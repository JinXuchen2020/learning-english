/**
 * 录音采集纯逻辑层（AI-302）。
 *
 * 所有带分支的逻辑（错误分类 / MIME 探测与 iOS 降级 / 时长钳制 / 结果装配）都集中在此，
 * 与 React 组件解耦，便于在 Vitest `node` 环境下单元测试（浏览器 API 一律通过参数注入或
 * 受 `typeof` 守卫，绝不在模块加载期访问 `MediaRecorder`/`URL` 等全局）。
 *
 * 组件层（`components/SpeechRecorder.tsx`）只负责把结果渲染出来、把浏览器 API 注入本层。
 */

/** 录音失败的分类（供 UI 渲染分级友好文案）。 */
export type RecordingErrorKind =
  | "permission-denied"
  | "not-supported"
  | "no-microphone"
  | "insecure-context"
  | "unknown";

/**
 * 把 `getUserMedia` / `MediaRecorder` 抛出的异常归类为可展示的错误类型。
 * 纯函数：只读 `error` 的 `name` / `message`，不触碰任何浏览器全局。
 */
export function classifyRecordingError(error: unknown): RecordingErrorKind {
  if (error && typeof error === "object") {
    const e = error as { name?: unknown; message?: unknown; code?: unknown };
    const name = typeof e.name === "string" ? e.name : "";
    const message =
      typeof e.message === "string" ? e.message.toLowerCase() : "";
    const code = e.code;

    if (name === "NotAllowedError" || name === "SecurityError") {
      return "permission-denied";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "no-microphone";
    }
    if (name === "NotSupportedError") {
      return "not-supported";
    }
    // 部分浏览器（尤其是旧 Safari）把权限拒绝塞进 message 而非 name。
    if (message.includes("permission") || message.includes("denied")) {
      return "permission-denied";
    }
    if (message.includes("microphone") || message.includes("device")) {
      return "no-microphone";
    }
    // 某些环境用数字 code 而非 name（如 0/NotAllowed）。
    if (code === 0 || code === "0") {
      return "permission-denied";
    }
  }
  return "unknown";
}

/** 优先采用的录音容器/编码（桌面 Chrome/Firefox/Edge）。 */
export const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

/** iOS Safari 降级容器（MediaRecorder 存在但不支持 webm）。 */
export const IOS_FALLBACK_MIME_TYPE = "audio/mp4";

export interface MimeSelection {
  /** 选中的 MIME；空串表示让浏览器自选默认（兜底）。 */
  mimeType: string;
  /** 是否走了 iOS audio/mp4 降级（UI 可据此提示格式）。 */
  isIosFallback: boolean;
}

/**
 * 探测并选择录音 MIME 类型。
 * `isTypeSupported` 由调用方注入（浏览器中即 `MediaRecorder.isTypeSupported.bind(MediaRecorder)`），
 * 因此本函数在 node 环境下以 stub 即可单测。
 */
export function pickMimeType(
  isTypeSupported: (type: string) => boolean,
): MimeSelection {
  for (const type of PREFERRED_MIME_TYPES) {
    if (isTypeSupported(type)) {
      return { mimeType: type, isIosFallback: false };
    }
  }
  if (isTypeSupported(IOS_FALLBACK_MIME_TYPE)) {
    return { mimeType: IOS_FALLBACK_MIME_TYPE, isIosFallback: true };
  }
  return { mimeType: "", isIosFallback: false };
}

/** 默认录音时长上限（毫秒）。 */
export const DEFAULT_MAX_DURATION_MS = 10_000;

/**
 * 把实际录音时长钳制到合法区间：非有限/负数→0；超出上限→上限；否则原值。
 */
export function clampDuration(recMs: number, capMs: number): number {
  if (!Number.isFinite(recMs) || recMs < 0) return 0;
  if (recMs > capMs) return capMs;
  return recMs;
}

/**
 * `getUserMedia` 需安全上下文（https 或 localhost）。无 `window`（node/SSR）时返回 false。
 */
export function isSecureContextForMedia(): boolean {
  const w = globalThis as { window?: { isSecureContext?: boolean } };
  if (!w.window || typeof w.window.isSecureContext !== "boolean") {
    return false;
  }
  return w.window.isSecureContext;
}

/** 装配后的录音结果，交给上层消费（上传/预览）。 */
export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  /** 对象 URL；生成失败时为 ""（不抛）。 */
  url: string;
  size: number;
  durationMs: number;
}

export interface RecordingResultInput {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** 注入式对象 URL 构造器；默认 `URL.createObjectURL`（带 try/catch 兜底）。 */
  createObjectURL?: (blob: Blob) => string;
}

function safeCreateObjectURL(blob: Blob): string {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    try {
      return URL.createObjectURL(blob);
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * 装配录音结果：计算 size、生成可预览的 url（注入或默认），durationMs 经 `clampDuration`
 * 兜底（防止负值/NaN 脏数据）。`url` 生成失败静默降级为 ""，绝不抛出。
 */
export function buildRecordingResult(input: RecordingResultInput): RecordingResult {
  const createObjectURL = input.createObjectURL ?? safeCreateObjectURL;
  let url = "";
  try {
    url = createObjectURL(input.blob);
  } catch {
    url = "";
  }
  return {
    blob: input.blob,
    mimeType: input.mimeType,
    url,
    size: input.blob.size,
    durationMs: clampDuration(input.durationMs, Number.MAX_SAFE_INTEGER),
  };
}
