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
