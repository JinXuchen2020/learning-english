"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import TrendChart from "@/components/TrendChart";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { mondayOfWeekUTC, addDaysUTC, weekEndOf, todayUtc } from "@/lib/weekly";
import { logger } from "@/lib/logger";
import type { WeeklyReportData } from "@/lib/types";
import { ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";

const METRIC_DEFS: { key: keyof WeeklyReportData["metrics"]; labelKey: string; suffixKey?: string }[] = [
  { key: "activeDays", labelKey: "metricActiveDays", suffixKey: "metricDaysSuffix" },
  { key: "totalTasksCompleted", labelKey: "metricTasksCompleted" },
  { key: "totalWordsPracticed", labelKey: "metricWordsPracticed" },
  { key: "totalLessonsCompleted", labelKey: "metricLessonsCompleted" },
  { key: "totalSpeechAttempts", labelKey: "metricSpeechAttempts", suffixKey: "metricSpeechSuffix" },
  { key: "avgSpeechScore", labelKey: "metricAvgSpeechScore" },
];

function ParentReportInner() {
  const { user } = useAuth();
  const t = useTranslations("Report");
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
  const childName = data?.childName || user?.nickname || t("childFallback");

  return (
    <div className="space-y-6" data-component="ParentReport">
      {/* Header */}
      <section
        className="card-kids flex items-center gap-4 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
        data-component="ReportHeader"
      >
        <Mascot expression="happy" size="large" />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-kids-title">{t("reportTitle")}</h1>
          <p className="text-kids-muted">
            {t("weeklyReportOf", { name: childName })}
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
            aria-label={t("prevWeek")}
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
            aria-label={t("nextWeek")}
            className="p-1 rounded-full hover:bg-kids-secondary"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </section>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Mascot expression="thinking" size="medium" />
          <p className="text-kids-muted font-semibold">{t("summarizingData")}</p>
        </div>
      )}

      {error && !loading && (
        <section className="card-kids flex items-center gap-4" data-component="ReportError">
          <Mascot expression="encouraging" size="medium" />
          <p className="text-kids-muted">{t("reportLoadError")}</p>
        </section>
      )}

      {!loading && !error && data && (
        <>
          {/* Metrics cards */}
          <section data-component="MetricsGrid" className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {METRIC_DEFS.map((m) => {
              const raw = data.metrics[m.key];
              const value = raw == null ? "—" : `${raw}${m.suffixKey ? t(m.suffixKey) : ""}`;
              return (
                <div
                  key={m.key}
                  className="card-kids text-center py-4"
                  data-component="MetricCard"
                  data-metric={m.key}
                >
                  <div className="text-2xl font-extrabold text-[var(--seed-primary)]">{value}</div>
                  <div className="text-sm text-kids-muted mt-1">{t(m.labelKey)}</div>
                </div>
              );
            })}
          </section>

          {/* Trend chart */}
          <section data-component="TrendSection" className="card-kids">
            <h2 className="font-bold text-kids-title mb-3 flex items-center gap-2">
              <BarChart3 size={18} className="text-[var(--seed-primary)]" />
              {t("trendTitle")}
            </h2>
            <TrendChart points={data.masteryTrend} />
          </section>

          {/* Weak words Top10 */}
          <section data-component="WeakWordsSection" className="card-kids">
            <h2 className="font-bold text-kids-title mb-3">{t("weakWordsTitle")}</h2>
            {data.weakWordsTop.length === 0 ? (
              <p className="text-kids-muted">{t("weakWordsEmpty")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2" data-component="WeakWordsList">
                {data.weakWordsTop.map((w) => (
                  <li key={w} data-component="WeakWordItem" data-weak-word={w}>
                    <Link
                      href={`/practice?focusWord=${encodeURIComponent(w)}`}
                      className="inline-block rounded-control bg-kids-secondary px-3 py-1.5 text-sm font-semibold text-kids-text hover:bg-[var(--seed-primary)] hover:text-white transition-colors"
                      aria-label={t("practiceWeakWordAria", { word: w })}
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
            <h2 className="font-bold text-kids-title mb-3">{t("suggestionsTitle")}</h2>
            {data.suggestions.length === 0 ? (
              <p className="text-kids-muted">{t("suggestionsEmpty")}</p>
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
