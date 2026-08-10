"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import LevelRing from "@/components/LevelRing";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { isSpeakingTask, speakingTaskHref } from "@/lib/tasks";
import { mapBackendMascotExpr } from "@/lib/speech";
import { logger } from "@/lib/logger";
import type { DailyReportResponse, DailyTask, PlanStatusResponse, MascotLevelInfo, MascotStory, DueReview, MakeupQueue } from "@/lib/types";
import { Headphones, Mic, Pencil, Star, Flame, Check, MessageCircle, RefreshCw, Gift } from "lucide-react";

const taskIcons = {
  headphones: Headphones,
  mic: Mic,
  pencil: Pencil,
  review: RefreshCw,
};

function ProgressRing({ progress, color }: { progress: number; color: string }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r={radius} fill="none" stroke="#F0E8D8" strokeWidth="6" />
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="progress-ring-circle"
      />
      <text
        x="28"
        y="28"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-[11px] font-extrabold"
        fill="#725D42"
      >
        {progress}%
      </text>
    </svg>
  );
}

function AiReportCard({
  report,
  reportLoading,
  onRetry,
}: {
  report: DailyReportResponse | null;
  reportLoading: boolean;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("Home");

  // 尚未装载完成 → 思考态占位（不显示生成按钮，避免成功路径闪现按钮）。
  if (reportLoading) {
    return (
      <section
        data-component="AiReportCard"
        className="card-kids flex items-center gap-4"
      >
        <Mascot expression="thinking" size="medium" />
        <div className="flex-1">
          <p className="font-bold text-kids-title">{t("aiReportTitle")}</p>
          <p className="text-kids-muted">{t("aiReportLoading")}</p>
        </div>
      </section>
    );
  }

  // 拉取失败 / 无报告 → 吉祥物思考态 + 生成按钮（可重试）。
  if (!report) {
    return (
      <section
        data-component="AiReportCard"
        className="card-kids flex items-center gap-4"
      >
        <Mascot expression="thinking" size="medium" />
        <div className="flex-1">
          <p className="font-bold text-kids-title">{t("aiReportTitle")}</p>
          <p className="text-kids-muted">{t("aiReportEmpty")}</p>
        </div>
        <button
          data-component="AiReportGenerateBtn"
          onClick={onRetry}
          className="rounded-control bg-kids-sun px-4 py-2 font-bold text-white hover:opacity-90"
        >
          {t("aiReportGenerate")}
        </button>
      </section>
    );
  }

  const expr = mapBackendMascotExpr(report.mascotExpr);
  return (
    <section
      data-component="AiReportCard"
      className="card-kids flex items-start gap-4"
    >
      <Mascot expression={expr} size="medium" />
      <div className="flex-1">
        <p className="font-bold text-kids-title">{t("aiReportTitle")}</p>
        <p data-component="AiReportSummary" className="text-kids-text">
          {report.summaryText}
        </p>
        {report.weakWords.length > 0 && (
          <div data-component="AiReportWeakWords" className="mt-2 flex flex-wrap gap-2">
            {report.weakWords.map((w) => (
              <span
                key={w}
                className="rounded-control bg-kids-secondary px-3 py-1 text-sm font-semibold text-kids-text"
              >
                {w}
              </span>
            ))}
          </div>
        )}
        {report.suggestionText && (
          <p data-component="AiReportSuggestion" className="mt-1 text-sm text-kids-muted">
            💡 {report.suggestionText}
          </p>
        )}
        <button
          data-component="AiReportToggle"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-sm font-semibold text-[var(--seed-primary)] hover:underline"
        >
          {expanded ? t("aiReportToggleCollapse") : t("aiReportToggleExpand")}
        </button>
        {expanded && (
          <div
            data-component="AiReportDetails"
            className="mt-2 space-y-1 text-sm text-kids-muted"
          >
            <p>{t("aiReportDate", { date: report.date })}</p>
            {report.isDefault && <p>{t("aiReportDefaultTip")}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function MakeupCard({
  makeup,
  onCompleteTask,
  completingId,
}: {
  makeup: MakeupQueue | null;
  onCompleteTask: (planDayId: string) => void;
  completingId: string | null;
}) {
  if (!makeup) return null;
  const { weakWords, missedTasks } = makeup;
  const t = useTranslations("Home");
  if (weakWords.length === 0 && missedTasks.length === 0) return null;

  return (
    <section data-component="MakeupCard" className="card-kids flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-kids-orange/20 text-kids-orange">
          <RefreshCw size={24} />
        </div>
        <div>
          <h2 className="font-bold text-kids-title">{t("makeupTitle")}</h2>
          <p className="text-kids-muted">
            {t("makeupHint", { count: weakWords.length + missedTasks.length })}
          </p>
        </div>
      </div>

      {weakWords.length > 0 && (
        <ul className="flex flex-col gap-2">
          {weakWords.map((w) => (
            <li key={w.wordId}>
              <Link
                href={`/practice?focusWord=${encodeURIComponent(w.wordText)}`}
                data-makeup-word-id={w.wordId}
                data-component="MakeupWordLink"
                className="flex items-center justify-between rounded-control bg-kids-secondary/60 px-4 py-3 hover:shadow-card-hover"
              >
                <span className="font-bold text-kids-title">{w.wordText}</span>
                <span className="text-sm text-kids-muted">
                  {w.meaning} · {t("masteryLabel", { pct: w.mastery })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {missedTasks.length > 0 && (
        <ul className="flex flex-col gap-2">
          {missedTasks.map((taskItem) => (
            <li
              key={taskItem.planDayId}
              data-component="MakeupMissedTask"
              className="flex items-center justify-between rounded-control bg-kids-secondary/60 px-4 py-3"
            >
              <span className="font-bold text-kids-title">{taskItem.title}</span>
              <button
                data-component="MakeupCompleteBtn"
                data-makeup-plan-day-id={taskItem.planDayId}
                onClick={() => onCompleteTask(taskItem.planDayId)}
                disabled={completingId === taskItem.planDayId}
                className="rounded-control bg-kids-sun px-3 py-1.5 font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {completingId === taskItem.planDayId ? t("makeupMarking") : t("makeupMarkDone")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HomeContent() {
  const { user } = useAuth();
  const t = useTranslations("Home");
  const [courses, setCourses] = useState<api.CourseSummary[]>([]);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [progress, setProgress] = useState<api.ProgressOverview | null>(null);
  const [planStatus, setPlanStatus] = useState<PlanStatusResponse | null>(null);
  const [chatStars, setChatStars] = useState(0);
  const [mascotLevel, setMascotLevel] = useState<MascotLevelInfo | null>(null);
  const [mascotStory, setMascotStory] = useState<MascotStory | null>(null);
  // AI-605：到期/今日待复习单词（间隔重复）。
  const [reviews, setReviews] = useState<DueReview[]>([]);
  // AI-704：补学队列（昨日未掌握弱词 + 昨日未完成计划日）。
  const [makeup, setMakeup] = useState<MakeupQueue | null>(null);
  const [showStory, setShowStory] = useState(false);
  const [storyLoading, setStoryLoading] = useState(false);
  const [report, setReport] = useState<DailyReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (!user) return;
    setReportLoading(true);
    try {
      const r = await api.getDailyReport(user.id);
      setReport(r);
    } catch (err) {
      // AI-504：拉取失败（4xx/5xx）→ 不阻塞主数据，展示「{t("aiReportGenerate")}」按钮。
      logger.error("Failed to load daily AI report", err);
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [courseData, taskData, progressData, planData, levelData, reviewsData, makeupData] = await Promise.all([
        api.getCourses(),
        api.getDailyTasks(),
        api.getProgress(),
        user ? api.getPlanStatus(user.id) : Promise.resolve(null),
        user ? api.getMascotLevel(user.id) : Promise.resolve(null),
        user ? api.getDueReviews(user.id) : Promise.resolve([] as DueReview[]),
        user
          ? api.getMakeupQueue()
          : Promise.resolve({ weakWords: [], missedTasks: [] } as MakeupQueue),
      ]);
      setCourses(courseData);
      setTasks(taskData);
      setProgress(progressData);
      setPlanStatus(planData);
      setMascotLevel(levelData);
      setReviews(reviewsData);
      setMakeup(makeupData);
    } catch (err) {
      logger.error("Failed to load home data", err);
    } finally {
      setLoading(false);
    }
    // AI-408：聊天星星独立加载，失败不影响主数据（与 messages 接口口径一致：缺省 anonymous）。
    try {
      const stars = await api.getChatStars(user?.id);
      setChatStars(stars.stars);
    } catch (err) {
      logger.error("Failed to load chat stars", err);
    }
    // AI-504：每日 AI 小结独立加载（失败不影响主数据）。
    await loadReport();
  }, [user, loadReport]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCompleteTask = useCallback(
    async (task: DailyTask) => {
      if (task.completed || completingId) return;
      setCompletingId(task.id);
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, completed: true } : t))
      );
      try {
        await api.completeTask(task.id);
        const [fresh, plan] = await Promise.all([
          api.getProgress(),
          user ? api.getPlanStatus(user.id) : Promise.resolve(null),
        ]);
        setProgress(fresh);
        setPlanStatus(plan);
      } catch (err) {
        logger.error("Failed to complete task", err);
        // Revert on failure
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, completed: false } : t))
        );
      } finally {
        setCompletingId(null);
      }
    },
    [completingId]
  );

  // AI-704：标记昨日未完成计划日为完成（补学回写 +1 积分，乐观移除 + 刷新积分/计划进度）。
  const handleCompleteMakeupTask = useCallback(
    async (planDayId: string) => {
      if (completingId) return;
      setCompletingId(planDayId);
      try {
        const res = await api.completeMakeupTask(planDayId);
        if (res.success) {
          setMakeup((prev) =>
            prev
              ? {
                  ...prev,
                  missedTasks: prev.missedTasks.filter(
                    (t) => t.planDayId !== planDayId
                  ),
                }
              : prev
          );
          const [fresh, plan] = await Promise.all([
            api.getProgress(),
            user ? api.getPlanStatus(user.id) : Promise.resolve(null),
          ]);
          setProgress(fresh);
          setPlanStatus(plan);
        }
      } catch (err) {
        logger.error("Failed to complete makeup task", err);
      } finally {
        setCompletingId(null);
      }
    },
    [completingId, user]
  );

  const handleViewStory = useCallback(async () => {
    if (!user || !mascotLevel) return;
    setStoryLoading(true);
    try {
      const s = await api.getMascotStory(user.id, mascotLevel.level);
      setMascotStory(s);
      setShowStory(true);
    } catch (err) {
      logger.error("Failed to load mascot story", err);
    } finally {
      setStoryLoading(false);
    }
  }, [user, mascotLevel]);

  const doneCount = tasks.filter((t) => t.completed).length;
  const nickname = user?.nickname || "friend";

  return (
    <div className="space-y-8" data-component="Home">
      {/* Greeting Banner */}
      <section
        className="card-kids flex items-center gap-5 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
        data-component="GreetingBanner"
      >
        <Mascot expression="happy" size="large" level={mascotLevel?.level} />
        <div className="relative">
          <div className="bg-white rounded-panel rounded-bl-none px-5 py-3 shadow-sm">
            <p className="text-lg font-bold text-kids-title">
              {t("greeting", { name: nickname })}
            </p>
            <p className="text-kids-text">{t("greetingReady")}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2 bg-kids-sun/20 rounded-control px-4 py-2">
            <Flame size={22} className="text-kids-orange" />
            <span className="font-extrabold text-kids-title">
              {progress?.streakDays ?? 0}
            </span>
            <span className="text-sm text-kids-muted">{t("streakDays")}</span>
          </div>
          <div className="flex items-center gap-2 bg-kids-sun/20 rounded-control px-4 py-2">
            <Star size={22} className="text-kids-sun fill-kids-sun" />
            <span className="font-extrabold text-kids-title">
              {progress?.totalStars ?? 0}
            </span>
          </div>
          {/* AI-408：聊天星星徽标（对话陪练累计，独立于练习星星） */}
          {chatStars > 0 && (
            <div
              className="flex items-center gap-2 bg-kids-sun/20 rounded-control px-4 py-2"
              data-component="ChatStars"
            >
              <MessageCircle size={22} className="text-kids-sun" />
              <span className="font-extrabold text-kids-title">{chatStars}</span>
              <span className="text-sm text-kids-muted">{t("chatStarsLabel")}</span>
            </div>
          )}
        </div>
      </section>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Mascot expression="thinking" size="medium" />
          <p className="text-kids-muted font-semibold">{t("loading")}</p>
        </div>
      ) : (
        <>
          {/* AI-504：{t("aiReportTitle")}卡片（吉祥物气泡 + 弱项 + 明日建议，可展开详情） */}
          <AiReportCard report={report} reportLoading={reportLoading} onRetry={loadReport} />

          {/* AI-603：吉祥物成长 — 等级环 + 看成长故事 */}
          {mascotLevel && (
            <section data-component="MascotGrowthCard" className="card-kids flex items-center gap-5">
              <Mascot expression="happy" size="large" level={mascotLevel.level} />
              <div className="flex-1">
                <h2 className="font-bold text-kids-title">{t("mascotLevelTitle", { level: mascotLevel.level })}</h2>
                <p className="text-kids-muted">
                  {mascotLevel.isMaxLevel
                    ? t("mascotMax", { stars: mascotLevel.totalStars })
                    : t("mascotNext", { need: mascotLevel.nextLevelStars - mascotLevel.totalStars, level: mascotLevel.level + 1 })}
                </p>
                {!mascotLevel.isMaxLevel && (
                  <div className="mt-2 h-2 w-full rounded-full bg-kids-secondary">
                    <div
                      className="h-2 rounded-full bg-kids-sun"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            Math.round(
                              (mascotLevel.levelStars /
                                (mascotLevel.nextLevelStars -
                                  (mascotLevel.totalStars - mascotLevel.levelStars))) *
                                100
                            )
                          )
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              <button
                data-component="ViewGrowthStoryBtn"
                onClick={handleViewStory}
                disabled={storyLoading}
                className="rounded-control bg-kids-sun px-4 py-2 font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {storyLoading ? t("storyLoading") : t("storyView")}
              </button>
            </section>
          )}

          {/* AI-603：成长剧情弹层（fixed overlay） */}
          {showStory && (
            <div
              data-component="MascotStoryModal"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={() => setShowStory(false)}
            >
              <div
                className="card-kids max-w-md w-full space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  <Mascot expression="celebrating" size="medium" level={mascotLevel?.level} />
                  <h3 data-component="MascotStoryTitle" className="font-bold text-kids-title text-lg">
                    {mascotStory?.title}
                  </h3>
                </div>
                <p data-component="MascotStoryText" className="text-kids-text leading-relaxed">
                  {mascotStory?.storyText}
                </p>
                {mascotStory?.isDefault && (
                  <p className="text-xs text-kids-muted">{t("storyTip")}</p>
                )}
                <button
                  data-component="MascotStoryClose"
                  className="w-full rounded-control bg-kids-secondary px-4 py-2 font-bold text-kids-title hover:opacity-90"
                  onClick={() => setShowStory(false)}
                >
                  {t("storyClose")}
                </button>
              </div>
            </div>
          )}

          {/* AI-701：{t("rewardsTitle")} — 余额 + 等级环 + {t("rewardsGo")}深链 */}
          {progress && (
            <section
              data-component="RewardsHomeCard"
              className="card-kids flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-kids-sun/20 text-kids-sun">
                  <Gift size={24} />
                </div>
                <div>
                  <h2 className="font-bold text-kids-title">{t("rewardsTitle")}</h2>
                  <p className="text-sm text-kids-muted">
                    {t("rewardsBalancePrefix")}<span className="font-extrabold text-kids-title">{progress.pointsBalance}</span>{t("rewardsBalanceSuffix")}
                  </p>
                </div>
              </div>
              <LevelRing totalStars={progress.totalStars} size={80} />
              <Link
                href="/rewards"
                data-component="GoRewardsBtn"
                className="self-start rounded-control bg-[var(--seed-primary)] text-white px-4 py-2 font-bold hover:opacity-90"
              >
                {t("rewardsGo")}
              </Link>
            </section>
          )}

          {/* Plan Progress (AI-209)：仅当存在已应用计划时展示完成度 */}
          {planStatus?.hasPlan && (
            <section
              data-component="PlanProgress"
              className="card-kids flex items-center gap-5"
            >
              <ProgressRing
                progress={Math.round((planStatus.completionRatio ?? 0) * 100)}
                color="#10B981"
              />
              <div>
                <h2 className="font-bold text-kids-title">{t("planProgressTitle")}</h2>
                <p className="text-kids-muted">
                  {t("planDone", { done: planStatus.doneDays, total: planStatus.totalDays })}
                </p>
              </div>
            </section>
          )}

          {/* AI-605 复习提醒：到期/今日待复习单词（间隔重复） */}
          {reviews.length > 0 && (
            <section
              data-component="ReviewReminderCard"
              className="card-kids flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-kids-secondary text-kids-text">
                  <RefreshCw size={24} />
                </div>
                <div>
                  <h2 className="font-bold text-kids-title">{t("reviewTitle")}</h2>
                  <p className="text-kids-muted">
                    {t("reviewHint", { count: reviews.length })}
                  </p>
                </div>
              </div>
              <ul className="flex flex-col gap-2">
                {reviews.map((r) => (
                  <li key={r.wordId}>
                    <Link
                      href={`/practice?focusWord=${encodeURIComponent(r.wordText)}`}
                      data-review-word-id={r.wordId}
                      data-component="ReviewWordLink"
                      className="flex items-center justify-between rounded-control bg-kids-secondary/60 px-4 py-3 hover:shadow-card-hover"
                    >
                      <span className="font-bold text-kids-title">{r.wordText}</span>
                      <span className="text-sm text-kids-muted">{r.meaning}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/practice"
                data-component="ReviewGoBtn"
                className="self-start rounded-control bg-[var(--seed-primary)] text-white px-4 py-2 font-bold"
              >
                {t("reviewGo")}
              </Link>
            </section>
          )}

          {/* AI-704 补学队列：昨日未掌握弱词（深链练习）+ 昨日未完成计划日（标记完成） */}
          <MakeupCard
            makeup={makeup}
            onCompleteTask={handleCompleteMakeupTask}
            completingId={completingId}
          />

          {/* Daily Tasks */}
          <section data-component="DailyTasks">
            <h2 className="mb-4 flex items-center gap-2">
              {t("todaysTasks")}
              <span className="text-sm font-semibold text-kids-muted bg-kids-secondary rounded-control px-3 py-1">
                {t("tasksDone", { done: doneCount, total: tasks.length })}
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tasks.map((task) => {
                const Icon = taskIcons[task.icon] || Headphones;
                const isCompleted = task.completed;
                // 未完成的口语(mic)任务 → 深链到 /speech（AI-308）；其余维持一键完成。
                const isSpeechLink = isSpeakingTask(task) && !isCompleted;
                // AI-605：注入的复习任务 → 深链到 /practice?focusWord= 复习原词（非完成按钮）。
                const isReviewLink = !!task.reviewWordText && !isCompleted;
                const cardClass = `card-kids flex items-center gap-4 text-left touch-target transition-all ${
                  isCompleted
                    ? "opacity-80 bg-[var(--color-primary-wash)] cursor-default"
                    : "cursor-pointer hover:shadow-card-hover"
                }`;
                const body = (
                  <>
                    <div
                      className={`flex items-center justify-center w-14 h-14 rounded-full ${
                        isCompleted
                          ? "bg-[var(--color-success)] text-white"
                          : "bg-kids-secondary text-kids-text"
                      }`}
                    >
                      {isCompleted ? (
                        <Check size={26} strokeWidth={3} />
                      ) : (
                        <Icon size={26} />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-kids-title">{task.title}</p>
                      <p className="text-sm text-kids-muted">{task.description}</p>
                    </div>
                    {isCompleted && (
                      <Star
                        size={20}
                        className="ml-auto text-kids-sun fill-kids-sun animate-star-pop"
                      />
                    )}
                  </>
                );
                if (isSpeechLink) {
                  return (
                    <Link
                      key={task.id}
                      href={speakingTaskHref(task.id)}
                      className={cardClass}
                      data-task-id={task.id}
                      data-speech-link="true"
                      aria-label={t("openSpeakingPractice", { title: task.title })}
                    >
                      {body}
                    </Link>
                  );
                }
                if (isReviewLink) {
                  return (
                    <Link
                      key={task.id}
                      href={`/practice?focusWord=${encodeURIComponent(task.reviewWordText!)}`}
                      className={cardClass}
                      data-task-id={task.id}
                      data-review-word-id={task.reviewWordText}
                      data-component="ReviewTaskLink"
                      aria-label={t("reviewWordAria", { title: task.title })}
                    >
                      {body}
                    </Link>
                  );
                }
                return (
                  <button
                    key={task.id}
                    onClick={() => handleCompleteTask(task)}
                    disabled={isCompleted || completingId === task.id}
                    className={cardClass}
                    aria-pressed={isCompleted}
                    data-task-id={task.id}
                  >
                    {body}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Course Progress Cards */}
          <section data-component="CourseProgress">
            <h2 className="mb-4">{t("myCourses")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {courses.map((course) => (
                <Link
                  key={course.id}
                  href={`/course?id=${course.id}`}
                  className="card-kids flex flex-col items-center gap-3 text-center hover:shadow-card-hover group"
                >
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                    style={{ backgroundColor: `${course.color}33` }}
                  >
                    {course.icon === "paw" && "🐾"}
                    {course.icon === "palette" && "🎨"}
                    {course.icon === "apple" && "🍎"}
                    {course.icon === "leaf" && "🌿"}
                  </div>
                  <div className="w-full flex items-center justify-center gap-3">
                    <span className="text-2xl font-extrabold text-kids-title">
                      {course.totalLessons}
                    </span>
                    <span className="text-xs text-kids-muted">{t("lessons")}</span>
                  </div>
                  <div>
                    <p className="font-bold text-kids-title group-hover:text-[var(--seed-primary)] transition-colors">
                      {course.title}
                    </p>
                    <p className="text-xs text-kids-muted">{t("courseWords", { count: course.wordCount })}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <AuthGate>
      <HomeContent />
    </AuthGate>
  );
}
