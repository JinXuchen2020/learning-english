import { ConfigService } from '@nestjs/config';
import { createAiProvider } from './ai.module';
import { BigModelProvider } from './bigmodel.provider';
import { MockAiProvider } from './mock-ai.provider';
import { logger } from '../common/logger/logger';

/** 最小 ConfigService 桩：仅实现 `get`，返回预置 map。 */
function stubConfig(map: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => map[k] } as unknown as ConfigService;
}

describe('createAiProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns BigModelProvider when AI_PROVIDER=bigmodel', () => {
    const p = createAiProvider(stubConfig({ AI_PROVIDER: 'bigmodel', BIGMODEL_API_KEY: 'k' }));
    expect(p).toBeInstanceOf(BigModelProvider);
    expect(p.name).toBe('bigmodel');
  });

  it('returns MockAiProvider when AI_PROVIDER=mock', () => {
    const p = createAiProvider(stubConfig({ AI_PROVIDER: 'mock' }));
    expect(p).toBeInstanceOf(MockAiProvider);
  });

  it('returns MockAiProvider when AI_PROVIDER is missing', () => {
    const p = createAiProvider(stubConfig({}));
    expect(p).toBeInstanceOf(MockAiProvider);
  });

  it('falls back to MockAiProvider with a warning for nvidia (not yet implemented)', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const p = createAiProvider(stubConfig({ AI_PROVIDER: 'nvidia' }));
    expect(p).toBeInstanceOf(MockAiProvider);
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to MockAiProvider with a warning for azure (not yet implemented)', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const p = createAiProvider(stubConfig({ AI_PROVIDER: 'azure' }));
    expect(p).toBeInstanceOf(MockAiProvider);
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to MockAiProvider with a warning for unknown value', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const p = createAiProvider(stubConfig({ AI_PROVIDER: 'openai' }));
    expect(p).toBeInstanceOf(MockAiProvider);
    expect(warn).toHaveBeenCalled();
  });

  it('is case-insensitive and trims AI_PROVIDER', () => {
    const p = createAiProvider(stubConfig({ AI_PROVIDER: '  BigModel  ' }));
    expect(p).toBeInstanceOf(BigModelProvider);
  });

  it('passes BigModel config from ConfigService into the provider', () => {
    const p = createAiProvider(
      stubConfig({
        AI_PROVIDER: 'bigmodel',
        BIGMODEL_API_KEY: 'my-key',
        BIGMODEL_BASE_URL: 'https://example.com/v1',
        BIGMODEL_MODEL: 'glm-x',
        BIGMODEL_VISION_MODEL: 'glm-y',
      }),
    ) as BigModelProvider;
    expect(p.name).toBe('bigmodel');
  });

  it('warns at startup when AI_PROVIDER=bigmodel but BIGMODEL_API_KEY is missing', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const p = createAiProvider(stubConfig({ AI_PROVIDER: 'bigmodel' }));
    expect(p).toBeInstanceOf(BigModelProvider);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain('BIGMODEL_API_KEY');
  });

  it('does NOT warn about a missing key when AI_PROVIDER=bigmodel and the key is present', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    createAiProvider(stubConfig({ AI_PROVIDER: 'bigmodel', BIGMODEL_API_KEY: 'my-key' }));
    expect(warn).not.toHaveBeenCalled();
  });
});
