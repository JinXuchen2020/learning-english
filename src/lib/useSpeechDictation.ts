"use client";

// AI-802 — 聊天语音输入 hook：封装浏览器 Web Speech API 实时听写。
// 设计目标：让孩子不用键盘也能对狐狸老师说英语。识别结果只作为输入框文本，
// 发送沿用既有 handleSend（后端无改动）。不支持的浏览器 / 非安全上下文 → supported=false，
// 调用方据此隐藏或禁用麦克风按钮，绝不抛错、不阻断键盘输入。
//
// 核心「结果合并 / final 增量 / supported 探测」逻辑抽到纯模块 speech-dictation.ts，
// 本 hook 只负责 React 副作用（实例生命周期 / 状态 / 卸载清理）。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applySpeechResult,
  getSpeechRecognitionCtor,
  isSpeechDictationSupported,
} from "./speech-dictation";
import { logger } from "./logger";

export interface UseSpeechDictationOptions {
  /** 新确认的 final 片段到达时回调（参数是本次新增文本，已 trimmed）。 */
  onFinal?: (segment: string) => void;
}

export interface SpeechDictation {
  /** 浏览器是否支持语音听写（有构造器 + 安全上下文）。 */
  supported: boolean;
  /** 是否正在监听（麦克风激活）。 */
  listening: boolean;
  /** 当前中间（interim）结果预览，仅用于展示，不写入输入框。 */
  interim: string;
  start: () => void;
  stop: () => void;
}

export function useSpeechDictation(
  lang: string,
  options: UseSpeechDictationOptions = {},
): SpeechDictation {
  const { onFinal } = options;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const listeningRef = useRef(false);
  const finalRef = useRef("");
  // onFinal 可能每次渲染变化；用 ref 持有最新值，避免 start 闭包捕获过期回调。
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  // 客户端探测支持性（SSR 时 window 不存在 → supported=false）。
  useEffect(() => {
    setSupported(isSpeechDictationSupported());
  }, []);

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    setInterim("");
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* 未 start 时 stop 可能抛错，忽略 */
      }
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor() as
      | (typeof SpeechRecognition)
      | null;
    if (!Ctor) return; // 不支持 → 不启动

    // 已有实例在跑 → 先停再起，避免重复 start 抛 "already started"。
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      const next = applySpeechResult(
        { final: finalRef.current, interim: "" },
        event,
        event.resultIndex,
      );
      finalRef.current = next.final;
      setInterim(next.interim);
      // 仅把「新增 final 片段」追加进输入框，避免重复或覆盖已有文本。
      if (next.finalDelta) {
        onFinalRef.current?.(next.finalDelta);
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 网络 / 无语音 / 权限等错误：仅记录，不抛；保持当前输入不被破坏。
      // "aborted" / "no-speech" 多为正常 stop 流程，无需处理。
      logger.warn("speech dictation error", { error: event?.error });
    };

    rec.onend = () => {
      // continuous 模式浏览器可能在静音后自动 onend；若用户仍意图 listening，
      // 则重启识别，避免「说一半突然停」。手动 stop() 已将 listeningRef 置 false。
      if (listeningRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* 重启失败 → 落停 */
        }
      }
      listeningRef.current = false;
      setListening(false);
      setInterim("");
    };

    listeningRef.current = true;
    setListening(true);
    setInterim("");
    try {
      rec.start();
    } catch (err) {
      // 极小概率 start 抛错（部分浏览器状态异常）→ 落停并记录，不向上抛。
      logger.warn("speech dictation start failed", err);
      listeningRef.current = false;
      setListening(false);
      return;
    }
    recognitionRef.current = rec;
  }, [lang]);

  // 组件卸载时停止识别，防止识别器泄漏（避免后台持续监听 / 内存泄漏）。
  useEffect(() => {
    return () => {
      listeningRef.current = false;
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
        }
      }
      recognitionRef.current = null;
    };
  }, []);

  return { supported, listening, interim, start, stop };
}
