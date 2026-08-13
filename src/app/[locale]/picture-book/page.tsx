"use client";

import React, { useCallback, useEffect, useState } from "react";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { playTts } from "@/lib/audio";
import { logger } from "@/lib/logger";
import type { CourseSummary } from "@/lib/api";
import type { PictureBook, PictureBookPage } from "@/lib/types";
import { BookOpen, Volume2, X } from "lucide-react";
import { useTranslations } from "next-intl";

/** 绘本页主体（已登录态由 `AuthGate` 包裹）。 */
function PictureBookInner() {
  const { user } = useAuth();
  const t = useTranslations("PictureBook");
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [book, setBook] = useState<PictureBook | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakingPage, setSpeakingPage] = useState<number | null>(null);

  // 加载课程列表（全局课程，新用户也能看到）。
  useEffect(() => {
    void (async () => {
      try {
        setCourses(await api.getCourses());
      } catch (err) {
        logger.error("Failed to load courses", err);
      }
    })();
  }, []);

  const openBook = useCallback(
    async (courseId?: string, courseTitle?: string) => {
      setLoading(true);
      setError(null);
      try {
        const b = await api.getPictureBook(user?.id ?? "", courseId);
        setBook(b);
        setShowModal(true);
        void courseTitle; // 预留：未来在弹层展示课程名
      } catch (err) {
        const msg = err instanceof api.ApiError ? err.message : t('genError');
        logger.error("Failed to load picture book", err);
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleSample = useCallback(() => {
    void openBook(undefined);
  }, [openBook]);

  const handleReadAloud = useCallback(async (page: PictureBookPage) => {
    setSpeakingPage(page.pageNumber);
    try {
      const { ttsUrl } = await api.requestPictureBookTts(page.text);
      playTts(ttsUrl);
    } catch (err) {
      logger.error("Failed to synthesize TTS", err);
    } finally {
      setSpeakingPage(null);
    }
  }, []);

  return (
    <div className="space-y-6" data-component="PictureBookSection">
      {/* Header */}
      <Card
        className="flex items-center gap-4 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
        data-component="PictureBookHeader"
      >
        <Mascot expression="happy" size="large" />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-kids-title">{t('title')}</h1>
          <p className="text-kids-muted">{t('subtitle')}</p>
        </div>
      </Card>

      {error && (
        <Card className="flex items-center gap-3" data-component="PictureBookError">
          <Mascot expression="encouraging" size="medium" />
          <p className="text-kids-muted">{error}</p>
        </Card>
      )}

      {/* 示例绘本（免课程种子，随时可读） */}
      <Card className="space-y-3" data-component="SampleBookCard">
        <h2 className="font-bold text-kids-title">{t('sampleTitle')}</h2>
        <p className="text-sm text-kids-muted">{t('sampleDesc')}</p>
        <button
          data-component="ViewSampleBookBtn"
          onClick={() => void handleSample()}
          disabled={loading}
          className="rounded-control bg-[var(--seed-primary)] px-5 py-3 font-bold text-white shadow-button transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {loading ? t('generating') : t('readSample')}
        </button>
      </Card>

      {/* 课程选择器 */}
      <section className="space-y-3" data-component="CoursePicker">
        <h2 className="font-bold text-kids-title">{t('courseTitle')}</h2>
        {courses.length === 0 ? (
          <p className="text-sm text-kids-muted" data-component="CourseEmpty">
            {t('courseEmpty')}
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3" data-component="CourseList">
            {courses.map((c) => (
              <li
                key={c.id}
                data-component="CourseItem"
                data-course-id={c.id}
                className="rounded-panel bg-kids-card shadow-card p-6 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold text-kids-title">{c.title}</span>
                  <Badge variant="neutral" size="sm">
                    {c.wordCount} {t('words')}
                  </Badge>
                </div>
                <p className="text-sm text-kids-muted">{c.description}</p>
                <button
                  data-component="GenerateCourseBookBtn"
                  onClick={() => void openBook(c.id, c.title)}
                  disabled={loading}
                  className="rounded-control bg-[var(--seed-primary)] px-4 py-2 text-sm font-bold text-white shadow-button transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  t('generate')
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 阅读器弹层 */}
      {showModal && book && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          data-component="PictureBookModal"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-[28px] bg-kids-card p-6 shadow-[0_10px_40px_rgba(107,92,67,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                className="text-xl font-extrabold text-kids-title"
                data-component="PictureBookTitle"
              >
                {book.title}
              </h2>
              <button
                aria-label={t('close')}
                data-component="PictureBookClose"
                onClick={() => setShowModal(false)}
                className="rounded-full bg-kids-secondary p-2 text-kids-text"
              >
                <X size={18} />
              </button>
            </div>

            {book.isDefault && (
              <p className="mb-3 text-sm text-kids-muted" data-component="PictureBookDegradedHint">
                {t('degradedHint')}
              </p>
            )}

            <div className="space-y-4" data-component="PictureBookPages">
              {book.pages.map((page) => (
                <div
                  key={page.pageNumber}
                  data-component="PictureBookPage"
                  data-page-number={page.pageNumber}
                  className="rounded-control bg-kids-secondary/60 p-4"
                >
                  <p className="text-kids-text" data-component="PictureBookPageText">
                    {page.text}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-kids-muted" data-component="PictureBookPagePrompt">
                      🖼 {t('illustrationPrompt')}：{page.illustrationPrompt}
                    </p>
                    <button
                      aria-label={`朗读第 ${page.pageNumber} 页`}
                      data-component="PictureBookPageAudio"
                      data-action="play-tts"
                      onClick={() => void handleReadAloud(page)}
                      disabled={speakingPage === page.pageNumber}
                      className="flex items-center gap-1 rounded-control bg-[var(--seed-primary)] px-3 py-2 text-sm font-bold text-white shadow-button transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      <Volume2 size={16} /> {t('readAloud')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PictureBookPage() {
  return (
    <AuthGate>
      <PictureBookInner />
    </AuthGate>
  );
}
