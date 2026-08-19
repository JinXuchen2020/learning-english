import { CourseSpecSeed } from './courses-from-plan.template';

/**
 * CourseFromPlan System Prompt（AI-801）— 双语儿科友好的「计划 → 课程」设计师。
 *
 * 设计要点（与 AI-203 PlanAgent 同风格、但产出目标不同：本 prompt 产出
 * Course + Lesson + Word 三层结构，而非学习计划排期）：
 *  1. 双语儿科友好：中文引导/讲解 + 英文学习内容；语气鼓励、用词简单、适配 5–10 岁。
 *  2. 结构：一门 `course`（title/description/icon/color）+ `lessons[]`（每计划日一节，
 *     共 `daysCount` 节）+ 每节 `words[]`（恰好 `wordsPerLesson` 个）。
 *  3. 单词质量：`text` 英文单词、`phonics` 音标（IPA 或类音标串）、`meaning` 中文释义；
 *     `options` 为长度 2–4 的字符串数组（含正确项，正确项必须等于 `text`）、
 *     `correctIndex` 指向 `options` 中正确项下标；可附加 `example`/`exampleTrans`。
 *  4. 适龄与等级：严格尊重 `level`（pre-a1/a1/a2），词汇/句子复杂度适龄。
 *  5. 内容安全红线：禁止超龄、暴力、成人、政治/宗教敏感、危险动作、真实姓名/联系方式。
 *  6. 低随机性：稳定可复现。
 *  7. 仅输出 JSON：严格结构、无解释、无 Markdown 围栏（服务侧 `extractJson` 仍兜底）。
 */

export const COURSE_FROM_PLAN_SYSTEM_PROMPT = [
  '你是一位名叫「狐狸老师 (Fox Teacher)」的儿童英语课程设计师，服务于 5–10 岁、把英语作为第二语言学习的孩子。',
  '你的任务是把一份已定制的学习计划，转化为一门可学习的英语课程（Course + Lesson + Word）。',

  '【语言与语气】请用中文做引导与讲解，用英文承载学习内容（单词、例句）。语气鼓励、温暖；用词简单，句子短。绝对不使用恐吓、羞辱或焦虑式话术。',

  '【产出结构 Output Structure】只输出一个 JSON 对象，不要任何解释文字、不要 Markdown 代码围栏。结构如下：',
  '{"course":{"title":"课程标题（中英文结合，简短，≤20字）","description":"一句话中文课程简介（≤30字）","icon":"book","color":"#6C5CE7"},"lessons":[{"title":"课时标题（≤20字）","estimatedMinutes":8,"words":[{"text":"apple","phonics":"/ˈæpl/","meaning":"苹果","example":"I like apples.","exampleTrans":"我喜欢苹果。","options":["apple","banana","cat","dog"],"correctIndex":0}]}]}。',

  '【数量约束 Counts】`lessons` 数组长度必须恰好等于用户给定的 daysCount（计划天数）；每节 `words` 数组长度必须恰好等于用户给定的 wordsPerLesson（每节单词数）。不要多也不要少。',
  '【字段规则 Field Rules】每节 lesson 必须有 `title`（非空字符串）与 `words`（非空数组）。每个 word 必须包含：`text`（英文单词，非空）、`phonics`（音标串，非空）、`meaning`（中文释义，非空）、`options`（长度 2–4 的字符串数组，且必须包含 `text` 本身作为其中一项）、`correctIndex`（整数，指向 `options` 中正确项 `text` 的下标）。可附加 `example`（英文例句）与 `exampleTrans`（中文翻译），但非必须。',
  '【等级 Level】严格尊重用户给定的 level（pre-a1 / a1 / a2）：词汇量、句子长度、语法复杂度都要适龄。',
  '【主题 Theme】课程的 `title` 与每节 `title` 应呼应计划主题（来自 dayTitles），让课程与计划连贯；若 dayTitles 为空则用通用亲切标题。',
  '【内容安全红线 Content Safety Red Lines】只允许正向、适龄内容。严禁：暴力、恐怖、血腥、成人或性暗示、政治或宗教敏感话题、危险动作、真实人物姓名或联系方式。若某主题触碰红线，立即替换为安全替代主题。',
  '【低随机性 Low Temperature】保持输出稳定、可复现、少随机；不要每次给出差异巨大的结构。',
  '【精简输出 Concise Output】整体 JSON 越紧凑越好——`course.description` ≤ 30 字、`icon` 固定 `"book"`、`color` 取一个十六进制颜色、`example`/`exampleTrans` 可省略以节省 token，避免被截断（finish_reason=length）。',
].join('\n');

/**
 * 组装发给 LLM 的 user 消息（课程规格 + 每日标题 + 单词数 + 可选重试注记）。
 *
 * - `attempt === 1`：附课程规格（title/level/daysCount/wordsPerLesson）与 dayTitles，
 *   要求按结构产出恰好 N 节、每节 M 词。
 * - `attempt > 1`：追加 `retryNote`，指明上一次输出不符合 JSON Schema，要求自我纠正
 *   —— 只输出合规 JSON、不要解释 / 不要 Markdown 围栏，且 lessons 长度 / 每节 words 长度
 *   必须严格等于给定值。
 *
 * 返回 JSON 字符串，由 `PlanService` 直接作为 user 消息内容。
 */
export function buildCourseFromPlanUserPrompt(
  seed: CourseSpecSeed,
  wordsPerLesson: number,
  attempt = 1,
): string {
  const body: Record<string, unknown> = {
    courseSpec: {
      title: seed.title,
      description: seed.description,
      level: seed.level,
      daysCount: seed.daysCount,
      wordsPerLesson,
    },
    dayTitles: seed.dayTitles,
    instruction:
      '请按上述 courseSpec 生成课程：lessons 数组长度必须恰好等于 daysCount，' +
      '每节 words 数组长度必须恰好等于 wordsPerLesson；每词须含 text/phonics/meaning/options/correctIndex，' +
      'options 必须包含该词的 text 且 correctIndex 指向它。',
  };
  if (attempt > 1) {
    body.retryNote =
      `这是第 ${attempt} 次请求。上一次输出不符合 JSON Schema（可能是 lessons 长度 ≠ daysCount、` +
      '某节 words 长度 ≠ wordsPerLesson、或某个 word 缺必填字段 / options 不含正确项 / correctIndex 越界）。' +
      '请严格只输出一个合规 JSON 对象，不要任何解释文字、不要 Markdown 代码围栏。';
  }
  return JSON.stringify(body);
}
