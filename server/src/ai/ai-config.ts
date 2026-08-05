import { ConfigService } from '@nestjs/config';

/**
 * AI 配置集中读取（AI-105）。
 *
 * 把散落在 `createAiProvider` 中各处的 `config.get(...)` 收拢到单一、类型化的入口，
 * 所有 AI 相关环境变量（`AI_PROVIDER` / `BIGMODEL_*` / `NVIDIA_*`）经 `ConfigModule`
 * （已 `isGlobal:true`）读取并归一化，缺失的 key 记为 `undefined`（不抛错），
 * model / baseUrl 等应用与 `.env.example` 一致的默认值。
 *
 * 这是「接入现有 ConfigModule」的落地点，后续 NVIDIA 等 provider 接入时只需扩展本文件。
 */

/** BigModel（智谱）相关配置视图。 */
export interface BigModelConfigView {
  /** 智谱 API key（`{id}.{secret}`），缺失为 `undefined`。 */
  apiKey?: string;
  /** OpenAI 兼容 base URL。 */
  baseUrl?: string;
  /** 默认 chat 模型。 */
  model?: string;
  /** 视觉 / OCR 模型。 */
  visionModel?: string;
}

/** NVIDIA NIM 相关配置视图（provider 尚未实现，仅集中读取备用）。 */
export interface NvidiaConfigView {
  /** NVIDIA API key，缺失为 `undefined`。 */
  apiKey?: string;
  /** NVIDIA 推理 base URL。 */
  baseUrl?: string;
  /** 默认 chat 模型。 */
  model?: string;
  /** 内容安全过滤模型（对话安全层 AI-406 用）。 */
  safetyModel?: string;
}

/** 归一化后的整体 AI 配置。 */
export interface AiConfig {
  /**
   * 归一化（小写 + trim）后的 provider 选择。缺省 `mock`。
   * 允许未知值透传，由 `createAiProvider` 的 switch 决定回退与告警。
   */
  provider: string;
  /** BigModel 配置。 */
  bigmodel: BigModelConfigView;
  /** NVIDIA 配置。 */
  nvidia: NvidiaConfigView;
}

const DEFAULT_BIGMODEL_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_BIGMODEL_MODEL = 'glm-4.7-flash';
const DEFAULT_BIGMODEL_VISION_MODEL = 'glm-4.6v-flash';
const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

/** 从 ConfigService 读取并归一化全部 AI 配置。 */
export function readAiConfig(config: ConfigService): AiConfig {
  const provider = (config.get<string>('AI_PROVIDER') ?? 'mock').toLowerCase().trim();

  const bigmodel: BigModelConfigView = {
    apiKey: config.get<string>('BIGMODEL_API_KEY') || undefined,
    baseUrl: config.get<string>('BIGMODEL_BASE_URL') || DEFAULT_BIGMODEL_BASE_URL,
    model: config.get<string>('BIGMODEL_MODEL') || DEFAULT_BIGMODEL_MODEL,
    visionModel: config.get<string>('BIGMODEL_VISION_MODEL') || DEFAULT_BIGMODEL_VISION_MODEL,
  };

  const nvidia: NvidiaConfigView = {
    apiKey: config.get<string>('NVIDIA_API_KEY') || undefined,
    baseUrl: config.get<string>('NVIDIA_BASE_URL') || DEFAULT_NVIDIA_BASE_URL,
    model: config.get<string>('NVIDIA_MODEL') || undefined,
    safetyModel: config.get<string>('NVIDIA_SAFETY_MODEL') || undefined,
  };

  return { provider, bigmodel, nvidia };
}
