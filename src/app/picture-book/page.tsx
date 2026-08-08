"use client";

import React, { useCallback, useEffect, useState } from "react";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { playTts } from "@/lib/audio";
import { logger } from "@/lib/logger";
import type { CourseSummary } from "@/lib/api";
import type { PictureBook, PictureBookPage } from "@/lib/types";
import { BookOpen, Volume2, X } from "lucide-react";

/** 绘本页主体（已登录态由 `AuthGate` 包裹）。 */
function PictureBookInner() {
  const { user } = useAuth();
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
        const msg = err instanceof api.ApiError ? err.message : "绘本生成失败，请稍后再试。";
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
      <section
        className="card-kids flex items-center gap-4 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
        data-component="PictureBookHeader"
      >
        <Mascot expression="happy" size="large" />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-kids-title">AI 绘本馆</h1>
          <p className="text-kids-muted">学完课程，小狐狸把单词编成故事书，还能读给你听～</p>
        </div>
      </section>

      {error && (
        <section className="card-kids flex items-center gap-3" data-component="PictureBookError">
          <Mascot expression="encouraging" size="medium" />
          <p className="text-kids-muted">{error}</p>
        </section>
      )}

      {/* 示例绘本（免课程种子，随时可读） */}
      <section className="card-kids space-y-3" data-component="SampleBookCard">
        <h2 className="font-bold text-kids-title">先来读一本示例绘本</h2>
        <p className="text-sm text-kids-muted">不需要选课程，马上体验小狐狸的故事书。</p>
        <button
          data-component="ViewSampleBookBtn"
          onClick={() => void handleSample()}
          disabled={loading}
          className="rounded-control bg-[var(--seed-primary)] px-5 py-3 font-bold text-white shadow-button transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "生成中…" : "读示例绘本"}
        </button>
      </section>

      {/* 课程选择器 */}
      <section className="space-y-3" data-component="CoursePicker">
        <h2 className="font-bold text-kids-title">选一门课程，生成专属绘本</h2>
        {courses.length === 0 ? (
          <p className="text-sm text-kids-muted" data-component="CourseEmpty">
            还没有可用课程，先去「Courses」完成一门吧～
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3" data-component="CourseList">
            {courses.map((c) => (
              <li
                key={c.id}
                data-component="CourseItem"
                data-course-id={c.id}
                className="card-kids space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold text-kids-title">{c.title}</span>
                  <span className="rounded-full bg-kids-secondary px-2 py-0.5 text-xs font-bold text-kids-text">
                    {c.wordCount} 词
                  </span>
                </div>
                <p className="text-sm text-kids-muted">{c.description}</p>
                <button
                  data-component="GenerateCourseBookBtn"
                  onClick={() => void openBook(c.id, c.title)}
                  disabled={loading}
                  className="rounded-control bg-[var(--seed-primary)] px-4 py-2 text-sm font-bold text-white shadow-button transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  生成绘本
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
                aria-label="关闭绘本"
                data-component="PictureBookClose"
                onClick={() => setShowModal(false)}
                className="rounded-full bg-kids-secondary p-2 text-kids-text"
              >
                <X size={18} />
              </button>
            </div>

            {book.isDefault && (
              <p className="mb-3 text-sm text-kids-muted" data-component="PictureBookDegradedHint">
                当前为内置示例绘本（AI 降级兜底），仍可正常阅读。
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
                      🖼 配图提示：{page.illustrationPrompt}
                    </p>
                    <button
                      aria-label={`朗读第 ${page.pageNumber} 页`}
                      data-component="PictureBookPageAudio"
                      data-action="play-tts"
                      onClick={() => void handleReadAloud(page)}
                      disabled={speakingPage === page.pageNumber}
                      className="flex items-center gap-1 rounded-control bg-[var(--seed-primary)] px-3 py-2 text-sm font-bold text-white shadow-button transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      <Volume2 size={16} /> 朗读
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
