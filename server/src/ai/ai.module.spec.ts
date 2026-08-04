import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai.module';
import { AiProvider, AI_PROVIDER_TOKEN } from './ai-provider.interface';

describe('AiModule (DI 动态装配)', () => {
  const ORIGINAL = process.env.AI_PROVIDER;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = ORIGINAL;
  });

  it('injects a bigmodel-backed provider when AI_PROVIDER=bigmodel', async () => {
    process.env.AI_PROVIDER = 'bigmodel';
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AiModule],
    }).compile();
    const provider = moduleRef.get<AiProvider>(AI_PROVIDER_TOKEN);
    expect(provider.name).toBe('bigmodel');
  });

  it('injects a mock-backed provider when AI_PROVIDER is unset (default)', async () => {
    delete process.env.AI_PROVIDER;
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AiModule],
    }).compile();
    const provider = moduleRef.get<AiProvider>(AI_PROVIDER_TOKEN);
    expect(provider.name).toBe('mock');
  });

  it('injects a mock-backed provider when AI_PROVIDER=mock', async () => {
    process.env.AI_PROVIDER = 'mock';
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AiModule],
    }).compile();
    const provider = moduleRef.get<AiProvider>(AI_PROVIDER_TOKEN);
    expect(provider.name).toBe('mock');
  });
});
