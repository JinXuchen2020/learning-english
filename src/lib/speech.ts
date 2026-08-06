/**
 * speech — 口语跟读页纯逻辑层（AI-307）。
 *
 * 把带分支的逻辑（后端→前端吉祥物表情映射、Web Speech API 朗读封装）集中于此，
 * 与 React 页面组件解耦，便于在 Vitest `node` 环境下单元测试（浏览器全局一律
 * 通过参数注入或 `typeof` 守卫，绝不在模块加载期访问 `window.speechSynthesis`）。
 *
 * 组件层（`app/speech/page.tsx`）只负责渲染与状态编排，朗读/表情映射委托本层。
 */

import type { MascotExpression } from "./types";

/**
 * 后端吉祥物表情（来自 `ai-provider.interface.ts` 的 `MascotExpression`）：
 *   'happy' | 'encourage' | 'thinking' | 'cheer'
 * 前端 `Mascot` 组件支持（来自 `src/lib/types.ts`）：
 *   'happy' | 'thinking' | 'celebrating' | 'encouraging'
 *
 * 二者枚举**不一致**（AI-306/403 用后端口径，前端 Mascot 用展示口径），
 * 本函数做显式映射，未知/缺省安全回退到 'happy'。
 */
const BACKEND_TO_FRONTEND_MASCOT: Record<string, MascotExpression> = {
  happy: "happy",
  thinking: "thinking",
  cheer: "celebrating",
  encourage: "encouraging",
};

/**
 * 把后端吉祥物表情映射为前端 `Mascot` 组件可渲染的表情。
 * 纯函数：未知值 / 空值 → 'happy'（最安全的默认，不会破坏渲染）。
 */
export function mapBackendMascotExpr(
  expr: string | null | undefined,
): MascotExpression {
  if (!expr) return "happy";
  return BACKEND_TO_FRONTEND_MASCOT[expr] ?? "happy";
}

/** Web Speech API 的 `SpeechSynthesis` 最小结构（注入式，便于 node 单测）。 */
export interface SpeechSynthesisLike {
  speak: (utterance: SpeechSynthesisUtterance) => void;
  cancel: () => void;
  getVoices: () => SpeechSynthesisVoice[];
}

/** 单个语音（用于按 lang 选音色）。 */
export interface SpeechSynthesisVoiceLike {
  lang: string;
  name: string;
  default?: boolean;
}

export interface SpeakTextOptions {
  /** 语言标签，如 'en-US'。 */
  lang?: string;
  /** 注入式 `speechSynthesis`（默认取 `window.speechSynthesis`），便于测试。 */
  synth?: SpeechSynthesisLike | null;
}

/**
 * 浏览器是否支持语音合成（Web Speech API）。
 * 注入式 `synth` 优先；否则读 `window.speechSynthesis`。无支持时返回 false。
 */
export function isSpeechSynthesisSupported(
  synth?: SpeechSynthesisLike | null,
): boolean {
  if (synth) return true;
  if (typeof window === "undefined") return false;
  return typeof window.speechSynthesis !== "undefined";
}

/**
 * 构造朗读语句对象。浏览器环境用原生 `SpeechSynthesisUtterance`；
 * node / 无 DOM 环境（单测）回退为最小结构，注入式 `synth` 不在意真实类型。
 */
function createUtterance(text: string): SpeechSynthesisUtterance {
  if (typeof SpeechSynthesisUtterance !== "undefined") {
    return new SpeechSynthesisUtterance(text);
  }
  const fallback: Partial<SpeechSynthesisUtterance> = { text };
  return fallback as SpeechSynthesisUtterance;
}

/**
 * 用浏览器原生 TTS 朗读文本（Web Speech API）。
 *
 * - 无 `synth` 且无 `window.speechSynthesis` → 安全返回 false（不抛），页面调用点据此静默降级。
 * - 优先匹配 `opts.lang` 的语音（找不到则用默认），提升儿童跟读发音准确度。
 * - 返回 true 表示已提交朗读；返回 false 表示环境不支持。
 *
 * 纯逻辑可测：所有浏览器全局通过 `opts.synth` 注入，node 环境下无需真实 `window`。
 */
export function speakText(text: string, opts: SpeakTextOptions = {}): boolean {
  const synth =
    opts.synth ??
    (typeof window !== "undefined" ? window.speechSynthesis : undefined);

  if (!synth) return false;

  try {
    // 中断可能存在的上一句朗读，避免排队叠加。
    synth.cancel();

    const utterance = createUtterance(text);
    if (opts.lang) utterance.lang = opts.lang;

    const voices = synth.getVoices?.() ?? [];
    if (opts.lang && voices.length > 0) {
      const match = voices.find((v) => v.lang === opts.lang);
      if (match) utterance.voice = match;
    }

    synth.speak(utterance);
    return true;
  } catch {
    // 极少数环境 speaker 构造/调用抛错 → 安全降级，绝不阻塞朗读按钮交互。
    return false;
  }
}
