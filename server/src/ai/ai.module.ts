import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiProvider, AI_PROVIDER_TOKEN } from './ai-provider.interface';
import { BigModelProvider } from './bigmodel.provider';
import { logger } from '../common/logger/logger';
import { createRetryableProvider } from './retryable-ai-provider';
import { FallbackAiProvider } from './fallback-ai-provider';
import { EdgeTtsProvider } from './edge-tts.provider';
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
import { JwtModule } from '@nestjs/jwt';
import {
  createLoggedProvider,
  AI_MODULE_TAG_RESOLVER_TOKEN,
  ModuleTagResolver,
} from './logged-ai-provider';
import { ProviderConfigModule } from './provider-config/provider-config.module';
import { ProviderConfigService } from './provider-config/provider-config.service';
import { AiProviderRouter } from './ai-provider.router';
import { AiProviderContextInterceptor } from './ai-provider-context.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';

/**
 * 构造「重试 + 每日配额 + 审计」链（AI-713）。
 *
 * 基础 provider 不再来自 env，而来自 DB 解析的「系统默认」provider 配置
 * （`providerConfigService.resolveSystemDefault()`，由 `seed.ts` 播种智谱配置）。
 * 未 seed / 缺失时兜底构造一个空 key 的 BigModelProvider（调用时失败但应用可启动）。
 */
export function createQuotaAwareProvider(
  inner: AiProvider,
  usage: AiUsageLimitService,
  resolveUserId: UserIdResolver,
): AiProvider {
  return createUsageLimitedProvider(inner, usage, resolveUserId);
}

/**
 * 模块工厂（最终对外 provider）：在最外层套上 AI-108 审计日志
 * `Logged(UsageLimited(Retryable(inner)))`。
 * 注入 userId / moduleTag 解析器与 `AiCallLogService`。
 */
export function createAuditedProvider(
  inner: AiProvider,
  usage: AiUsageLimitService,
  resolveUserId: UserIdResolver,
  resolveModuleTag: ModuleTagResolver,
  callLog: AiCallLogService,
): AiProvider {
  const quotaWrapped = createQuotaAwareProvider(inner, usage, resolveUserId);
  return createLoggedProvider(quotaWrapped, callLog, resolveUserId, resolveModuleTag);
}

/** 系统默认缺失时的兜底 provider（无 key，调用时失败但应用可启动）。 */
function fallbackProvider(): AiProvider {
  logger.error(
    '[AI] 未找到系统默认 provider 配置（请先运行 npm run seed 播种智谱默认），AI 调用将失败',
  );
  return createRetryableProvider(new BigModelProvider({ apiKey: '' }));
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
  imports: [TypeOrmModule.forFeature([AiUsage, AiCallLog, AiSpeechAttempt, AiReport, AiParentEmailLog, MascotStory, PictureBook, Course, Lesson, TaskCompletion, WordProgress, LessonProgress, User, Word, Sentence]), RewardsModule, ProviderConfigModule, JwtModule.register({ secret: process.env.JWT_SECRET || 'fox-english-kids-secret', signOptions: { expiresIn: '15m' } })],
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
      useFactory: async (
        usage: AiUsageLimitService,
        resolveUserId: UserIdResolver,
        resolveModuleTag: ModuleTagResolver,
        callLog: AiCallLogService,
        providerConfigService: ProviderConfigService,
      ) => {
        // AI-713：基础 provider 来自 DB 系统默认（seed 播种的智谱配置），
        // 不再从 env 读取。缺失则兜底空 key provider（调用失败但可启动）。
        // AI-713 续：系统 provider 链（主用 Agnes AI → 兜底智谱）。为空则回退空 key provider。
        const sysChain = await providerConfigService.resolveSystemChain();
        const innerProviders = sysChain.length
          ? sysChain.map((cfg) => providerConfigService.buildProvider(cfg))
          : [fallbackProvider()];
        // AI-407 修复：本地免费 edge-tts 作为 synthesize 链最终兜底（付费 provider 均无可用 TTS 通道）。
        innerProviders.push(new EdgeTtsProvider());
        const chain = new FallbackAiProvider(innerProviders);
        const defaultProvider = createAuditedProvider(chain, usage, resolveUserId, resolveModuleTag, callLog);
        // 运行时路由代理：命中家长/孩子配置则走自定义 provider，否则回退系统默认链。
        return new AiProviderRouter(defaultProvider, providerConfigService);
      },
      inject: [
        AiUsageLimitService,
        USER_ID_RESOLVER_TOKEN,
        AI_MODULE_TAG_RESOLVER_TOKEN,
        AiCallLogService,
        ProviderConfigService,
      ],
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AiProviderContextInterceptor,
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
