"use client";

import React, { useState, useCallback, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Volume2, Star, Mic, ArrowRight, Trophy } from "lucide-react";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import SpeechRecorder from "@/components/SpeechRecorder";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { logger } from "@/lib/logger";
import { mapBackendMascotExpr, speakText } from "@/lib/speech";
import type {
  Word,
  SpeechFeedback,
  SpeechLevel,
  MascotExpression,
} from "@/lib/types";
import type { RecordingResult } from "@/lib/speech-recorder";

/** 口语反馈等级档位 → 展示文案 + 配色（与 AI-306 `levelFromScore` 语义一致）。 */
const LEVEL_BADGE: Record<SpeechLevel, { label: string; cls: string }> = {
  good: {
    label: "Great!",
    cls: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  },
  ok: {
    label: "Good job!",
    cls: "bg-[var(--color-primary-wash)] text-[var(--seed-primary)]",
  },
  weak: {
    label: "Keep trying!",
    cls: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  },
};

/** 单个单词跟读卡片（听 → 录 → 评 → 反馈）。 */
function SpeechCard({
  word,
  index,
  total,
  recording,
  evaluating,
  feedback,
  cardError,
  onListen,
  onRecordingComplete,
  onReset,
  onSubmit,
  onNext,
}: {
  word: Word;
  index: number;
  total: number;
  recording: RecordingResult | null;
  evaluating: boolean;
  feedback: SpeechFeedback | null;
  cardError: string | null;
  onListen: () => void;
  onRecordingComplete: (r: RecordingResult) => void;
  onReset: () => void;
  onSubmit: () => void;
  onNext: () => void;
}) {
  const [showPhonics, setShowPhonics] = useState(false);
  const mascotExpr: MascotExpression = feedback
    ? mapBackendMascotExpr(feedback.mascotExpr)
    : "happy";

  return (
    <div className="max-w-2xl mx-auto space-y-6" data-component="WordCard">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-kids-muted">
          Word {index + 1} of {total}
        </span>
        {feedback && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-extrabold ${LEVEL_BADGE[feedback.level].cls}`}
          >
            {LEVEL_BADGE[feedback.level].label}
          </span>
        )}
      </div>

      {/* Word card */}
      <section className="card-kids text-center space-y-3" data-component="WordFront">
        <div className="w-full h-40 rounded-card bg-gradient-to-b from-[var(--color-primary-wash)] to-kids-secondary flex items-center justify-center overflow-hidden">
          <span className="text-5xl font-extrabold text-kids-title tracking-tight">
            {word.text}
          </span>
        </div>
        <div className="space-y-1">
          <p className="text-kids-muted">{word.meaning}</p>
          <button
            onClick={() => setShowPhonics((s) => !s)}
            className="btn-kids bg-[var(--seed-primary)]/15 text-[var(--seed-primary)] !px-5"
            aria-label="Show pronunciation hint"
            data-action="toggle-phonics"
          >
            <Volume2 size={20} className="mr-2" />
            {showPhonics ? word.phonics : "Phonics"}
          </button>
        </div>
      </section>

      {/* Listen (TTS) button */}
      <div className="flex justify-center">
        <Button
          variant="secondary"
          size="lg"
          onClick={onListen}
          data-action="listen"
          aria-label={`Listen to ${word.text}`}
        >
          <Volume2 size={22} className="mr-2" />
          Listen
        </Button>
      </div>

      {/* Recorder OR feedback */}
      {!feedback ? (
        <section className="space-y-4" data-component="RecordArea">
          {/* key=index 让切换卡片时录音组件重新挂载，内部状态归零 */}
          <SpeechRecorder
            key={index}
            disabled={evaluating}
            onRecordingComplete={onRecordingComplete}
            onReset={onReset}
            onError={() => {
              /* 录音错误由 SpeechRecorder 自身友好提示，这里仅清页面已录态 */
              onReset();
            }}
          />

          <div className="flex justify-center">
            <Button
              variant="success"
              size="lg"
              disabled={!recording || evaluating}
              onClick={onSubmit}
              data-action="submit-speech"
            >
              <Mic size={22} className="mr-2" />
              {evaluating ? "Checking…" : "Submit"}
            </Button>
          </div>

          {evaluating && (
            <div
              className="flex flex-col items-center gap-2 text-kids-muted font-semibold"
              data-component="SpeechEvaluating"
            >
              <Mascot expression="thinking" size="medium" />
              Foxy is listening…
            </div>
          )}

          {cardError && (
            <p
              className="text-sm font-bold text-[var(--color-danger)] bg-[var(--color-danger)]/10 rounded-control px-4 py-2.5 text-center"
              role="alert"
            >
              {cardError}
            </p>
          )}
        </section>
      ) : (
        <SpeechFeedbackPanel
          feedback={feedback}
          mascotExpr={mascotExpr}
          onNext={onNext}
          isLast={index + 1 >= total}
        />
      )}
    </div>
  );
}

/** 口语反馈面板（AI-306 结构渲染）。 */
function SpeechFeedbackPanel({
  feedback,
  mascotExpr,
  onNext,
  isLast,
}: {
  feedback: SpeechFeedback;
  mascotExpr: MascotExpression;
  onNext: () => void;
  isLast: boolean;
}) {
  return (
    <section
      className="card-kids flex flex-col items-center gap-4 text-center"
      data-component="SpeechFeedbackPanel"
    >
      <Mascot expression={mascotExpr} size="large" />

      <div className="space-y-1">
        <p className="text-3xl font-extrabold text-kids-title">
          {feedback.score}
          <span className="text-lg text-kids-muted"> / 100</span>
        </p>
        <p className="text-kids-muted">
          “{feedback.readableText || "—"}”
        </p>
      </div>

      {/* 弱音素高亮 */}
      {feedback.weakPhonemes.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2" data-component="WeakPhonemes">
          {feedback.weakPhonemes.map((p, i) => (
            <span
              key={i}
              className="rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)] px-3 py-1 text-sm font-bold"
            >
              {p}
            </span>
          ))}
        </div>
      )}

      <p className="text-kids-text font-semibold max-w-sm">{feedback.feedback}</p>

      {/* 通过 → 得星 + 庆祝 */}
      {feedback.passed && (
        <div
          className="flex flex-col items-center gap-1"
          data-component="SpeechCelebration"
        >
          <Star
            size={48}
            className="text-kids-sun fill-kids-sun animate-star-pop"
          />
          <p className="font-extrabold text-[var(--color-success)]">
            You earned a star! ⭐
          </p>
        </div>
      )}

      <Button
        variant="default"
        onClick={onNext}
        data-action="next-word"
        className="mt-2"
      >
        {isLast ? "Finish" : "Next word"}
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </section>
  );
}

function SpeechInner() {
  const { user } = useAuth();
  // AI-308：从 URL 读取口语任务 id（Home 深链携带），会话完成后回写任务状态。
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId");
  const [taskMarked, setTaskMarked] = useState(false);

  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [stars, setStars] = useState(0);
  const [finished, setFinished] = useState(false);

  const [recording, setRecording] = useState<RecordingResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [feedback, setFeedback] = useState<SpeechFeedback | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getAllWords()
      .then((data) => {
        if (active) setWords(data);
      })
      .catch((err) => {
        logger.error("Failed to load words for speech practice", err);
        if (active) {
          setLoadError(
            err instanceof ApiError
              ? err.message || "加载单词失败"
              : "网络好像开小差了，再试一次吧！",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleListen = useCallback((word: Word) => {
    // 浏览器原生 TTS（Web Speech API）朗读；不支持时静默降级（AI-402 后续接入狐狸音色）。
    speakText(word.text, { lang: "en-US" });
  }, []);

  const clearCardState = useCallback(() => {
    setRecording(null);
    setFeedback(null);
    setCardError(null);
  }, []);

  const handleRecordingComplete = useCallback(
    (r: RecordingResult) => {
      setRecording(r);
      setFeedback(null);
      setCardError(null);
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!recording || evaluating) return;
    setEvaluating(true);
    setCardError(null);
    try {
      const fb = await api.evaluateSpeech(recording.blob, {
        wordId: words[currentIndex]?.id,
        durationMs: recording.durationMs,
        userId: user?.id,
      });
      setFeedback(fb);
      if (fb.passed) setStars((s) => s + 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setCardError(err.message || "评测失败，再试一次吧～");
      } else {
        setCardError("网络好像开小差了，再试一次吧！");
      }
      logger.error("evaluateSpeech failed", err);
    } finally {
      setEvaluating(false);
    }
  }, [recording, evaluating, words, currentIndex, user]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= words.length) {
      setFinished(true);
      return;
    }
    setCurrentIndex((i) => i + 1);
    clearCardState();
  }, [currentIndex, words.length, clearCardState]);

  // AI-308：口语会话完成（finished）且携带 taskId 时，回写每日任务状态。
  // 后端 completeTask 幂等（重复完成无害），这里用 taskMarked 守卫只调一次。
  useEffect(() => {
    if (!finished || !taskId || taskMarked) return;
    let active = true;
    api
      .completeTask(taskId)
      .then(() => {
        if (active) setTaskMarked(true);
      })
      .catch((err) => logger.error("Failed to mark speech task complete", err));
    return () => {
      active = false;
    };
  }, [finished, taskId, taskMarked]);

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 gap-3"
        data-component="SpeechLoading"
      >
        <Mascot expression="thinking" size="medium" />
        <p className="text-kids-muted font-semibold">Getting words ready…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <p
        className="text-sm font-bold text-[var(--color-danger)] bg-[var(--color-danger)]/10 rounded-control px-4 py-2.5 text-center"
        role="alert"
      >
        {loadError}
      </p>
    );
  }

  if (words.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4"
        data-component="SpeechEmpty"
      >
        <Mascot expression="encouraging" size="large" />
        <h1 className="text-2xl">No words here yet!</h1>
        <p className="text-kids-muted">Add some words from a course to start speaking.</p>
        <Button variant="success" asChild>
          <Link href="/course">
            <ArrowRight size={20} className="mr-2" />
            Browse Courses
          </Link>
        </Button>
      </div>
    );
  }

  if (finished) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6"
        data-component="SpeechComplete"
      >
        <Mascot expression="celebrating" size="large" />
        <h1 className="text-3xl">Amazing Job!</h1>
        <div className="flex items-center gap-2 text-xl font-extrabold text-[var(--color-success)]">
          <Trophy size={32} className="text-kids-sun" />
          You earned {stars} {stars === 1 ? "star" : "stars"}!
        </div>
        {taskId && taskMarked && (
          <p
            className="text-sm font-semibold text-[var(--seed-primary)]"
            data-component="TaskDoneNote"
          >
            Daily task complete! ✓
          </p>
        )}
        <Button variant="secondary" asChild>
          <Link href="/">
            <ArrowRight size={20} className="mr-2" />
            Back to Home
          </Link>
        </Button>
      </div>
    );
  }

  const word = words[currentIndex];

  return (
    <div className="space-y-6" data-component="SpeechPage">
      {/* Header: title + star counter */}
      <div className="flex items-center justify-between gap-3">
        <h1
          className="text-2xl font-extrabold text-kids-title"
          data-component="SpeechTitle"
        >
          Speak with Foxy!
        </h1>
        <div
          className="flex items-center gap-2 text-kids-title font-extrabold"
          data-component="StarCounter"
        >
          <Star size={22} className="text-kids-sun fill-kids-sun" />
          <span data-component="StarCount">{stars}</span>
        </div>
      </div>

      <SpeechCard
        word={word}
        index={currentIndex}
        total={words.length}
        recording={recording}
        evaluating={evaluating}
        feedback={feedback}
        cardError={cardError}
        onListen={() => handleListen(word)}
        onRecordingComplete={handleRecordingComplete}
        onReset={clearCardState}
        onSubmit={handleSubmit}
        onNext={handleNext}
      />
    </div>
  );
}

export default function SpeechPage() {
  return (
    <AuthGate>
      <Suspense
        fallback={
          <div
            className="flex flex-col items-center justify-center py-16 gap-3"
            data-component="SpeechSuspense"
          >
            <Mascot expression="thinking" size="medium" />
            <p className="text-kids-muted font-semibold">Getting ready…</p>
          </div>
        }
      >
        <SpeechInner />
      </Suspense>
    </AuthGate>
  );
}
