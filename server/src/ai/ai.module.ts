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
 * 模块工厂：把内层（重试后）provider 再套上 AI-107 每日配额闸门，形成最终对外
 * 暴露的 `AiProvider`：UsageLimited(Retryable(inner))。
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
 * AI 能力模块。标 `@Global()`：plan / speech / conversation / report 等多模块
 * 复用同一 `AiProvider`，全局注入免去各消费方重复 import（与 `ConfigModule`
 * 的 `isGlobal:true` 同一设计取向）。
 *
 * 注册 `AiUsage` 实体（`TypeOrmModule.forFeature`）以支撑 `AiUsageLimitService`
 * 的仓库注入；导出 `AiUsageLimitService` 供未来控制器按需直接调用。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AiUsage])],
  providers: [
    { provide: USER_ID_RESOLVER_TOKEN, useValue: (() => 'anonymous') as UserIdResolver },
    AiUsageLimitService,
    {
      provide: AI_PROVIDER_TOKEN,
      useFactory: createQuotaAwareProvider,
      inject: [ConfigService, AiUsageLimitService, USER_ID_RESOLVER_TOKEN],
    },
  ],
  exports: [AI_PROVIDER_TOKEN, AiUsageLimitService],
})
export class AiModule {}
