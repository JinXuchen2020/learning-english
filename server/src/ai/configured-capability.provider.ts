import { Injectable } from '@nestjs/common';
import { AiProvider } from './ai-provider.interface';
import { ProviderCapability } from './provider-config/provider-config.entity';
import { ProviderConfigService } from './provider-config/provider-config.service';
import { MockAiProvider } from './mock-ai-provider';
import { aiContextStorage } from './ai-provider.context';

/**
 * 按能力命名的 provider 配置加载基类（AI-重构核心）。
 *
 * 设计：每个能力 provider（Chat/Vision/Stt/Tts/Pronunciation）**只关心一种能力**，
 * 在每次调用时**自行从 `ProviderConfigService` 按能力加载生效配置**（家长覆盖 →
 * 系统默认 → null），用配置构建底层真实 client（OpenAI 兼容通道，已套 retry）；
 * 无配置 / 解密或构建异常 → 一律返回 `MockAiProvider` 安全桩，**绝不抛错**，
 * 保证「没配该能力的 provider」时 UI 不崩、可演示。
 *
 * 这把「provider 加载配置」的职责从单一的兜底链下沉到每个能力 provider 自身，
 * 实现「5 种能力 = 5 个 provider、以能力命名而非以配置/传输类型命名」。
 *
 * @module ai/configured-capability.provider
 */
@Injectable()
export abstract class ConfiguredCapabilityProvider {
  /** 能力缺失时的安全桩（调用不抛错）。 */
  protected readonly mock = new MockAiProvider();

  constructor(protected readonly configService: ProviderConfigService) {}

  /**
   * 按能力解析生效的真实 client（已套 retry）；无配置 / 异常 → Mock 安全桩。
   * 真实 client 不缓存：配置（key 轮换等）变更即时生效，重建成本可忽略。
   */
  protected async resolveClient(capability: ProviderCapability): Promise<AiProvider> {
    try {
      const ctx = aiContextStorage.getStore();
      const effectiveParentId = await this.configService.resolveEffectiveParentId(
        ctx?.userId,
        ctx?.role,
      );
      const cfg = await this.configService.resolveConfigForCapability(
        effectiveParentId,
        capability,
      );
      if (!cfg) return this.mock;
      // buildProvider 已返回带重试/并发保护的可运行 provider，无需再包一层。
      return this.configService.buildProvider(cfg);
    } catch {
      // 解析 / 构建失败 → 回退 Mock 安全桩，绝不向外抛错。
      return this.mock;
    }
  }
}
