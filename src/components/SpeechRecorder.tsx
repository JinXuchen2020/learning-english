"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Mic, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import {
  buildRecordingResult,
  classifyRecordingError,
  clampDuration,
  DEFAULT_MAX_DURATION_MS,
  isSecureContextForMedia,
  pickMimeType,
  type RecordingErrorKind,
  type RecordingResult,
} from "@/lib/speech-recorder";

type RecorderStatus = "idle" | "requesting" | "recording" | "recorded" | "error";

export interface SpeechRecorderProps {
  /** 录音时长上限（毫秒）。达到上限自动停止。默认 10s。 */
  maxDurationMs?: number;
  /** 录音完成（停止并装配结果）回调。 */
  onRecordingComplete?: (result: RecordingResult) => void;
  /** 录音失败分类回调。 */
  onError?: (kind: RecordingErrorKind) => void;
  /** 重置（"Try again" 回到 idle）回调，供父组件同步清除已录状态。 */
  onReset?: () => void;
  disabled?: boolean;
  className?: string;
}

/** 分级友好错误文案（儿童友好、可操作）。 */
const ERROR_MESSAGES: Record<RecordingErrorKind, string> = {
  "permission-denied":
    "We need your microphone to hear you speak. Please allow mic access in your browser settings, then try again.",
  "no-microphone": "No microphone found. Please connect a microphone and try again.",
  "not-supported": "Recording isn't supported on this browser. Try Chrome or Safari.",
  "insecure-context":
    "Recording needs a secure (https) connection. Open the app from the secure link.",
  unknown: "Something went wrong while recording. Please try again.",
};

function useSpeechRecorder(opts: {
  maxDurationMs: number;
  onRecordingComplete?: (r: RecordingResult) => void;
  onError?: (k: RecordingErrorKind) => void;
  onReset?: () => void;
}) {
  const [status, setStatus] = React.useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [errorKind, setErrorKind] = React.useState<RecordingErrorKind | null>(null);
  const [result, setResult] = React.useState<RecordingResult | null>(null);
  const [isIosFallback, setIsIosFallback] = React.useState(false);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const startTimeRef = React.useRef<number>(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = React.useRef(false);
  const maxDurationRef = React.useRef(opts.maxDurationMs);
  maxDurationRef.current = opts.maxDurationMs;

  const stopTracks = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearTimers = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fail = React.useCallback(
    (kind: RecordingErrorKind) => {
      busyRef.current = false;
      stopTracks();
      setErrorKind(kind);
      setStatus("error");
      opts.onError?.(kind);
    },
    [opts, stopTracks],
  );

  const stop = React.useCallback(() => {
    clearTimers();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        // 已停止则忽略
      }
    }
  }, [clearTimers]);

  const reset = React.useCallback(() => {
    clearTimers();
    stopTracks();
    recorderRef.current = null;
    chunksRef.current = [];
    busyRef.current = false;
    setResult((prev) => {
      if (prev?.url) {
        try {
          URL.revokeObjectURL(prev.url);
        } catch {
          // 已释放则忽略
        }
      }
      return null;
    });
    setElapsedMs(0);
    setErrorKind(null);
    setIsIosFallback(false);
    setStatus("idle");
    opts.onReset?.();
  }, [clearTimers, stopTracks, opts]);

  const start = React.useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setErrorKind(null);
    setResult(null);
    setElapsedMs(0);

    // 安全上下文预判（getUserMedia 需 https/localhost）
    if (!isSecureContextForMedia()) {
      logger.warn("SpeechRecorder: insecure context, mic unavailable");
      fail("insecure-context");
      return;
    }
    // API 存在性预判
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      logger.warn("SpeechRecorder: MediaRecorder/getUserMedia unavailable");
      fail("not-supported");
      return;
    }

    setStatus("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      logger.warn(`SpeechRecorder: getUserMedia failed (${classifyRecordingError(err)})`, err);
      fail(classifyRecordingError(err));
      return;
    }

    streamRef.current = stream;
    const selection = pickMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder));
    setIsIosFallback(selection.isIosFallback);

    let recorder: MediaRecorder;
    try {
      recorder = selection.mimeType
        ? new MediaRecorder(stream, { mimeType: selection.mimeType })
        : new MediaRecorder(stream);
    } catch (err) {
      logger.warn(`SpeechRecorder: MediaRecorder init failed (${classifyRecordingError(err)})`, err);
      fail(classifyRecordingError(err));
      return;
    }

    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = () => {
      logger.error("SpeechRecorder: MediaRecorder error event");
      fail("unknown");
    };
    recorder.onstop = () => {
      busyRef.current = false;
      const durationMs = clampDuration(Date.now() - startTimeRef.current, maxDurationRef.current);
      const blob = new Blob(chunksRef.current, { type: selection.mimeType || "audio/webm" });
      const built = buildRecordingResult({
        blob,
        mimeType: selection.mimeType || blob.type,
        durationMs,
      });
      stopTracks();
      recorderRef.current = null;
      chunksRef.current = [];
      setResult(built);
      setElapsedMs(durationMs);
      setStatus("recorded");
      opts.onRecordingComplete?.(built);
    };

    startTimeRef.current = Date.now();
    try {
      recorder.start();
    } catch (err) {
      logger.warn(`SpeechRecorder: recorder.start failed (${classifyRecordingError(err)})`, err);
      fail(classifyRecordingError(err));
      return;
    }
    setStatus("recording");

    timerRef.current = setTimeout(() => stop(), maxDurationRef.current);
    intervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);
  }, [opts, fail, stopTracks, stop]);

  React.useEffect(() => {
    return () => {
      clearTimers();
      stopTracks();
      setResult((prev) => {
        if (prev?.url) {
          try {
            URL.revokeObjectURL(prev.url);
          } catch {
            // 已释放则忽略
          }
        }
        return prev;
      });
    };
  }, [clearTimers, stopTracks]);

  return { status, elapsedMs, errorKind, result, isIosFallback, start, stop, reset };
}

