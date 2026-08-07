import type {
  Course,
  Lesson,
  Word,
  Sentence,
  DailyTask,
  GeneratePlanDto,
  GeneratePlanResponse,
  SavePlanDto,
  SavePlanResponse,
  ApplyPlanDto,
  ApplyPlanResponse,
  PlanStatusResponse,
  SpeechFeedback,
  EvaluateSpeechOptions,
  ChatScene,
  SendChatMessageDto,
  SendChatMessageResponse,
  ChatStarsResponse,
  ChatSessionSummary,
  ChatHistoryMessage,
  DailyReportResponse,
  WeeklyReportData,
} from "./types";

/**
 * Backend API base URL. The NestJS server runs with a global `/api` prefix,
 * so this points straight at it. Override with NEXT_PUBLIC_API_URL if the
 * backend lives elsewhere.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

/**
 * The JWT is held in module memory only (no localStorage/sessionStorage),
 * which suits this prototype. The trade-off: a hard refresh clears the
 * session and the user signs in again.
 */
let accessToken: string | null = null;

export function setToken(token: string | null) {
  accessToken = token;
}

export function getToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    if (body && typeof body === "object") {
      const payload = body as Record<string, unknown>;
      const candidate = payload.message ?? payload.error;
      if (typeof candidate === "string") message = candidate;
      else if (Array.isArray(candidate)) message = candidate.map(String).join(", ");
    }
    throw new ApiError(message, res.status);
  }

  return body as T;
}

/* ----------------------------- Auth ----------------------------- */

export interface AuthUser {
  id: string;
  username: string;
  nickname: string;
  totalStars: number;
  streakDays: number;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export function register(username: string, password: string, nickname?: string) {
  return request<AuthResponse>(
    "/auth/register",
    { method: "POST", body: JSON.stringify({ username, password, nickname }) },
    false
  );
}

export function login(username: string, password: string) {
  return request<AuthResponse>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ username, password }) },
    false
  );
}

/* ---------------------------- Courses --------------------------- */

export interface CourseSummary {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  totalLessons: number;
  wordCount: number;
}

export interface CourseDetail extends CourseSummary {
  completedLessons: number;
  lessons: Lesson[];
}

export function getCourses() {
  return request<CourseSummary[]>("/courses");
}

export function getCourse(id: string) {
  return request<CourseDetail>(`/courses/${id}`);
}

/* ---------------------------- Lessons --------------------------- */

export function getLessonWords(lessonId: string) {
  return request<Word[]>(`/lessons/${lessonId}/words`);
}

/* ----------------------------- Words ---------------------------- */

export function getAllWords() {
  return request<Word[]>("/words");
}

/* ---------------------------- Sentences (AI-309) ---------------------------- */

/** 句库查询参数（均为可选）。 */
export interface SentenceQuery {
  /** 仅返回该分级（如 `L1`）。 */
  level?: string;
  /** 仅返回关联该词汇文本的句。 */
  wordText?: string;
}

/**
 * 查询句子跟读库（AI-309）。
 * `GET /api/sentences`，可按 `level` / `wordText` 过滤，返回按 level+sortOrder 升序。
 * 与 `getAllWords` 同口径走 `request`（默认带内存 token；SentencesController 加 JwtAuthGuard）。
 */
export function getSentences(query: SentenceQuery = {}): Promise<Sentence[]> {
  const params = new URLSearchParams();
  const level = query.level?.trim();
  const wordText = query.wordText?.trim();
  if (level) params.set("level", level);
  if (wordText) params.set("wordText", wordText);
  const qs = params.toString();
  return request<Sentence[]>(`/sentences${qs ? `?${qs}` : ""}`);
}

/* ----------------------------- Tasks ---------------------------- */

export function getDailyTasks() {
  return request<DailyTask[]>("/tasks/daily");
}

export function completeTask(taskId: string) {
  return request<{ success: boolean; alreadyCompleted: boolean }>(
    `/tasks/${taskId}/complete`,
    { method: "PATCH" }
  );
}

/* ---------------------------- Progress -------------------------- */

export interface ProgressOverview {
  completedLessons: number;
  practicedWords: number;
  totalStars: number;
  streakDays: number;
}

export function getProgress() {
  return request<ProgressOverview>("/progress");
}

export function completeLesson(lessonId: string) {
  return request<{ success: boolean }>(`/progress/lesson/${lessonId}`, {
    method: "PATCH",
  });
}

export function recordWordAttempt(wordId: string, correct: boolean) {
  return request<{ success: boolean; attempts: number; correctCount: number }>(
    "/progress/word",
    { method: "POST", body: JSON.stringify({ wordId, correct }) }
  );
}

