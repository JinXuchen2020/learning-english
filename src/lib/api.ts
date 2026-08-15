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
  WordCard,
  WordCardStatus,
  GenerateWordCardDto,
  GenerateWordCardResult,
  WordDifficulty,
  WordDifficultyInfo,
  MascotLevelInfo,
  MascotStory,
  PictureBook,
  DueReview,
  ReviewSettings,
  ScanCard,
  ScanResult,
  ConfirmScanDto,
  Reward,
  RewardRedemption,
  RewardsSummary,
  RedemptionStatus,
  MakeupQueue,
  ProviderConfigView,
  CreateProviderConfigDto,
  UpdateProviderConfigDto,
  ProviderTestResult,
  ChildView,
  ChildProgressSummary,
  ChildProgressDetail,
  CreateChildDto as CreateChildApiDto,
  ClaimChildDto as ClaimChildApiDto,
  SetChildProviderDto as SetChildProviderApiDto,
} from "./types";

/**
 * Backend API base URL. The NestJS server runs with a global `/api` prefix,
 * so this points straight at it. Override with NEXT_PUBLIC_API_URL if the
 * backend lives elsewhere.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

/**
 * Session persistence.
 *
 * The JWT is cached in module memory (primary) AND mirrored to localStorage so
 * a hard refresh keeps the user signed in. The backend JWT TTL is 7d
 * (JWT_EXPIRES_IN), so a refresh within that window restores the session
 * transparently. The lightweight `user` object is persisted alongside the
 * token so the auth context can rehydrate without an extra /auth/me round-trip.
 *
 * All storage access is guarded for `typeof window === 'undefined'`, making
 * this module safe to import during SSR (Next.js) — on the server storage is a
 * no-op and the session simply stays memory-only.
 */
const TOKEN_KEY = "le_auth_token";
const USER_KEY = "le_auth_user";

function storageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode / quota) — degrade to memory only */
  }
}

let accessToken: string | null = storageGet(TOKEN_KEY);

export function setToken(token: string | null) {
  accessToken = token;
  storageSet(TOKEN_KEY, token);
}

export function getToken(): string | null {
  return accessToken ?? storageGet(TOKEN_KEY);
}

/** Persist the lightweight auth user object so the context rehydrates on refresh. */
export function setStoredUser(user: AuthUser | null) {
  storageSet(USER_KEY, user ? JSON.stringify(user) : null);
}

