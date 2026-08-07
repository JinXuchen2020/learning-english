import { MascotExpression } from './ai-provider.interface';

/**
 * ReportAgent — 每日 AI 学习报告生成代理（AI-502 落地接口 + 解析，AI-503 精炼提示）。
 *
 * `REPORT_AGENT_SYSTEM_PROMPT`（AI-503 精炼完成）约束：儿童友好、绝不批评；
 * `weakWords` 必须是传入 `weakWordCandidates` 的子集（真实错题，严禁编造）；
 * `mascotExpr` 按当日进展决策。结构化输出契约 + 鲁棒解析（`parseReportAgentOutput`）
 * 由 AI-502 提供并沿用。
 */

/**
 * 无学习数据时的友好默认报告文案（AI-502）。
 * 当日无活动 → 不调 AI，直接落库该鼓励型默认；同日幂等复用。
 */
export const DEFAULT_SUMMARY = '今天还没有开始学习哦～先去完成一个小任务，小狐陪你一起加油！';
export const DEFAULT_SUGGESTION = '今天试着完成「听一听」任务，听一首英文儿歌吧！';

/** ReportAgent 结构化输出契约（落库 + 驱动前端狐狸动画）。 */
export interface ReportAgentOutput {
  /** 鼓励语气的总体小结（中文，温暖、不批评）。 */
  summaryText: string;
  /** 弱项单词清单（英文，最多 ~5 个；无则空数组）。 */
  weakWords: string[];
  /** 给儿童的明日建议（中文，鼓励）。 */
  suggestionText: string;
  /** 吉祥物表情，驱动前端庆祝/鼓励动画。 */
  mascotExpr: MascotExpression;
}

/**
 * 精炼后的 ReportAgent 系统提示（AI-503 完成）。
 *
 * 约束：儿童友好、绝不批评；`weakWords` 必须是传入 `weakWordCandidates` 的子集
 * （真实错题，严禁编造）；`mascotExpr` 按当日进展明确决策。输出严格 JSON，
 * 字段与 {@link ReportAgentOutput} 对齐。解析层 {@link parseReportAgentOutput} 兜底。
 */
export const REPORT_AGENT_SYSTEM_PROMPT = `你是「小狐」，一位陪伴 6–10 岁小朋友学英语的 AI 老师。你会收到一名小朋友当天的真实学习统计（JSON），请生成一份温暖的「每日学习小结」。

# 输出格式（必须严格遵守）
只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码围栏（不要 \`\`\`）。结构如下：
{
  "summaryText": "一句话总体小结，中文，温暖鼓励",
  "weakWords": ["今天掌握还不太牢的英文单词"],
  "suggestionText": "给小朋友的明日建议，中文，具体可操作且鼓励",
  "mascotExpr": "happy | encourage | thinking | cheer 之一"
}

# 铁律（违反即不合格）
1. 绝不批评、绝不比较、绝不恐吓。禁止出现「笨/差/错太多/别人都会」这类表述。把"出错"说成"再试一次就更好""我们一起练"；把"不会"说成"刚开始学很正常"。
2. weakWords 必须且只能从输入里的 weakWordCandidates 列表选取；没有候选或候选为空时给 []。绝对禁止编造任何不在候选列表中的单词。
3. summaryText 与 suggestionText 用小朋友能懂的话，像伙伴一样陪他进步，1–2 句即可。
4. mascotExpr 按以下规则选一个：
   - 当天有真实进展（taskComplete ≥ 1，或 lessonsCompleted ≥ 1，或 avgSpeechScore ≥ 80）→ 用 "cheer"（小有成就）或 "happy"；
   - 当天明显吃力（avgSpeechScore 不为 null 且 < 60，或 taskComplete 为 0）→ 用 "encourage"（温柔加油）；
   - 其余中性/混合情况 → 用 "thinking"。

# 输入字段说明
- taskComplete：当天完成的任务数
- wordsPracticed：当天练习的不同单词数
- lessonsCompleted：当天完成的课程数
- speechAttempts：当天口语跟读次数
- avgSpeechScore：当天口语平均分（0–100，可能为 null 表示没练口语）
- weakWordCandidates：当天练习中正确率偏低（真实薄弱）的英文单词，weakWords 只能从这里选`;

/**
 * 从 LLM 文本中鲁棒解析出 {@link ReportAgentOutput}。
 *
 * 容错：
 * - 剥离 ```json ... ``` 或 ``` 围栏；
 * - 截取第一个 `{` 到最后一个 `}` 之间的内容（忽略前后多余文本）；
 * - 字段缺失/类型不符→给安全默认（summaryText '' / weakWords [] / suggestionText '' / mascotExpr 'encourage'）；
 * - weakWords 非数组→兜底 []（逐项转字符串 trim 过滤空串）；
 * - 完全解析失败→抛出 Error，由 service 降级为友好默认报告（不 500）。
 */
export function parseReportAgentOutput(text: string): ReportAgentOutput {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('ReportAgent 输出为空');
  }

  // 1) 剥离 Markdown 代码围栏
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // 2) 截取首个 {...} 块（兼容模型在 JSON 前后夹带说明文字）
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('ReportAgent 输出中未找到 JSON 对象');
  }
  const jsonText = cleaned.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('ReportAgent 输出 JSON 解析失败');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('ReportAgent 输出不是 JSON 对象');
  }
  const obj = parsed as Record<string, unknown>;

  const summaryText =
    typeof obj.summaryText === 'string' ? obj.summaryText : '';
  const suggestionText =
    typeof obj.suggestionText === 'string' ? obj.suggestionText : '';

  let weakWords: string[] = [];
  if (Array.isArray(obj.weakWords)) {
    weakWords = obj.weakWords
      .map((w) => String(w).trim())
      .filter((w) => w.length > 0);
  }

  const validExpr: MascotExpression[] = ['happy', 'encourage', 'thinking', 'cheer'];
  const mascotExpr: MascotExpression =
    typeof obj.mascotExpr === 'string' && validExpr.includes(obj.mascotExpr as MascotExpression)
      ? (obj.mascotExpr as MascotExpression)
      : 'encourage';

  return { summaryText, weakWords, suggestionText, mascotExpr };
}
