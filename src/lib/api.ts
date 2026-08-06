import type {
  Course,
  Lesson,
  Word,
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
