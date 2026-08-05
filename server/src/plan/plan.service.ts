import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiProvider, AI_PROVIDER_TOKEN, ChatMessage, ChatOptions } from '../ai/ai-provider.interface';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { GeneratePlanResponse, GeneratedPlan } from './plan.types';

/**
 * 学习计划生成服务（AI-202）。
 *
 * 编排：`GeneratePlanDto` → 组装 chat 消息 → `AiProvider.chat` → 剥离代码围栏
 * 并解析为 `GeneratedPlan`。不落库（落库/应用为 AI-206）。
 *
 * 依赖全局 `AiProvider`（`AiModule` 的 `@Global()` 注入 `AI_PROVIDER_TOKEN`），
 * 因此 `PlanModule` 无需重复 import `AiModule`。
 *
 * 降级策略：LLM 返回非 JSON（如 `AI_PROVIDER=mock` 的演示文本）时，`degraded`
 * 置 true 并将原文放入 `plan.rawText`，仍返回 200，保证 AI-104「无 key 演示」
 * 契约与前端降级展示。严格 Schema 校验 + 重试 + 模板降级属 AI-204 / AI-205。
 */
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    @Inject(AI_PROVIDER_TOKEN) private readonly ai: AiProvider,
  ) {}

  /**
   * 生成学习计划。
   * @param dto 经 class-validator 校验后的请求体
   * @returns 结构化计划响应（含 `degraded` 标志）
   * @throws 当 `AiProvider.chat` 抛错时向上传播（AI-106 重试/配额在外层处理）
   */
  async generatePlan(dto: GeneratePlanDto): Promise<GeneratePlanResponse> {
    const messages = this.buildMessages(dto);
    const options: ChatOptions = { temperature: 0.4, maxTokens: 2048 };

    const result = await this.ai.chat(messages, options);
    const model = result.model;

    let plan: GeneratedPlan;
    let degraded = false;
    try {
      plan = this.parsePlan(result.text);
    } catch {
      degraded = true;
      plan = { rawText: result.text };
      this.logger.warn(
        '[Plan] AI 返回非 JSON，降级为 rawText（degraded=true）；模型=%s',
        model ?? this.ai.name,
      );
    }

    return { plan, model, degraded };
  }

  /** 组装 system + user 消息。占位 prompt，完整双语 PlanAgent 提示词属 AI-203。 */
  private buildMessages(dto: GeneratePlanDto): ChatMessage[] {
    return [
      { role: 'system', content: PLAN_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(dto) },
    ];
  }

  /**
   * 从 LLM 文本解析结构化计划。
   * 先剥离可能的 Markdown 代码围栏（```json ... ```），再 `JSON.parse`；
   * 解析失败或结果非对象 → 抛错由调用方降级为 `rawText`。
   */
  private parsePlan(text: string): GeneratedPlan {
    const cleaned = extractJson(text);
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new SyntaxError('AI 返回不是 JSON 对象');
    }
    return parsed as GeneratedPlan;
  }
}

/**
 * 最小可运行系统提示词（AI-202 占位）。
 * 要求模型仅输出 JSON 学习计划；完整双语 PlanAgent（安全红线/间隔复习/技能交错/
 * 儿童友好）由 AI-203 替换。保持简短以免过度构建 AI-203。
 */
const PLAN_SYSTEM_PROMPT = [
  '你是一位儿童英语学习计划设计师。',
  '根据用户的年龄段、等级、每日时长、兴趣与计划周数，生成一份个性化学习计划。',
  '每天包含 1 节主课 + 2 个复习 + 1 个口语练习，技能交错，避免一天过载，严守儿童内容安全。',
  '只输出 JSON，不要任何解释或 Markdown 围栏，结构：{"weeks":[{"week":1,"days":[{"day":1,"skillType":"vocab","title":"...","lessons":[{"type":"main","title":"..."}]}]}]}。',
].join('');

/**
 * 剥离 LLM 常见的 Markdown 代码围栏，提取纯 JSON 文本。
 * 处理 ```json ... ``` 与 ``` ... ``` 两种围栏；无围栏则原样返回（trim）。
 */
export function extractJson(text: string): string {
  if (!text) return text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}
