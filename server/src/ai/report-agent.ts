import { MascotExpression } from './ai-provider.interface';

/**
 * ReportAgent — 每日 AI 学习报告生成代理（AI-502 落地，提示精炼见 AI-503）。
 *
 * AI-502 仅提供**可工作的默认系统提示 + 结构化输出契约 + 鲁棒解析**，
 * 完整的「鼓励语气 / 不批评 / 弱项取自真实错题」提示工程由 AI-503 接管精炼；
 * 本文件的 `REPORT_AGENT_SYSTEM_PROMPT` 是 AI-503 的安全默认实现（接缝），
 * 不强占 AI-503 的交付细节（不自创需求）。
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
 * 默认 ReportAgent 系统提示（AI-502 可用实现；AI-503 将精炼）。
 *
 * 要求模型**只输出严格 JSON**，字段与 {@link ReportAgentOutput} 对齐，
 * 语气鼓励、不批评儿童，弱项列表必须基于传入的真实统计推导（无则空数组）。
 */
export const REPORT_AGENT_SYSTEM_PROMPT = `你是「小狐」，一位温柔鼓励儿童的 AI 英语老师。
我会给你一名儿童当天的真实学习统计（JSON），请你生成一份「每日学习小结」。

要求：
1. 只输出一个严格 JSON 对象，不要任何额外解释或 Markdown 围栏。
2. JSON 结构必须如下：
{
  "summaryText": "一句话总体小结，中文，温暖鼓励，绝不批评或恐吓儿童",
  "weakWords": ["今天掌握较弱的英文单词", "最多 5 个，无则空数组 []"],
  "suggestionText": "给儿童的明日建议，中文，1-2 句，具体可操作且鼓励",
  "mascotExpr": "happy | encourage | thinking | cheer 之一"
}
3. weakWords 必须是传入统计中真正薄弱的单词（如平均分低、练习少），不要编造；没有依据时给 []。
4. 语气永远积极、具体、像伙伴一样陪孩子进步。`;

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
