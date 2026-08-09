// Seed weak-word progress for a test user via the backend API.
//
// Why this exists: a freshly UI-registered user has zero WordProgress rows, so
// the weekly report's weakWordsTop is empty and the parent-report drill-down
// scenario has nothing to click ("本周暂无显著弱项"). The weekly report derives
// weak words from WordProgress rows where the day's correct-rate < 0.6, so we
// record several *wrong* attempts for a target word — that drops its rate to 0
// and promotes it to a weak-word candidate for today.
//
// We authenticate from Node because the browser's JWT lives in the browser's
// module memory, not in this process. We reuse the same credentials the UI
// registration created, so the WordProgress rows attach to the same user that
// the browser is logged in as.
import { execFileSync } from "child_process";
import path from "path";
import type { TestUser } from "./world";

const API_BASE =
  process.env.E2E_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000/api";

interface ApiWord {
  id: string;
  text: string;
}

async function apiFetch(path: string, opts: RequestInit = {}, token?: string): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object"
        ? String((body as Record<string, unknown>).message ?? (body as Record<string, unknown>).error ?? "")
        : text;
    throw new Error(`API ${path} failed (${res.status}): ${msg}`);
  }
  return body;
}

/**
 * Make `word` appear as a weak word in the given user's weekly report.
 * Returns the matched word text (e.g. "Cat") so callers can assert on it.
 */
export async function seedWeakWord(
  user: TestUser,
  word: string,
  attempts = 3,
): Promise<string> {
  const auth = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: user.username, password: user.password }),
  });
  const token: string = auth.accessToken;

  const words: ApiWord[] = await apiFetch("/words", {}, token);
  const target = words.find((w) => w.text.toLowerCase() === word.toLowerCase());
  if (!target) {
    const sample = words.slice(0, 5).map((w) => w.text).join(", ");
    throw new Error(`Seed word "${word}" not found in catalog (${words.length} words; sample: ${sample})`);
  }

  // Record only wrong attempts → daily correct-rate 0/attempts < 0.6 → weak candidate.
  for (let i = 0; i < attempts; i++) {
    await apiFetch(
      "/progress/word",
      { method: "POST", body: JSON.stringify({ wordId: target.id, correct: false }) },
      token,
    );
  }
  return target.text;
}

/**
 * Seed a *due* (overdue) review word for the given user (AI-605).
 * 1) records one correct attempt so the word gains a WordProgress row with a
 *    (future) dueDate, then 2) moves that dueDate into the past via the
 *    review/schedule endpoint so GET /progress/review/due returns it as a
 *    review task on Home. Returns the matched word text (e.g. "Cat").
 */
export async function seedDueReview(user: TestUser, word: string): Promise<string> {
  const auth = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: user.username, password: user.password }),
  });
  const token: string = auth.accessToken;

  const words: ApiWord[] = await apiFetch("/words", {}, token);
  const target = words.find((w) => w.text.toLowerCase() === word.toLowerCase());
  if (!target) {
    const sample = words.slice(0, 5).map((w) => w.text).join(", ");
    throw new Error(
      `Seed word "${word}" not found in catalog (${words.length} words; sample: ${sample})`,
    );
  }

  // 1) one correct attempt → WordProgress row with a future dueDate.
  await apiFetch(
    "/progress/word",
    { method: "POST", body: JSON.stringify({ wordId: target.id, correct: true }) },
    token,
  );

  // 2) push dueDate into the past so it shows up as "due" / "overdue".
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await apiFetch(
    "/progress/review/schedule",
    { method: "POST", body: JSON.stringify({ wordId: target.id, dueDate: yesterday }) },
    token,
  );

  return target.text;
}

/**
 * Seed `count` practiced words (AI-602) so the free-practice page renders
 * difficulty badges for a returning user. Records a few attempts per word with
 * mixed correctness so the words gain a difficulty profile (easy/medium/hard).
 * Returns the seeded word texts.
 */
export async function seedPracticedWords(
  user: TestUser,
  count = 3,
): Promise<string[]> {
  const auth = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: user.username, password: user.password }),
  });
  const token: string = auth.accessToken;

  const words: ApiWord[] = await apiFetch("/words", {}, token);
  const picked = words.slice(0, count);
  if (picked.length === 0) {
    throw new Error("No words in catalog to seed practiced progress");
  }

  const texts: string[] = [];
  for (const w of picked) {
    // 3 attempts, 2 correct → mastery 67 → medium (exercises the adaptive tier).
    const pattern = [true, true, false];
    for (const correct of pattern) {
      await apiFetch(
        "/progress/word",
        { method: "POST", body: JSON.stringify({ wordId: w.id, correct }) },
        token,
      );
    }
    texts.push(w.text);
  }
  return texts;
}

/**
 * AI-704: 为测试用户写入「昨日」补学数据（弱词 + 未完成计划日）。
 *
 * 直接调用后端 `seed-makeup.ts` 脚本（经 ts-node 运行），该脚本用同一凭据登录
 * 拿到 userId 后直连 SQLite 写入 lastPracticedAt=昨日 的 word_progress 与
 * date=昨日、isDone=false 的 study_plan_days。返回 { wordText, planDayId } 供断言。
 *
 * 后端 better-sqlite3 原生模块按 Node 20 预编译；E2E 如需用特定 Node 运行此脚本，
 * 可经 `E2E_NODE_BIN` 指定（缺省用当前 cucumber 进程 Node）。
 */
export function seedMakeup(user: TestUser): { wordText: string; planDayId: string } {
  if (!user) {
    throw new Error('No test user; run "I am logged in as a new user" first');
  }
  const repoRoot = path.resolve(__dirname, "../../.."); // learning-english
  const script = path.join(repoRoot, "server/src/scripts/seed-makeup.ts");
  const tsNode = path.join(repoRoot, "server/node_modules/ts-node/dist/bin.js");
  const nodeBin = process.env.E2E_NODE_BIN || process.execPath;

  const out = execFileSync(
    nodeBin,
    [tsNode, script, user.username, user.password],
    {
      cwd: path.join(repoRoot, "server"),
      encoding: "utf8",
      // 必须与后端 E2E 用同一 SQLite 文件：后端以 `SQLITE_PATH=./e2e.sqlite`
      // 启动（cwd=server → server/e2e.sqlite）。脚本 cwd 同为 server，故缺省
      // 落到 ./e2e.sqlite 即可对齐；若外层已显式设置 SQLITE_PATH 则尊重之。
      // 否则 buildDataSourceOptions 会用默认 dev.sqlite，与后端库不一致 →
      // 经 API 拿到的 userId 在 dev.sqlite 的 users 表不存在 → FK 报错。
      env: {
        ...process.env,
        SQLITE_PATH: process.env.SQLITE_PATH || "./e2e.sqlite",
        // 跳过 ts-node 类型检查（测试脚本无需），显著加快冷启动。
        TS_NODE_TRANSPILE_ONLY: "1",
        // 不重复 synchronize：后端已在启动时同步过同一 e2e.sqlite 的 schema，
        // 此处只做 INSERT，避免与后端争夺 schema 写锁导致 execFileSync 卡死超时。
        DB_SYNCHRONIZE: "false",
      },
      timeout: 180000,
    },
  );

  const lines = out.trim().split("\n");
  const last = lines[lines.length - 1];
  const parsed = JSON.parse(last) as { ok: boolean; wordText: string; planDayId: string };
  if (!parsed.ok) {
    throw new Error(`seed-makeup reported failure: ${last}`);
  }
  return { wordText: parsed.wordText, planDayId: parsed.planDayId };
}
