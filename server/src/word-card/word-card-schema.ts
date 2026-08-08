import { GeneratedWordCard } from './word-card.types';

/**
 * 单词卡批量 JSON Schema 校验（AI-601，对齐 AI-204 `validatePlan` 设计）。
 *
 * 接收 LLM 原始输出的解析结果（应为数组），逐项校验字段类型与非空，
 * 返回 `{ ok, value, errors }` 供 service 决定是否重试 / 降级。
 */

/** 校验结果。 */
export interface WordCardValidation {
  ok: boolean;
  value?: GeneratedWordCard[];
  errors: string[];
}

/** 允许的单卡字段（必填文本）。 */
const REQUIRED_TEXT_FIELDS: (keyof GeneratedWordCard)[] = [
  'wordText',
  'meaning',
  'example',
  'imagePrompt',
];

/**
 * 剥离 LLM 常见的 Markdown 代码围栏，提取纯 JSON 文本。
 * 处理 ```json ... ``` 与 ``` ... ``` 两种围栏；无围栏则原样返回（trim）。
 */
export function extractJson(text: string): string {
  if (!text) return text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * 校验 LLM 输出是否符合单词卡结构。
 * @param input 已 `JSON.parse` 的对象（应为数组）
 */
export function validateWordCards(input: unknown): WordCardValidation {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ['根节点必须是数组'] };
  }
  if (input.length === 0) {
    return { ok: false, errors: ['数组不能为空'] };
  }

  const errors: string[] = [];
  const value: GeneratedWordCard[] = [];

  input.forEach((item, idx) => {
    if (typeof item !== 'object' || item === null) {
      errors.push(`第 ${idx + 1} 项不是对象`);
      return;
    }
    const obj = item as Record<string, unknown>;
    for (const field of REQUIRED_TEXT_FIELDS) {
      if (!isNonEmptyString(obj[field])) {
        errors.push(`第 ${idx + 1} 项字段 "${field}" 缺失或非空字符串`);
      }
    }
    const exampleTrans = obj.exampleTrans;
    if (exampleTrans !== undefined && exampleTrans !== null && !isNonEmptyString(exampleTrans)) {
      errors.push(`第 ${idx + 1} 项字段 "exampleTrans" 必须是字符串或省略`);
    }
    if (errors.length > 0) return;

    value.push({
      wordText: String(obj.wordText).trim(),
      meaning: String(obj.meaning).trim(),
      example: String(obj.example).trim(),
      imagePrompt: String(obj.imagePrompt).trim(),
      exampleTrans: obj.exampleTrans != null ? String(obj.exampleTrans).trim() : undefined,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value, errors: [] };
}