/** Read the persisted auth user, or null if absent/corrupt. */
export function getStoredUser(): AuthUser | null {
  const raw = storageGet(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
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
  auth = true,
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (auth) {
    // 允许调用方显式覆盖鉴权令牌（如家长会话令牌），缺省沿用内存 child token。
    const tok = token !== undefined ? token : accessToken;
    if (tok) {
      headers.Authorization = `Bearer ${tok}`;
    }
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
  role: 'child' | 'parent';
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export function register(
  username: string,
  password: string,
  nickname?: string,
  role?: 'child' | 'parent',
) {
  return request<AuthResponse>(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify({ username, password, nickname, role }),
    },
    false,
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
  /** 由 totalStars 推导的当前等级（AI-701）。 */
  level: number;
  /** 可消费积分余额（AI-701：user_points.balance）。 */
  pointsBalance: number;
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
  return request<{ success: boolean; attempts: number; correctCount: number; mastery: number; difficulty: WordDifficulty }>(
    "/progress/word",
    { method: "POST", body: JSON.stringify({ wordId, correct }) }
  );
}

/* ----------------------- AI Difficulty Adaptation (AI-602) ----------------------- */

/** 获取当前用户所有已练单词的自适应画像（按复习优先级降序）。 */
export function getWordDifficulties() {
  return request<{ items: WordDifficultyInfo[] }>("/progress/word-difficulty");
}

/* ----------------------- AI Mascot Growth Story (AI-603) ----------------------- */

/** 获取当前用户等级与进度（驱动前端等级环）。 */
export function getMascotLevel(userId: string): Promise<MascotLevelInfo> {
  return request<MascotLevelInfo>(
    `/ai/mascot/level?userId=${encodeURIComponent(userId)}`
  );
}

/* ----------------------- AI Review Reminder (AI-605) ----------------------- */

/** 获取当前用户「到期/今日待复习」单词列表（间隔重复，遗忘曲线）。 */
export function getDueReviews(userId: string, date?: string): Promise<DueReview[]> {
  const params = new URLSearchParams();
  params.set("userId", userId);
  if (date) params.set("date", date);
  return request<DueReview[]>(`/progress/review/due?${params.toString()}`);
}

/** 获取当前复习节奏配置（间隔阶梯可经环境变量配置）。 */
export function getReviewSettings(userId: string): Promise<ReviewSettings> {
  return request<ReviewSettings>(
    `/progress/review/settings?userId=${encodeURIComponent(userId)}`
  );
}

/* ----------------------- AI Makeup Queue (AI-704) ----------------------- */

/**
 * 获取补学队列：昨日未掌握弱词 + 昨日未完成计划日（与 AI-605 到期复习去重）。
 * `GET /api/progress/makeup`，需 Jwt（模块内存 child token）。
 */
export function getMakeupQueue(): Promise<MakeupQueue> {
  return request<MakeupQueue>("/progress/makeup");
}

/**
 * 标记昨日未完成计划日为完成（补学回写完成态，幂等，仅限本人）。
 * `POST /api/progress/makeup/task/:planDayId/complete`。
 * 成功（含已完成的幂等）返回 `{ success:true }`；不存在/越权返回 `{ success:false, reason }`。
 * @param planDayId 计划日 id（study_plan_days.id）
 */
export function completeMakeupTask(
  planDayId: string
): Promise<{ success: boolean; reason?: string; alreadyDone?: boolean }> {
  return request<{ success: boolean; reason?: string; alreadyDone?: boolean }>(
    `/progress/makeup/task/${encodeURIComponent(planDayId)}/complete`,
    { method: "POST" }
  );
}

/** 获取（或按需生成）某等级的吉祥物成长剧情（AI 生成或 Mock 兜底）。 */
export function getMascotStory(userId: string, level: number): Promise<MascotStory> {
  return request<MascotStory>(
    `/ai/mascot/story/${level}?userId=${encodeURIComponent(userId)}`
  );
}

/* AI Picture Book (AI-604) */

/**
 * 获取（或按需生成）某课程的绘本。courseId 可空 → 返回示例/默认绘本。
 */
export function getPictureBook(userId: string, courseId?: string): Promise<PictureBook> {
  const params = new URLSearchParams();
  params.set("userId", userId);
  if (courseId) params.set("courseId", encodeURIComponent(courseId));
  return request<PictureBook>(`/ai/picture-book/story?${params.toString()}`);
}

/**
 * 合成绘本页朗读音频，返回可播放 URL（mock 下为 null，前端静默降级）。
 */
export function requestPictureBookTts(text: string): Promise<{ ttsUrl: string | null }> {
  return request<{ ttsUrl: string | null }>("/ai/picture-book/tts", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/* ----------------------------- Plan ----------------------------- */

/**
 * 生成学习计划（AI-202/AI-207）。
 * 注意：自 AI-713 移除 MockProvider 后，后端不再有无 key 自动降级；缺 key / 不可达时
 * provider 会抛错并由 service 向上传播（不返回 200）。e2e 通过该端点 `page.route`
 * 封闭 mock，使计划向导测试不依赖外部 AI。响应 `degraded:true` 仅在后端模板兜底
 * （如 LLM 输出校验失败）时出现，前端据此提示而非解析失败。
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

/* ----------------------- AI Word Cards (AI-601) ----------------------- */

/**
 * 生成单词卡片（AI-601）：`POST /api/ai/word-card/generate`。
 * 无 LLM key 时后端经 MockProvider 自动降级为内置模板卡片，仍返回 200，
 * 响应 `degraded:true` 表示走了模板兜底（前端据此提示，而非解析失败）。
 * 内容安全命中 → 422 `{ code:'CONTENT_UNSAFE', ... }`，由调用方提示「内容不安全」。
 *
 * @param dto { interest, count?, courseId? }
 */
export function generateWordCards(dto: GenerateWordCardDto): Promise<GenerateWordCardResult> {
  return request<GenerateWordCardResult>("/ai/word-card/generate", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

/**
 * 列出单词卡片（AI-601）：`GET /api/ai/word-card?status=`。
 * @param status 可选过滤值（pending/approved/rejected）；缺省返回全部
 */
export function listWordCards(status?: WordCardStatus): Promise<WordCard[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<WordCard[]>(`/ai/word-card${qs}`);
}

/* ----------------------------- Scan / OCR (AI-606) ---------------------------- */

/**
 * 拍照识词：上传图片（multipart）做 OCR 识别（AI-606）。
 * `POST /api/scan/recognize`，字段 `image` + 可选 `prompt`。
 * 复用 `postFormData`（与 `evaluateSpeech` 同思路，避免 JSON Content-Type 破坏 boundary）。
 *
 * @param file 图片 Blob（来自 `<input type="file" accept="image/*" capture>`）
 * @param prompt 可选用户提示（如「水果」）
 */
export function recognizeImage(file: Blob, prompt?: string): Promise<ScanResult> {
  const form = new FormData();
  form.append("image", file, "scan.png");
  if (prompt && prompt.trim()) form.append("prompt", prompt.trim());

  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return postFormData<ScanResult>("/scan/recognize", form, headers);
}

/**
 * 将识别出的 pending 卡片加入生词本（AI-606）：`POST /api/scan/confirm`。
 * @param ids 卡片 id 列表
 */
export function confirmScanWords(ids: string[]): Promise<ScanCard[]> {
  return request<ScanCard[]>("/scan/confirm", {
    method: "POST",
    body: JSON.stringify({ ids } as ConfirmScanDto),
  });
}

/**
 * 获取当前用户的生词本（AI-606）：`GET /api/scan`（仅 saved 状态）。
 */
export function listScannedWords(): Promise<ScanCard[]> {
  return request<ScanCard[]>("/scan");
}

/**
 * 批准一张 pending 卡片（AI-601）：`POST /api/ai/word-card/:id/approve`。
 * @param id 卡片 id
 * @param reviewerNote 可选审核备注
 */
export function approveWordCard(id: string, reviewerNote?: string): Promise<WordCard> {
  return request<WordCard>(`/ai/word-card/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(reviewerNote != null ? { reviewerNote } : {}),
  });
}

/**
 * 驳回一张 pending 卡片（AI-601）：`POST /api/ai/word-card/:id/reject`。
 * @param id 卡片 id
 * @param reviewerNote 可选审核备注
 */
export function rejectWordCard(id: string, reviewerNote?: string): Promise<WordCard> {
  return request<WordCard>(`/ai/word-card/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(reviewerNote != null ? { reviewerNote } : {}),
  });
}

/* ----------------------- AI Growth Incentives (AI-701) ----------------------- */

/**
 * 列出上架奖励（商城展示）。`GET /api/rewards`，无 guard。
 * 返回按 cost 升序的 `Reward[]`（active=true）。
 */
export function listRewards(): Promise<Reward[]> {
  return request<Reward[]>("/rewards");
}

/**
 * 当前用户的积分/等级概览（驱动 Home/奖励页余额与等级环）。
 * `GET /api/rewards/summary`，需 Jwt（模块内存 token）。
 */
export function getRewardsSummary(): Promise<RewardsSummary> {
  return request<RewardsSummary>("/rewards/summary");
}

/**
 * 当前孩子的兑换记录（仅本人）。`GET /api/rewards/my-redemptions`，需 Jwt。
 */
export function getMyRedemptions(): Promise<RewardRedemption[]> {
  return request<RewardRedemption[]>("/rewards/my-redemptions");
}

/**
 * 申请兑换某奖励：扣余额 + 建 pending 兑换单。`POST /api/rewards/redeem/:rewardId`。
 * 余额不足后端返回 400 `{ code:'INSUFFICIENT_POINTS' }`，由调用方提示「再去攒积分」。
 * @param rewardId 奖励 id
 */
export function redeemReward(rewardId: string): Promise<RewardRedemption> {
  return request<RewardRedemption>(`/rewards/redeem/${encodeURIComponent(rewardId)}`, {
    method: "POST",
  });
}

/* ----------------------- Parent / Reward approvals ----------------------- */

/**
 * 家长待审批/全部兑换列表（全部用户）。`GET /api/rewards/redemptions?status=`，需家长登录 JWT。
 * @param status 可选过滤（pending/approved/rejected）
 */
export function getPendingApprovals(status?: RedemptionStatus): Promise<RewardRedemption[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<RewardRedemption[]>(`/rewards/redemptions${qs}`);
}

/**
 * 家长批准一条兑换。`POST /api/rewards/redemptions/:id/approve`，需家长登录 JWT。
 * @param id 兑换单 id
 */
export function approveRedemption(id: string): Promise<RewardRedemption> {
  return request<RewardRedemption>(
    `/rewards/redemptions/${encodeURIComponent(id)}/approve`,
    { method: "POST" },
  );
}

/**
 * 家长驳回一条兑换（可选原因）。`POST /api/rewards/redemptions/:id/reject`，需家长登录 JWT。
 * @param id 兑换单 id
 * @param reason 可选驳回原因
 */
export function rejectRedemption(id: string, reason?: string): Promise<RewardRedemption> {
  return request<RewardRedemption>(
    `/rewards/redemptions/${encodeURIComponent(id)}/reject`,
    { method: "POST", body: JSON.stringify(reason != null ? { reason } : {}) },
  );
}

/* ----------------------- AI Provider Config (AI-705) ----------------------- */

/**
 * 列出当前家长账号下全部 provider 配置（掩码视图）。`GET /api/provider-config`，需家长登录 JWT。
 * ownerUserId 由后端从 ParentGuard JWT 解析，前端不传。
 */
export function listProviderConfigs(): Promise<ProviderConfigView[]> {
  return request<ProviderConfigView[]>("/provider-config");
}

/**
 * 新增一条 provider 配置（明文 apiKey 由后端加密落库）。`POST /api/provider-config`。
 */
export function createProviderConfig(
  dto: CreateProviderConfigDto
): Promise<ProviderConfigView> {
  return request<ProviderConfigView>("/provider-config", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

/**
 * 修改一条 provider 配置；省略的字段（如 apiKey）不改动原值。`PUT /api/provider-config/:id`。
 */
export function updateProviderConfig(
  id: string,
  dto: UpdateProviderConfigDto
): Promise<ProviderConfigView> {
  return request<ProviderConfigView>(
    `/provider-config/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(dto) },
  );
}

/**
 * 删除一条 provider 配置（越权/不存在后端抛 403/404）。`DELETE /api/provider-config/:id`。
 */
export function deleteProviderConfig(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `/provider-config/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/**
 * 设为当前账号默认（同账号互斥）。`POST /api/provider-config/:id/default`。
 */
export function setDefaultProviderConfig(
  id: string
): Promise<ProviderConfigView> {
  return request<ProviderConfigView>(
    `/provider-config/${encodeURIComponent(id)}/default`,
    { method: "POST" },
  );
}

/**
 * 轻量连通性探测（按该配置构建 provider 并发一个极小 chat 请求）。
 * `POST /api/provider-config/:id/test`，返回 `{ ok, message }`。
 */
export function testProviderConfig(id: string): Promise<ProviderTestResult> {
  return request<ProviderTestResult>(
    `/provider-config/${encodeURIComponent(id)}/test`,
    { method: "POST" },
  );
}

/* ----------------------- Family Binding (AI-710) ----------------------- */

/**
 * 列出当前家长名下全部孩子。`GET /api/parent/children`，需家长登录 JWT。
 */
export function listChildren(): Promise<ChildView[]> {
  return request<ChildView[]>("/parent/children");
}

/**
 * 家长创建孩子账号。`POST /api/parent/children`，需家长登录 JWT。
 * @param dto { nickname, username, password, ageRange? }
 */
export function createChild(
  dto: CreateChildApiDto,
): Promise<ChildView> {
  return request<ChildView>("/parent/children", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

/**
 * 家长认领已有孩子（密码校验）。`POST /api/parent/children/claim`，需家长登录 JWT。
 * @param dto { username, password }
 */
export function claimChild(
  dto: ClaimChildApiDto,
): Promise<ChildView> {
  return request<ChildView>("/parent/children/claim", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

/**
 * 解除归属（仅清 parentId，不删账号）。`DELETE /api/parent/children/:childId`。
 */
export function unlinkChild(childId: string): Promise<void> {
  return request<void>(
    `/parent/children/${encodeURIComponent(childId)}`,
    { method: "DELETE" },
  );
}

/* ----------------------- AI-711: per-child provider override ----------------------- */

/**
 * 设置 / 清除孩子的 provider 覆盖。`PUT /api/parent/children/:childId/provider`，需家长登录 JWT。
 * `providerConfigId` 为 null / 省略 → 清除覆盖，孩子回退家长默认；非 null 必须是家长名下配置。
 * @param childId 孩子 id
 * @param dto { providerConfigId?: string | null }
 */
export function setChildProvider(
  childId: string,
  dto: SetChildProviderApiDto,
): Promise<ChildView> {
  return request<ChildView>(
    `/parent/children/${encodeURIComponent(childId)}/provider`,
    { method: "PUT", body: JSON.stringify(dto) },
  );
}

/**
 * 列出家长名下可选 provider（供孩子下拉）。`GET /api/parent/children/:childId/provider-options`，需家长登录 JWT。
 * 同时校验孩子归属；返回与 AI-705 同口径的掩码 `ProviderConfigView[]`。
 * @param childId 孩子 id
 */
export function getChildProviderOptions(
  childId: string,
): Promise<ProviderConfigView[]> {
  return request<ProviderConfigView[]>(
    `/parent/children/${encodeURIComponent(childId)}/provider-options`,
  );
}

/* ----------------------- Parent Dashboard (AI-712) ----------------------- */

/**
 * 家庭总览：列出当前家长名下每个孩子的进度摘要。`GET /api/parent/dashboard`，需家长登录 JWT。
 * 返回 `ChildProgressSummary[]`（昵称/等级/星星/连续天数/计划完成度/独立配置标识）。
 */
export function getDashboard(): Promise<ChildProgressSummary[]> {
  return request<ChildProgressSummary[]>("/parent/dashboard");
}

/**
 * 单孩进度详情（薄弱词 Top / 技能掌握度 / 周趋势）。`GET /api/parent/children/:childId/progress`，需家长登录 JWT。
 * 越权访问他人孩子 → 后端抛 404（ApiError）。返回 `ChildProgressDetail`。
 * @param childId 孩子 id
 */
export function getChildProgress(
  childId: string,
): Promise<ChildProgressDetail> {
  return request<ChildProgressDetail>(
    `/parent/children/${encodeURIComponent(childId)}/progress`,
  );
}
