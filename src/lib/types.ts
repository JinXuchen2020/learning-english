export type MascotExpression = "happy" | "thinking" | "celebrating" | "encouraging";
export type MascotSize = "small" | "medium" | "large";

export interface Course {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  totalLessons: number;
  completedLessons: number;
  wordCount: number;
}

export type LessonState = "locked" | "available" | "completed";

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  state: LessonState;
  wordCount: number;
  estimatedMinutes: number;
}

export interface Word {
  id: string;
  text: string;
  phonics: string;
  meaning: string;
  illustration: string;
  options: string[];
  correctIndex: number;
}

export interface DailyTask {
  id: string;
  title: string;
  description: string;
  icon: "headphones" | "mic" | "pencil";
  completed: boolean;
}

/** 句子跟读库条目（AI-309，后端 `sentences` 表）。 */
export interface Sentence {
  id: string;
  /** 英文跟读句（评测参考文本）。 */
  text: string;
  /** 中文释义。 */
  meaning: string;
  /** 难度分级 L1/L2/L3。 */
  level: string;
  /** 关联 P0 词汇文本（小写）。 */
  wordTexts: string[];
  /** 主题标签。 */
  tags: string[];
}

export type QuizPhase = "answering" | "correct" | "incorrect" | "complete";

export interface QuizState {
  phase: QuizPhase;
  currentWordIndex: number;
  selectedAnswer: number | null;
  correctCount: number;
  totalWords: number;
}

/* ----------------------- AI Study Plan (AI-207) ----------------------- */

/** 学习计划技能类型（与后端 `StudyPlanSkillType` 同口径）。 */
export type PlanSkillType = "vocab" | "listen" | "speak" | "write";

/** 学习计划等级（与 `POST /api/ai/plan/generate` 的 `level` 枚举一致）。 */
export type PlanLevel = "pre-a1" | "a1" | "a2";

/** 单节计划内的学习任务。 */
export interface PlanLesson {
  type?: "main" | "review" | "speaking";
  title?: string;
  skillType?: PlanSkillType;
  description?: string;
  courseId?: string;
  lessonId?: string;
}

/** 计划中的某一天。 */
export interface PlanDay {
  day?: number;
  date?: string;
  skillType?: PlanSkillType;
  title?: string;
  lessons?: PlanLesson[];
  content?: string;
}

/** 计划中的某一周。 */
export interface PlanWeek {
  week?: number;
  theme?: string;
  days?: PlanDay[];
}

/** LLM 生成的结构化学习计划（宽松结构，容忍自由 JSON）。 */
export interface GeneratedPlan {
  weeks?: PlanWeek[];
  rawText?: string;
  [key: string]: unknown;
}

/** `POST /api/ai/plan/generate` 响应：`degraded` 为真表示走了模板兜底。 */
export interface GeneratePlanResponse {
  plan: GeneratedPlan;
  model?: string;
  degraded: boolean;
}

/** `POST /api/ai/plan/generate` 请求体（字段名/类型/枚举与后端 DTO 对齐）。 */
export interface GeneratePlanDto {
  childId: string;
  ageRange: string; // "lo-hi"，如 "6-8"
  level: PlanLevel;
  dailyMinutes: number; // 5-120
  interests: string[]; // 至少 1 个
  weeks: number; // 1-4
  useTemplate?: boolean;
}

/** `POST /api/ai/plan/save` 请求体（AI-206，字段名/类型与后端 `SavePlanDto` 对齐）。 */
export interface SavePlanDto {
  childId: string;
  plan: GeneratedPlan;
}

/** `POST /api/ai/plan/save` 响应（AI-206：`SavePlanResult`）。 */
export interface SavePlanResponse {
  id: string;
  status: string; // "draft"
}

/** `POST /api/ai/plan/:id/apply` 请求体（AI-206，字段名/类型与后端 `ApplyPlanDto` 对齐）。 */
export interface ApplyPlanDto {
  confirm?: boolean;
}

/** `POST /api/ai/plan/:id/apply` 响应（AI-206：`ApplyPlanResult`）。 */
export interface ApplyPlanResponse {
  id: string;
  status: string; // "applied"
  appliedDays: number;
  tasksCreated: number;
  appliedAt: string;
}

/** `GET /api/ai/plan/status?childId=` 响应（AI-209：计划完成度快照）。 */
export interface PlanStatusResponse {
  hasPlan: boolean;
  totalDays: number;
  doneDays: number;
  /** 完成度比例 0-1。 */
  completionRatio: number;
  planId?: string;
  appliedAt?: string;
}

