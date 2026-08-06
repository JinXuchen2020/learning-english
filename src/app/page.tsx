"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { isSpeakingTask, speakingTaskHref } from "@/lib/tasks";
import { logger } from "@/lib/logger";
import type { DailyTask, PlanStatusResponse } from "@/lib/types";
import { Headphones, Mic, Pencil, Star, Flame, Check } from "lucide-react";

const taskIcons = {
  headphones: Headphones,
  mic: Mic,
  pencil: Pencil,
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

function HomeContent() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<api.CourseSummary[]>([]);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [progress, setProgress] = useState<api.ProgressOverview | null>(null);
  const [planStatus, setPlanStatus] = useState<PlanStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [courseData, taskData, progressData, planData] = await Promise.all([
        api.getCourses(),
        api.getDailyTasks(),
        api.getProgress(),
        user ? api.getPlanStatus(user.id) : Promise.resolve(null),
      ]);
      setCourses(courseData);
      setTasks(taskData);
      setProgress(progressData);
      setPlanStatus(planData);
    } catch (err) {
      logger.error("Failed to load home data", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

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

  const doneCount = tasks.filter((t) => t.completed).length;
  const nickname = user?.nickname || "friend";

  return (
    <div className="space-y-8" data-component="Home">
      {/* Greeting Banner */}
      <section
        className="card-kids flex items-center gap-5 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
        data-component="GreetingBanner"
      >
        <Mascot expression="happy" size="large" />
        <div className="relative">
          <div className="bg-white rounded-panel rounded-bl-none px-5 py-3 shadow-sm">
            <p className="text-lg font-bold text-kids-title">
              Hi {nickname}! I&apos;m Foxy!
            </p>
            <p className="text-kids-text">Ready to learn some new words today?</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2 bg-kids-sun/20 rounded-control px-4 py-2">
            <Flame size={22} className="text-kids-orange" />
            <span className="font-extrabold text-kids-title">
              {progress?.streakDays ?? 0}
            </span>
            <span className="text-sm text-kids-muted">days</span>
          </div>
          <div className="flex items-center gap-2 bg-kids-sun/20 rounded-control px-4 py-2">
            <Star size={22} className="text-kids-sun fill-kids-sun" />
            <span className="font-extrabold text-kids-title">
              {progress?.totalStars ?? 0}
            </span>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Mascot expression="thinking" size="medium" />
          <p className="text-kids-muted font-semibold">Loading your learning...</p>
        </div>
      ) : (
        <>
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
                <h2 className="font-bold text-kids-title">本周学习计划</h2>
                <p className="text-kids-muted">
                  已完成 {planStatus.doneDays}/{planStatus.totalDays} 天
                </p>
              </div>
            </section>
          )}

          {/* Daily Tasks */}
          <section data-component="DailyTasks">
            <h2 className="mb-4 flex items-center gap-2">
              Today&apos;s Tasks
              <span className="text-sm font-semibold text-kids-muted bg-kids-secondary rounded-control px-3 py-1">
                {doneCount}/{tasks.length} done
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tasks.map((task) => {
                const Icon = taskIcons[task.icon] || Headphones;
                const isCompleted = task.completed;
                // 未完成的口语(mic)任务 → 深链到 /speech（AI-308）；其余维持一键完成。
                const isSpeechLink = isSpeakingTask(task) && !isCompleted;
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
                      aria-label={`Open speaking practice: ${task.title}`}
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
            <h2 className="mb-4">My Courses</h2>
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
                    <span className="text-xs text-kids-muted">lessons</span>
                  </div>
                  <div>
                    <p className="font-bold text-kids-title group-hover:text-[var(--seed-primary)] transition-colors">
                      {course.title}
                    </p>
                    <p className="text-xs text-kids-muted">{course.wordCount} words</p>
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
