import type { DailyTask } from "./types";

/**
 * 口语类任务（mic 图标）从 Home 卡片直达 `/speech` 页，而非直接勾选完成。
 * 其余图标（headphones / pencil）保持原有一键完成行为。
 */
export function isSpeakingTask(task: Pick<DailyTask, "icon">): boolean {
  return task.icon === "mic";
}

/**
 * 构造口语任务对应的 `/speech` 深链，携带 `taskId` 供会话完成后回写任务状态。
 * 使用 `encodeURIComponent` 防止任务 id 含特殊字符破坏 URL。
 */
export function speakingTaskHref(taskId: string): string {
  return `/speech?taskId=${encodeURIComponent(taskId)}`;
}

/**
 * 计划节引用任务（AI-803）：携带真实 `lessonId` 的每日任务，Home 卡片深链到对应课时。
 * 无引用（通用任务 / 全局种子）为 false。
 */
export function isLessonTask(task: Pick<DailyTask, "lessonId">): boolean {
  return !!task.lessonId;
}

/**
 * 构造计划节引用任务的深链（AI-803）：
 *  - `speak` 技能 → 复用口语路径 `/speech?taskId=`（保留会话完成回写 taskId 的机制）；
 *  - 其余（vocab/listen/write）→ `/practice?lessonId=<id>`，直达对应课时测验。
 * 使用 `encodeURIComponent` 防止 id 含特殊字符破坏 URL。
 */
export function lessonTaskHref(
  task: Pick<DailyTask, "lessonId" | "skillType" | "id">,
): string {
  if (task.skillType === "speak") return speakingTaskHref(task.id);
  return `/practice?lessonId=${encodeURIComponent(task.lessonId!)}`;
}
