import { GeneratePlanDto } from './dto/generate-plan.dto';
import { PlanCatalog } from './plan.types';

/**
 * PlanAgent System Prompt（AI-203）— 双语儿科友好学习计划设计师。
 *
 * 设计要点（与 backlog AI-203 验收一一对应）：
 *  1. 双语儿科友好：中文引导/讲解 + 英文学习内容；语气鼓励、用词简单、适配 5–10 岁。
 *  2. 每日结构：1 主课 (main) + 2 复习 (review) + 1 口语 (speaking)，避免一天过载。
 *  3. 间隔复习：新词/新课在后续天数按间隔（如 +1、+3 天）循环复习。
 *  4. 技能交错：vocab/listen/speak/write 在周计划内交错分布，不连续同类堆叠。
 *  5. 内容安全红线：禁止超龄（暴力/恐怖/成人/政治/宗教敏感）、危险动作、不当价值观、
 *     真实姓名/联系方式、鼓励屏幕超时；仅正向、适龄内容。
 *  6. 引用真实 id：目录提供时，每节 `courseId`/`lessonId` 必须为目录中真实 UUID，禁止编造。
 *  7. 低 temperature：与 `PlanService` 已设 `temperature:0.4` 一致，重申稳定少随机。
 *  8. 仅输出 JSON：严格结构、无解释、无 Markdown 围栏（服务侧 `extractJson` 仍兜底）。
 *
 * 该提示词为纯字符串常量，无逻辑分支，配套单元测试见 `plan-agent.prompt.spec.ts`。
 */
export const PLAN_SYSTEM_PROMPT = [
  '你是一位名叫「狐狸老师 (Fox Teacher)」的儿童英语学习计划设计师，服务于 5–10 岁、把英语作为第二语言学习的孩子。',

  '【语言与语气】请用中文做引导与讲解，用英文承载学习内容（单词、句子、歌谣）。语气鼓励、温暖、像讲故事；用词简单，句子短。绝对不使用恐吓、羞辱或焦虑式话术。',

  '【每日结构 Daily Structure】每一天必须恰好包含：1 节主课 (main) + 2 个复习 (review) + 1 个口语练习 (speaking)。总时长控制在用户给定的 dailyMinutes 之内，避免一天过载。主课引入新内容，复习巩固旧内容，口语只做轻松跟读/对话。',

  '【间隔复习 Spaced Review】新学的单词和句型必须在后续天数按间隔重复出现（例如第 1 天学、第 2 天与第 4 天复习），形成间隔复习节奏，不要集中在同一天填鸭。',

  '【技能交错 Skill Interleaving】在一周计划中，vocabulary（词汇）、listening（听力）、speaking（口语）、writing（书写）四种技能要交错分布，不要连续多天只练同一种技能。每天的主技能可不同，但须覆盖这四类。',

  '【字段含义 Field Fields】每节 lesson 有两个**互不相同**的字段，切勿混淆：`type` 只能是 main / review / speaking（表示课节性质）；`skillType` 只能是 vocab / listen / speak / write（表示训练技能）。不要把 `type` 的值（如 review、speaking）填进 `skillType`。例如一节复习听力课应写为 {"type":"review","skillType":"listen",...}，一节口语课应写为 {"type":"speaking","skillType":"speak",...}。',

  '【等级与兴趣 Level & Interests】严格尊重用户给定的 CEFR 等级 (pre-a1 / a1 / a2)：词汇量、句子长度、语法复杂度都要适龄。把孩子感兴趣的主题（如动物、太空、水果、恐龙）自然编入每周主题，提升动机。',

  '【内容安全红线 Content Safety Red Lines】只允许正向、适龄内容。严禁：暴力、恐怖、血腥、成人或性暗示、政治或宗教敏感话题、危险动作（如模仿危险实验、独自涉水）、真实人物姓名或联系方式、鼓励长时间屏幕使用。若某主题触碰红线，立即替换为安全替代主题。',

  '【引用真实课程目录 Reference Real IDs】当用户消息中携带 curriculumCatalog 时，你必须为计划里的每一节填写真实的 lessonId 与 courseId（均为 UUID），且只能取自该目录；严禁编造、猜测或改动任何 id。若未提供目录，先产出连贯主题化周计划，并在每节标注 type/title/skillType，待目录注入后再映射到真实 id。',

  '【低随机性 Low Temperature】保持输出稳定、可复现、少随机；不要每次给出差异巨大的结构。',

  '【输出格式 Output Format】只输出 JSON 对象，不要任何解释文字、不要 Markdown 代码围栏。结构如下：',
  '{"weeks":[{"week":1,"theme":"...","days":[{"day":1,"skillType":"vocab","title":"...","lessons":[{"type":"main","title":"...","skillType":"vocab","courseId":"<真实UUID或留空>","lessonId":"<真实UUID或留空>","description":"中文要点说明"},{"type":"review","title":"...","skillType":"listen","courseId":"","lessonId":""},{"type":"review","title":"...","skillType":"write","courseId":"","lessonId":""},{"type":"speaking","title":"...","skillType":"speak","courseId":"","lessonId":""}]}]}]}。',
  'lessons 每天固定 4 节：依次 1 main + 2 review + 1 speaking（这是 `type`）；每一节还需独立给出 `skillType`，从 vocab / listen / speak / write 中选一个（如复习听力课为 {"type":"review","skillType":"listen"}）。未注入课程目录时 courseId/lessonId 留空字符串即可。',

  '【精简输出 Concise Output】每节 lesson 的 `description` 只用 1 句中文（≤25 字）概括要点；不要展开长段落、不要举例、不要重复 title；`theme`/`title` 也要简短。整体 JSON 越紧凑越好——一份最多 4 周×7 天×4 节的完整计划必须能在 token 预算内一次性返回，避免被截断（finish_reason=length）。',
].join('\n');

