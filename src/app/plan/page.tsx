"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import Mascot from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
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
import type { PlanLevel, GeneratePlanResponse, PlanWeek } from "@/lib/types";
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
}: {
  result: GeneratePlanResponse;
  onRegenerate: () => void;
  onApply: () => void;
  applying: boolean;
  applied: boolean;
  checkedDays: Set<number>;
  onToggleDay: (index: number) => void;
}) {
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
          <h2 className="text-xl">你的学习计划来啦！</h2>
          <p className="text-kids-muted font-semibold">
            {weeks.length} 周 · 共 {totalDays} 天
          </p>
        </div>
      </div>

      {result.degraded && (
        <p
          data-component="PlanDegradedNote"
          className="text-sm font-bold text-[var(--color-warning)] bg-[var(--color-warning)]/10 rounded-control px-4 py-2.5"
        >
          Foxy 用了一套现成计划，稍后你可以再让它量身定制～
        </p>
      )}

      {applied && (
        <p
          data-component="PlanAppliedSuccess"
          className="text-sm font-bold text-[var(--color-success)] bg-[var(--color-success)]/10 rounded-control px-4 py-2.5"
        >
          🎉 已应用到你的每日任务，正在跳转到首页…
        </p>
      )}

      <div className="space-y-3">
        {weeks.map((week, wi) => (
          <div key={wi} className="card-kids" data-component="PlanWeekCard">
            <h3 className="mb-2">
              第 {week.week ?? wi + 1} 周{week.theme ? ` · ${week.theme}` : ""}
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
                          {fmt.lessonCount} 节
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
                        {done ? "已完成" : "完成今天"}
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
                              {planLessonTypeLabel(lesson) || "任务"}
                            </span>
                            <span>{lesson.title || planLessonTypeLabel(lesson) || "今日学习"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {weeks.length === 0 && (
        <p className="text-kids-muted">计划正在生成，稍等一下下～</p>
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
          重新生成 ↻
        </Button>
        <Button
          type="button"
          variant="success"
          className="flex-1 justify-center"
          onClick={onApply}
          disabled={applying || applied}
          data-action="apply"
        >
          {applying ? "正在应用…" : applied ? "已应用 ✓" : "应用此计划 ✨"}
        </Button>
      </div>
    </div>
  );
}

function PlanContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [values, setValues] = useState<PlanFormValues>(EMPTY_VALUES);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratePlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [checkedDays, setCheckedDays] = useState<Set<number>>(new Set());

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
    setLoading(true);
    setError(null);
    setResult(null);
    setApplied(false);
    try {
      const res = await api.generatePlan({
        childId: user.id,
        ageRange: values.ageRange,
        level: values.level as PlanLevel,
        dailyMinutes: values.dailyMinutes as number,
        interests: values.interests,
        weeks: values.weeks as number,
      });
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "生成失败，再试一次吧～");
      } else {
        setError("网络好像开小差了，再试一次吧！");
      }
      logger.error("generatePlan failed", err);
    } finally {
      setLoading(false);
    }
  }, [valid, user, values]);

  const handleApply = useCallback(async () => {
    if (!result || !user) return;
    setApplying(true);
    setError(null);
    try {
      const saved = await api.savePlan({ childId: user.id, plan: result.plan });
      await api.applyPlan(saved.id, {});
      setApplied(true);
      // 短暂展示成功提示后跳回首页（Home 会渲染新计划任务）。
      setTimeout(() => router.push("/"), 1200);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "应用失败，再试一次吧～");
      } else {
        setError("网络好像开小差了，再试一次吧！");
      }
      logger.error("applyPlan failed", err);
      setApplying(false);
    }
  }, [result, user, router]);

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
        定制你的学习计划
      </h1>

      {/* Mascot guide */}
      <section className="card-kids flex items-center gap-5 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]">
        <Mascot expression="happy" size="large" />
        <div className="relative">
          <div className="bg-white rounded-panel rounded-bl-none px-5 py-3 shadow-sm">
            <p className="text-lg font-bold text-kids-title">Hi! I&apos;m Foxy!</p>
            <p className="text-kids-text">
              告诉我一点点，我就能帮你做一份专属学习计划～
            </p>
          </div>
        </div>
      </section>

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
            你几岁啦？
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
            现在的英语水平？
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
            每天想学多久？
          </legend>
          <div className="flex flex-wrap gap-2">
            {DAILY_MINUTE_OPTIONS.map((m) => (
              <Chip
                key={m}
                field="dailyMinutes"
                value={String(m)}
                label={`${m} 分钟`}
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
            喜欢什么呀？（可多选）
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
            计划学几周？
          </legend>
          <div className="flex flex-wrap gap-2">
            {WEEK_OPTIONS.map((w) => (
              <Chip
                key={w}
                field="weeks"
                value={String(w)}
                label={`${w} 周`}
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
          disabled={!valid || loading}
          data-action="generate"
        >
          {loading ? "Foxy 正在思考…" : "生成我的学习计划 ✨"}
        </Button>
      </form>

      {/* Loading */}
      {loading && (
        <div
          className="flex flex-col items-center justify-center py-10 gap-3"
          data-component="PlanLoading"
        >
          <Mascot expression="thinking" size="large" />
          <p className="text-kids-muted font-semibold">Foxy 正在为你准备计划…</p>
        </div>
      )}

      {/* Result preview */}
      {!loading && result && (
        <PlanPreview
          result={result}
          onRegenerate={() => void handleGenerate()}
          onApply={() => void handleApply()}
          applying={applying}
          applied={applied}
          checkedDays={checkedDays}
          onToggleDay={toggleDay}
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
