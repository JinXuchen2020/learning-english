import * as crypto from 'crypto';

/**
 * Provider 密钥加密工具（AI-705）。
 *
 * 采用 AES-256-GCM：认证加密，密文附带 16 字节 auth tag，防篡改。
 * 密钥取自环境变量 `PROVIDER_ENC_KEY`（生产必填）；dev 缺失时回退固定
 * dev key 并打 warn（仅演示，绝不用于生产）。
 *
 * 存储格式（单行，base64，用 `::` 分隔）：`iv :: tag :: ciphertext`。
 * API 绝不返回明文；读路径只产出 `hasKey` + `masked`（末尾 4 字符 + 长度）。
 */

const DEV_FALLBACK_KEY = 'dev-only-provider-enc-key-do-not-use-in-prod';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

/** 解析加密主密钥（32 字节）。缺失则 dev 回退 + warn。 */
function resolveKey(): Buffer {
  const raw = process.env.PROVIDER_ENC_KEY;
  if (raw && raw.length > 0) {
    // 支持 hex（64 字符=32 字节）或直接作为 passphrase 经 sha256 派生。
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    return crypto.createHash('sha256').update(raw, 'utf8').digest();
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[AI-705] PROVIDER_ENC_KEY 未配置，使用固定 dev key（仅演示，生产必须设置）',
  );
  return crypto.createHash('sha256').update(DEV_FALLBACK_KEY, 'utf8').digest();
}

/** 加密明文 → `iv::tag::ciphertext`（均为 base64）。 */
export function encryptSecret(plain: string): string {
  const key = resolveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64'),
  ].join('::');
}

/**
 * 解密存储 blob → 明文。
 * - blob 格式错误 / 被篡改 / key 不匹配 → 抛 `Error('解密失败')`，由上层捕获回退。
 */
export function decryptSecret(blob: string): string {
  const key = resolveKey();
  const parts = blob.split('::');
  if (parts.length !== 3) {
    throw new Error('解密失败：密文格式非法');
  }
  const [ivB64, tagB64, encB64] = parts;
  try {
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const enc = Buffer.from(encB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    throw new Error('解密失败：密钥不匹配或密文被篡改');
  }
}

/**
 * 生成前端展示用掩码：保留末尾 4 字符，前缀 `****` + 长度提示。
 * 明文为空 → 返回空串（表示未设置）。
 */
export function maskSecret(plain: string | null | undefined): string {
  if (!plain) return '';
  const tail = plain.slice(-4);
  return `****${tail}`;
}