export default function SpeechRecorder({
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  onRecordingComplete,
  onError,
  onReset,
  disabled = false,
  className = "",
}: SpeechRecorderProps) {
  const { status, elapsedMs, errorKind, result, isIosFallback, start, stop, reset } =
    useSpeechRecorder({ maxDurationMs, onRecordingComplete, onError, onReset });

  const seconds = (elapsedMs / 1000).toFixed(1);
  const maxSeconds = Math.round(maxDurationMs / 1000);

  return (
    <div
      data-component="SpeechRecorder"
      data-status={status}
      className={cn("flex flex-col items-center gap-4", className)}
    >
      {status === "idle" && (
        <Button
          onClick={() => start()}
          disabled={disabled}
          size="lg"
          aria-label="Tap to record"
        >
          <Mic className="mr-2" /> Tap to record
        </Button>
      )}

      {status === "requesting" && (
        <Button size="lg" disabled aria-busy="true">
          <span className="mr-2 animate-pulse">…</span> Requesting microphone…
        </Button>
      )}

      {status === "recording" && (
        <div className="flex flex-col items-center gap-3" aria-live="polite">
          <div className="flex items-center gap-2 text-kids-title font-bold">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-kids-pink opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-kids-pink" />
            </span>
            Recording… {seconds}s / {maxSeconds}s
          </div>
          <Button variant="secondary" onClick={() => stop()} aria-label="Stop recording">
            <Square className="mr-2" /> Stop
          </Button>
        </div>
      )}

      {status === "recorded" && result && (
        <div className="flex flex-col items-center gap-3 w-full" aria-live="polite">
          <div className="flex items-center gap-2 text-[var(--color-success)] font-bold">
            <CheckCircle2 className="mr-1" /> Got it!
          </div>
          {result.url && (
            <audio controls src={result.url} className="w-full max-w-xs" />
          )}
          <Button variant="soft" onClick={() => reset()} aria-label="Try again">
            <RotateCcw className="mr-2" /> Try again
          </Button>
        </div>
      )}

      {status === "error" && errorKind && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center gap-3 w-full max-w-sm text-center"
        >
          <div className="flex flex-col items-center gap-1 font-bold text-kids-pink">
            <span className="flex items-center gap-1">
              <AlertCircle className="mr-1" /> {ERROR_MESSAGES[errorKind]}
            </span>
            {isIosFallback && errorKind !== "permission-denied" && (
              <span className="text-xs font-normal text-kids-muted">
                (recorded as audio/mp4 on this device)
              </span>
            )}
          </div>
          <Button variant="soft" onClick={() => reset()} aria-label="Try again">
            <RotateCcw className="mr-2" /> Try again
          </Button>
        </div>
      )}
    </div>
  );
}
