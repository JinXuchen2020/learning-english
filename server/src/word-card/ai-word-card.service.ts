import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiProvider,
  AI_PROVIDER_TOKEN,
  ChatMessage,
  ChatOptions,
} from '../ai/ai-provider.interface';
import { AiWordCard, WordCardStatus } from './ai-word-card.entity';
import { GenerateWordCardDto } from './dto/generate-word-card.dto';
import { GeneratedWordCard, WordCardView, GenerateWordCardResult } from './word-card.types';
import { validateWordCards, extractJson } from './word-card-schema';
import { WORD_CARD_SYSTEM_PROMPT, buildWordCardUserPrompt } from './word-card-agent.prompt';
import { buildTemplateWordCards } from './word-card-template';
import { checkWordCardSafety } from './word-card-safety';
import { ContentUnsafeException } from './word-card-exceptions';

/**
 * AI 单词卡片生成服务（AI-601 编排）。
 *
 * 编排：`GenerateWordCardDto` → 组装 chat 消息（system=单词卡 Agent 提示词，
 * user=兴趣/数量/可选课程）→ `AiProvider.chat` → 剥离代码围栏 → `validateWordCards`
 * 结构校验 → 合规则落库为 pending；不合规则**自动重试**（≤`MAX_ATTEMPTS` 次，
 * 重试请求附 `retryNote` 自我纠正）→ 仍失败降级为 `buildTemplateWordCards`
 * 内置模板（`degraded:true`）。
 *
 * 内容安全（AI-406 复用）：落库前对每张卡片全文本字段跑 `matchBlocklist` 黑名单
 * 硬闸，任一命中 → 抛 `ContentUnsafeException`（422），**整批拒绝入库**。
 *
 * `AiProvider` 由 `AiModule` 的 `@Global()` 注入，本模块无需重复 import AiModule。
 *
 * 重试边界（AI-204 硬约束）：仅「输出校验失败」重试；`AiProvider.chat` 抛出的
 * 基础设施异常**向上传播**（AI-106 的 HTTP 层 3 次退避不在此叠加）。
 *
 * @module word-card/ai-word-card.service
 */
@Injectable()
export class AiWordCardService {
  private readonly logger = new Logger(AiWordCardService.name);

  /** 最大尝试次数：首轮 + 至多 2 次重试。 */
  static readonly MAX_ATTEMPTS = 3;

  constructor(
    @Inject(AI_PROVIDER_TOKEN) private readonly ai: AiProvider,
    @InjectRepository(AiWordCard) private readonly repo: Repository<AiWordCard>,
  ) {}

  /**
   * 生成单词卡片（含 Schema 校验 + 自动重试 + 降级模板 + 内容安全）。
   * @param dto 经 class-validator 校验后的请求体
   * @returns 卡片视图数组 + 降级标志 + 模型标识
   * @throws ContentUnsafeException 命中内容安全黑名单（422，不留库）
   * @throws 当 `AiProvider.chat` 抛错时向上传播（AI-106 重试/配额在外层处理）
   */
  async generate(dto: GenerateWordCardDto): Promise<GenerateWordCardResult> {
    const count = dto.count ?? 5;
    const interest = dto.interest.trim();

    let lastErrors: string[] = [];
    let parsed: GeneratedWordCard[] | null = null;
    let parsedModel = 'unknown';

    for (let attempt = 1; attempt <= AiWordCardService.MAX_ATTEMPTS; attempt++) {
      const messages: ChatMessage[] = this.buildMessages(interest, count, dto.courseId, attempt);
      const options: ChatOptions = { temperature: 0.7, maxTokens: 1500 };

      const result = await this.ai.chat(messages, options);
      let data: unknown;
      try {
        data = JSON.parse(extractJson(result.text));
      } catch {
        lastErrors = ['响应不是合法 JSON'];
        this.logger.warn('[WordCard] 第 %d 次生成：响应非合法 JSON，将重试', attempt);
        continue;
      }

      const validation = validateWordCards(data);
      if (validation.ok) {
        parsed = validation.value!;
        parsedModel = result.model ?? 'unknown';
        break;
      }

      lastErrors = validation.errors;
      this.logger.warn(
        '[WordCard] 第 %d 次生成校验失败（%d 项）：%s',
        attempt,
        validation.errors.length,
        validation.errors.join('; '),
      );
    }

    let cards: GeneratedWordCard[];
    let degraded = false;
    let model: string;
    if (parsed && parsed.length > 0) {
      cards = parsed.slice(0, count);
      model = parsedModel;
    } else {
      // 重试耗尽 → 降级内置模板卡片（前端可渲染，标记 degraded）。
      degraded = true;
      model = 'template';
      cards = buildTemplateWordCards(interest, count);
      this.logger.warn(
        '[WordCard] 重试 %d 次后仍不符合 Schema，降级内置模板卡片；末次错误：%s',
        AiWordCardService.MAX_ATTEMPTS,
        lastErrors.join('; '),
      );
    }

    // 内容安全硬闸：任一卡命中黑名单 → 整批拒绝，不留库。
    for (const card of cards) {
      const safety = checkWordCardSafety(card);
      if (!safety.safe) {
        this.logger.warn(
          '[WordCard] 内容安全命中关键词 "%s" @ %s，拒绝整批生成',
          safety.keyword,
          safety.field,
        );
        throw new ContentUnsafeException(safety.keyword!, safety.field!);
      }
    }

    const saved = await this.repo.save(
      cards.map((c) => this.toEntity(c, interest, dto.courseId)),
    );
    this.logger.log('[WordCard] 已生成 %d 张卡片（degraded=%s）', saved.length, degraded);

    return {
      cards: saved.map(toView),
      degraded,
      model,
    };
  }

