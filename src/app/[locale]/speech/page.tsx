"use client";

import React, { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Volume2, Star, Mic, ArrowRight, Trophy } from "lucide-react";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import SpeechRecorder from "@/components/SpeechRecorder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { logger } from "@/lib/logger";
import { mapBackendMascotExpr, speakText } from "@/lib/speech";
import type {
  Word,
  Sentence,
  SpeechFeedback,
  SpeechLevel,
  MascotExpression,
} from "@/lib/types";
import type { RecordingResult } from "@/lib/speech-recorder";

/** 口语反馈等级档位 → 展示文案 key + 配色（与 AI-306 `levelFromScore` 语义一致）。 */
const LEVEL_BADGE: Record<SpeechLevel, { labelKey: string; cls: string }> = {
  good: {
    labelKey: "levelGreat",
    cls: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  },
  ok: {
    labelKey: "levelGood",
    cls: "bg-[var(--color-primary-wash)] text-[var(--seed-primary)]",
  },
  weak: {
    labelKey: "levelKeep",
    cls: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  },
};

/** 跟读练习项（单词 / 句子通用抽象）。 */
interface PracticeItem {
  id: string;
  text: string;
  meaning: string;
}

/** 单个跟读卡片（听 → 录 → 评 → 反馈）。单词 / 句子通用，按 `mode` 渲染。 */
function SpeechCard({
  item,
  mode,
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
  item: PracticeItem;
  mode: "words" | "sentences";
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
  const t = useTranslations("Speech");
  const [showPhonics, setShowPhonics] = useState(false);
  const mascotExpr: MascotExpression = feedback
    ? mapBackendMascotExpr(feedback.mascotExpr)
    : "happy";

  const isSentence = mode === "sentences";

  return (
    <div
      className="max-w-2xl mx-auto space-y-6"
      data-component={isSentence ? "SentenceCard" : "WordCard"}
    >
      {/* Progress */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-kids-muted">
          {isSentence
            ? t("progressSentence", { index: index + 1, total })
            : t("progressWord", { index: index + 1, total })}
        </span>
        {feedback && (
          <Badge
            variant="neutral"
            className={`rounded-full px-3 py-1 text-xs font-extrabold ${LEVEL_BADGE[feedback.level].cls}`}
          >
            {t(LEVEL_BADGE[feedback.level].labelKey)}
          </Badge>
        )}
      </div>

      {/* Card front */}
      <Card className="text-center space-y-3" data-component="WordFront">
        <div className="w-full h-40 rounded-card bg-gradient-to-b from-[var(--color-primary-wash)] to-kids-secondary flex items-center justify-center overflow-hidden">
          <span
            className={`font-extrabold text-kids-title tracking-tight ${
              isSentence ? "text-2xl px-4 leading-snug" : "text-5xl"
            }`}
          >
            {item.text}
          </span>
        </div>
        <div className="space-y-1">
          <p className="text-kids-muted">{item.meaning}</p>
          {!isSentence && (
            <button
              onClick={() => setShowPhonics((s) => !s)}
              className="btn-kids bg-[var(--seed-primary)]/15 text-[var(--seed-primary)] !px-5"
              aria-label={t("pronunciationHintLabel")}
              data-action="toggle-phonics"
            >
              <Volume2 size={20} className="mr-2" />
              {showPhonics ? t("phonics") : t("showPhonics")}
            </button>
          )}
        </div>
      </Card>

      {/* Listen (TTS) button */}
      <div className="flex justify-center">
        <Button
          variant="secondary"
          size="lg"
          onClick={onListen}
          data-action="listen"
          aria-label={t("listenTo", { text: item.text })}
        >
          <Volume2 size={22} className="mr-2" />
          {t("listen")}
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
              {evaluating ? t("checking") : t("submit")}
            </Button>
          </div>

          {evaluating && (
            <div
              className="flex flex-col items-center gap-2 text-kids-muted font-semibold"
              data-component="SpeechEvaluating"
            >
              <Mascot expression="thinking" size="medium" />
              {t("foxyListening")}
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
  const t = useTranslations("Speech");
  return (
      <Card
        className="flex flex-col items-center gap-4 text-center"
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
            <Badge
              key={i}
              variant="neutral"
              className="rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)] px-3 py-1 text-sm font-bold"
            >
              {p}
            </Badge>
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
            {t("earnedStar")}
          </p>
        </div>
      )}

      <Button
        variant="default"
        onClick={onNext}
        data-action="next-word"
        className="mt-2"
      >
        {isLast ? t("finish") : t("nextWord")}
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </Card>
  );
}

function SpeechInner() {
  const { user } = useAuth();
  const t = useTranslations("Speech");
  // AI-308：从 URL 读取口语任务 id（Home 深链携带），会话完成后回写任务状态。
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId");
  const [taskMarked, setTaskMarked] = useState(false);

  // AI-309：单词 / 句子双模式；句子模式消费句库（GET /api/sentences）。
  const [mode, setMode] = useState<"words" | "sentences">("words");
  const [words, setWords] = useState<Word[]>([]);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [stars, setStars] = useState(0);
  const [finished, setFinished] = useState(false);

  const [recording, setRecording] = useState<RecordingResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [feedback, setFeedback] = useState<SpeechFeedback | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  // 当前模式下的练习项（单词/句子统一抽象为 {id,text,meaning}）。
  const items: PracticeItem[] = useMemo(
    () =>
      mode === "sentences"
        ? sentences.map((s) => ({ id: s.id, text: s.text, meaning: s.meaning }))
        : words.map((w) => ({ id: w.id, text: w.text, meaning: w.meaning })),
    [mode, words, sentences],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    // 并行加载单词与句库（句子模式复用，避免切换时再发请求）。
    Promise.allSettled([api.getAllWords(), api.getSentences()])
      .then(([wordsRes, sentencesRes]) => {
        if (!active) return;
        if (wordsRes.status === "fulfilled") setWords(wordsRes.value);
        if (sentencesRes.status === "fulfilled") setSentences(sentencesRes.value);
        // 仅单词加载失败才视为阻断性错误（句库失败可降级到单词模式）。
        if (wordsRes.status === "rejected") {
          const err = wordsRes.reason;
          setLoadError(
            err instanceof ApiError
              ? err.message || t("loadWordsError")
              : t("networkError"),
          );
          logger.error("Failed to load words for speech practice", err);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleListen = useCallback((item: PracticeItem) => {
    // 浏览器原生 TTS（Web Speech API）朗读；不支持时静默降级（AI-402 后续接入狐狸音色）。
    speakText(item.text, { lang: "en-US" });
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
    const current = items[currentIndex];
    if (!current) return;
    setEvaluating(true);
    setCardError(null);
    try {
      // AI-309：句子模式携带 sentenceId，单词模式携带 wordId（互斥）。
      const opts =
        mode === "sentences"
          ? { sentenceId: current.id }
          : { wordId: current.id };
      const fb = await api.evaluateSpeech(recording.blob, {
        ...opts,
        durationMs: recording.durationMs,
        userId: user?.id,
      });
      setFeedback(fb);
      if (fb.passed) setStars((s) => s + 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setCardError(err.message || t("evalError"));
      } else {
        setCardError(t("networkError"));
      }
      logger.error("evaluateSpeech failed", err);
    } finally {
      setEvaluating(false);
    }
  }, [recording, evaluating, items, currentIndex, mode, user, t]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= items.length) {
      setFinished(true);
      return;
    }
    setCurrentIndex((i) => i + 1);
    clearCardState();
  }, [currentIndex, items.length, clearCardState]);

  // AI-309：切换模式 → 重置会话到首张卡（清反馈/录音/完成态），避免跨模式状态错乱。
  const switchMode = useCallback(
    (next: "words" | "sentences") => {
      if (next === mode) return;
      setMode(next);
      setCurrentIndex(0);
      setFinished(false);
      clearCardState();
    },
    [mode, clearCardState],
  );

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
        <p className="text-kids-muted font-semibold">{t("gettingWordsReady")}</p>
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

  if (items.length === 0) {
    const isSentence = mode === "sentences";
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4"
        data-component="SpeechEmpty"
      >
        <Mascot expression="encouraging" size="large" />
        <h1 className="text-2xl">
          {isSentence ? t("emptySentences") : t("emptyWords")}
        </h1>
        <p className="text-kids-muted">
          {isSentence ? t("emptySentencesHint") : t("emptyWordsHint")}
        </p>
        {!isSentence && (
          <Button variant="success" asChild>
            <Link href="/course">
              <ArrowRight size={20} className="mr-2" />
              {t("browseCourses")}
            </Link>
          </Button>
        )}
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
        <h1 className="text-3xl">{t("amazingJob")}</h1>
        <div className="flex items-center gap-2 text-xl font-extrabold text-[var(--color-success)]">
          <Trophy size={32} className="text-kids-sun" />
          {t("earnedStars", { count: stars })}
        </div>
        {taskId && taskMarked && (
          <p
            className="text-sm font-semibold text-[var(--seed-primary)]"
            data-component="TaskDoneNote"
          >
            {t("dailyTaskComplete")}
          </p>
        )}
        <Button variant="secondary" asChild>
          <Link href="/">
            <ArrowRight size={20} className="mr-2" />
            {t("backToHome")}
          </Link>
        </Button>
      </div>
    );
  }

  const current = items[currentIndex];

  return (
    <div className="space-y-6" data-component="SpeechPage">
      {/* Header: title + star counter */}
      <div className="flex items-center justify-between gap-3">
        <h1
          className="text-2xl font-extrabold text-kids-title"
          data-component="SpeechTitle"
        >
          {t("title")}
        </h1>
        <div
          className="flex items-center gap-2 text-kids-title font-extrabold"
          data-component="StarCounter"
        >
          <Star size={22} className="text-kids-sun fill-kids-sun" />
          <span data-component="StarCount">{stars}</span>
        </div>
      </div>

      {/* AI-309：单词 / 句子模式切换 */}
      <div
        className="flex items-center gap-2 p-1 rounded-control bg-[var(--color-primary-wash)]/60 w-fit mx-auto"
        data-component="ModeToggle"
        role="tablist"
        aria-label={t("practiceModeLabel")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "words"}
          onClick={() => switchMode("words")}
          data-action="mode-words"
          className={`px-4 py-1.5 rounded-control text-sm font-bold transition-colors ${
            mode === "words"
              ? "bg-white text-[var(--seed-primary)] shadow-sm"
              : "text-kids-muted"
          }`}
        >
          {t("modeWords")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sentences"}
          onClick={() => switchMode("sentences")}
          data-action="mode-sentences"
          className={`px-4 py-1.5 rounded-control text-sm font-bold transition-colors ${
            mode === "sentences"
              ? "bg-white text-[var(--seed-primary)] shadow-sm"
              : "text-kids-muted"
          }`}
        >
          {t("modeSentences")}
        </button>
      </div>

      {current && (
        <SpeechCard
          item={current}
          mode={mode}
          index={currentIndex}
          total={items.length}
          recording={recording}
          evaluating={evaluating}
          feedback={feedback}
          cardError={cardError}
          onListen={() => handleListen(current)}
          onRecordingComplete={handleRecordingComplete}
          onReset={clearCardState}
          onSubmit={handleSubmit}
          onNext={handleNext}
        />
      )}
    </div>
  );
}

export default function SpeechPage() {
  const t = useTranslations("Speech");
  return (
    <AuthGate>
      <Suspense
        fallback={
          <div
            className="flex flex-col items-center justify-center py-16 gap-3"
            data-component="SpeechSuspense"
          >
            <Mascot expression="thinking" size="medium" />
            <p className="text-kids-muted font-semibold">{t("gettingReady")}</p>
          </div>
        }
      >
        <SpeechInner />
      </Suspense>
    </AuthGate>
  );
}
