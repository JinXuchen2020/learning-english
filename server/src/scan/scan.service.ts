import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  AiProvider,
  AI_PROVIDER_TOKEN,
  ImageInput,
} from '../ai/ai-provider.interface';
import { ScannedWord } from '../entities/scanned-word.entity';
import { ScanCardView, ScanResult } from './scan.types';
import { GeneratedScanCard, parseScanOutput, buildScanPrompt } from './scan-agent';

/**
 * 拍照学单词服务（AI-606 编排）。
 *
 * 编排：`recognize`(图片 base64 + mime) → `AiProvider.chatWithImage`(OCR) →
 * `parseScanOutput` 结构解析 → 成功则落库 pending 并返回卡片视图；解析为空 →
 * 返回 `recognized:false` + 友好文案（不抛 500）。`confirm` 将当前用户拥有的
 * pending 卡片置 `saved`（越权 id 静默忽略）。`listSaved` 返回生词本。
 *
 * 429 限流退避由 AI-106 `RetryableAiProvider` 在外层统一处理，本服务不重复实现。
 *
 * @module scan/scan.service
 */
@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @Inject(AI_PROVIDER_TOKEN) private readonly ai: AiProvider,
    @InjectRepository(ScannedWord) private readonly repo: Repository<ScannedWord>,
  ) {}

  /**
   * 识别图片并生成单词卡（落库 pending）。
   * @param imageBase64 图片 base64（不含 `data:` 前缀）
   * @param mimeType 图片 MIME
   * @param userId 当前用户 id
   * @param prompt 可选用户提示
   */
  async recognize(
    imageBase64: string,
    mimeType: string,
    userId: string,
    prompt?: string,
  ): Promise<ScanResult> {
    const image: ImageInput = { data: imageBase64, mimeType };

    let result: { text: string; model?: string };
    try {
      result = await this.ai.chatWithImage(buildScanPrompt(prompt), image, {
        temperature: 0.3,
        maxTokens: 1500,
      });
    } catch (err) {
      // AI 视觉调用失败（无 key / 网络不可达 / 限流耗尽）时优雅降级为「未识别」，
      // 而不是把异常抛到 controller 变成 500 —— 前端会据此展示友好文案，不破坏体验。
      this.logger.warn(`[Scan] 视觉识别调用失败，走友好兜底：${(err as Error).message}`);
      return {
        cards: [],
        recognized: false,
        message: "图片识别服务暂时不可用，稍后再试～",
      };
    }

    const cards = parseScanOutput(result.text);
    if (cards.length === 0) {
      this.logger.warn('[Scan] 图片未解析出有效单词卡，走友好兜底');
      return {
        cards: [],
        recognized: false,
        message: '没有认出单词，换一张更清晰的图片试试～',
      };
    }

    const saved = await this.repo.save(cards.map((c) => this.toEntity(c, userId)));
    this.logger.log('[Scan] 已识别 %d 个单词（pending）', saved.length);
    return {
      cards: saved.map(toView),
      recognized: true,
      model: result.model,
    };
  }

  /**
   * 将当前用户拥有的 pending 卡片加入生词本（置 saved）。
   * 越权 / 不存在的 id 静默忽略。
   * @throws 当 ids 为空数组时返回空（controller 已用 DTO 校验非空）
   */
  async confirm(ids: string[], userId: string): Promise<ScanCardView[]> {
    if (!ids.length) return [];
    const rows = await this.repo.find({ where: { id: In(ids) } });
    const owned = rows.filter((r) => r.userId === userId);
    if (owned.length) {
      owned.forEach((r) => (r.status = 'saved'));
      const updated = await this.repo.save(owned);
      this.logger.log('[Scan] 已加入生词本 %d 个单词', updated.length);
      return updated.map(toView);
    }
    return [];
  }

  /** 返回当前用户的生词本（saved 状态）。 */
  async listSaved(userId: string): Promise<ScanCardView[]> {
    const rows = await this.repo.find({
      where: { userId, status: 'saved' },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toView);
  }

  /** 由解析卡构建待入库实体（status=pending）。 */
  private toEntity(c: GeneratedScanCard, userId: string): ScannedWord {
    const e = new ScannedWord();
    e.userId = userId;
    e.wordText = c.wordText;
    e.meaning = c.meaning;
    e.example = c.example;
    e.imagePrompt = c.imagePrompt;
    e.status = 'pending';
    return e;
  }
}

/** 实体 → 前端视图（日期序列化为 ISO 字符串）。 */
export function toView(e: ScannedWord): ScanCardView {
  return {
    id: e.id,
    wordText: e.wordText,
    meaning: e.meaning,
    example: e.example,
    imagePrompt: e.imagePrompt,
    status: e.status,
    createdAt: e.createdAt ? e.createdAt.toISOString() : '',
  };
}
