/**
 * scan-upload.validation — 拍照上传校验（纯逻辑层，AI-606）
 *
 * 与 `speech-evaluate.validation` 同思路：带分支的校验下沉为纯函数，
 * 便于 node 环境单元测试。校验图片大小 / MIME 格式，错误以
 * `ScanUploadError`（普通 Error，非 HttpException）抛出，由 controller
 * 翻译为对应 HTTP 状态码。
 *
 * @module scan/scan-upload.validation
 */

/** 允许的图片 MIME 白名单（拍照/上传常见格式）。 */
export const ALLOWED_IMAGE_MIME: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** 单张图片精确上限（5MB），超出返回 413。 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** multer 硬上限（10MB）：仅防内存爆，精确 5MB 判定在 service 层。 */
export const HARD_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;

/**
 * 拍照上传业务错误。携带 HTTP `status` 与机器可读 `code`。
 * 不继承 `HttpException`，保持纯逻辑层对 Nest 传输层零依赖。
 */
export class ScanUploadError extends Error {
  /** HTTP 状态码。 */
  readonly status: number;
  /** 机器可读错误码。 */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ScanUploadError';
    this.status = status;
    this.code = code;
  }
}

/** 校验输入。 */
export interface ScanUploadInput {
  /** 文件字节数。 */
  size: number;
  /** 文件 MIME 类型（来自 multer `file.mimetype`）。 */
  mimeType: string;
}

/** 校验图片上传的大小 / 格式。任一不满足抛 `ScanUploadError`。 */
export function validateScanUpload(input: ScanUploadInput): void {
  if (!input || input.size <= 0) {
    throw new ScanUploadError(400, 'EMPTY_IMAGE', '图片文件为空');
  }
  if (input.size > MAX_IMAGE_BYTES) {
    throw new ScanUploadError(
      413,
      'IMAGE_TOO_LARGE',
      `图片过大（上限 ${MAX_IMAGE_BYTES} 字节）`,
    );
  }
  if (!ALLOWED_IMAGE_MIME.has(input.mimeType)) {
    throw new ScanUploadError(
      415,
      'UNSUPPORTED_IMAGE_TYPE',
      `不支持的图片格式：${input.mimeType || '未知'}`,
    );
  }
}
