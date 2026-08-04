import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AI_PROVIDER_TOKEN } from './ai-provider.interface';
import { BigModelProvider } from './bigmodel.provider';
import { MockAiProvider } from './mock-ai.provider';
import { logger } from '../common/logger/logger';

/**
 * 按 `.env` 的 `AI_PROVIDER` 选择并构造具体 provider：
 * - `bigmodel`  -> `BigModelProvider`（智谱 OpenAI 兼容，AI-102）
 * - `mock` / 缺失 / 未知 -> `MockAiProvider`（确定性假数据，保证无 key 可启动）
 * - `nvidia` / `azure` -> 对应 provider 尚未实现，回退 `MockAiProvider` 并告警，
 *   避免启动失败（真实实现分别由后续 feature 接入）。
 *
 * 业务模块只需 `@Inject(AI_PROVIDER_TOKEN)` 拿 `AiProvider` 抽象，不绑定厂商。
 */
export function createAiProvider(config: ConfigService): AiProvider {
  const provider = (config.get<string>('AI_PROVIDER') ?? 'mock').toLowerCase().trim();
  switch (provider) {
    case 'bigmodel':
      return new BigModelProvider({
        apiKey: config.get<string>('BIGMODEL_API_KEY'),
        baseUrl: config.get<string>('BIGMODEL_BASE_URL'),
        model: config.get<string>('BIGMODEL_MODEL'),
        visionModel: config.get<string>('BIGMODEL_VISION_MODEL'),
      });
    case 'mock':
      return new MockAiProvider();
    case 'nvidia':
    case 'azure':
      logger.warn(`AI_PROVIDER=${provider} 尚未实现，回退到 MockAiProvider 以保证应用可启动`);
      return new MockAiProvider();
    default:
      logger.warn(`未知的 AI_PROVIDER=${provider}，回退到 MockAiProvider`);
      return new MockAiProvider();
  }
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
