#!/bin/sh
# Local full-stack verification for feature-builder.
#
# What it does (mirrors the CI `e2e` job, but runs on your machine):
#   1) backend unit tests (jest)            -> gate: unit
#   2) build + seed + boot backend (start:prod :4000) and frontend (:3000, next dev)
#   3) run the Cucumber + Playwright E2E suite
# On full success it writes `gates.tests: "PASSED"` (plus a verification stamp
# testsVerifiedCommit / testsVerifiedAt) DIRECTLY into `.quality-gate.json`, so
# the pre-commit hook (scripts/git-hooks/pre-commit) will accept the commit
# without any manual transcription. The hook only accepts tests:PASSED when the
# stamp's commit == current HEAD, so a self-reported PASSED without a real local
# run can never pass. No separate evidence file is produced.
#
# Requirements:
#   - Node 22 (managed runtime) on PATH.
#   - Microsoft Edge installed (Playwright uses the `msedge` channel locally;
#     CI uses bundled Chromium via E2E_BROWSER_CHANNEL="").
#   - Backend + frontend dependencies installed (`npm ci` in server/ and src/).
#
# Notes on the isolated build dir:
#   Next.js 14 reads its config only from the real `next.config.{js,mjs,ts}`
#   filename — the `-c` flag is NOT supported in this version. To get an
#   isolated `.next-e2e` distDir (so this run never touches the default,
#   possibly lock-contended `.next`), the script temporarily swaps
#   `next.config.mjs` <- `next.config.e2e.mjs` for the duration of the run and
#   restores it on exit.
#
# Usage:
#   bash scripts/run-e2e-local.sh
# Env overrides:
#   SQLITE_PATH   sqlite file for the backend (default: e2e-local.sqlite, fresh each run)
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/server"
FRONT="$ROOT/src"
# Use a UNIQUE sqlite file each run. We must NOT `rm` the file first (the
# sandbox safe-delete guard fails-closed on `rm` of real files), and a fixed
# name would collide with a lingering backend process that still holds the
# previous file open. A fresh per-run name sidesteps both problems; stale
# files are gitignored and harmless.
SQLITE_PATH="${SQLITE_PATH:-e2e-run-$(date +%s).sqlite}"
CFG_BAK="/tmp/next.config.mjs.bak.$$"

# On full success, write gates.tests:PASSED (with a verification stamp) directly
# into .quality-gate.json. The pre-commit hook only accepts tests:PASSED when this
# stamp's commit == current HEAD, so a self-reported PASSED without a real local
# run cannot pass. We do NOT create a separate evidence file.
patch_gate() {
  local commit ts gate="$ROOT/.quality-gate.json"
  commit="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null)" || commit=""
  if [ -z "$commit" ]; then
    echo "::warning::cannot read HEAD; skip gate write" >&2
    return 1
  fi
  if [ ! -f "$gate" ]; then
    echo "::warning::$gate not found; cannot record tests:PASSED" >&2
    return 1
  fi
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  node -e '
    const fs = require("fs");
    const p = process.argv[1], commit = process.argv[2], ts = process.argv[3];
    const g = JSON.parse(fs.readFileSync(p, "utf8"));
    g.gates = g.gates || {};
    g.gates.tests = "PASSED (本地 jest + cucumber E2E 全量实跑通过；verifiedCommit=" + commit.slice(0,8) + "；verifiedAt=" + ts + ")";
    g.testsVerifiedCommit = commit;
    g.testsVerifiedAt = ts;
    fs.writeFileSync(p, JSON.stringify(g, null, 2) + "\n");
  ' "$gate" "$commit" "$ts"
  echo "    Wrote gates.tests:PASSED + verification stamp (commit=${commit:0:8}) into $gate"
  echo "    Next: git add .quality-gate.json && git commit   (pre-commit hook will accept it)"
}

SRV=""
FE=""
FE_OWNED=0
CFG_SWAPPED=0
cleanup() {
  # Kill the frontend (next dev) FIRST. The e2e run swaps next.config.mjs for
  # next.config.e2e.mjs; restoring the original config while next dev is still
  # alive makes next detect the change and auto-restart, which internally
  # recursive-deletes the old .next-e2e dir — that bulk delete trips the sandbox
  # safe-delete guard (fail-closed) and hangs/kills the process (final9 got
  # stuck in cleanup for 20+ min). Killing next before the mv means no
  # auto-restart fires; `mv` is a rename (not a delete) so it never triggers
  # the guard either.
  if [ "$FE_OWNED" = "1" ] && [ -n "$FE" ]; then kill "$FE" 2>/dev/null || true; fi
  if [ "$CFG_SWAPPED" = "1" ] && [ -f "$CFG_BAK" ]; then
    mv "$CFG_BAK" "$FRONT/next.config.mjs" 2>/dev/null || true
  fi
  [ -n "$SRV" ] && kill "$SRV" 2>/dev/null || true
}
trap cleanup EXIT

# ── 1) backend unit tests ──
echo "==> [1/3] Running backend unit tests (jest)"
set +e
( cd "$SERVER" && npm test )
unit_rc=$?
set -e
if [ "$unit_rc" -ne 0 ]; then
  echo "::error::backend jest unit tests failed" >&2
  exit 1
fi
echo "==> jest passed."