/* ----------------------- AI Speech (AI-307) ----------------------- */

/** 口语反馈等级档位（与后端 `SpeechFeedback.level` 对齐）。 */
export type SpeechLevel = "good" | "ok" | "weak";

/**
 * 面向儿童的口语评测反馈（AI-303/306 响应体）。
 * 继承 `score / readableText / weakPhonemes / feedback / mascotExpr`，
 * 追加 `passed`（是否通过）+ `level`（等级档位）。
 * `mascotExpr` 为**后端**表情枚举（happy/encourage/thinking/cheer），
 * 渲染到前端 `Mascot` 前须经 `mapBackendMascotExpr` 映射到前端枚举。
 */
export interface SpeechFeedback {
  /** 综合发音得分 [0,100]。 */
  score: number;
  /** 目标可读文本（含识别/纠正后的展示文本）。 */
  readableText: string;
  /** 薄弱音素列表（IPA），供高亮。 */
  weakPhonemes: string[];
  /** 面向儿童的鼓励性反馈文案。 */
  feedback: string;
  /** 后端吉祥物表情（渲染前需映射）。 */
  mascotExpr: string;
  /** 是否通过（score >= 60 通过线，与 AI-306 `PASS_LINE` 一致）。 */
  passed: boolean;
  /** 等级档位：good(≥80) / ok(≥60) / weak(<60)。 */
  level: SpeechLevel;
}

/** `POST /api/ai/speech/evaluate` 的入参（构造 multipart 用，非完整 DTO）。 */
export interface EvaluateSpeechOptions {
  /** 单词 id（优先）→ 后端解析 `Word.text` 作参考文本。 */
  wordId?: string;
  /** 句子 id（AI-309 句库）→ 后端解析 `Sentence.text` 作参考文本。与 wordId 互斥。 */
  sentenceId?: string;
  /** 直传参考文本（E2E / 句子模式便利）。 */
  referenceText?: string;
  /** 客户端上报录音时长（毫秒），来自 `RecordingResult.durationMs`。 */
  durationMs?: number;
  /** 归属用户 id（缺省后端用 `anonymous` 占位）。 */
  userId?: string;
}

/* ----------------------- AI Chat (AI-407) ----------------------- */

/** 场景包摘要（与后端 `GET /api/ai/chat/scenes` 响应、AI-405 `SceneSummary` 对齐）。
 *  不含内部 `systemPrompt`（后端不向浏览器泄露）。 */
export interface ChatScene {
  /** 场景 id（greeting / zoo / shopping / weather / body）。 */
  id: string;
  /** 展示标题（中文，如「打招呼」）。 */
  title: string;
  /** 狐狸开场引导语（英文，供选定场景后首条助手气泡种子）。 */
  openingLine: string;
  /** A1 目标词汇（英文）。 */
  targetVocabulary: string[];
}

/** 一条对话气泡（前端本地模型，role 区分用户/狐狸）。 */
export interface ChatMessage {
  /** 本地唯一 id（助手开场种子以 `opening-` 前缀；真实回复用后端 `messageId`）。 */
  id: string;
  role: "user" | "assistant";
  /** 消息正文。 */
  text: string;
  /** 狐狸朗读音频引用（data URI / URL）；用户消息与开场种子为 null。 */
  ttsUrl?: string | null;
  /** 是否为场景开场种子气泡（本地生成、未过后端、无 ttsUrl）。 */
  isOpening?: boolean;
}

/** `POST /api/ai/chat/messages` 请求体（字段名/类型与后端 `ChatMessageDto` 对齐）。 */
export interface SendChatMessageDto {
  /** 宝宝发言（必填，≤2000 字符）。 */
  text: string;
  /** 续聊会话 id（缺省新建）。对应 `ai_chat_sessions.id`。 */
  sessionId?: string | null;
  /** 场景包 id（仅新建会话写入）。 */
  sceneId?: string | null;
  /** 归属用户 id（缺省后端 `anonymous`）。 */
  userId?: string | null;
}

/** `POST /api/ai/chat/messages` 响应（与后端 `ChatSendResponse` 对齐）。 */
export interface SendChatMessageResponse {
  /** 本次会话 id（新建或复用），续聊时回传以便后续携带。 */
  sessionId: string;
  /** 助手回复消息 id。 */
  messageId: string;
  /** 狐狸回复正文。 */
  replyText: string;
  /** 狐狸朗读音频引用（data URI / URL）；TTS 失败降级为 null。 */
  ttsUrl: string | null;
}
