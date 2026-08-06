/**
 * speech-evaluate.validation — 口语评测上传校验（纯逻辑层）
 *
 * 与 `src/lib/speech-recorder.ts`(AI-302) 同思路：把带分支的校验逻辑下沉为
 * **纯函数**（无 Nest / 浏览器依赖），便于 node 环境单元测试全覆盖。
 *
 * 校验项（AI-303 核心）：文件大小 / MIME 格式 / 客户端上报时长。
 * 错误以 `SpeechEvaluateError`（普通 Error，非 HttpException）抛出，由 controller
 * 翻译为对应 HTTP 状态码，保持本层与传输层解耦、可单测。
 *
 * @module ai/speech-evaluate.validation
 */

/**
 * 允许的音频 MIME 白名单。
 * 覆盖 `SpeechRecorder`(AI-302) 产出的 `audio/webm`(opus) 与 iOS Safari 降级
 * `audio/mp4`，以及常见 `wav` / `mp3` / `ogg` / `matroska` / `x-wav`。
 */
export const ALLOWED_AUDIO_MIME: ReadonlySet<string> = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/wav',
  'audio/mpeg',
  'audio/ogg',
  'audio/x-matroska',
  'audio/x-wav',
]);

/** 单条音频最大字节数（5MB）。超出返回 413。 */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/** 客户端上报录音时长上限（毫秒，15s）。超出返回 400。 */
export const MAX_DURATION_MS = 15_000;

/** multer 硬上限（字节，10MB）：仅防内存爆，精确 5MB 判定仍在 service 层。 */
export const HARD_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;

/**
 * 口语评测业务错误。携带 HTTP `status` 与机器可读 `code`，便于前端按 `code` 分支。
 * 不继承 `HttpException`，保持纯逻辑层对 Nest 传输层零依赖（node 可单测）。
 */
export class SpeechEvaluateError extends Error {
  /** HTTP 状态码。 */
  readonly status: number;
  /** 机器可读错误码（前端据此提示）。 */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'SpeechEvaluateError';
    this.status = status;
    this.code = code;
  }
}

/** `validateSpeechUpload` 的可选覆盖（测试用，默认值见上方常量）。 */
export interface SpeechUploadValidateOptions {
  /** 大小上限（字节）。默认 {@link MAX_AUDIO_BYTES}。 */
  maxBytes?: number;
  /** 时长上限（毫秒）。默认 {@link MAX_DURATION_MS}。 */
  maxDurationMs?: number;
  /** 允许的 MIME 集合。默认 {@link ALLOWED_AUDIO_MIME}。 */
  allowedMime?: ReadonlySet<string>;
}

/** 校验输入。 */
export interface SpeechUploadInput {
  /** 文件字节数。 */
  size: number;
  /** 文件 MIME 类型（来自 multer `file.mimetype`）。 */
  mimeType: string;
  /** 客户端上报录音时长（毫秒），可选。 */
  durationMs?: number;
}

/**
 * 校验口语评测上传的「大小 / 格式 / 时长」。
 * 任一不满足即抛出 {@link SpeechEvaluateError}；全部通过则静默返回（void）。
 *
 * 顺序（先轻后重）：空文件 → 超大小 → 格式 → 时长。
 *
 * @param input 文件元信息
 * @param options 覆盖常量（测试用）
 * @throws SpeechEvaluateError 校验失败时
 */
export function validateSpeechUpload(
  input: SpeechUploadInput,
  options: SpeechUploadValidateOptions = {},
): void {
  const maxBytes = options.maxBytes ?? MAX_AUDIO_BYTES;
  const maxDurationMs = options.maxDurationMs ?? MAX_DURATION_MS;
  const allowedMime = options.allowedMime ?? ALLOWED_AUDIO_MIME;

  if (!input || input.size <= 0) {
    throw new SpeechEvaluateError(400, 'EMPTY_AUDIO', '录音文件为空');
  }

  if (input.size > maxBytes) {
    throw new SpeechEvaluateError(
      413,
      'AUDIO_TOO_LARGE',
      `录音文件过大（上限 ${maxBytes} 字节）`,
    );
  }

  if (!allowedMime.has(input.mimeType)) {
    throw new SpeechEvaluateError(
      415,
      'UNSUPPORTED_AUDIO_TYPE',
      `不支持的音频格式：${input.mimeType || '未知'}`,
    );
  }

  if (input.durationMs != null && input.durationMs > maxDurationMs) {
    throw new SpeechEvaluateError(
      400,
      'DURATION_EXCEEDED',
      `录音时长超出上限（${maxDurationMs}ms）`,
    );
  }
}
