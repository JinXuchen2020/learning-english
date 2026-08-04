import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiModule } from './ai.module';
import { AiProvider, AI_PROVIDER_TOKEN } from './ai-provider.interface';
import { AiUsage } from './ai-usage.entity';
import { AiUsageLimitService } from './ai-usage-limit.service';

/** 假 AiUsage 仓库：让 `AiUsageLimitService` 在无需真实 DB 的情况下完成 DI 装配。 */
const fakeAiUsageRepo = {
  findOne: jest.fn(),
  create: jest.fn((e) => e),
  save: jest.fn(async (e) => e),
};

/** 构造并编译 AiModule（含仓库覆盖），供各用例复用。 */
async function compileAiModule() {
  return Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AiModule],
  })
    .overrideProvider(getRepositoryToken(AiUsage))
    .useValue(fakeAiUsageRepo)
    .compile();
}

describe('AiModule (DI 动态装配)', () => {
  const ORIGINAL = process.env.AI_PROVIDER;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = ORIGINAL;
  });

  it('injects a bigmodel-backed provider when AI_PROVIDER=bigmodel', async () => {
    process.env.AI_PROVIDER = 'bigmodel';
    const moduleRef = await compileAiModule();
    const provider = moduleRef.get<AiProvider>(AI_PROVIDER_TOKEN);
    expect(provider.name).toBe('bigmodel');
  });

  it('injects a mock-backed provider when AI_PROVIDER is unset (default)', async () => {
    delete process.env.AI_PROVIDER;
    const moduleRef = await compileAiModule();
    const provider = moduleRef.get<AiProvider>(AI_PROVIDER_TOKEN);
    expect(provider.name).toBe('mock');
  });

  it('injects a mock-backed provider when AI_PROVIDER=mock', async () => {
    process.env.AI_PROVIDER = 'mock';
    const moduleRef = await compileAiModule();
    const provider = moduleRef.get<AiProvider>(AI_PROVIDER_TOKEN);
    expect(provider.name).toBe('mock');
  });

  it('also exposes AiUsageLimitService for direct consumption', async () => {
    delete process.env.AI_PROVIDER;
    const moduleRef = await compileAiModule();
    const svc = moduleRef.get(AiUsageLimitService);
    expect(svc).toBeDefined();
  });
});
