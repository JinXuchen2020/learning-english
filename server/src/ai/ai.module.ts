import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AI_PROVIDER_TOKEN } from './ai-provider.interface';
import { BigModelProvider } from './bigmodel.provider';
import { MockAiProvider } from './mock-ai.provider';
import { logger } from '../common/logger/logger';
import { readAiConfig } from './ai-config';
import { createRetryableProvider } from './retryable-ai-provider';

/**
 * 按 `.env` 的 `AI_PROVIDER` 选择并构造具体 provider：
 * - `bigmodel`  -> `BigModelProvider`（智谱 OpenAI 兼容，AI-102）
 * - `mock` / 缺失 / 未知 -> `MockAiProvider`（确定性假数据，保证无 key 可启动）
 * - `nvidia` / `azure` -> 对应 provider 尚未实现，回退 `MockAiProvider` 并告警，
 *   避免启动失败（真实实现分别由后续 feature 接入）。
 *
 * 配置统一经 `readAiConfig`（AI-105）读取；选中的真实 provider 缺 key 时打印
 * 启动告警（不阻断启动，保持「无 key 应用可启动」契约）。
 *
 * 无论选哪个内层 provider，最终都经 `createRetryableProvider`（AI-106）套上
 * 指数退避重试 + 并发限流，使所有消费方免费获得调用韧性。
 *
 * 业务模块只需 `@Inject(AI_PROVIDER_TOKEN)` 拿 `AiProvider` 抽象，不绑定厂商。
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
 * AI 能力模块。标 `@Global()`：plan / speech / conversation / report 等多模块
 * 复用同一 `AiProvider`，全局注入免去各消费方重复 import（与 `ConfigModule`
 * 的 `isGlobal:true` 同一设计取向）。
 */
@Global()
@Module({
  providers: [
    {
      provide: AI_PROVIDER_TOKEN,
      useFactory: createAiProvider,
      inject: [ConfigService],
    },
  ],
  exports: [AI_PROVIDER_TOKEN],
})
export class AiModule {}
