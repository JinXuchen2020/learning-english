"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import * as api from "@/lib/api";
import { logger } from "@/lib/logger";
import type { Word, QuizPhase, WordDifficultyInfo } from "@/lib/types";
import { buildDifficultyMap, sortWordsByReviewPriority } from "@/lib/wordDifficulty";
import { buildQuizItems, type QuizMode, type QuizItem } from "@/lib/quizVariants";
import { Volume2, Star, ArrowLeft, RotateCcw } from "lucide-react";

/** 颜色名 → 十六进制（组词模式颜色块）。未知颜色回落到主题绿。 */
const COLOR_HEX: Record<string, string> = {
  orange: "#F5A25D", brown: "#9A835A", blue: "#889DF0", white: "#F0E8D8",
  green: "#6FBA2C", yellow: "#F7CD67", red: "#F8A6B2", pink: "#F8A6B2",
  purple: "#B39DDB", black: "#4A3520", gray: "#9CA3AF",
};

function colorHex(name?: string | null): string {
  if (name && COLOR_HEX[name]) return COLOR_HEX[name];
  return "#82D5BB";
}

/** 用浏览器 TTS 朗读单词（听音选图模式音频优先；无 API 时静默降级）。 */
function speakWord(text: string) {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}

const MODE_LABELS: Record<QuizMode, string> = {
  multiple: "modeMultiple",
  listen: "modeListen",
  combination: "modeCombination",
};

const answerColors = [
  "bg-kids-teal hover:bg-kids-teal/80",
  "bg-kids-pink hover:bg-kids-pink/80",
  "bg-kids-blue hover:bg-kids-blue/80",
  "bg-kids-sun/80 hover:bg-kids-sun",
];

const answerTextColors = [
  "text-white",
  "text-white",
  "text-white",
  "text-kids-text",
];

