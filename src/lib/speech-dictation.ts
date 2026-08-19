// AI-802 — 浏览器 Web Speech API 实时听写的纯逻辑层。
// 与 React 解耦，便于在 node 环境下做单元测试（见 speech-dictation.spec.ts）。
// 运行时类型来自 src/types/speech-recognition.d.ts 的全局声明（SpeechRecognition /
// SpeechRecognitionEvent 等），此文件仅以最小结构描述，避免测试依赖 DOM 全局。

/** window 上可能提供的 SpeechRecognition 构造器来源（可注入便于测试）。 */
export interface SpeechRecognitionWindowLike {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
  /** 安全上下文（HTTPS / localhost）。Web Speech API 仅在安全上下文可用。 */
  isSecureContext?: boolean;
}

/** 取 SpeechRecognition 构造器；无则返回 null（不支持 / SSR）。 */
export function getSpeechRecognitionCtor(
  win?: SpeechRecognitionWindowLike | null,
): unknown | null {
  const w =
    win ??
    (typeof window !== "undefined"
      ? (window as unknown as SpeechRecognitionWindowLike)
      : null);
  if (!w) return null;
  const ctor =
    (w.SpeechRecognition as unknown) ?? (w.webkitSpeechRecognition as unknown);
  return ctor ?? null;
}

/**
 * 是否支持语音听写：需同时具备构造器 + 安全上下文（HTTPS / localhost）。
 * 非安全上下文（http 非 localhost）下 Web Speech API 不可用，必须降级。
 */
export function isSpeechDictationSupported(
  win?: SpeechRecognitionWindowLike | null,
): boolean {
  const w =
    win ??
    (typeof window !== "undefined"
      ? (window as unknown as SpeechRecognitionWindowLike)
      : null);
  if (!w) return false;
  if (!getSpeechRecognitionCtor(w)) return false;
  // SSR / node 无 isSecureContext → 视为不支持（Web Speech 需安全上下文）。
  return w.isSecureContext === true;
}

/** 听写累计状态：final 已确认文本 + interim 当前中间结果。 */
export interface SpeechAccumulator {
  final: string;
  interim: string;
}

/** 单次 onresult 事件处理后的合并结果。 */
export interface SpeechResult extends SpeechAccumulator {
  /** 本次事件新增的 final 片段（可能多个，空格连接），供调用方增量追加进输入框。 */
  finalDelta: string;
}

/**
 * 处理一次 onresult 事件，把新结果合并进累计状态（纯函数）。
 *
 * @param prev        上次累计状态（final = 已确认文本）。
 * @param event       SpeechRecognitionEvent（results 为累积列表 + resultIndex）。
 * @param resultIndex 本次事件覆盖的新结果起始索引（results 中此前索引已处理过）。
 *
 * 规则：
 *  - isFinal 的结果追加进 final（以空格分隔，trim 后非空才计入）；
 *  - 非 final 的结果作为 interim（取本次事件尾部非 final 结果的拼接，覆盖式更新）；
 *  - 返回 finalDelta 供调用方把「新增片段」增量追加进受控输入框，避免重复/全量覆盖。
 */
export function applySpeechResult(
  prev: SpeechAccumulator,
  event: SpeechRecognitionEvent,
  resultIndex: number,
): SpeechResult {
  let finalText = prev.final;
  let interimText = "";
  let delta = "";

  const results = event.results;
  if (!results || results.length === 0) {
    return { final: finalText, interim: interimText, finalDelta: delta };
  }

  const start = Math.max(0, resultIndex);
  for (let i = start; i < results.length; i++) {
    const result = results[i];
    if (!result) continue;
    const transcript = (result[0]?.transcript ?? "").trim();
    if (result.isFinal) {
      if (transcript) {
        finalText = finalText ? `${finalText} ${transcript}` : transcript;
        delta = delta ? `${delta} ${transcript}` : transcript;
      }
    } else if (transcript) {
      interimText = interimText ? `${interimText} ${transcript}` : transcript;
    }
  }

  return { final: finalText, interim: interimText, finalDelta: delta };
}
