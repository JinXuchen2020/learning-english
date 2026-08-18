import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiProvider, AI_PROVIDER_TOKEN } from './ai-provider.interface';
import { logger } from '../common/logger/logger';
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
import { AiProviderContextInterceptor } from './ai-provider-context.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AiCapabilityHub } from './ai-capability-hub';
import { ChatProvider } from './chat.provider';
import { VisionProvider } from './vision.provider';
import { SttProvider } from './stt.provider';
import { TtsProvider } from './tts.provider';
import { PronunciationProvider } from './pronunciation.provider';

/**
 * 构造「重试 + 每日配额 + 审计」链（AI-713）。
 *
 * 基础 provider 来自 DB 解析的「系统默认」provider 配置，由 `AiCapabilityHub` 聚合
 * 5 个能力 provider（Chat/Vision/Stt/Tts/Pronunciation），每个能力 provider 在调用时
 * **自行加载**生效配置（家长覆盖 → 系统默认 → Mock 安全桩），不依赖单一兜底链。
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
 * `Logged(UsageLimited(inner))`。
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

/**
 * AI 能力模块。标 `@Global()`：plan / speech / conversation / report 等多模块
 * 复用同一 `AiProvider`，全局注入免去各消费方重复 import（与 `ConfigModule`
 * 的 `isGlobal:true` 同一设计取向）。
 *
 * 注册 `AiUsage` / `AiCallLog` / `AiSpeechAttempt` 实体（`TypeOrmModule.forFeature`）以支撑
 * `AiUsageLimitService` / `AiCallLogService` / `AiSpeechAttemptService` 的仓库注入；
 * 三者均导出供未来控制器按需直接调用。
 *
 * 架构（AI-重构）：`AI_PROVIDER_TOKEN` 绑定 `AiCapabilityHub`，由 5 个按能力命名的
 * provider（各自加载配置）组成；不再有 `FallbackAiProvider` 多链 / `EdgeTts` 链路。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AiUsage, AiCallLog, AiSpeechAttempt, AiReport, AiParentEmailLog, MascotStory, PictureBook, Course, Lesson, TaskCompletion, WordProgress, LessonProgress, User, Word, Sentence]), RewardsModule, ProviderConfigModule, JwtModule.register({ secret: process.env.JWT_SECRET || 'fox-english-kids-secret', signOptions: { expiresIn: '15m' } })],
  controllers: [AiController, AiReportController, AiWeeklyReportController, MascotStoryController, PictureBookController],
  providers: [
    { provide: USER_ID_RESOLVER_TOKEN, useValue: (() => 'anonymous') as UserIdResolver },
    { provide: AI_MODULE_TAG_RESOLVER_TOKEN, useValue: ((op: string) => op) as ModuleTagResolver },
    // 5 个按能力命名的 provider（各自加载配置）
    ChatProvider,
    VisionProvider,
    SttProvider,
    TtsProvider,
    PronunciationProvider,
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
        chat: ChatProvider,
        vision: VisionProvider,
        stt: SttProvider,
        tts: TtsProvider,
        pronunciation: PronunciationProvider,
      ) => {
        // AI-重构：聚合 5 个能力 provider；每个能力 provider 自行按能力加载配置，
        // 无配置时返回 Mock 安全桩。跨切面审计/配额包在最外层。
        const hub = new AiCapabilityHub(chat, vision, stt, tts, pronunciation);
        return createAuditedProvider(hub, usage, resolveUserId, resolveModuleTag, callLog);
      },
      inject: [
        AiUsageLimitService,
        USER_ID_RESOLVER_TOKEN,
        AI_MODULE_TAG_RESOLVER_TOKEN,
        AiCallLogService,
        ChatProvider,
        VisionProvider,
        SttProvider,
        TtsProvider,
        PronunciationProvider,
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
export class AiModule {
  /** 模块装配自检：能力 provider 缺失配置时由 Mock 兜底（不抛错、可启动）。 */
  onModuleInit(): void {
    logger.info('[AI] 模块装配完成：AiCapabilityHub 聚合 Chat/Vision/Stt/Tts/Pronunciation 5 个能力 provider（各自按能力加载配置）');
  }
}
