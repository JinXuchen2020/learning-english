import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiProvider, AI_PROVIDER_TOKEN } from './ai-provider.interface';
import { BigModelProvider } from './bigmodel.provider';
import { MockAiProvider } from './mock-ai.provider';
import { logger } from '../common/logger/logger';
import { readAiConfig } from './ai-config';
import { createRetryableProvider } from './retryable-ai-provider';
import { AiUsage } from './ai-usage.entity';
import { AiUsageLimitService } from './ai-usage-limit.service';
import {
  createUsageLimitedProvider,
  USER_ID_RESOLVER_TOKEN,
  UserIdResolver,
} from './usage-limited-ai-provider';
import { AiCallLog } from './ai-call-log.entity';
import { AiCallLogService } from './ai-call-log.service';
import { AiSpeechAttempt } from './ai-speech-attempt.entity';
import { AiSpeechAttemptService } from './ai-speech-attempt.service';
import { AiReportService } from './ai-report.service';
import { AiReportController } from './ai-report.controller';
import { MascotStory } from './mascot-story.entity';
import { MascotStoryService } from './mascot-story.service';
import { MascotStoryController } from './mascot-story.controller';
import { PictureBook } from './picture-book.entity';
import { PictureBookService } from './picture-book.service';
import { PictureBookController } from './picture-book.controller';
import { AiReport } from './ai-report.entity';
import { AiParentEmailLog } from './ai-parent-email-log.entity';
import { ReportSchedulerService } from './report-scheduler.service';
import { EmailService } from './email.service';
import { LogEmailSender } from './log-email-sender.service';
import { EMAIL_SENDER_TOKEN } from './email-sender.interface';
import { WeeklyReportService } from './weekly-report.service';
import { AiWeeklyReportController } from './ai-weekly-report.controller';
import { TaskCompletion } from '../entities/task-completion.entity';
import { WordProgress } from '../entities/word-progress.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { User } from '../entities/user.entity';
import { Course } from '../entities/course.entity';
import { Lesson } from '../entities/lesson.entity';
import { Word } from '../entities/word.entity';
import { Sentence } from '../entities/sentence.entity';
import { AiController } from './ai.controller';
import { AiSpeechEvaluatorService } from './ai-speech-evaluator.service';
import { AiTranscribeService } from './ai-transcribe.service';
import { AiPronunciationScorerService } from './ai-pronunciation-scorer.service';
import { AiSpeechFeedbackService } from './ai-speech-feedback.service';
import { RewardsModule } from '../rewards/rewards.module';
import {
  createLoggedProvider,
  AI_MODULE_TAG_RESOLVER_TOKEN,
  ModuleTagResolver,
} from './logged-ai-provider';

/**
 * 构造「重试 + 每日配额」链的最内层 provider（不含配额外壳）。
 *
 * 保留原签名（仅 `config`）以兼容 `ai.factory.spec.ts`；配额外壳在下方模块
 * 工厂 `createQuotaAwareProvider` 中叠加，二者职责分离便于单测。
 */
export function createAiProvider(config: ConfigService): AiProvider {
  const cfg = readAiConfig(config);
  const provider = cfg.provider;
  let inner: AiProvider;
  switch (provider) {
    case 'bigmodel':
      if (!cfg.bigmodel.apiKey) {
        logger.warn(
          '[AI] AI_PROVIDER=bigmodel 但未配置 BIGMODEL_API_KEY，调用将失败；建议配置 key 或设 AI_PROVIDER=mock 进行演示',
        );
      }
      inner = new BigModelProvider({
        apiKey: cfg.bigmodel.apiKey,
        baseUrl: cfg.bigmodel.baseUrl,
        model: cfg.bigmodel.model,
        visionModel: cfg.bigmodel.visionModel,
        ttsModel: cfg.bigmodel.ttsModel,
        ttsVoice: cfg.bigmodel.ttsVoice,
      });
      break;
    case 'mock':
      inner = new MockAiProvider();
      break;
    case 'nvidia': {
      const lackingKey = cfg.nvidia.apiKey ? '' : '且缺少 NVIDIA_API_KEY，';
      logger.warn(`[AI] AI_PROVIDER=nvidia 尚未实现（${lackingKey}）回退 MockAiProvider 以保证应用可启动`);
      inner = new MockAiProvider();
      break;
    }
    case 'azure':
      logger.warn('[AI] AI_PROVIDER=azure 尚未实现，回退 MockAiProvider 以保证应用可启动');
      inner = new MockAiProvider();
      break;
    default:
      logger.warn(`[AI] 未知的 AI_PROVIDER=${provider}，回退 MockAiProvider`);
      inner = new MockAiProvider();
  }
  return createRetryableProvider(inner);
}

