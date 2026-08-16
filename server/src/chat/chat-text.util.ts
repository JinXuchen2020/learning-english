/**
 * 聊天文本清洗工具（AI-407 后续加固）。
 *
 * LLM 有时会自造元注释（如 `（这次没有语音）`）来"解释"自己没有语音输出，
 * 这些标记会污染用户可见消息和跟读参考文本。本模块负责在落库/TTS 前兜底清洗。
 */

/** 已知的 LLM 自造元注释/系统标记。 */
const META_MARKER_PATTERNS: ReadonlyArray<RegExp> = [
  /（\s*这次没有语音\s*）/gu,
  /\(\s*这次没有语音\s*\)/gu,
  /（\s*暂无语音\s*）/gu,
  /\(\s*暂无语音\s*\)/gu,
  /（\s*无语音\s*）/gu,
  /\(\s*无语音\s*\)/gu,
];

/**
 * 去掉 LLM 自造的元注释标记，例如 `（这次没有语音）`。
 * 只去掉标记本身，保留其他内容。
 */
export function stripMetaMarkers(text: string): string {
  let cleaned = text;
  for (const re of META_MARKER_PATTERNS) {
    cleaned = cleaned.replace(re, '');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}