/* ----------------------------- Plan ----------------------------- */

/**
 * 生成学习计划（AI-202/AI-207）。
 * 无 LLM key 时后端经 MockProvider 自动降级为内置模板计划，仍返回 200，
 * 响应 `degraded:true` 表示走了模板兜底（前端据此提示，而非解析失败）。
 */
export function generatePlan(dto: GeneratePlanDto) {
  return request<GeneratePlanResponse>("/ai/plan/generate", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

/**
 * 持久化生成计划为草稿（AI-206/AI-208）。
 * 后端复用 AI-204 `validatePlan` 校验结构，不合法 → 400。
 */
export function savePlan(dto: SavePlanDto) {
  return request<SavePlanResponse>("/ai/plan/save", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

/**
 * 应用已保存的计划：置 `applied`、按天写 `daily_tasks`（AI-206/AI-208）。
 * 已 applied 且 `confirm!==true` → 409 `{ code:'PLAN_ALREADY_APPLIED', needsConfirm:true }`，
 * 前端弹确认后用 `applyPlan(id, { confirm:true })` 重应用（覆盖式）。
 */
export function applyPlan(id: string, dto: ApplyPlanDto = {}) {
  return request<ApplyPlanResponse>(`/ai/plan/${id}/apply`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

/**
 * 计划完成度快照（AI-209）。
 * 取该 childId 最近一份 applied 计划，统计 study_plan_days 完成度。
 * 无 applied 计划时后端返回 `{ hasPlan:false, totalDays:0, doneDays:0, completionRatio:0 }`，
 * 前端据此隐藏完成度卡。沿用计划接口「childId 走 query、不加 JwtAuthGuard」约定。
 */
export function getPlanStatus(childId: string) {
  return request<PlanStatusResponse>(
    `/ai/plan/status?childId=${encodeURIComponent(childId)}`
  );
}

/* ----------------------------- Speech (AI-307) ---------------------------- */

/**
 * 提交一次口语录音做评测（AI-303 / AI-306）。
 *
 * 以 `multipart/form-data` 上传录音 + 参考文本来源（wordId / referenceText），
 * 后端经 AI-305 评分策略 + AI-306 反馈装配返回 `SpeechFeedback`。
 *
 * 注意：本函数**不使用**通用 `request`（其强制 `Content-Type: application/json`
 * 会破坏 multipart boundary），改用专用 `postFormData` 让 fetch 自动带 boundary。
 * 鉴权沿用模块内存 token（与本项目 M2 链口径一致）。
 *
 * @param file 录音 Blob（来自 `SpeechRecorder` 的 `RecordingResult.blob`）
 * @param opts 参考文本来源 / 时长 / 用户 id（字段名与后端 `EvaluateSpeechDto` 对齐）
 */
export function evaluateSpeech(
  file: Blob,
  opts: EvaluateSpeechOptions = {}
): Promise<SpeechFeedback> {
  const form = new FormData();
  form.append("audio", file, "recording.webm");
  if (opts.wordId) form.append("wordId", opts.wordId);
  if (opts.sentenceId) form.append("sentenceId", opts.sentenceId);
  if (opts.referenceText) form.append("referenceText", opts.referenceText);
  if (opts.durationMs != null) form.append("durationMs", String(opts.durationMs));
  if (opts.userId) form.append("userId", opts.userId);

  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return postFormData<SpeechFeedback>("/ai/speech/evaluate", form, headers);
}

/**
 * 通用 multipart POST（仅供 `evaluateSpeech` 使用）。
 * 复用 `request` 的错误解析逻辑（非 ok → `ApiError`，优先取 `message`/`error`），
 * 但不设置 JSON `Content-Type`（交由 fetch 自动注入 multipart boundary）。
 */
async function postFormData<T>(
  path: string,
  form: FormData,
  headers: Record<string, string>
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: form,
    headers,
  });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    if (body && typeof body === "object") {
      const payload = body as Record<string, unknown>;
      const candidate = payload.message ?? payload.error;
      if (typeof candidate === "string") message = candidate;
      else if (Array.isArray(candidate)) message = candidate.map(String).join(", ");
    }
    throw new ApiError(message, res.status);
  }

  return body as T;
}

/* ----------------------------- Chat (AI-407) ---------------------------- */

/**
 * 枚举全部对话场景包（AI-405）。
 * `GET /api/ai/chat/scenes`，返回 `ChatScene[]`（id/title/openingLine/targetVocabulary，
 * 不含内部 systemPrompt）。用于 /chat 页场景选择卡。
 */
export function getChatScenes(): Promise<ChatScene[]> {
  return request<ChatScene[]>("/ai/chat/scenes");
}

/**
 * 发送一条对话发言并取回狐狸回复（AI-403/407）。
 * `POST /api/ai/chat/messages`，body 与后端 `ChatMessageDto` 对齐。
 * 返回 `{ sessionId, messageId, replyText, ttsUrl, stars, starAwarded, starsUntilNext }`
 * （stars 字段为 AI-408 追加：完成 N 轮对话得一颗星星）；`ttsUrl` 为狐狸音色音频引用
 * （data URI / URL，TTS 失败时 null）。续聊时调用方应携带上次的 `sessionId`。
 *
 * @param dto { text, sessionId?, sceneId?, userId? }
 */
export function sendChatMessage(
  dto: SendChatMessageDto,
): Promise<SendChatMessageResponse> {
  return request<SendChatMessageResponse>("/ai/chat/messages", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

/**
 * 查询某用户全部对话会话累计星星数之和（AI-408）。
 * `GET /api/ai/chat/stars?userId=`，供 Home 展示「聊天星星」。
 * 与 messages 接口口径一致：缺省 userId → 后端用 `anonymous` 占位。
 */
export function getChatStars(userId?: string): Promise<ChatStarsResponse> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return request<ChatStarsResponse>(`/ai/chat/stars${qs}`);
}

/**
 * 列出某用户全部对话会话摘要（AI-409，「我的会话」列表）。
 * `GET /api/ai/chat/sessions?userId=`，返回 `ChatSessionSummary[]`（按最近活动倒序）。
 * 与 messages 接口口径一致：缺省 userId → 后端用 `anonymous` 占位。
 */
export function getChatSessions(
  userId?: string,
): Promise<ChatSessionSummary[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return request<ChatSessionSummary[]>(`/ai/chat/sessions${qs}`);
}

/**
 * 取回某会话的全部历史消息（AI-409，续聊前回显）。
 * `GET /api/ai/chat/sessions/:id/messages?userId=`，返回 `ChatHistoryMessage[]`
 * （按时间升序，仅 user/assistant）。
 * @param sessionId 会话 id（对应 `ai_chat_sessions.id`）
 */
export function getChatSessionMessages(
  sessionId: string,
  userId?: string,
): Promise<ChatHistoryMessage[]> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return request<ChatHistoryMessage[]>(
    `/ai/chat/sessions/${encodeURIComponent(sessionId)}/messages${qs}`,
  );
}

/* ----------------------- AI Daily Report (AI-504) ----------------------- */

/**
 * 获取（或按需生成）当日 AI 学习小结（AI-502/504）。
 * `POST /api/ai/report/daily`，body 与后端 `GenerateDailyReportDto` 对齐
 * （`userId` 必填，`date` 可选 YYYY-MM-DD，缺省后端取当日）。
 * 后端该路由无 guard，但前端随内存 token 携带（与 `/ai/chat` 同口径）；
 * 失败（4xx/5xx）抛 `ApiError`，由调用方决定是否展示「生成今日小结」按钮。
 *
 * @param userId 用户 id（来自 `useAuth().user.id`）
 * @param date   可选报告日期 YYYY-MM-DD
 */
export function getDailyReport(
  userId: string,
  date?: string,
): Promise<DailyReportResponse> {
  const body = date ? { userId, date } : { userId };
  return request<DailyReportResponse>("/ai/report/daily", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/* ----------------------- AI Weekly Report (AI-507) ----------------------- */

/**
 * 家长周报只读预览（AI-506/507 Dashboard 数据源）。
 * `GET /api/ai/report/weekly/preview?userId=&weekStart=`，返回 `WeeklyReportData`
 * （聚合指标/弱项Top10/趋势/每日亮点/建议），**不发送邮件**。
 * 与每日报告同口径：路由无 guard，userId 由 query 传入（待全局鉴权收紧）。
 *
 * @param userId   用户 id（来自 `useAuth().user.id`）
 * @param weekStart 可选周起始日 YYYY-MM-DD（Monday）；缺省后端按 UTC 当日推算所在周
 */
export function getWeeklyReport(
  userId: string,
  weekStart?: string,
): Promise<WeeklyReportData> {
  const params = new URLSearchParams();
  params.set("userId", userId);
  if (weekStart) params.set("weekStart", weekStart);
  return request<WeeklyReportData>(`/ai/report/weekly/preview?${params.toString()}`);
}
