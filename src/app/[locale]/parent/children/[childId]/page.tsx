"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { logger } from "@/lib/logger";
import type { ChildProgressDetail, SkillMastery } from "@/lib/types";
import { ChevronLeft } from "lucide-react";

/** skillType → i18n key（与 zh/en 的 skillVocab/skillListen/... 对齐）。 */
const SKILL_LABEL_KEY: Record<string, string> = {
  vocab: "skillVocab",
  listen: "skillListen",
  speak: "skillSpeak",
  write: "skillWrite",
};

function ChildDetailInner() {
  const params = useParams<{ childId: string }>();
  const childId = params.childId;
  const { user } = useAuth();
  const t = useTranslations("Parent");
  const router = useRouter();

  const [detail, setDetail] = useState<ChildProgressDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!childId) return;
    setLoading(true);
    setError(false);
    try {
      const d = await api.getChildProgress(childId);
      setDetail(d);
    } catch (err) {
      logger.error("Failed to load child progress", err);
      setError(true);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    load();
  }, [load]);

  if (user?.role !== "parent") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4" data-component="ParentUnauthorized">
        <Mascot expression="encouraging" size="large" />
        <h1 className="text-xl font-extrabold text-kids-title">{t("parentOnly")}</h1>
        <Link
          href="/"
          className="rounded-control bg-[var(--seed-primary)] text-white px-5 py-2.5 font-bold shadow-button hover:opacity-90"
          data-component="BackHomeBtn"
        >
          {t("backHome")}
        </Link>
      </div>
    );
  }

  const childName = detail?.summary.nickname || t("myChildren");

  return (
    <div className="container-kids">
      <div className="space-y-6" data-component="ChildProgressDetail">
        {/* Header + back */}
        <Card
          className="flex items-center gap-3 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
          data-component="DetailHeader"
        >
          <button
            data-component="BackToDashboard"
            onClick={() => router.push("/parent")}
            aria-label={t("backToDashboard")}
            className="p-1 rounded-full hover:bg-kids-secondary"
          >
            <ChevronLeft size={22} />
          </button>
          <Mascot expression="happy" size="medium" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-kids-title truncate">
              {childName}
              {t("childDetailTitle")}
            </h1>
          </div>
        </Card>

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3" data-component="DetailLoading">
            <Mascot expression="thinking" size="medium" />
            <p className="text-kids-muted font-semibold">{t("childrenLoading")}</p>
          </div>
        )}

        {error && !loading && (
          <Card className="flex items-center gap-4" data-component="DetailError">
            <Mascot expression="encouraging" size="medium" />
            <p className="text-kids-muted">{t("loadProviderFailed")}</p>
          </Card>
        )}

        {!loading && !error && detail && (
          <>
            {/* Summary stats */}
            <section data-component="DetailStats" className="grid grid-cols-3 gap-3">
              <Card className="text-center py-4" data-component="StatLevel">
                <div className="text-2xl font-extrabold text-[var(--seed-primary)]">{detail.summary.level}</div>
                <div className="text-sm text-kids-muted mt-1">{t("childCardLevel")}</div>
              </Card>
              <Card className="text-center py-4" data-component="StatStars">
                <div className="text-2xl font-extrabold text-kids-sun">★ {detail.summary.totalStars}</div>
                <div className="text-sm text-kids-muted mt-1">{t("childStars")}</div>
              </Card>
              <Card className="text-center py-4" data-component="StatStreak">
                <div className="text-2xl font-extrabold text-kids-title">{detail.summary.streakDays}</div>
                <div className="text-sm text-kids-muted mt-1">{t("childCardStreak")}</div>
              </Card>
            </section>

            {/* Weak words */}
            <Card data-component="WeakWordsSection">
              <h2 className="font-bold text-kids-title mb-3">{t("weakWordsTitle")}</h2>
              {detail.weakWords.length === 0 ? (
                <p className="text-kids-muted" data-component="WeakWordsEmpty">
                  {t("weakWordsEmpty")}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2" data-component="WeakWordsList">
                  {detail.weakWords.map((w) => (
                    <li key={w.word} data-component="WeakWordItem" data-weak-word={w.word}>
                      <Link
                        href={`/practice?focusWord=${encodeURIComponent(w.word)}`}
                        className="inline-flex items-center gap-1 rounded-control bg-kids-secondary px-3 py-1.5 text-sm font-semibold text-kids-text hover:bg-[var(--seed-primary)] hover:text-white transition-colors"
                        aria-label={t("weakWordWrongCount", { count: w.wrongCount })}
                      >
                        {w.word}
                        <Badge variant="sun" size="sm">{w.wrongCount}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Skill mastery */}
            <Card data-component="SkillMasterySection">
              <h2 className="font-bold text-kids-title mb-3">{t("skillMasteryTitle")}</h2>
              {detail.skillMastery.length === 0 ? (
                <p className="text-kids-muted" data-component="SkillMasteryEmpty">
                  {t("skillMasteryEmpty")}
                </p>
              ) : (
                <ul className="space-y-3" data-component="SkillMasteryList">
                  {detail.skillMastery.map((s: SkillMastery) => (
                    <li
                      key={s.skillType}
                      data-component="SkillMasteryItem"
                      data-skill={s.skillType}
                      className="flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-kids-title">
                          {t(SKILL_LABEL_KEY[s.skillType] ?? s.skillType)}
                        </span>
                        <span className="text-kids-muted">{Math.round(s.ratio * 100)}%</span>
                      </div>
                      <Progress value={Math.round(s.ratio * 100)} max={100} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Weekly trend */}
            <Card data-component="WeeklyTrendSection">
              <h2 className="font-bold text-kids-title mb-3">{t("weeklyTrendTitle")}</h2>
              <WeeklyTrendBars points={detail.weeklyTrend} />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 近 7 日活跃度柱状（AI-712，复用 AI-507 思路但用 {date,stars}）。
 * 纯原生 div 柱状，零图表依赖；每根柱 data-stars 供 E2E 断言（语言无关）。
 */
function WeeklyTrendBars({ points }: { points: { date: string; stars: number }[] }) {
  const t = useTranslations("Parent");
  const max = Math.max(1, ...points.map((p) => p.stars));
  return (
    <div className="flex items-end gap-2 h-28" data-component="TrendBars" role="img" aria-label={t("weeklyTrendTitle")}>
      {points.map((p) => (
        <div
          key={p.date}
          className="flex-1 flex flex-col items-center justify-end gap-1"
          data-component="TrendBar"
          data-stars={p.stars}
        >
          <span className="text-xs font-bold text-kids-title">{p.stars}</span>
          <div
            className="w-full rounded-t-card bg-[var(--seed-primary)]"
            style={{ height: `${(p.stars / max) * 100}%`, minHeight: p.stars > 0 ? 4 : 2 }}
          />
          <span className="text-[10px] text-kids-muted">{p.date.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ChildProgressPage() {
  return (
    <AuthGate>
      <ChildDetailInner />
    </AuthGate>
  );
}
