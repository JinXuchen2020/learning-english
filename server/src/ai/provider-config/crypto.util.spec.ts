import { encryptSecret, decryptSecret, maskSecret } from './crypto.util';

describe('crypto.util (AI-705)', () => {
  const ORIGINAL = process.env.PROVIDER_ENC_KEY;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PROVIDER_ENC_KEY;
    else process.env.PROVIDER_ENC_KEY = ORIGINAL;
  });

  it('encrypt → decrypt 可逆（hex key）', () => {
    process.env.PROVIDER_ENC_KEY = 'a'.repeat(64); // 64 hex = 32 bytes
    const plain = 'sk-test-1234567890';
    const blob = encryptSecret(plain);
    expect(blob).not.toContain(plain);
    expect(decryptSecret(blob)).toBe(plain);
  });

  it('encrypt → decrypt 可逆（passphrase key 经 sha256 派生）', () => {
    process.env.PROVIDER_ENC_KEY = 'my-secret-passphrase';
    const plain = 'another-key';
    const blob = encryptSecret(plain);
    expect(decryptSecret(blob)).toBe(plain);
  });

  it('不同明文密文不同（随机 iv）', () => {
    process.env.PROVIDER_ENC_KEY = 'a'.repeat(64);
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a).not.toBe(b);
  });

  it('错误 key 解密抛错', () => {
    process.env.PROVIDER_ENC_KEY = 'a'.repeat(64);
    const blob = encryptSecret('secret');
    process.env.PROVIDER_ENC_KEY = 'b'.repeat(64);
    expect(() => decryptSecret(blob)).toThrow(/解密失败/);
  });

  it('损坏 blob 解密抛错', () => {
    process.env.PROVIDER_ENC_KEY = 'a'.repeat(64);
    expect(() => decryptSecret('not::valid::blob')).toThrow(/解密失败/);
  });

  it('maskSecret 仅保留末尾 4 位', () => {
    expect(maskSecret('sk-abcd')).toBe('****abcd');
    expect(maskSecret('')).toBe('');
    expect(maskSecret(null)).toBe('');
    expect(maskSecret(undefined)).toBe('');
  });
});
