/**
 * audio — 对话陪练 TTS 播放纯逻辑层（AI-407）。
 *
 * 把带分支的逻辑（TTS url 合法性归一、Audio 元素创建 + 自动播放 + 异常降级）
 * 集中于此，与 React 页面解耦，便于 Vitest `node` 环境下单元测试
 * （浏览器 `Audio` 全局通过 `createAudio` 参数注入；模块加载期不访问 `Audio`）。
 *
 * 组件层（`app/chat/page.tsx`）渲染 `<audio>` 并委托本层做程序化自动播放兜底。
 */

/** 最小 `HTMLAudioElement` 结构（注入式，便于 node 单测）。 */
export interface AudioLike {
  src: string;
  autoplay: boolean;
  /** 返回 Promise（现代浏览器）或 void（老实现）；被拦截时 reject。 */
  play: () => Promise<void> | void;
}

/**
 * 把后端 TTS 引用归一为可播放 url；不可播放（空 / 非 data·http(s)）返回 null。
 * 后端契约（`ChatSendResponse.ttsUrl`）：data URI 或绝对 http(s) URL，TTS 失败为 null。
 * 纯函数。
 */
export function normalizeTtsUrl(ttsUrl: string | null | undefined): string | null {
  if (!ttsUrl) return null;
  if (
    ttsUrl.startsWith("data:") ||
    ttsUrl.startsWith("http://") ||
    ttsUrl.startsWith("https://")
  ) {
    return ttsUrl;
  }
  return null;
}

/** 默认工厂：用浏览器原生 `Audio` 构造；node / SSR（无 `Audio` 全局）返回 null。 */
function defaultAudioFactory(src: string): AudioLike | null {
  if (typeof Audio === "undefined") return null;
  return new Audio(src) as unknown as AudioLike;
}

/**
 * 程序化播放狐狸 TTS 音频（自动播放 + 手动播放按钮共用）。
 *
 * - url 不可播放 → 返回 false（不抛），页面据此隐藏播放控件。
 * - 创建 `Audio(url)`，`autoplay=true` 后调用 `play()`；自动播放被浏览器策略拦截
 *   （reject）时静默吞掉——手动 🔊 按钮仍可触发，不视为失败。
 * - 工厂抛错 / 返回 null → 返回 false（安全降级，绝不阻塞对话）。
 *
 * @param createAudio 注入式 Audio 工厂（默认取浏览器 `Audio`），便于 node 单测。
 * @returns 是否已提交播放（true）或无法播放（false）。
 */
export function playTts(
  url: string | null | undefined,
  createAudio?: (src: string) => AudioLike | null,
): boolean {
  const finalUrl = normalizeTtsUrl(url);
  if (!finalUrl) return false;

  const factory = createAudio ?? defaultAudioFactory;
  let el: AudioLike | null = null;
  try {
    el = factory(finalUrl);
  } catch {
    return false;
  }
  if (!el) return false;

  try {
    el.src = finalUrl;
    el.autoplay = true;
    const p = el.play();
    if (p && typeof (p as Promise<void>).catch === "function") {
      // 自动播放被策略拦截：吞掉 reject，避免冒泡为未处理拒绝。
      (p as Promise<void>).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}