  /**
   * 列出卡片，可按 status 过滤。
   * @param status 可选过滤值（pending/approved/rejected）
   */
  async list(status?: WordCardStatus): Promise<WordCardView[]> {
    const where = status ? { status } : {};
    const rows = await this.repo.find({ where, order: { createdAt: 'DESC' } });
    return rows.map(toView);
  }

  /**
   * 批准一张 pending 卡片 → approved，写 approvedAt。
   * @throws NotFoundException 卡片不存在；ConflictException 已处于终态
   */
  async approve(id: string, reviewerNote?: string): Promise<WordCardView> {
    const card = await this.repo.findOne({ where: { id } });
    if (!card) {
      throw new NotFoundException({ code: 'WORD_CARD_NOT_FOUND', message: '单词卡片不存在' });
    }
    if (card.status !== 'pending') {
      throw new ConflictException({
        code: 'WORD_CARD_TERMINAL',
        message: `卡片已处于 ${card.status} 状态，不能重复审核`,
      });
    }
    card.status = 'approved';
    card.approvedAt = new Date();
    if (reviewerNote != null) card.reviewerNote = reviewerNote;
    const saved = await this.repo.save(card);
    this.logger.log('[WordCard] 已批准卡片 %s', id);
    return toView(saved);
  }

  /**
   * 驳回一张 pending 卡片 → rejected（approvedAt 保持 null）。
   * @throws NotFoundException 卡片不存在；ConflictException 已处于终态
   */
  async reject(id: string, reviewerNote?: string): Promise<WordCardView> {
    const card = await this.repo.findOne({ where: { id } });
    if (!card) {
      throw new NotFoundException({ code: 'WORD_CARD_NOT_FOUND', message: '单词卡片不存在' });
    }
    if (card.status !== 'pending') {
      throw new ConflictException({
        code: 'WORD_CARD_TERMINAL',
        message: `卡片已处于 ${card.status} 状态，不能重复审核`,
      });
    }
    card.status = 'rejected';
    if (reviewerNote != null) card.reviewerNote = reviewerNote;
    const saved = await this.repo.save(card);
    this.logger.log('[WordCard] 已驳回卡片 %s', id);
    return toView(saved);
  }

  /** 组装 system + user 消息。 */
  private buildMessages(
    interest: string,
    count: number,
    courseId: string | undefined,
    attempt: number,
  ): ChatMessage[] {
    return [
      { role: 'system', content: WORD_CARD_SYSTEM_PROMPT },
      { role: 'user', content: buildWordCardUserPrompt(interest, count, courseId, attempt) },
    ];
  }

  /** 由合法 GeneratedWordCard 构建待入库实体（status=pending）。 */
  private toEntity(c: GeneratedWordCard, interest: string, courseId?: string): AiWordCard {
    const e = new AiWordCard();
    e.wordText = c.wordText;
    e.meaning = c.meaning;
    e.example = c.example;
    e.exampleTrans = c.exampleTrans ?? null;
    e.imagePrompt = c.imagePrompt;
    e.interest = interest;
    e.courseId = courseId ?? null;
    e.status = 'pending';
    e.reviewerNote = null;
    e.approvedAt = null;
    return e;
  }
}

/** 实体 → 前端视图（日期序列化为 ISO 字符串）。 */
export function toView(e: AiWordCard): WordCardView {
  return {
    id: e.id,
    wordText: e.wordText,
    meaning: e.meaning,
    example: e.example,
    exampleTrans: e.exampleTrans,
    imagePrompt: e.imagePrompt,
    interest: e.interest,
    courseId: e.courseId,
    status: e.status,
    reviewerNote: e.reviewerNote,
    createdAt: serializeDate(e.createdAt),
    approvedAt: e.approvedAt ? serializeDate(e.approvedAt) : null,
  };
}

function serializeDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString();
  return String(d);
}
