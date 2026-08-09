import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Recursively make any value JSON-safe:
 *  - Errors become { name, message, stack } (optionally with `cause`)
 *  - circular references are broken with `[circular]`
 *  - arrays / plain objects are walked; primitives pass through
 * Used both for the file line and for the frontend -> backend log envelope.
 */
export function serializeMeta(
  meta: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (meta === null || meta === undefined) return meta;
  if (typeof meta !== 'object') return meta;
  if (meta instanceof Error) {
    const out: Record<string, unknown> = {
      name: meta.name,
      message: meta.message,
      stack: meta.stack,
    };
    const cause = (meta as { cause?: unknown }).cause;
    if (cause !== undefined) out.cause = serializeMeta(cause, seen);
    return out;
  }
  if (Array.isArray(meta)) return meta.map((m) => serializeMeta(m, seen));
  if (seen.has(meta)) return '[circular]';
  seen.add(meta);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = serializeMeta(v, seen);
  }
  return out;
}

/** Stable single-line format so the log file is easy to grep/tail. */
export function formatLine(
  ts: string,
  level: LogLevel,
  message: string,
  metaStr: string,
): string {
  return metaStr
    ? `[${ts}] [${level.toUpperCase()}] ${message} ${metaStr}`
    : `[${ts}] [${level.toUpperCase()}] ${message}`;
}

export interface LoggerOptions {
  /** Directory for dated log files. Defaults to `process.env.LOG_DIR` or `<cwd>/logs`. */
  logDir?: string;
  /** Only levels at or above this are written to file. Default `debug` (all). */
  minLevel?: LogLevel;
  /** Mirror each line to console at the matching level. Default `true`. */
  mirror?: boolean;
}

export interface Logger {
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
  write(level: LogLevel, message: string, meta?: unknown): void;
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const logDir = opts.logDir ?? process.env.LOG_DIR ?? path.join(process.cwd(), 'logs');
  const minLevel: LogLevel = opts.minLevel ?? 'debug';
  // In test environments (jest / CI unit runs) we default `mirror` to false so the
  // logger does not spray error/warning lines onto stderr during unit tests. This
  // keeps CI output clean and stops deliberate test-stub errors (e.g. a mocked
  // provider throwing `boom` in chat.service.spec.ts) from leaking into the
  // pass/fail log and looking like real failures. Production keeps the default
  // `true` for operational visibility. Tests that specifically assert the mirror
  // behaviour pass `mirror: true` explicitly (see logger.spec.ts).
  const isTestEnv =
    process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';
  const mirror = opts.mirror ?? !isTestEnv;

  // Ensure the log directory exists exactly once (cached). If creation fails we
  // log a single warning and retry on the next write; per-line appends never throw.
  let dirReady: Promise<void> | null = null;
  let dirWarned = false;
  function ensureDir(): Promise<void> {
    if (!dirReady) {
      dirReady = fsp.mkdir(logDir, { recursive: true }).then(() => undefined).catch((e) => {
        if (!dirWarned) {
          dirWarned = true;
          console.error('[logger] failed to create log dir', logDir, (e as Error).message);
        }
        dirReady = null; // allow retry on next write (e.g. transient)
        throw e;
      });
    }
    return dirReady!;
  }

  function write(level: LogLevel, message: string, meta?: unknown): void {
    const ts = new Date().toISOString();
    let metaStr = '';
    if (meta !== undefined) {
      metaStr = JSON.stringify(serializeMeta(meta));
    }
    const line = formatLine(ts, level, message, metaStr);

    if (mirror) {
      (level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : level === 'debug'
            ? console.debug
            : console.log)(line);
    }

    // Below the configured minimum level: mirror only, skip the file.
    if (LEVEL_ORDER[level] > LEVEL_ORDER[minLevel]) return;

    const file = path.join(logDir, `app-${ts.slice(0, 10)}.log`);
    // Best-effort: logging must never crash the app, even if the disk is full
    // or the directory is unwritable. ensureDir() creates the dir once; any
    // failure (dir or append) is swallowed — logging is never allowed to throw.
    ensureDir()
      .then(() => fsp.appendFile(file, line + '\n', 'utf8'))
      .catch(() => {
        /* best-effort: ignored */
      });
  }

  return {
    error: (m, meta) => write('error', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    info: (m, meta) => write('info', m, meta),
    debug: (m, meta) => write('debug', m, meta),
    write,
  };
}

/** App-wide singleton. Writes to `<cwd>/logs/app-YYYY-MM-DD.log`. */
export const logger = createLogger();
