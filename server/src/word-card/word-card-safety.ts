import { matchBlocklist } from '../chat/chat-safety.config';
import { GeneratedWordCard } from './word-card.types';

/**
 * 单词卡内容安全校验（AI-601，复用 AI-406 黑名单硬闸）。
 *
 * `matchBlocklist` 是 AI-406 双保险的第一道**同步硬闸**（命中即拦，零网络开销、
 * 必然生效）。此处对卡片全部文本字段做归一化子串匹配：任一字段命中即判定整批
 * 不安全（拒绝入库），从源头阻止显式有害词进入词库。语义更微妙的有害内容由
 * prompt 约束 + 人工审核（approve 动作）兜底。
 *
 * @module word-card/word-card-safety
 */

/** 单卡字段 → 文本内容，用于黑名单匹配。 */
const CARD_TEXT_FIELDS: { field: string; get: (c: GeneratedWordCard) => string }[] = [
  { field: 'wordText', get: (c) => c.wordText },
  { field: 'meaning', get: (c) => c.meaning },
  { field: 'example', get: (c) => c.example },
  { field: 'exampleTrans', get: (c) => c.exampleTrans ?? '' },
  { field: 'imagePrompt', get: (c) => c.imagePrompt },
];

/** 内容安全判定结果。 */
export interface CardSafetyResult {
  safe: boolean;
  keyword?: string;
  field?: string;
}

/**
 * 校验单张卡片文本是否命中内容安全黑名单。
 * @param card 待校验卡片
 * @returns 安全则 `{ safe:true }`；命中则含 `keyword` 与命中 `field`
 */
export function checkWordCardSafety(card: GeneratedWordCard): CardSafetyResult {
  for (const { field, get } of CARD_TEXT_FIELDS) {
    const hit = matchBlocklist(get(card));
    if (hit) {
      return { safe: false, keyword: hit, field };
    }
  }
  return { safe: true };
}
