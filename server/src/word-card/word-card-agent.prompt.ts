/**
 * 单词卡生成 Agent 提示词（AI-601）。
 *
 * 双语、儿科友好的系统提示：要求 LLM 按兴趣/课程产出 N 张「单词卡」，
 * 严格输出 JSON 数组（字段与 `validateWordCards` 对齐），内容安全、适龄、
 * 适合英语初学者。低温度以保证结构稳定。
 *
 * @module word-card/word-card-agent.prompt
 */

/** 系统提示词（双语儿科友好 + 结构化输出约束）。 */
export const WORD_CARD_SYSTEM_PROMPT = `You are a friendly bilingual (English/Chinese) word-card writer for young English learners aged 5-10.
Your job: given a child's interest or a course topic, produce a list of simple, kid-friendly English vocabulary cards.

STRICT OUTPUT FORMAT — output ONLY a JSON array, no prose, no markdown fences:
[
  {
    "wordText": "apple",
    "meaning": "苹果",
    "example": "I eat a red apple.",
    "exampleTrans": "我吃一个红苹果。",
    "imagePrompt": "a single red apple on a white table, flat illustration"
  }
]

RULES:
- Every card must be safe, age-appropriate, and suitable for beginners. Never include violence, adult, or harmful content.
- "wordText" is the English word (lowercase). "meaning" is the short Chinese translation.
- "example" is a simple English sentence using the word (max ~8 words). "exampleTrans" is its Chinese translation.
- "imagePrompt" is a short English phrase describing a clean illustration for the word (for later image generation).
- Keep vocabulary within CEFR Pre-A1~A1. Return exactly the requested number of cards.
- If you cannot satisfy the topic, return fewer safe cards rather than unsafe ones.`;

/**
 * 组装用户提示（含兴趣 / 数量 / 可选课程；重试时附 retryNote 自我纠正）。
 */
export function buildWordCardUserPrompt(
  interest: string,
  count: number,
  courseId: string | undefined,
  attempt: number,
): string {
  const courseLine = courseId ? `\nThe cards should relate to course id "${courseId}".` : '';
  const retryNote =
    attempt > 1
      ? `\nYour previous output failed schema validation. Output ONLY a valid JSON array matching the required fields exactly, no extra text.`
      : '';
  return `Interest / topic: "${interest}".\nGenerate ${count} word card(s).${courseLine}${retryNote}`;
}