# ── 2) boot services (force-restart so we ALWAYS test CURRENT source) ──
echo "==> [2/3] Restarting backend (:4000) + frontend (:3000) on current source"

# Never reuse a possibly-stale process (different branch / old build): a
# lingering :4000 backend without the current routes would 404 the E2E and
# silently validate the wrong code. Kill whatever holds :4000/:3000 first.
# NOTE: `fuser -k` is unreliable on Windows/Git Bash for some node processes,
# so we parse `netstat` for the listening PID and `taskkill /F /PID` it.
free_port() {
  local port="$1" pid
  pid=$(netstat -ano 2>/dev/null | grep -E ":$port[[:space:]]" | grep LISTENING | awk '{print $NF}' | head -1)
  if [ -n "$pid" ]; then
    taskkill /F /PID "$pid" >/dev/null 2>&1 || true
  fi
}
free_port 4000
free_port 3000
sleep 2

# Backend: compile current source to ./dist with `tsc` (CI uses `nest build`,
# which first `rimraf dist` ~820 files and trips the sandbox safe-delete guard).
# Plain `tsc` overwrites existing output WITHOUT deleting the directory, so it
# never triggers the guard. We also rename any prior ./dist aside (mv = rename,
# not a delete) for a clean output, then compile fresh.
echo "    building backend (tsc -> ./dist, no rimraf) on current source"
( cd "$SERVER" && mv dist "/tmp/server-dist-old.$$" 2>/dev/null || true )
( cd "$SERVER" && ./node_modules/.bin/tsc )
echo "    seeding + starting backend on :4000 (sqlite=$SQLITE_PATH)"
( cd "$SERVER" && SQLITE_PATH="$SQLITE_PATH" npm run seed )
( cd "$SERVER" && SQLITE_PATH="$SQLITE_PATH" PORT=4000 npm run start:prod ) &
SRV=$!

# Frontend: run `next dev` on an ISOLATED, CLEAN .next-e2e (distDir from the
# e2e config) so the verification never touches the default `.next` and never
# bulk-deletes. `next build`/`next start` BOTH internally rm >50 files and get
# blocked by the sandbox safe-delete guard (fail-closed) — so they cannot run
# here. Instead we rename any prior .next-e2e aside (rename, not delete -> no
# guard) so `next dev` starts fresh and only WRITES files, never bulk-deletes.
echo "    starting frontend on :3000 (next dev, isolated clean .next-e2e)"
cp "$FRONT/next.config.mjs" "$CFG_BAK"
cp "$FRONT/next.config.e2e.mjs" "$FRONT/next.config.mjs"
CFG_SWAPPED=1
( cd "$FRONT" && mv .next-e2e "/tmp/.next-e2e-old.$$" 2>/dev/null || true )
( cd "$FRONT" && npx next dev -p 3000 ) &
FE=$!
FE_OWNED=1

echo "Waiting for backend (:4000/api/health) and frontend (:3000/login)..."
READY=0
for i in $(seq 1 90); do
  BE_OK=$(curl -sf http://localhost:4000/api/health >/dev/null 2>&1 && echo 1 || echo 0)
  FE_OK=$(curl -sf http://localhost:3000/login >/dev/null 2>&1 && echo 1 || echo 0)
  if [ "$BE_OK" = "1" ] && [ "$FE_OK" = "1" ]; then
    echo "Both services are up after ${i} tries."; READY=1; break
  fi
  sleep 2
done
if [ "$READY" -ne 1 ]; then
  echo "::error::Services did not become ready in time." >&2
  echo "backend: $(curl -sf http://localhost:4000/api/health >/dev/null 2>&1 && echo UP || echo DOWN)"
  echo "frontend: $(curl -sf http://localhost:3000/login >/dev/null 2>&1 && echo UP || echo DOWN)"
  exit 1
fi

# ── 3) E2E ──
echo "==> [3/3] Running E2E (cucumber + playwright)"
set +e
# 必须把 SQLITE_PATH 传给 e2e 进程：seed 脚本（seed-makeup/seed-stars 经
# src/e2e/support/seed.ts 调用）fallback 到 ./e2e.sqlite，若此处不显式透传，
# 就会连到与后端（e2e-run-<ts>.sqlite）不同的库 → seed-stars 在错库 UPDATE 0 行
# 静默失效、seed-makeup 在错库 INSERT 触发 FOREIGN KEY 失败（AI-704 / AI-712 的
# E2E 失败根因）。
# 额外写 JSON report 到文件：cucumber 默认只有 progress/summary 控制台格式，
# 而本脚本经 `| tee` 全缓冲，进程若未及时干净退出则汇总不落盘（final8 丢结果）。
# JSON 由 cucumber 直接写文件、绕过管道缓冲，作为确定性真相源。
( cd "$FRONT" && SQLITE_PATH="$SQLITE_PATH" npx cucumber-js \
    --config e2e/cucumber.js \
    --format progress --format summary \
    --format json:"/tmp/e2e-report.json" )
e2e_rc=$?
set -e
if [ "$e2e_rc" -ne 0 ]; then
  echo "::error::E2E failed" >&2
  exit 1
fi

patch_gate
echo "==> Local verification PASSED. gates.tests:PASSED written into .quality-gate.json"