/**
 * 模块工厂：把内层（重试后）provider 再套上 AI-107 每日配额闸门，形成
 * 中间层 `UsageLimited(Retryable(inner))`。
 * 配额错误在最外层抛出，不会进入内层 `withRetry` 重试。
 *
 * 注入 `AiUsageLimitService`（负责 `ai_usage` 持久化）与 userId 解析器。
 */
export function createQuotaAwareProvider(
  config: ConfigService,
  usage: AiUsageLimitService,
  resolveUserId: UserIdResolver,
): AiProvider {
  const inner = createAiProvider(config);
  return createUsageLimitedProvider(inner, usage, resolveUserId);
}

/**
 * 模块工厂（最终对外 provider）：在最外层套上 AI-108 审计日志
 * `Logged(UsageLimited(Retryable(inner)))`。
 * 注入 userId / moduleTag 解析器与 `AiCallLogService`。
 */
export function createAuditedProvider(
  config: ConfigService,
  usage: AiUsageLimitService,
  resolveUserId: UserIdResolver,
  resolveModuleTag: ModuleTagResolver,
  callLog: AiCallLogService,
): AiProvider {
  const inner = createQuotaAwareProvider(config, usage, resolveUserId);
  return createLoggedProvider(inner, callLog, resolveUserId, resolveModuleTag);
}

/**
 * AI 能力模块。标 `@Global()`：plan / speech / conversation / report 等多模块
 * 复用同一 `AiProvider`，全局注入免去各消费方重复 import（与 `ConfigModule`
 * 的 `isGlobal:true` 同一设计取向）。
 *
 * 注册 `AiUsage` / `AiCallLog` / `AiSpeechAttempt` 实体（`TypeOrmModule.forFeature`）以支撑
 * `AiUsageLimitService` / `AiCallLogService` / `AiSpeechAttemptService` 的仓库注入；
 * 三者均导出供未来控制器按需直接调用。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AiUsage, AiCallLog, AiSpeechAttempt, AiReport, AiParentEmailLog, MascotStory, PictureBook, Course, Lesson, TaskCompletion, WordProgress, LessonProgress, User, Word, Sentence]), RewardsModule],
  controllers: [AiController, AiReportController, AiWeeklyReportController, MascotStoryController, PictureBookController],
  providers: [
    { provide: USER_ID_RESOLVER_TOKEN, useValue: (() => 'anonymous') as UserIdResolver },
    { provide: AI_MODULE_TAG_RESOLVER_TOKEN, useValue: (() => 'global') as ModuleTagResolver },
    AiUsageLimitService,
    AiCallLogService,
    AiSpeechAttemptService,
    AiReportService,
    MascotStoryService,
    PictureBookService,
    ReportSchedulerService,
    EmailService,
    LogEmailSender,
    WeeklyReportService,
    AiSpeechEvaluatorService,
    AiTranscribeService,
    AiPronunciationScorerService,
    AiSpeechFeedbackService,
    { provide: EMAIL_SENDER_TOKEN, useClass: LogEmailSender },
    {
      provide: AI_PROVIDER_TOKEN,
      useFactory: createAuditedProvider,
      inject: [
        ConfigService,
        AiUsageLimitService,
        USER_ID_RESOLVER_TOKEN,
        AI_MODULE_TAG_RESOLVER_TOKEN,
        AiCallLogService,
      ],
    },
  ],
  exports: [
    AI_PROVIDER_TOKEN,
    AiUsageLimitService,
    AiCallLogService,
    AiSpeechAttemptService,
    AiReportService,
    MascotStoryService,
    PictureBookService,
    ReportSchedulerService,
    AiSpeechEvaluatorService,
    AiTranscribeService,
    AiPronunciationScorerService,
    AiSpeechFeedbackService,
  ],
})
export class AiModule {}
