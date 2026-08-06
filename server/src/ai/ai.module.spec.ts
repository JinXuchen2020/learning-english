import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiModule } from './ai.module';
import { AiProvider, AI_PROVIDER_TOKEN } from './ai-provider.interface';
import { AiUsage } from './ai-usage.entity';
import { AiUsageLimitService } from './ai-usage-limit.service';
import { AiCallLog } from './ai-call-log.entity';
import { AiCallLogService } from './ai-call-log.service';
import { AiSpeechAttempt } from './ai-speech-attempt.entity';
import { AiSpeechAttemptService } from './ai-speech-attempt.service';
import { AiPronunciationScorerService } from './ai-pronunciation-scorer.service';
import { AiSpeechFeedbackService } from './ai-speech-feedback.service';
import { Word } from '../entities/word.entity';

/** 假 AiUsage 仓库：让 `AiUsageLimitService` 在无需真实 DB 的情况下完成 DI 装配。 */
const fakeAiUsageRepo = {
  findOne: jest.fn(),
  create: jest.fn((e) => e),
  save: jest.fn(async (e) => e),
};

/** 假 AiCallLog 仓库：让 `AiCallLogService` 在无需真实 DB 的情况下完成 DI 装配。 */
const fakeAiCallLogRepo = {
  create: jest.fn((e) => e),
  save: jest.fn(async (e) => e),
};

/** 假 AiSpeechAttempt 仓库：让 `AiSpeechAttemptService`(AI-301) 在无需真实 DB 的情况下完成 DI 装配。 */
const fakeAiSpeechAttemptRepo = {
  create: jest.fn((e) => e),
  save: jest.fn(async (e) => e),
  find: jest.fn(async () => []),
};

/** 假 Word 仓库：让 `AiSpeechEvaluatorService`(AI-303) 在无需真实 DB 的情况下完成 DI 装配。 */
const fakeWordRepo = {
  findOne: jest.fn(),
  create: jest.fn((e) => e),
  save: jest.fn(async (e) => e),
};

/** 假 AiPronunciationScorerService：让 `AiSpeechEvaluatorService`(AI-303 委托) 在无需真实 AI 链的情况下完成 DI 装配。 */
const fakeScorer = {
  score: jest.fn(async () => ({
    score: 88,
    readableText: '',
    weakPhonemes: [],
    feedback: '',
    mascotExpr: 'encourage',
    strategy: 'phoneme',
  })),
};

/** 构造并编译 AiModule（含仓库/服务覆盖），供各用例复用。 */
async function compileAiModule() {
  return Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AiModule],
  })
    .overrideProvider(getRepositoryToken(AiUsage))
    .useValue(fakeAiUsageRepo)
    .overrideProvider(getRepositoryToken(AiCallLog))
    .useValue(fakeAiCallLogRepo)
    .overrideProvider(getRepositoryToken(AiSpeechAttempt))
    .useValue(fakeAiSpeechAttemptRepo)
    .overrideProvider(getRepositoryToken(Word))
    .useValue(fakeWordRepo)
    .overrideProvider(AiPronunciationScorerService)
    .useValue(fakeScorer)
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

  it('also exposes AiCallLogService (AI-108) for direct consumption', async () => {
    delete process.env.AI_PROVIDER;
    const moduleRef = await compileAiModule();
    const svc = moduleRef.get(AiCallLogService);
    expect(svc).toBeDefined();
  });

  it('also exposes AiSpeechFeedbackService (AI-306) for direct consumption', async () => {
    delete process.env.AI_PROVIDER;
    const moduleRef = await compileAiModule();
    const svc = moduleRef.get(AiSpeechFeedbackService);
    expect(svc).toBeDefined();
  });
});
