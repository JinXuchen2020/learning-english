"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import Mascot from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { ApiError, generatePlanStream } from "@/lib/api";
import { logger } from "@/lib/logger";
import {
  PLAN_LEVELS,
  AGE_RANGES,
  DAILY_MINUTE_OPTIONS,
  INTEREST_OPTIONS,
  WEEK_OPTIONS,
  validatePlanForm,
  isPlanFormValid,
  planSkillColor,
  planSkillLabel,
  planLessonTypeLabel,
  formatPlanDay,
} from "@/lib/plan";
import type { PlanLevel, GeneratePlanResponse, PlanWeek, PlanStreamEvent, PlanStreamErrorCode } from "@/lib/types";
import type { PlanFormValues } from "@/lib/plan";

const EMPTY_VALUES: PlanFormValues = {
  ageRange: "",
  level: "",
  dailyMinutes: null,
  interests: [],
  weeks: null,
};

/** 单/多选卡片选择器。 */
function Chip({
  field,
  value,
  label,
  selected,
  onToggle,
  multiple,
}: {
  field: string;
  value: string;
  label: string;
  selected: boolean;
  onToggle: () => void;
  multiple?: boolean;
}) {
  return (
    <button
      type="button"
      data-field={field}
      data-value={value}
      aria-pressed={selected}
      onClick={onToggle}
      className={`touch-target rounded-control px-5 py-3 font-bold border-2 transition-all ${
        selected
          ? "bg-[var(--seed-primary)] text-white border-[var(--seed-primary)] shadow-sm"
          : "bg-white text-kids-title border-kids-secondary hover:border-[var(--seed-primary)]"
      } ${multiple ? "" : ""}`}
    >
      {label}
    </button>
  );
}

/**
 * 计划预览 + 交互（AI-208）：每日颜色化卡片视图 + 重新生成 / 应用此计划 + 单日勾选。
 */
