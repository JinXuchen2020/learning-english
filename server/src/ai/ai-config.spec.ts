import { ConfigService } from '@nestjs/config';
import { readAiConfig } from './ai-config';

/** 最小 ConfigService 桩：仅实现 `get`，返回预置 map。 */
function stubConfig(map: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => map[k] } as unknown as ConfigService;
}

describe('readAiConfig', () => {
  it('defaults provider to mock and leaves keys undefined when nothing is set', () => {
    const cfg = readAiConfig(stubConfig({}));
    expect(cfg.provider).toBe('mock');
    expect(cfg.bigmodel.apiKey).toBeUndefined();
    expect(cfg.nvidia.apiKey).toBeUndefined();
  });

  it('applies BigModel defaults for baseUrl / model / visionModel', () => {
    const cfg = readAiConfig(stubConfig({ AI_PROVIDER: 'bigmodel', BIGMODEL_API_KEY: 'k' }));
    expect(cfg.bigmodel.apiKey).toBe('k');
    expect(cfg.bigmodel.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(cfg.bigmodel.model).toBe('glm-4.7-flash');
    expect(cfg.bigmodel.visionModel).toBe('glm-4.6v-flash');
    expect(cfg.bigmodel.ttsModel).toBe('glm-tts');
    expect(cfg.bigmodel.ttsVoice).toBe('tongtong');
  });

  it('reads overridden BigModel values', () => {
    const cfg = readAiConfig(
      stubConfig({
        AI_PROVIDER: 'bigmodel',
        BIGMODEL_API_KEY: 'k',
        BIGMODEL_BASE_URL: 'https://example.com/v1',
        BIGMODEL_MODEL: 'glm-x',
        BIGMODEL_VISION_MODEL: 'glm-y',
        BIGMODEL_TTS_MODEL: 'glm-tts-custom',
        BIGMODEL_TTS_VOICE: 'xiaochen',
      }),
    );
    expect(cfg.bigmodel).toEqual({
      apiKey: 'k',
      baseUrl: 'https://example.com/v1',
      model: 'glm-x',
      visionModel: 'glm-y',
      ttsModel: 'glm-tts-custom',
      ttsVoice: 'xiaochen',
    });
  });

  it('reads NVIDIA values when provided', () => {
    const cfg = readAiConfig(
      stubConfig({
        AI_PROVIDER: 'nvidia',
        NVIDIA_API_KEY: 'nv',
        NVIDIA_BASE_URL: 'https://nv.example/v1',
        NVIDIA_MODEL: 'meta/llama-3.3-70b-instruct',
        NVIDIA_SAFETY_MODEL: 'nvidia/llama-3.1-nemoguard-8b-content-safety',
      }),
    );
    expect(cfg.provider).toBe('nvidia');
    expect(cfg.nvidia).toEqual({
      apiKey: 'nv',
      baseUrl: 'https://nv.example/v1',
      model: 'meta/llama-3.3-70b-instruct',
      safetyModel: 'nvidia/llama-3.1-nemoguard-8b-content-safety',
    });
  });

  it('normalizes AI_PROVIDER case and surrounding whitespace', () => {
    const cfg = readAiConfig(stubConfig({ AI_PROVIDER: '  BigModel  ' }));
    expect(cfg.provider).toBe('bigmodel');
  });

  it('treats empty-string keys as undefined (so warnings can trigger)', () => {
    const cfg = readAiConfig(stubConfig({ AI_PROVIDER: 'bigmodel', BIGMODEL_API_KEY: '' }));
    expect(cfg.bigmodel.apiKey).toBeUndefined();
  });
});
