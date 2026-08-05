import type { Course, Lesson, Word, DailyTask, GeneratePlanDto, GeneratePlanResponse } from "./types";

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
