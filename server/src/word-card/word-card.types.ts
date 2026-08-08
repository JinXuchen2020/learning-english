import { WordCardStatus } from './ai-word-card.entity';

/**
 * LLM 输出的单张单词卡（结构化 JSON 中的一项，尚未落库）。
 * 与 `word-card-schema.ts` 的 `validateWordCards` 对齐：仅含文本字段，
 * 不含 id / 状态 / 时间戳等由系统填充的字段。
 */
export interface GeneratedWordCard {
  wordText: string;
  meaning: string;
  example: string;
  exampleTrans?: string;
  imagePrompt: string;
}

/** 落库后返回给前端的单词卡视图（含系统字段）。 */
export interface WordCardView {
  id: string;
  wordText: string;
  meaning: string;
  example: string;
  exampleTrans: string | null;
  imagePrompt: string;
  interest: string;
  courseId: string | null;
  status: WordCardStatus;
  reviewerNote: string | null;
  createdAt: string;
  approvedAt: string | null;
}

/** `generate` 接口响应。 */
export interface GenerateWordCardResult {
  cards: WordCardView[];
  /** true 表示 LLM 输出经重试后仍不符合 Schema，已降级为内置模板卡片。 */
  degraded: boolean;
  /** 实际使用的模型标识；降级时为 'template'。 */
  model: string;
}
