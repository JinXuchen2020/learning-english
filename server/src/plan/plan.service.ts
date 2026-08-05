import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiProvider, AI_PROVIDER_TOKEN, ChatMessage, ChatOptions } from '../ai/ai-provider.interface';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { GeneratePlanResponse, GeneratedPlan } from './plan.types';
import { PLAN_SYSTEM_PROMPT, buildPlanUserPrompt } from './plan-agent.prompt';
import { validatePlan } from './plan-schema';
import { buildFallbackPlan } from './plan-template';

/**
 * 学习计划生成服务（AI-202 编排 + AI-203 双语 PlanAgent 提示词 + AI-204 Schema 校验/重试/模板降级）。
 *
 * 编排：`GeneratePlanDto` → 组装 chat 消息（system=双语儿科友好 PlanAgent 提示词，
 * user=学习者画像 + 可选课程目录）→ `AiProvider.chat` → 剥离代码围栏 → `validatePlan`
 * 结构校验 → 合规则返回；不合规则**自动重试**（≤`MAX_PLAN_ATTEMPTS` 次，重试请求附带
 * `retryNote` 自我纠正）→ 仍失败降级为 `buildFallbackPlan` 内置模板（`degraded:true`）。
 * 不落库（落库/应用为 AI-206）。
 *
 * 依赖全局 `AiProvider`（`AiModule` 的 `@Global()` 注入 `AI_PROVIDER_TOKEN`），
 * 因此 `PlanModule` 无需重复 import `AiModule`。
 *
 * 重试边界（AI-204 硬约束）：仅「输出校验失败」重试；`AiProvider.chat` 抛出的基础设施
 * 异常**向上传播**（不在本层重试，避免与 AI-106 的 HTTP 层 3 次退避叠加成 9 次）。
 */
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  /** 计划生成最大尝试次数（AI-204）：首轮 + 至多 2 次重试。 */
  static readonly MAX_PLAN_ATTEMPTS = 3;

  constructor(
    @Inject(AI_PROVIDER_TOKEN) private readonly ai: AiProvider,
  ) {}

  /**
   * 生成学习计划（含 Schema 校验 + 自动重试 + 模板降级）。
   * @param dto 经 class-validator 校验后的请求体
   * @returns 结构化计划响应（含 `degraded` 标志）
   * @throws 当 `AiProvider.chat` 抛错时向上传播（AI-106 重试/配额在外层处理）
   */
  async generatePlan(dto: GeneratePlanDto): Promise<GeneratePlanResponse> {
    let lastErrors: string[] = [];
    let lastRawText = '';

    for (let attempt = 1; attempt <= PlanService.MAX_PLAN_ATTEMPTS; attempt++) {
      const messages = this.buildMessages(dto, attempt);
      const options: ChatOptions = { temperature: 0.4, maxTokens: 2048 };

      // provider 基础设施异常 → 直接向上传播，不在本层重试（避免与 AI-106 叠加）。
      const result = await this.ai.chat(messages, options);
      lastRawText = result.text;

      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJson(result.text));
      } catch {
        lastErrors = ['响应不是合法 JSON'];
        this.logger.warn('[Plan] 第 %d 次生成：响应非合法 JSON，将重试', attempt);
        continue;
      }

      const validation = validatePlan(parsed);
      if (validation.ok) {
        return { plan: validation.value!, model: result.model, degraded: false };
      }

      lastErrors = validation.errors;
      this.logger.warn(
        '[Plan] 第 %d 次生成校验失败（%d 项）：%s',
        attempt,
        validation.errors.length,
        validation.errors.join('; '),
      );
    }

    // 重试耗尽 → 降级内置模板计划（前端可渲染，标记 degraded）。
    this.logger.warn(
      '[Plan] 重试 %d 次后仍不符合 Schema，降级内置模板计划；末次错误：%s',
      PlanService.MAX_PLAN_ATTEMPTS,
      lastErrors.join('; '),
    );
    return { plan: buildFallbackPlan(dto), model: 'template', degraded: true };
  }

  /** 组装 system + user 消息。system 用双语儿科友好 PlanAgent 提示词（AI-203）；user 含学习者画像、可选课程目录，重试时附 `retryNote`。 */
  private buildMessages(dto: GeneratePlanDto, attempt: number): ChatMessage[] {
    return [
      { role: 'system', content: PLAN_SYSTEM_PROMPT },
      { role: 'user', content: buildPlanUserPrompt(dto, undefined, attempt) },
    ];
  }
}

/**
 * 剥离 LLM 常见的 Markdown 代码围栏，提取纯 JSON 文本。
 * 处理 ```json ... ``` 与 ``` ... ``` 两种围栏；无围栏则原样返回（trim）。
 */
export function extractJson(text: string): string {
  if (!text) return text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}
