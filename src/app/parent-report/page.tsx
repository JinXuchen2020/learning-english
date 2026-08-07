"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import TrendChart from "@/components/TrendChart";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { mondayOfWeekUTC, addDaysUTC, weekEndOf, todayUtc } from "@/lib/weekly";
import { logger } from "@/lib/logger";
import type { WeeklyReportData } from "@/lib/types";
import { ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";

const METRIC_DEFS: { key: keyof WeeklyReportData["metrics"]; label: string; suffix?: string }[] = [
  { key: "activeDays", label: "活跃天数", suffix: " 天" },
  { key: "totalTasksCompleted", label: "完成任务" },
  { key: "totalWordsPracticed", label: "练习单词" },
  { key: "totalLessonsCompleted", label: "完成课程" },
  { key: "totalSpeechAttempts", label: "口语跟读", suffix: " 次" },
  { key: "avgSpeechScore", label: "平均口语分" },
];

function ParentReportInner() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState<string>(() => mondayOfWeekUTC(todayUtc()));
  const [data, setData] = useState<WeeklyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(false);
    try {
      const report = await api.getWeeklyReport(user.id, weekStart);
      setData(report);
    } catch (err) {
      logger.error("Failed to load weekly report", err);
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user, weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const goPrevWeek = useCallback(() => setWeekStart((ws) => addDaysUTC(ws, -7)), []);
  const goNextWeek = useCallback(() => setWeekStart((ws) => addDaysUTC(ws, 7)), []);

  const weekLabel = data
    ? `${data.weekStart} ~ ${data.weekEnd}`
    : `${weekStart} ~ ${weekEndOf(weekStart)}`;
  const childName = data?.childName || user?.nickname || "孩子";

  return (
    <div className="space-y-6" data-component="ParentReport">
      {/* Header */}
      <section
        className="card-kids flex items-center gap-4 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
        data-component="ReportHeader"
      >
        <Mascot expression="happy" size="large" />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-kids-title">家长报告</h1>
          <p className="text-kids-muted">
            {childName} 的每周学习周报
          </p>
        </div>
        {/* Week navigator */}
        <div
          className="flex items-center gap-2 bg-white rounded-control px-2 py-1"
          data-component="WeekNav"
        >
          <button
            data-component="WeekPrev"
            onClick={goPrevWeek}
            aria-label="上一周"
            className="p-1 rounded-full hover:bg-kids-secondary"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm font-bold text-kids-title whitespace-nowrap" data-component="WeekLabel">
            {weekLabel}
          </span>
          <button
            data-component="WeekNext"
            onClick={goNextWeek}
            aria-label="下一周"
            className="p-1 rounded-full hover:bg-kids-secondary"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </section>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Mascot expression="thinking" size="medium" />
          <p className="text-kids-muted font-semibold">小狐正在汇总本周学习数据…</p>
        </div>
      )}

      {error && !loading && (
        <section className="card-kids flex items-center gap-4" data-component="ReportError">
          <Mascot expression="encouraging" size="medium" />
          <p className="text-kids-muted">这周的报告暂时加载不出来，稍后再来看看吧～</p>
        </section>
      )}

      {!loading && !error && data && (
        <>
          {/* Metrics cards */}
          <section data-component="MetricsGrid" className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {METRIC_DEFS.map((m) => {
              const raw = data.metrics[m.key];
              const value = raw == null ? "—" : `${raw}${m.suffix ?? ""}`;
              return (
                <div
                  key={m.key}
                  className="card-kids text-center py-4"
                  data-component="MetricCard"
                  data-metric={m.key}
                >
                  <div className="text-2xl font-extrabold text-[var(--seed-primary)]">{value}</div>
                  <div className="text-sm text-kids-muted mt-1">{m.label}</div>
                </div>
              );
            })}
          </section>

          {/* Trend chart */}
          <section data-component="TrendSection" className="card-kids">
            <h2 className="font-bold text-kids-title mb-3 flex items-center gap-2">
              <BarChart3 size={18} className="text-[var(--seed-primary)]" />
              本周学习趋势
            </h2>
            <TrendChart points={data.masteryTrend} />
          </section>

          {/* Weak words Top10 */}
          <section data-component="WeakWordsSection" className="card-kids">
            <h2 className="font-bold text-kids-title mb-3">🌟 本周弱项 Top</h2>
            {data.weakWordsTop.length === 0 ? (
              <p className="text-kids-muted">本周暂无显著弱项，棒棒哒！</p>
            ) : (
              <ul className="flex flex-wrap gap-2" data-component="WeakWordsList">
                {data.weakWordsTop.map((w) => (
                  <li key={w} data-component="WeakWordItem" data-weak-word={w}>
                    <Link
                      href={`/practice?focusWord=${encodeURIComponent(w)}`}
                      className="inline-block rounded-control bg-kids-secondary px-3 py-1.5 text-sm font-semibold text-kids-text hover:bg-[var(--seed-primary)] hover:text-white transition-colors"
                      aria-label={`练习弱项单词 ${w}`}
                    >
                      {w}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* AI suggestions */}
          <section data-component="SuggestionsSection" className="card-kids">
            <h2 className="font-bold text-kids-title mb-3">💡 AI 建议</h2>
            {data.suggestions.length === 0 ? (
              <p className="text-kids-muted">本周暂无特别建议。</p>
            ) : (
              <ul className="space-y-2" data-component="SuggestionsList">
                {data.suggestions.map((s, i) => (
                  <li key={i} data-component="SuggestionItem" className="text-kids-text">
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function ParentReportPage() {
  return (
    <AuthGate>
      <ParentReportInner />
    </AuthGate>
  );
}
