/** 生词本条目视图（与 `ScannedWord` 对齐，日期序列化为 ISO 字符串）。 */
export interface ScanCardView {
  /** 条目 id（uuid）。 */
  id: string;
  /** 英文单词。 */
  wordText: string;
  /** 中文释义。 */
  meaning: string;
  /** 英文例句（可空）。 */
  example: string | null;
  /** 配图 prompt（可空）。 */
  imagePrompt: string | null;
  /** 状态：pending(识别后) / saved(已加入生词本)。 */
  status: 'pending' | 'saved';
  /** 创建时间（ISO 字符串）。 */
  createdAt: string;
}

/** `POST /api/scan/recognize` 响应。 */
export interface ScanResult {
  /** 识别出的卡片（pending）。未识别时为空数组。 */
  cards: ScanCardView[];
  /** true=识别成功；false=未识别（前端展示友好兜底文案）。 */
  recognized: boolean;
  /** 友好提示（仅 `recognized=false` 时存在）。 */
  message?: string;
  /** 实际使用的模型标识（仅供排查）。 */
  model?: string;
}