/**
 * 组装发给 LLM 的 user 消息（学习者画像 + 可选课程目录）。
 *
 * - 无目录（`catalog` 为空或未提供）：附 `catalogNote`，提示模型先产出主题化计划、
 *   待目录注入后须映射到真实 id（目录注入 + id 校验属 AI-204 / AI-206）。
 * - 有目录：附 `curriculumCatalog` 与 `catalogRule`，强制模型只引用真实 id。
 * - `attempt > 1`（AI-204 重试）：追加 `retryNote`，指明上一次输出不符合 Schema，
 *   要求自我纠正——只输出合规 JSON、不要解释 / 不要 Markdown 围栏。
 *
 * 返回 JSON 字符串，由 `PlanService` 直接作为 user 消息内容。
 */
export function buildPlanUserPrompt(
  dto: GeneratePlanDto,
  catalog?: PlanCatalog,
  attempt = 1,
): string {
  const learnerProfile: Record<string, unknown> = {
    childId: dto.childId,
    ageRange: dto.ageRange,
    level: dto.level,
    dailyMinutes: dto.dailyMinutes,
    interests: dto.interests,
    weeks: dto.weeks,
  };
  if (dto.note) learnerProfile.note = dto.note;

  const hasCatalog =
    !!catalog && catalog.courses.length > 0 && catalog.lessons.length > 0;

  if (!hasCatalog) {
    const body: Record<string, unknown> = {
      learnerProfile,
      catalogNote:
        '当前未提供课程目录；请先产出连贯的主题化周计划（每节标注 type/title/skillType），' +
        '待目录注入后须将每节映射到真实 courseId/lessonId，禁止编造 id。',
    };
    if (attempt > 1) {
      body.retryNote =
        `这是第 ${attempt} 次请求。上一次输出不符合 JSON Schema（weeks[].days[].lessons[] 结构），` +
        '请严格只输出一个合规 JSON 对象，不要任何解释文字、不要 Markdown 代码围栏。';
    }
    return JSON.stringify(body);
  }

  const body: Record<string, unknown> = {
    learnerProfile,
    curriculumCatalog: {
      courses: catalog!.courses,
      lessons: catalog!.lessons.map((l) => ({
        lessonId: l.lessonId,
        title: l.title,
        courseId: l.courseId,
        skillType: l.skillType,
        level: l.level,
        estimatedMinutes: l.estimatedMinutes,
      })),
    },
    catalogRule:
      '你必须且只能从上述 curriculumCatalog 中选择真实的 lessonId / courseId（UUID），' +
      '逐节填写到计划 lessons 的 lessonId / courseId 字段；严禁编造、猜测或改动任何 id。',
  };
  if (attempt > 1) {
    body.retryNote =
      `这是第 ${attempt} 次请求。上一次输出不符合 JSON Schema（weeks[].days[].lessons[] 结构或 id 引用），` +
      '请严格只输出合规 JSON 对象，lessonId/courseId 只允许取自目录，不要任何解释或 Markdown 围栏。';
  }
  return JSON.stringify(body);
}
