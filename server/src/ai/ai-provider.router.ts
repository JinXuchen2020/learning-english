import {
  AiProvider,
  ProviderName,
  ChatMessage,
  ChatOptions,
  ChatResult,
  ImageInput,
  TranscriptResult,
  TranscribeOptions,
  ScoreResult,
  AssessOptions,
  AudioResult,
  SynthesizeOptions,
  AudioInput,
} from './ai-provider.interface';
import { aiContextStorage } from './ai-provider.context';
import { ProviderConfigService } from './provider-config/provider-config.service';

/**
 * AI provider 运行时路由代理（AI-705 核心）。
 *
 * 实现 `AiProvider` 接口，对现有消费者透明（仍 `@Inject(AI_PROVIDER_TOKEN)`）。
 * 每次方法调用先解析 effective parent（来自 AsyncLocalStorage），命中且有默认配置
 * → 构建该家长配置的 provider 并调用；否则 / 任何异常 → 回退构造时传入的
 * `defaultProvider`（DB 系统默认 provider，由 AiModule 工厂解析并套完整 重试/配额/日志 链）。
 *
 * 设计保证：
 * - 未配置任何自定义 provider 时，行为与改动前完全一致（零回归）；
 * - 解密失败 / 配置缺失 / 运行时异常 → 一律安全降级到系统默认，绝不向外抛启动期错误。
 */
export class AiProviderRouter implements AiProvider {
  constructor(
    private readonly defaultProvider: AiProvider,
    private readonly providerConfigService: ProviderConfigService,
  ) {}

  /** 当前生效 provider 的名称（默认 provider 之名；自定义 provider 透明代理）。 */
  get name(): string {
    return this.defaultProvider.name;
  }

  /**
   * 解析当前请求应使用的 provider（多层降级）：
   * - child 角色：先查 `resolveForChild`（自身覆盖 → 家长默认）；
   * - parent 角色：自身 `resolveDefault`；
   * - 无上下文 / 未配置 / 任何异常 → 回退构造时传入的系统默认 provider。
   */
  private async resolve(): Promise<AiProvider> {
    const ctx = aiContextStorage.getStore();
    const userId = ctx?.userId;
    if (userId) {
      try {
        if (ctx?.role !== 'parent') {
          // child：优先自身覆盖，否则 resolveForChild 内含家长默认回退
          const childConfig = await this.providerConfigService.resolveForChild(userId);
          if (childConfig) return this.providerConfigService.buildProvider(childConfig);
        } else {
          // parent：自身默认配置
          const config = await this.providerConfigService.resolveDefault(userId);
          if (config) return this.providerConfigService.buildProvider(config);
        }
      } catch {
        // 解码 / 构建失败 → 回退
      }
    }
    return this.defaultProvider;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    return (await this.resolve()).chat(messages, options);
  }

  async chatWithImage(prompt: string, image: ImageInput, options?: ChatOptions): Promise<ChatResult> {
    return (await this.resolve()).chatWithImage(prompt, image, options);
  }

  async transcribe(audio: AudioInput, options?: TranscribeOptions): Promise<TranscriptResult> {
    return (await this.resolve()).transcribe(audio, options);
  }

  async assessPronunciation(
    audio: AudioInput,
    referenceText: string,
    options?: AssessOptions,
  ): Promise<ScoreResult> {
    return (await this.resolve()).assessPronunciation(audio, referenceText, options);
  }

  async synthesize(text: string, voice?: string, options?: SynthesizeOptions): Promise<AudioResult> {
    return (await this.resolve()).synthesize(text, voice, options);
  }
}