/* Distinct animal SVG illustrations for vocabulary learning */
function WordIllustration({ word }: { word: string }) {
  const illustrations: Record<string, React.ReactNode> = {
    Cat: (
      <svg width="120" height="110" viewBox="0 0 120 110" fill="none" role="img" aria-label="A cute cat">
        <ellipse cx="60" cy="95" rx="30" ry="12" fill="#82D5BB" opacity="0.3" />
        <ellipse cx="60" cy="70" rx="24" ry="22" fill="#F5A25D" />
        <circle cx="60" cy="42" r="20" fill="#F5A25D" />
        <path d="M44 30 L40 12 L54 26 Z" fill="#F5A25D" />
        <path d="M76 30 L80 12 L66 26 Z" fill="#F5A25D" />
        <path d="M46 28 L43 16 L53 25 Z" fill="#FDF0E0" />
        <path d="M74 28 L77 16 L67 25 Z" fill="#FDF0E0" />
        <circle cx="52" cy="40" r="3.5" fill="#4A3520" />
        <circle cx="68" cy="40" r="3.5" fill="#4A3520" />
        <ellipse cx="60" cy="47" rx="3" ry="2" fill="#F8A6B2" />
        <path d="M55 51 Q60 55 65 51" stroke="#4A3520" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M38 44 L26 42" stroke="#4A3520" strokeWidth="1" strokeLinecap="round" />
        <path d="M38 47 L27 48" stroke="#4A3520" strokeWidth="1" strokeLinecap="round" />
        <path d="M82 44 L94 42" stroke="#4A3520" strokeWidth="1" strokeLinecap="round" />
        <path d="M82 47 L93 48" stroke="#4A3520" strokeWidth="1" strokeLinecap="round" />
        <path d="M84 72 Q96 68 94 58" stroke="#F5A25D" strokeWidth="6" fill="none" strokeLinecap="round" />
      </svg>
    ),
    Dog: (
      <svg width="120" height="110" viewBox="0 0 120 110" fill="none" role="img" aria-label="A happy dog">
        <ellipse cx="60" cy="95" rx="30" ry="12" fill="#82D5BB" opacity="0.3" />
        <ellipse cx="60" cy="72" rx="25" ry="20" fill="#D4A054" />
        <circle cx="60" cy="42" r="20" fill="#D4A054" />
        <path d="M42 34 Q34 28 36 42 Q38 50 44 46" fill="#B8863C" />
        <path d="M78 34 Q86 28 84 42 Q82 50 76 46" fill="#B8863C" />
        <circle cx="52" cy="40" r="3.5" fill="#4A3520" />
        <circle cx="68" cy="40" r="3.5" fill="#4A3520" />
        <ellipse cx="60" cy="48" rx="5" ry="4" fill="#4A3520" />
        <path d="M55 54 Q60 58 65 54" stroke="#4A3520" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <ellipse cx="60" cy="58" rx="4" ry="5" fill="#F8A6B2" />
        <path d="M84 74 Q96 70 98 60 Q99 55 95 58" stroke="#D4A054" strokeWidth="6" fill="none" strokeLinecap="round" />
      </svg>
    ),
    Fish: (
      <svg width="130" height="100" viewBox="0 0 130 100" fill="none" role="img" aria-label="A colorful fish">
        <ellipse cx="65" cy="85" rx="40" ry="8" fill="#82D5BB" opacity="0.3" />
        <ellipse cx="60" cy="50" rx="32" ry="20" fill="#889DF0" />
        <path d="M92 50 L112 35 L112 65 Z" fill="#6B7FD4" />
        <path d="M55 30 Q60 22 65 30" fill="#6B7FD4" />
        <circle cx="45" cy="46" r="4" fill="#FFFFFF" />
        <circle cx="45" cy="46" r="2.5" fill="#4A3520" />
        <path d="M38 55 Q42 58 46 55" stroke="#4A3520" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M55 42 Q65 38 75 42" stroke="#FFFFFF" strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round" />
        <path d="M55 50 Q65 46 75 50" stroke="#FFFFFF" strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round" />
        <path d="M55 58 Q65 54 75 58" stroke="#FFFFFF" strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round" />
      </svg>
    ),
    Bird: (
      <svg width="110" height="110" viewBox="0 0 110 110" fill="none" role="img" aria-label="A little bird">
        <ellipse cx="55" cy="95" rx="20" ry="8" fill="#82D5BB" opacity="0.3" />
        <ellipse cx="55" cy="62" rx="18" ry="20" fill="#889DF0" />
        <circle cx="55" cy="38" r="14" fill="#889DF0" />
        <circle cx="49" cy="35" r="3" fill="#4A3520" />
        <circle cx="61" cy="35" r="3" fill="#4A3520" />
        <path d="M53 42 L55 46 L57 42 Z" fill="#F5C31C" />
        <path d="M37 58 Q22 50 28 62 Q32 68 40 64" fill="#6B7FD4" />
        <path d="M73 58 Q88 50 82 62 Q78 68 70 64" fill="#6B7FD4" />
        <path d="M50 80 L50 92" stroke="#F5C31C" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M60 80 L60 92" stroke="#F5C31C" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M46 92 L50 92 L54 92" stroke="#F5C31C" strokeWidth="2" strokeLinecap="round" />
        <path d="M56 92 L60 92 L64 92" stroke="#F5C31C" strokeWidth="2" strokeLinecap="round" />
        <path d="M52 24 Q55 18 58 24" stroke="#6B7FD4" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    ),
    Rabbit: (
      <svg width="100" height="120" viewBox="0 0 100 120" fill="none" role="img" aria-label="A cute rabbit">
        <ellipse cx="50" cy="105" rx="22" ry="10" fill="#82D5BB" opacity="0.3" />
        <ellipse cx="50" cy="78" rx="20" ry="22" fill="#F0E8D8" />
        <circle cx="50" cy="50" r="16" fill="#F0E8D8" />
        <ellipse cx="42" cy="22" rx="6" ry="20" fill="#F0E8D8" />
        <ellipse cx="58" cy="22" rx="6" ry="20" fill="#F0E8D8" />
        <ellipse cx="42" cy="22" rx="3.5" ry="14" fill="#F8A6B2" />
        <ellipse cx="58" cy="22" rx="3.5" ry="14" fill="#F8A6B2" />
        <circle cx="44" cy="48" r="3" fill="#4A3520" />
        <circle cx="56" cy="48" r="3" fill="#4A3520" />
        <ellipse cx="50" cy="54" rx="2.5" ry="2" fill="#F8A6B2" />
        <path d="M46 58 Q50 61 54 58" stroke="#4A3520" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <circle cx="50" cy="98" r="7" fill="#FFFFFF" />
      </svg>
    ),
    Frog: (
      <svg width="120" height="100" viewBox="0 0 120 100" fill="none" role="img" aria-label="A green frog">
        <ellipse cx="60" cy="88" rx="35" ry="10" fill="#82D5BB" opacity="0.3" />
        <ellipse cx="60" cy="65" rx="30" ry="22" fill="#6FBA2C" />
        <circle cx="45" cy="38" r="12" fill="#6FBA2C" />
        <circle cx="75" cy="38" r="12" fill="#6FBA2C" />
        <circle cx="45" cy="35" r="7" fill="#FFFFFF" />
        <circle cx="75" cy="35" r="7" fill="#FFFFFF" />
        <circle cx="45" cy="35" r="4" fill="#4A3520" />
        <circle cx="75" cy="35" r="4" fill="#4A3520" />
        <path d="M45 72 Q60 80 75 72" stroke="#4A3520" strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="60" cy="70" rx="18" ry="10" fill="#8AC68A" />
        <path d="M30 80 Q22 88 28 90" stroke="#6FBA2C" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M90 80 Q98 88 92 90" stroke="#6FBA2C" strokeWidth="5" fill="none" strokeLinecap="round" />
      </svg>
    ),
    Horse: (
      <svg width="110" height="120" viewBox="0 0 110 120" fill="none" role="img" aria-label="A brown horse">
        <ellipse cx="55" cy="108" rx="28" ry="9" fill="#82D5BB" opacity="0.3" />
        <ellipse cx="55" cy="75" rx="22" ry="28" fill="#9A835A" />
        <ellipse cx="55" cy="35" rx="14" ry="18" fill="#9A835A" />
        <path d="M48 18 Q45 8 50 12 Q52 14 50 18" fill="#725D42" />
        <path d="M55 16 Q55 6 58 10 Q60 13 57 17" fill="#725D42" />
        <path d="M62 18 Q64 8 66 13 Q67 16 63 19" fill="#725D42" />
        <circle cx="49" cy="32" r="3" fill="#4A3520" />
        <circle cx="61" cy="32" r="3" fill="#4A3520" />
        <ellipse cx="55" cy="44" rx="6" ry="4" fill="#725D42" />
        <circle cx="52" cy="44" r="1.5" fill="#4A3520" />
        <circle cx="58" cy="44" r="1.5" fill="#4A3520" />
        <path d="M44 20 Q40 30 42 40" stroke="#725D42" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M66 20 Q70 30 68 40" stroke="#725D42" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    ),
    Duck: (
      <svg width="110" height="110" viewBox="0 0 110 110" fill="none" role="img" aria-label="A yellow duck">
        <ellipse cx="55" cy="95" rx="28" ry="10" fill="#82D5BB" opacity="0.3" />
        <ellipse cx="55" cy="68" rx="24" ry="22" fill="#F7CD67" />
        <circle cx="55" cy="38" r="16" fill="#F7CD67" />
        <circle cx="49" cy="34" r="3" fill="#4A3520" />
        <circle cx="61" cy="34" r="3" fill="#4A3520" />
        <path d="M52 42 L44 44 L52 46 Z" fill="#E59266" />
        <path d="M75 62 Q88 58 85 68 Q83 74 76 70" fill="#F7CD67" />
        <path d="M48 88 L48 98" stroke="#E59266" strokeWidth="3" strokeLinecap="round" />
        <path d="M62 88 L62 98" stroke="#E59266" strokeWidth="3" strokeLinecap="round" />
        <path d="M44 98 L48 98 L52 98" stroke="#E59266" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M58 98 L62 98 L66 98" stroke="#E59266" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M50 22 Q55 18 60 22" stroke="#F5C31C" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    ),
    Bear: (
      <svg width="120" height="110" viewBox="0 0 120 110" fill="none" role="img" aria-label="A friendly bear">
        <ellipse cx="60" cy="98" rx="30" ry="10" fill="#82D5BB" opacity="0.3" />
        <ellipse cx="60" cy="70" rx="26" ry="24" fill="#9A835A" />
        <circle cx="60" cy="40" r="22" fill="#9A835A" />
        <circle cx="42" cy="24" r="9" fill="#9A835A" />
        <circle cx="78" cy="24" r="9" fill="#9A835A" />
        <circle cx="42" cy="24" r="5" fill="#C4A882" />
        <circle cx="78" cy="24" r="5" fill="#C4A882" />
        <circle cx="52" cy="38" r="3.5" fill="#4A3520" />
        <circle cx="68" cy="38" r="3.5" fill="#4A3520" />
        <ellipse cx="60" cy="48" rx="8" ry="6" fill="#C4A882" />
        <ellipse cx="60" cy="46" rx="4" ry="3" fill="#4A3520" />
        <path d="M55 52 Q60 56 65 52" stroke="#4A3520" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <ellipse cx="60" cy="76" rx="14" ry="12" fill="#C4A882" />
      </svg>
    ),
    Turtle: (
      <svg width="130" height="100" viewBox="0 0 130 100" fill="none" role="img" aria-label="A small turtle">
        <ellipse cx="65" cy="88" rx="38" ry="9" fill="#82D5BB" opacity="0.3" />
        <ellipse cx="65" cy="60" rx="32" ry="24" fill="#6FBA2C" />
        <path d="M45 48 L55 60 L45 72" stroke="#5A9E1E" strokeWidth="2" fill="none" />
        <path d="M65 42 L65 78" stroke="#5A9E1E" strokeWidth="2" fill="none" />
        <path d="M85 48 L75 60 L85 72" stroke="#5A9E1E" strokeWidth="2" fill="none" />
        <path d="M48 60 L82 60" stroke="#5A9E1E" strokeWidth="2" fill="none" />
        <circle cx="30" cy="58" r="10" fill="#8AC68A" />
        <circle cx="27" cy="55" r="2.5" fill="#4A3520" />
        <path d="M24 62 Q27 64 30 62" stroke="#4A3520" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M42 78 L38 88" stroke="#8AC68A" strokeWidth="5" strokeLinecap="round" />
        <path d="M88 78 L92 88" stroke="#8AC68A" strokeWidth="5" strokeLinecap="round" />
        <path d="M50 80 L48 90" stroke="#8AC68A" strokeWidth="5" strokeLinecap="round" />
        <path d="M80 80 L82 90" stroke="#8AC68A" strokeWidth="5" strokeLinecap="round" />
        <path d="M95 62 L104 60" stroke="#8AC68A" strokeWidth="4" strokeLinecap="round" />
      </svg>
    ),
  };

  return (
    <>
      {illustrations[word] || (
        <svg width="100" height="100" viewBox="0 0 100 100" fill="none" role="img" aria-label={word}>
          <circle cx="50" cy="50" r="30" fill="#82D5BB" opacity="0.5" />
          <text x="50" y="55" textAnchor="middle" fontSize="24" fill="#725D42">?</text>
        </svg>
      )}
    </>
  );
}

function Quiz({
  words,
  lessonId,
  courseId,
  focusWord,
  difficultyMap,
  initialMode = "multiple",
}: {
  words: Word[];
  lessonId: string | null;
  courseId: string | null;
  /** AI-507：家长报告弱项下钻 —— 命中后跳到该词（不区分大小写）。 */
  focusWord?: string | null;
  /** AI-602：单词自适应难度画像（自由练习时传入）。 */
  difficultyMap?: Map<string, WordDifficultyInfo>;
  /** AI-703：初始练习模式（可由 ?mode= 查询参数预设）。 */
  initialMode?: QuizMode;
}) {
  const [mode, setMode] = useState<QuizMode>(initialMode);
  const t = useTranslations("Practice");
  // AI-703：按模式统一生成题项（看字选词/听音选图/颜色组词）。
  const items = useMemo<QuizItem[]>(
    () => buildQuizItems(words, mode),
    [words, mode],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<QuizPhase>("answering");
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [showPhonics, setShowPhonics] = useState(false);

  // 模式切换 → 重置题项进度。
  useEffect(() => {
    setCurrentIndex(0);
    setPhase("answering");
    setSelectedAnswer(null);
    setShowPhonics(false);
  }, [mode]);

  // AI-507：弱项下钻 —— 题项装载完成后跳转到命中词（仅一次）。
  useEffect(() => {
    if (!focusWord || items.length === 0) return;
    const idx = items.findIndex(
      (it) => it.word.text.toLowerCase() === focusWord.toLowerCase(),
    );
    if (idx >= 0) setCurrentIndex(idx);
  }, [focusWord, items]);

  // 模式切换可能导致当前题项集变化，钳制越界索引。
  const safeIndex = Math.min(currentIndex, Math.max(items.length - 1, 0));
  const item = items[safeIndex];
  const totalWords = items.length;
  const progress = totalWords > 0 ? Math.round(((safeIndex + 1) / totalWords) * 100) : 0;

  const handleAnswer = useCallback(
    (index: number) => {
      if (phase !== "answering" || !item) return;
      setSelectedAnswer(index);

      const isCorrect = index === item.correctIndex;
      if (isCorrect) {
        setPhase("correct");
        setCorrectCount((c) => c + 1);
      } else {
        setPhase("incorrect");
      }

      // Persist the attempt to the backend (fire-and-forget).
      api.recordWordAttempt(item.word.id, isCorrect).catch((err) =>
        logger.error("Failed to record word attempt", err)
      );
    },
    [phase, item]
  );

  const handleNext = useCallback(() => {
    if (safeIndex + 1 >= totalWords) {
      setPhase("complete");
      // Mark the lesson complete so progress and stars update.
      if (lessonId) {
        api.completeLesson(lessonId).catch((err) =>
          logger.error("Failed to complete lesson", err)
        );
      }
    } else {
      setCurrentIndex((i) => i + 1);
      setPhase("answering");
      setSelectedAnswer(null);
      setShowPhonics(false);
    }
  }, [safeIndex, totalWords, lessonId]);

  const handleRestart = useCallback(() => {
    setCurrentIndex(0);
    setPhase("answering");
    setSelectedAnswer(null);
    setCorrectCount(0);
    setShowPhonics(false);
  }, []);

  const backHref = courseId ? `/course?id=${courseId}` : "/course";

  // Celebration screen
  if (phase === "complete") {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-6"
        data-component="QuizComplete"
      >
        <Mascot expression="celebrating" size="large" />
        <h1 className="text-3xl">Amazing Job!</h1>
        <p className="text-xl text-kids-text">
          You got{" "}
          <span className="font-extrabold text-[var(--color-success)]">
            {correctCount}
          </span>{" "}
          out of {totalWords} words correct!
        </p>
        <div className="flex gap-2">
          {Array.from({ length: Math.min(correctCount, 5) }).map((_, i) => (
            <Star
              key={i}
              size={36}
              className="text-kids-sun fill-kids-sun animate-star-pop"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
        <div className="flex gap-4 pt-4">
          <Button onClick={handleRestart} variant="default">
            <RotateCcw size={20} className="mr-2" />
            Practice Again
          </Button>
          <Button variant="secondary" asChild>
            <Link href={backHref}>
              <ArrowLeft size={20} className="mr-2" />
              Back to Course
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // 该模式下无可用题项（如组词/听音在词数据不足时）。
  if (!item) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4"
        data-component="PracticeEmpty"
      >
        <Mascot expression="encouraging" size="large" />
        <h1 className="text-2xl">{t("emptyModeTitle")}</h1>
        <p className="text-kids-muted">
          {t("emptyModeHint")}
        </p>
      </div>
    );
  }

  const isImage = item.optionKind === "image";

  return (
    <div className="max-w-2xl mx-auto space-y-6" data-component="WordPractice">
      {/* AI-703：模式切换器 */}
      <div
        className="flex justify-center gap-2 flex-wrap"
        data-component="ModeSwitcher"
        role="tablist"
      >
        {(["multiple", "listen", "combination"] as QuizMode[]).map((m) => (
          <button
            key={m}
            data-action={`mode-${m}`}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`btn-kids !rounded-full text-base font-bold !px-5 ${
              mode === m
                ? "bg-[var(--seed-primary)] text-white"
                : "bg-kids-secondary text-kids-title"
            }`}
          >
            {t(MODE_LABELS[m])}
          </button>
        ))}
      </div>

      {/* Progress Bar */}
      <div data-component="QuizProgress">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-bold text-kids-muted">
            {t("quizWordProgress", { index: safeIndex + 1, total: totalWords })}
          </span>
          <span className="text-sm font-bold text-[var(--color-success)]">
            {t("correctCount", { count: correctCount })}
          </span>
        </div>
        <Progress value={progress} className="h-4" />
      </div>

      {/* Word Card */}
      <Card className="text-center space-y-4" data-component="WordCard">
        {/* 看字选词：动物插图 + 单词 + 含义 + 音标切换 */}
        {mode === "multiple" && (
          <>
            <div className="w-full h-40 rounded-card bg-gradient-to-b from-[var(--color-primary-wash)] to-kids-secondary flex items-center justify-center overflow-hidden">
              <WordIllustration word={item.word.text} />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl tracking-tight" data-component="QuizWordText">{item.word.text}</h1>
              <p className="text-kids-muted">{item.word.meaning}</p>
              {difficultyMap && difficultyMap.get(item.word.id) && (
                <span
                  data-component="DifficultyBadge"
                  data-difficulty={difficultyMap.get(item.word.id)!.difficulty}
                  className="inline-block text-xs font-bold px-2 py-0.5 rounded-full bg-kids-secondary text-kids-title"
                >
                  {difficultyMap.get(item.word.id)!.difficulty}
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowPhonics(!showPhonics)}
                className="btn-kids bg-[var(--seed-primary)]/15 text-[var(--seed-primary)] !px-5"
                aria-label={t("pronunciationHintLabel")}
              >
                <Volume2 size={22} className="mr-2" />
                {showPhonics ? item.word.phonics : t("listenBtn")}
              </button>
            </div>
          </>
        )}

        {/* 颜色组词：颜色块 + 类别短语 */}
        {mode === "combination" && (
          <div className="space-y-3" data-component="ComboPrompt">
            <div className="flex items-center justify-center gap-4">
              <span
                className="inline-block w-16 h-16 rounded-full border-4 border-white shadow-md"
                style={{ background: colorHex(item.color) }}
                aria-label={`color ${item.color}`}
              />
              <h1 className="text-3xl tracking-tight" data-component="QuizWordText">{item.promptText}</h1>
            </div>
            <p className="text-kids-muted">{t("findMatch")}</p>
          </div>
        )}

        {/* 听音选图：音频优先，隐藏文字 */}
        {mode === "listen" && (
          <div className="space-y-3" data-component="ListenPrompt">
            <div className="w-full h-40 rounded-card bg-gradient-to-b from-[var(--color-primary-wash)] to-kids-secondary flex items-center justify-center">
              <Volume2 size={64} className="text-[var(--seed-primary)]" />
            </div>
            <button
              data-component="ListenButton"
              onClick={() => speakWord(item.word.text)}
              className="btn-kids bg-[var(--seed-primary)] text-white !px-6 text-lg"
            >
              <Volume2 size={22} className="mr-2" />
              🔊 {t("listenBtn")}
            </button>
            <p className="text-kids-muted">{t("tapToHear")}</p>
          </div>
        )}
      </Card>

      {/* Answer Grid */}
      <section data-component="AnswerGrid">
        <p className="text-center font-bold text-kids-title mb-4">
          {mode === "combination" ? t("whichPicture") : t("whichCorrect")}
        </p>
        <div className="grid grid-cols-2 gap-4">
          {item.options.map((opt, index) => {
            let stateClass = "";
            if (phase === "correct" && index === item.correctIndex) {
              stateClass = "ring-4 ring-[var(--color-success)] animate-pulse-green scale-105";
            } else if (phase === "incorrect" && index === selectedAnswer) {
              stateClass = "ring-4 ring-[var(--color-danger)] animate-shake opacity-70";
            } else if (phase === "incorrect" && index === item.correctIndex) {
              stateClass = "ring-4 ring-[var(--color-success)]";
            }

            return (
              <button
                key={`${item.word.id}-${mode}-${index}`}
                data-answer-correct={index === item.correctIndex}
                onClick={() => handleAnswer(index)}
                disabled={phase !== "answering"}
                className={`btn-kids !rounded-card text-xl font-extrabold touch-target-lg transition-all duration-200 ${isImage ? "p-2" : ""} ${answerColors[index]} ${answerTextColors[index]} ${stateClass}`}
                style={{ boxShadow: "0 5px 0 0 rgba(0,0,0,0.15)" }}
              >
                {isImage ? <WordIllustration word={opt.word!.text} /> : opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Feedback + Next */}
      {(phase === "correct" || phase === "incorrect") && (
        <Card
          className="flex items-center gap-4"
          data-component="QuizFeedback"
        >
          <Mascot
            expression={phase === "correct" ? "celebrating" : "encouraging"}
            size="small"
          />
          <div className="flex-1">
            <p className="font-bold text-kids-title">
              {phase === "correct" ? "Wonderful! You got it!" : "Almost! Try to remember this one."}
            </p>
            <p className="text-sm text-kids-muted">
              {phase === "correct"
                ? `${item.word.text} — ${item.word.phonics}`
                : t("answerReveal", {
                    answer:
                      item.options[item.correctIndex].word?.text ??
                      item.options[item.correctIndex].label,
                    phonics: item.word.phonics,
                  })}
            </p>
          </div>
          <Button onClick={handleNext} variant="default" className="shrink-0" data-action="quiz-next">
            {safeIndex + 1 >= totalWords ? t("finish") : t("nextWord")}
          </Button>
        </Card>
      )}
    </div>
  );
}

function PracticeInner() {
  const t = useTranslations("Practice");
  const searchParams = useSearchParams();
  const lessonId = searchParams.get("lessonId");
  const courseId = searchParams.get("courseId");
  const focusWord = searchParams.get("focusWord");
  // AI-703：?mode=listen|combination 预设初始模式（其余归入看字选词）。
  const modeParam = searchParams.get("mode");
  const initialMode: QuizMode =
    modeParam === "listen" || modeParam === "combination" ? modeParam : "multiple";

  const [words, setWords] = useState<Word[]>([]);
  const [difficultyMap, setDifficultyMap] = useState<Map<string, WordDifficultyInfo>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // 自由练习（无 lessonId）走自适应排序：并行拉全量词 + 用户难度画像。
    // 跟课练习（lessonId）保持课程原顺序，不做自适应重排。
    const wordFetcher = lessonId
      ? api.getLessonWords(lessonId)
      : api.getAllWords();

    const difficultyFetcher = lessonId
      ? Promise.resolve({ items: [] })
      : api.getWordDifficulties().catch(() => ({ items: [] as WordDifficultyInfo[] }));

    Promise.all([wordFetcher, difficultyFetcher])
      .then(([data, diff]) => {
        if (!active) return;
        const map = buildDifficultyMap(diff.items);
        const ordered = lessonId
          ? data
          : sortWordsByReviewPriority(data, map);
        setWords(ordered);
        setDifficultyMap(map);
      })
      .catch((err) => logger.error("Failed to load words", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [lessonId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Mascot expression="thinking" size="medium" />
        <p className="text-kids-muted font-semibold">{t("gettingWordsReady")}</p>
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4"
        data-component="PracticeEmpty"
      >
        <Mascot expression="encouraging" size="large" />
        <h1 className="text-2xl">{t("emptyWords")}</h1>
        <p className="text-kids-muted">
          {t("emptyWordsHint")}
        </p>
        <Button variant="success" asChild>
          <Link href="/course">
            <ArrowLeft size={20} className="mr-2" />
            {t("browseCourses")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <Quiz
      words={words}
      lessonId={lessonId}
      courseId={courseId}
      focusWord={focusWord}
      difficultyMap={difficultyMap}
      initialMode={initialMode}
    />
  );
}

export default function WordPracticePage() {
  return (
    <AuthGate>
      <PracticeInner />
    </AuthGate>
  );
}
