"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import type { DailyTask } from "@/lib/types";
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
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [courseData, taskData, progressData] = await Promise.all([
        api.getCourses(),
        api.getDailyTasks(),
        api.getProgress(),
      ]);
      setCourses(courseData);
      setTasks(taskData);
      setProgress(progressData);
    } catch (err) {
      console.error("Failed to load home data", err);
    } finally {
      setLoading(false);
    }
  }, []);

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
        const fresh = await api.getProgress();
        setProgress(fresh);
      } catch (err) {
        console.error("Failed to complete task", err);
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
                return (
                  <button
                    key={task.id}
                    onClick={() => handleCompleteTask(task)}
                    disabled={task.completed || completingId === task.id}
                    className={`card-kids flex items-center gap-4 text-left touch-target transition-all ${
                      task.completed
                        ? "opacity-80 bg-[var(--color-primary-wash)] cursor-default"
                        : "cursor-pointer hover:shadow-card-hover"
                    }`}
                    aria-pressed={task.completed}
                  >
                    <div
                      className={`flex items-center justify-center w-14 h-14 rounded-full ${
                        task.completed
                          ? "bg-[var(--color-success)] text-white"
                          : "bg-kids-secondary text-kids-text"
                      }`}
                    >
                      {task.completed ? (
                        <Check size={26} strokeWidth={3} />
                      ) : (
                        <Icon size={26} />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-kids-title">{task.title}</p>
                      <p className="text-sm text-kids-muted">{task.description}</p>
                    </div>
                    {task.completed && (
                      <Star
                        size={20}
                        className="ml-auto text-kids-sun fill-kids-sun animate-star-pop"
                      />
                    )}
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