function PlanPreview({
  result,
  onRegenerate,
  onApply,
  applying,
  applied,
  checkedDays,
  onToggleDay,
  savedPlanId,
  generating,
  onGenerateCourses,
  onGoHome,
}: {
  result: GeneratePlanResponse;
  onRegenerate: () => void;
  onApply: () => void;
  applying: boolean;
  applied: boolean;
  checkedDays: Set<number>;
  onToggleDay: (index: number) => void;
  savedPlanId: string | null;
  generating: boolean;
  onGenerateCourses: () => void;
  onGoHome: () => void;
}) {
  const t = useTranslations("Plan");
  const weeks: PlanWeek[] = result.plan.weeks ?? [];

  // 计算每周之前累计的天数，给每天一个跨周稳定的全局序号（用于勾选 key）。
  const dayCountsBefore: number[] = [];
  let acc = 0;
  for (const w of weeks) {
    dayCountsBefore.push(acc);
    acc += w.days?.length ?? 0;
  }

  const totalDays = weeks.reduce((n, w) => n + (w.days?.length ?? 0), 0);

  return (
    <div className="space-y-4" data-component="PlanPreview">
      <div className="flex items-center gap-3">
        <Mascot expression="celebrating" size="medium" />
        <div>
          <h2 className="text-xl">{t('previewTitle')}</h2>
          <p className="text-kids-muted font-semibold">
            {t('weeksDays', { weeks: weeks.length, totalDays })}
          </p>
        </div>
      </div>

      {result.degraded && (
        <p
          data-component="PlanDegradedNote"
          className="text-sm font-bold text-[var(--color-warning)] bg-[var(--color-warning)]/10 rounded-control px-4 py-2.5"
        >
          {t('degradedNote')}
        </p>
      )}

      {applied && (
        <p
          data-component="PlanAppliedSuccess"
          className="text-sm font-bold text-[var(--color-success)] bg-[var(--color-success)]/10 rounded-control px-4 py-2.5"
        >
          {t('appliedNote')}
        </p>
      )}

      {applied && savedPlanId && (
        <div className="space-y-3" data-component="GenerateCoursesBlock">
          <p className="text-sm font-semibold text-kids-muted">
            {t('generateCoursesHint')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              variant="success"
              className="flex-1 justify-center"
              onClick={onGenerateCourses}
              disabled={generating}
              data-action="generate-courses"
            >
              {generating ? t('generatingCourses') : t('generateCourses')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1 justify-center"
              onClick={onGoHome}
              disabled={generating}
              data-action="go-home"
            >
              {t('goHome')}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {weeks.map((week, wi) => (
          <Card key={wi} data-component="PlanWeekCard">
            <h3 className="mb-2">
              {t('weekN', { n: week.week ?? wi + 1 })}{week.theme ? ` · ${week.theme}` : ""}
            </h3>
            <div className="space-y-2">
              {(week.days ?? []).map((day, di) => {
                const gi = dayCountsBefore[wi] + di;
                const fmt = formatPlanDay(day, gi);
                const done = checkedDays.has(gi);
                return (
                  <div
                    key={di}
                    data-component="PlanDayCard"
                    className="rounded-control border-l-4 p-3 bg-white transition-all"
                    style={{
                      borderLeftColor: fmt.color,
                      backgroundColor: fmt.color + "14",
                      opacity: done ? 0.7 : 1,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p
                          className={`font-bold text-kids-title ${
                            done ? "line-through" : ""
                          }`}
                        >
                          {fmt.label}
                        </p>
                        <p className="text-sm text-kids-muted">
                          {fmt.lessonCount} {t('lessons')}
                          {fmt.skills.length > 0 &&
                            ` · ${fmt.skills.map(planSkillLabel).join(" / ")}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        data-action="toggle-day"
                        data-day-index={gi}
                        aria-pressed={done}
                        onClick={() => onToggleDay(gi)}
                        className={`ml-auto touch-target flex items-center gap-1 rounded-control px-3 py-2 font-bold border-2 transition-all ${
                          done
                            ? "bg-[var(--color-success)] text-white border-[var(--color-success)]"
                            : "bg-white text-kids-title border-kids-secondary hover:border-[var(--color-success)]"
                        }`}
                      >
                        {done ? <Check size={18} strokeWidth={3} /> : null}
                        {done ? t('done') : t('finishToday')}
                      </button>
                    </div>

                    {(day.lessons ?? []).length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {(day.lessons ?? []).map((lesson, li) => (
                          <li
                            key={li}
                            className="text-sm text-kids-text flex items-center gap-2"
                          >
                            <span
                              className="rounded px-1.5 py-0.5 text-xs font-semibold"
                              style={{
                                backgroundColor:
                                  planSkillColor(lesson.skillType) + "22",
                                color: planSkillColor(lesson.skillType),
                              }}
                            >
                              {planLessonTypeLabel(lesson) || t('task')}
                            </span>
                            <span>{lesson.title || planLessonTypeLabel(lesson) || t('todayStudy')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {weeks.length === 0 && (
        <p className="text-kids-muted">{t('generatingPlan')}</p>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1 justify-center"
          onClick={onRegenerate}
          disabled={applying || applied}
          data-action="regenerate"
        >
          {t('regenerate')}
        </Button>
        <Button
          type="button"
          variant="success"
          className="flex-1 justify-center"
          onClick={onApply}
          disabled={applying || applied}
          data-action="apply"
        >
          {applying ? t('applying') : applied ? t('applied') : t('applyPlan')}
        </Button>
      </div>
    </div>
  );
}

function PlanContent() {
  const { user } = useAuth();
  const t = useTranslations("Plan");
  const router = useRouter();
  const [values, setValues] = useState<PlanFormValues>(EMPTY_VALUES);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [streamPhase, setStreamPhase] = useState<"thinking" | "writing" | "done" | null>(null);
  const [streamError, setStreamError] = useState<{ code: PlanStreamErrorCode; message: string } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [result, setResult] = useState<GeneratePlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checkedDays, setCheckedDays] = useState<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const errors = useMemo(() => validatePlanForm(values), [values]);
  const valid = isPlanFormValid(values);

  const toggleInterest = (interest: string) => {
    setValues((v) => ({
      ...v,
      interests: v.interests.includes(interest)
        ? v.interests.filter((x) => x !== interest)
        : [...v.interests, interest],
    }));
  };

  const handleGenerate = useCallback(async () => {
    if (!valid || !user) return;
    // 重置展示态，开始一次新的流式生成。
    setStreaming(true);
    setError(null);
    setStreamError(null);
    setCancelled(false);
    setResult(null);
    setDraft("");
    setStreamPhase("thinking");
    setApplied(false);
    setSavedPlanId(null);
    setGenerating(false);

    const ac = new AbortController();
    abortRef.current = ac;

    const onEvent = (ev: PlanStreamEvent) => {
      switch (ev.type) {
        case "start":
          setStreamPhase("thinking");
          break;
        case "token":
          setDraft((d) => d + ev.text);
          break;
        case "progress":
          setStreamPhase(ev.phase === "done" ? "writing" : ev.phase);
          break;
        case "done":
          setResult({ plan: ev.plan, model: ev.model, degraded: ev.model === "template" });
          setStreamPhase("done");
          setStreaming(false);
          break;
        case "error":
          setStreamError({ code: ev.code, message: ev.message });
          setStreaming(false);
          break;
      }
    };

    try {
      await generatePlanStream(
        {
          childId: user.id,
          ageRange: values.ageRange,
          level: values.level as PlanLevel,
          dailyMinutes: values.dailyMinutes as number,
          interests: values.interests,
          weeks: values.weeks as number,
        },
        onEvent,
        ac.signal,
      );
    } catch (err) {
      // 防御：理论上 generatePlanStream 不向上抛，但兜底处理以免白屏。
      if (err instanceof ApiError) {
        setError(err.message || t('genError'));
      } else {
        setError(t('networkError'));
      }
      logger.error("generatePlanStream failed", err);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [valid, user, values, t]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setCancelled(true);
  }, []);

  const handleApply = useCallback(async () => {
    if (!result || !user) return;
    setApplying(true);
    setError(null);
    try {
      const saved = await api.savePlan({ childId: user.id, plan: result.plan });
      setSavedPlanId(saved.id);
      await api.applyPlan(saved.id, {});
      setApplied(true);
      setApplying(false);
      // 不再自动跳首页：应用成功后展示「生成配套课程」入口（AI-801），
      // 由用户选择生成课程或稍后回首页。
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || t('applyError'));
      } else {
        setError(t('networkError'));
      }
      logger.error("applyPlan failed", err);
      setApplying(false);
    }
  }, [result, user]);

  /** AI-801：应用计划后，按已保存计划 id 生成配套课程，成功后跳 /course（课程列表页）。 */
  const handleGenerateCourses = useCallback(async () => {
    if (!savedPlanId || !user) return;
    setGenerating(true);
    setError(null);
    try {
      await api.generateCoursesForPlan(savedPlanId, {});
      setGenerating(false);
      router.push("/course");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || t('coursesError'));
      } else {
        setError(t('networkError'));
      }
      logger.error("generateCoursesForPlan failed", err);
      setGenerating(false);
    }
  }, [savedPlanId, user, router, t]);

  const handleGoHome = useCallback(() => {
    router.push("/");
  }, [router]);

  const toggleDay = useCallback((index: number) => {
    setCheckedDays((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  return (
    <div className="space-y-8" data-component="PlanWizard">
      <h1 className="text-2xl font-extrabold text-kids-title" data-component="PlanTitle">
        {t('title')}
      </h1>

      {/* Mascot guide */}
      <Card className="flex items-center gap-5 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]">
        <Mascot expression="happy" size="large" />
        <div className="relative">
          <div className="bg-white rounded-panel rounded-bl-none px-5 py-3 shadow-sm">
            <p className="text-lg font-bold text-kids-title">{t('mascotGreeting')}</p>
            <p className="text-kids-text">
              {t('mascotHint')}
            </p>
          </div>
        </div>
      </Card>

      {error && (
        <p
          className="text-sm font-bold text-[var(--color-danger)] bg-[var(--color-danger)]/10 rounded-control px-4 py-2.5"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Wizard form */}
      <form
        className="space-y-6"
        data-component="PlanForm"
        onSubmit={(e) => {
          e.preventDefault();
          void handleGenerate();
        }}
      >
        {/* Age range */}
        <fieldset>
          <legend className="block text-base font-extrabold text-kids-title mb-2">
            {t('ageLabel')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {AGE_RANGES.map((ar) => (
              <Chip
                key={ar}
                field="ageRange"
                value={ar}
                label={ar}
                selected={values.ageRange === ar}
                onToggle={() => setValues((v) => ({ ...v, ageRange: ar }))}
              />
            ))}
          </div>
          {errors.ageRange && (
            <p className="mt-1.5 text-sm font-bold text-[var(--color-danger)]">
              {errors.ageRange}
            </p>
          )}
        </fieldset>

        {/* Level */}
        <fieldset>
          <legend className="block text-base font-extrabold text-kids-title mb-2">
            {t('levelLabel')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {PLAN_LEVELS.map((lv) => (
              <Chip
                key={lv.value}
                field="level"
                value={lv.value}
                label={lv.label}
                selected={values.level === lv.value}
                onToggle={() => setValues((v) => ({ ...v, level: lv.value }))}
              />
            ))}
          </div>
          {errors.level && (
            <p className="mt-1.5 text-sm font-bold text-[var(--color-danger)]">
              {errors.level}
            </p>
          )}
        </fieldset>

        {/* Daily minutes */}
        <fieldset>
          <legend className="block text-base font-extrabold text-kids-title mb-2">
            {t('minutesLabel')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {DAILY_MINUTE_OPTIONS.map((m) => (
              <Chip
                key={m}
                field="dailyMinutes"
                value={String(m)}
                label={`${m} ${t('minutes')}`}
                selected={values.dailyMinutes === m}
                onToggle={() => setValues((v) => ({ ...v, dailyMinutes: m }))}
              />
            ))}
          </div>
          {errors.dailyMinutes && (
            <p className="mt-1.5 text-sm font-bold text-[var(--color-danger)]">
              {errors.dailyMinutes}
            </p>
          )}
        </fieldset>

        {/* Interests (multi) */}
        <fieldset>
          <legend className="block text-base font-extrabold text-kids-title mb-2">
            {t('interestLabel')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((i) => (
              <Chip
                key={i}
                field="interests"
                value={i}
                label={i}
                multiple
                selected={values.interests.includes(i)}
                onToggle={() => toggleInterest(i)}
              />
            ))}
          </div>
          {errors.interests && (
            <p className="mt-1.5 text-sm font-bold text-[var(--color-danger)]">
              {errors.interests}
            </p>
          )}
        </fieldset>

        {/* Weeks */}
        <fieldset>
          <legend className="block text-base font-extrabold text-kids-title mb-2">
            {t('weeksLabel')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {WEEK_OPTIONS.map((w) => (
              <Chip
                key={w}
                field="weeks"
                value={String(w)}
                label={`${w} ${t('weeks')}`}
                selected={values.weeks === w}
                onToggle={() => setValues((v) => ({ ...v, weeks: w }))}
              />
            ))}
          </div>
          {errors.weeks && (
            <p className="mt-1.5 text-sm font-bold text-[var(--color-danger)]">
              {errors.weeks}
            </p>
          )}
        </fieldset>

        <Button
          type="submit"
          variant="success"
          className="w-full justify-center"
          disabled={!valid || streaming}
          data-action="generate"
        >
          {streaming ? t('generating') : t('generate')}
        </Button>
      </form>

      {/* Stream error (AI-804): 错误事件 → 提示 + 重试 */}
      {streamError && !result && (
        <div className="space-y-3" data-component="PlanStreamError">
          <p
            className="text-sm font-bold text-[var(--color-danger)] bg-[var(--color-danger)]/10 rounded-control px-4 py-2.5"
            role="alert"
          >
            {t('streamError')}：{streamError.message}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center"
            onClick={() => void handleGenerate()}
            data-action="retry-stream"
          >
            {t('retry')}
          </Button>
        </div>
      )}

      {/* Streaming draft (AI-804): 渐进文本 + 取消 */}
      {streaming && !result && (
        <div className="space-y-4" data-component="PlanStreaming">
          <div className="flex items-center gap-3">
            <Mascot
              expression={streamPhase === "writing" ? "happy" : "thinking"}
              size="large"
            />
            <div className="relative">
              <div className="bg-white rounded-panel rounded-bl-none px-5 py-3 shadow-sm">
                <p className="text-lg font-bold text-kids-title">{t('streaming')}</p>
                <p className="text-kids-text">
                  {streamPhase === "writing"
                    ? t('writingPhase')
                    : streamPhase === "thinking"
                      ? t('thinkingPhase')
                      : t('streamHint')}
                </p>
              </div>
            </div>
          </div>

          <Card data-component="PlanDraftPanel" className="bg-[var(--seed-surface)]">
            <pre className="whitespace-pre-wrap break-words font-mono text-sm text-kids-text leading-relaxed">
              {draft}
              <span className="inline-block w-2 h-4 align-middle bg-[var(--seed-primary)] animate-pulse" />
            </pre>
          </Card>

          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center"
            onClick={handleCancel}
            data-action="cancel-stream"
          >
            {t('cancel')}
          </Button>
        </div>
      )}

      {/* Canceled (AI-804): 保留草稿 + 重新生成 */}
      {cancelled && !result && !streamError && (
        <div className="space-y-3" data-component="PlanCanceled">
          <Card data-component="PlanDraftPanel" className="bg-[var(--seed-surface)]">
            <pre className="whitespace-pre-wrap break-words font-mono text-sm text-kids-text leading-relaxed">
              {draft}
            </pre>
          </Card>
          <p className="text-sm font-semibold text-kids-muted">{t('canceled')}</p>
          <Button
            type="button"
            variant="success"
            className="w-full justify-center"
            onClick={() => void handleGenerate()}
            data-action="retry-stream"
          >
            {t('retry')}
          </Button>
        </div>
      )}

      {/* Result preview */}
      {!streaming && result && (
        <PlanPreview
          result={result}
          onRegenerate={() => void handleGenerate()}
          onApply={() => void handleApply()}
          applying={applying}
          applied={applied}
          checkedDays={checkedDays}
          onToggleDay={toggleDay}
          savedPlanId={savedPlanId}
          generating={generating}
          onGenerateCourses={() => void handleGenerateCourses()}
          onGoHome={handleGoHome}
        />
      )}
    </div>
  );
}

export default function PlanPage() {
  return (
    <AuthGate>
      <PlanContent />
    </AuthGate>
  );
}
