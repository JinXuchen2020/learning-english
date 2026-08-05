"use client";

import React, { useCallback, useMemo, useState } from "react";
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
} from "@/lib/plan";
import type {
  PlanLevel,
  GeneratePlanResponse,
  PlanWeek,
} from "@/lib/types";
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

/** 计划预览（AI-207 基础版；完整交互式周卡视图属 AI-208）。 */
function PlanPreview({ result }: { result: GeneratePlanResponse }) {
  const weeks: PlanWeek[] = result.plan.weeks ?? [];
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

      <div className="space-y-3">
        {weeks.map((week, wi) => (
          <div key={wi} className="card-kids" data-component="PlanWeekCard">
            <h3 className="mb-2">
              第 {week.week ?? wi + 1} 周{week.theme ? ` · ${week.theme}` : ""}
            </h3>
            <ul className="space-y-1.5">
              {(week.days ?? []).map((day, di) => (
                <li
                  key={di}
                  className="flex items-center gap-2 text-kids-text"
                  data-component="PlanDayRow"
                >
                  <span className="font-bold text-kids-title">
                    第 {day.day ?? di + 1} 天
                  </span>
                  <span>·</span>
                  <span>{day.title ?? "今日学习"}</span>
                  <span className="ml-auto text-xs text-kids-muted">
                    {(day.lessons ?? []).length} 节
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {weeks.length === 0 && (
        <p className="text-kids-muted">计划正在生成，稍等一下下～</p>
      )}
    </div>
  );
}

function PlanContent() {
  const { user } = useAuth();
  const [values, setValues] = useState<PlanFormValues>(EMPTY_VALUES);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratePlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
                onToggle={() =>
                  setValues((v) => ({ ...v, level: lv.value }))
                }
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
                onToggle={() =>
                  setValues((v) => ({ ...v, dailyMinutes: m }))
                }
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
      {!loading && result && <PlanPreview result={result} />}
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
