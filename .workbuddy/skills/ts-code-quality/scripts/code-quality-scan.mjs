#!/usr/bin/env node
// ts-code-quality 只读静态反模式扫描器（不修改任何文件）。
// 扫描 src 下 .ts/.tsx，输出 Markdown 报告。
// 用法: node code-quality-scan.mjs [--dir <项目根>] [--fail-on P0|P1|P2|P3] [--exclude <相对路径,逗号分隔>]
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const args = process.argv.slice(2);
let root = '.';
let failOn = null; // e.g. "P1" -> exit 1 if any finding at or above this severity
const excludePatterns = []; // 相对路径/目录/glob，跳过测试夹具等不应纳入质量门的文件
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir') root = args[++i];
  else if (args[i] === '--fail-on') failOn = String(args[++i]).toUpperCase();
  else if (args[i] === '--exclude') {
    String(args[++i]).split(',').forEach((x) => {
      const t = x.trim();
      if (t) excludePatterns.push(t);
    });
  }
}

const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', 'coverage', '.git', 'out', 'vendor', '.workbuddy',
]);
const isTestFile = (name) =>
  name.endsWith('.spec.ts') || name.endsWith('.test.ts') ||
  name.endsWith('.spec.tsx') || name.endsWith('.test.tsx') || name.endsWith('.d.ts');

// 测试夹具（如 E2E harness 中的假口令）应排除在质量门之外——它们本就要含固定凭据。
// 任何 exclude 项匹配「相对 cwd 的路径」或「相对扫描根的路径」即跳过（支持 **/* glob）。
function isExcluded(relPath, patterns) {
  const p = relPath.split('\\').join('/');
  for (const raw of patterns) {
    let pat = raw.trim().split('\\').join('/');
    if (!pat) continue;
    // 无 glob 字符 -> 按目录前缀匹配（含目录本身）
    if (!/[*?]/.test(pat) && (p === pat || p.startsWith(pat + '/'))) return true;
    const re = new RegExp(
      '^' +
        pat
          .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 转义正则元字符（保留 * ?）
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '.') +
        '$',
    );
    if (re.test(p)) return true;
  }
  return false;
}

// 每条规则: id / severity / desc / re(全局匹配)
const rules = [
  {
    id: 'any-type',
    severity: 'P2',
    desc: 'TypeScript `any` 逃逸（丧失类型安全）',
    re: /(:\s*|\bas\s+|\<)any\b/g,
  },
  {
    id: 'console-leftover',
    severity: 'P3',
    desc: '遗留 console.* 调试输出（生产应使用 Logger）',
    re: /\bconsole\.(log|warn|error|debug|info)\s*\(/g,
  },
  {
    id: 'todo-fixme',
    severity: 'P2',
    desc: 'TODO/FIXME/HACK 待办标记',
    re: /\b(TODO|FIXME|HACK|XXX)\b/g,
  },
  {
    id: 'empty-catch',
    severity: 'P2',
    desc: '空 catch 块（吞掉异常，无处理/无日志）',
    re: /catch\s*\([^)]*\)\s*\{\s*\}/g,
  },
  {
    id: 'hardcoded-secret',
    severity: 'P1',
    desc: '疑似硬编码密钥/口令（应走配置/环境变量）',
    re: /\b(api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key)\s*[:=]\s*['"][^'"]{6,}['"]/gi,
  },
  {
    id: 'dangerous-html',
    severity: 'P1',
    desc: 'dangerouslySetInnerHTML（XSS 风险）',
    re: /dangerouslySetInnerHTML/g,
  },
  {
    id: 'eval-usage',
    severity: 'P1',
    desc: 'eval / new Function（代码注入风险）',
    re: /\b(eval|new\s+Function)\s*\(/g,
  },
  {
    id: 'eslint-disable',
    severity: 'P3',
    desc: 'eslint-disable 抑制（掩盖质量问题）',
    re: /\/\/\s*eslint-disable/g,
  },
];

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(join(dir, e.name), out);
    } else if (e.isFile()) {
      const ext = extname(e.name);
      if ((ext === '.ts' || ext === '.tsx') && !isTestFile(e.name)) {
        const full = join(dir, e.name);
        if (
          excludePatterns.length &&
          (isExcluded(relative(process.cwd(), full), excludePatterns) ||
            isExcluded(relative(root, full), excludePatterns))
        ) {
          continue;
        }
        out.push(full);
      }
    }
  }
}

const files = [];
walk(root, files);

const findings = [];
let totalLines = 0;
for (const f of files) {
  let content;
  try {
    content = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split('\n');
  totalLines += lines.length;
  for (const rule of rules) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(content)) !== null) {
      const lineNo = content.slice(0, m.index).split('\n').length;
      const snippet = (lines[lineNo - 1] || '').trim().slice(0, 120);
      findings.push({
        severity: rule.severity,
        rule: rule.id,
        file: relative(process.cwd(), f),
        line: lineNo,
        snippet,
      });
      if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
    }
  }
}

const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
findings.sort(
  (a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line,
);

const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
for (const f of findings) counts[f.severity]++;

console.log('# Code Quality Scan Report (TS/NestJS)');
console.log(`- Scanned: ${files.length} files, ${totalLines} lines (root: ${root})`);
console.log(
  `- Findings: ${findings.length} — P0:${counts.P0} P1:${counts.P1} P2:${counts.P2} P3:${counts.P3}`,
);
if (findings.length) {
  console.log('\n| Severity | Rule | File:Line | Snippet |');
  console.log('|----------|------|-----------|----------|');
  for (const f of findings) {
    console.log(
      `| ${f.severity} | ${f.rule} | ${f.file}:${f.line} | ${f.snippet.replace(/\|/g, '\\|')} |`,
    );
  }
} else {
  console.log('\nNo static anti-patterns detected.');
}

// CI gate: optionally fail the process when findings reach a severity floor.
if (failOn) {
  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const threshold = rank[failOn];
  if (threshold === undefined) {
    console.error(`[WARN] Unknown --fail-on value "${failOn}" (expected P0|P1|P2|P3); ignoring gate.`);
  } else {
    const blockers = findings.filter((f) => rank[f.severity] <= threshold);
    if (blockers.length) {
      console.error(
        `\n[FAIL] ${blockers.length} finding(s) at or above --fail-on ${failOn} ` +
          `(P0:${counts.P0} P1:${counts.P1} P2:${counts.P2} P3:${counts.P3}).`,
      );
      process.exit(1);
    }
    console.log(`\n[OK] No findings at or above --fail-on ${failOn}.`);
  }
}

process.exit(0);
