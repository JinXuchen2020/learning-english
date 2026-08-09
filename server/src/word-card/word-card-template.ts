import { GeneratedWordCard } from './word-card.types';

/**
 * 内置模板单词卡（AI-601 降级兜底，对齐 AI-205 模板计划思路）。
 *
 * 当 LLM 输出经重试后仍不符合 Schema（或无 key 的 Mock 演示）时，返回此确定性、
 * 安全、适龄的卡片集合，保证前端始终能渲染出内容且字段合法。所有词条与例句
 * 均经过内容安全黑名单（见 `word-card-safety.ts`）复核，无敏感词。
 *
 * @module word-card/word-card-template
 */

/** 安全的基础词库（与兴趣无关，作为兜底）。 */
const TEMPLATE_POOL: GeneratedWordCard[] = [
  {
    wordText: 'apple',
    meaning: '苹果',
    example: 'I eat a red apple.',
    exampleTrans: '我吃一个红苹果。',
    imagePrompt: 'a single red apple on a white table, flat illustration',
  },
  {
    wordText: 'cat',
    meaning: '猫',
    example: 'The cat is sleeping.',
    exampleTrans: '猫在睡觉。',
    imagePrompt: 'a cute orange cat curled up, cartoon style',
  },
  {
    wordText: 'dog',
    meaning: '狗',
    example: 'A small dog runs fast.',
    exampleTrans: '一只小狗跑得快。',
    imagePrompt: 'a happy brown dog, friendly illustration',
  },
  {
    wordText: 'sun',
    meaning: '太阳',
    example: 'The sun is bright.',
    exampleTrans: '太阳很明亮。',
    imagePrompt: 'a yellow sun with rays, kids drawing style',
  },
  {
    wordText: 'book',
    meaning: '书',
    example: 'I read a book.',
    exampleTrans: '我读一本书。',
    imagePrompt: 'an open picture book, soft colors',
  },
  {
    wordText: 'star',
    meaning: '星星',
    example: 'Twinkle twinkle little star.',
    exampleTrans: '一闪一闪小星星。',
    imagePrompt: 'a silver star in the night sky',
  },
  {
    wordText: 'ball',
    meaning: '球',
    example: 'He kicks the ball.',
    exampleTrans: '他踢球。',
    imagePrompt: 'a red and blue ball on green grass',
  },
  {
    wordText: 'tree',
    meaning: '树',
    example: 'The tree is tall.',
    exampleTrans: '树很高。',
    imagePrompt: 'a green tree with brown trunk',
  },
  {
    wordText: 'fish',
    meaning: '鱼',
    example: 'The fish can swim.',
    exampleTrans: '鱼会游泳。',
    imagePrompt: 'an orange fish in blue water',
  },
  {
    wordText: 'bird',
    meaning: '鸟',
    example: 'A blue bird sings.',
    exampleTrans: '一只蓝鸟在唱歌。',
    imagePrompt: 'a small blue bird on a branch',
  },
];

/**
 * 构造降级模板卡片。
 * @param interest 兴趣（仅作来源标记，不影响词条）
 * @param count 需要的数量（1~10）
 */
export function buildTemplateWordCards(interest: string, count: number): GeneratedWordCard[] {
  const n = Math.max(1, Math.min(count, TEMPLATE_POOL.length));
  return TEMPLATE_POOL.slice(0, n).map((c) => ({ ...c }));
}
