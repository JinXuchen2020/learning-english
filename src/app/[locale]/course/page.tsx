"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import * as api from "@/lib/api";
import { logger } from "@/lib/logger";
import { Lock, CheckCircle2, PlayCircle, Clock, BookOpen, ArrowLeft } from "lucide-react";

const stateConfig = {
  completed: {
    icon: CheckCircle2,
    color: "text-[var(--color-success)]",
    bg: "bg-[var(--color-primary-wash)]",
  },
  available: {
    icon: PlayCircle,
    color: "text-[var(--seed-primary)]",
    bg: "bg-white",
  },
  locked: {
    icon: Lock,
    color: "text-kids-disabled",
    bg: "bg-kids-secondary/50",
  },
};

function courseEmoji(icon: string) {
  if (icon === "paw") return "🐾";
  if (icon === "palette") return "🎨";
  if (icon === "apple") return "🍎";
  if (icon === "leaf") return "🌿";
  return "📘";
}

/* ------------------------- Course list ------------------------- */

function CourseList() {
  const [courses, setCourses] = useState<api.CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("Course");

  useEffect(() => {
    api
      .getCourses()
      .then(setCourses)
      .catch((err) => logger.error("Failed to load courses", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Mascot expression="thinking" size="medium" />
        <p className="text-kids-muted font-semibold">{t("findingCourses")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-component="CourseList">
      <h1>{t("chooseCourse")}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course) => (
          <Link
            key={course.id}
            href={`/course?id=${course.id}`}
            className="rounded-panel bg-kids-card shadow-card p-6 flex items-center gap-4 hover:shadow-card-hover group"
          >
            <div
              className="w-16 h-16 rounded-panel flex items-center justify-center text-3xl shrink-0"
              style={{ backgroundColor: `${course.color}33` }}
            >
              {courseEmoji(course.icon)}
            </div>
            <div className="flex-1">
              <p className="font-bold text-kids-title group-hover:text-[var(--seed-primary)] transition-colors">
                {course.title}
              </p>
              <p className="text-sm text-kids-muted">{course.description}</p>
              <p className="text-xs text-kids-muted mt-1">
                {t("courseMeta", { lessons: course.totalLessons, words: course.wordCount })}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ------------------------ Course detail ------------------------ */

function CourseDetail({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<api.CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("Course");

  const load = useCallback(() => {
    setLoading(true);
    api
      .getCourse(courseId)
      .then(setCourse)
      .catch((err) => logger.error("Failed to load course", err))
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !course) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Mascot expression="thinking" size="medium" />
        <p className="text-kids-muted font-semibold">{t("openingCourse")}</p>
      </div>
    );
  }

  const progress = Math.round(
    (course.completedLessons / Math.max(course.totalLessons, 1)) * 100
  );
  const nextLesson =
    course.lessons.find((l) => l.state === "available") || course.lessons[0];

  return (
    <div className="space-y-8" data-component="CourseDetail">
      <Link
        href="/course"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-kids-muted hover:text-[var(--seed-primary)]"
      >
        <ArrowLeft size={18} />
        {t("allCourses")}
      </Link>

      {/* Course Header */}
      <Card className="flex items-center gap-6" data-component="CourseHeader">
        <div
          className="w-20 h-20 rounded-panel flex items-center justify-center text-4xl shrink-0"
          style={{ backgroundColor: `${course.color}33` }}
        >
          {courseEmoji(course.icon)}
        </div>
        <div className="flex-1">
          <h1>{course.title}</h1>
          <p className="text-kids-muted mt-1">{course.description}</p>
          <div className="flex items-center gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-kids-text bg-kids-secondary rounded-control px-3 py-1.5">
              <BookOpen size={16} />
              {t("wordsCount", { count: course.wordCount })}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-kids-text bg-kids-secondary rounded-control px-3 py-1.5">
              <Clock size={16} />~
              {t("minutes", { count: course.lessons.reduce((sum, l) => sum + l.estimatedMinutes, 0) })}
            </span>
          </div>
        </div>
        <div className="w-40 shrink-0">
          <div className="flex justify-between text-sm font-bold mb-2">
            <span className="text-kids-muted">{t("progress")}</span>
            <span className="text-[var(--color-success)]">{progress}%</span>
          </div>
          <Progress
            value={progress}
            className="h-4"
            indicatorClassName="bg-[var(--color-success)]"
          />
          <p className="text-xs text-kids-muted mt-1.5 text-center">
            {t("lessonsProgress", { done: course.completedLessons, total: course.totalLessons })}
          </p>
        </div>
      </Card>

      {/* Lesson List */}
      <section data-component="LessonList">
        <SectionTitle title={t("lessonsHeading")} />
        <div className="space-y-3">
          {course.lessons.map((lesson, index) => {
            const config = stateConfig[lesson.state];
            const Icon = config.icon;
            const isClickable = lesson.state !== "locked";
            const stateLabel =
              lesson.state === "completed"
                ? t("stateDone")
                : lesson.state === "available"
                ? t("stateStart")
                : t("stateLocked");

            const content = (
              <>
                <div
                  className={`flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-sm ${config.color}`}
                >
                  <Icon size={24} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-kids-title">
                    {index + 1}. {lesson.title}
                  </p>
                  <p className="text-sm text-kids-muted">
                    {t("lessonMeta", { words: lesson.wordCount, minutes: lesson.estimatedMinutes })}
                  </p>
                </div>
                <span
                  className={`text-sm font-bold rounded-control px-4 py-2 ${
                    lesson.state === "completed"
                      ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
                      : lesson.state === "available"
                      ? "bg-[var(--seed-primary)]/15 text-[var(--seed-primary)]"
                      : "bg-kids-secondary text-kids-disabled"
                  }`}
                >
                  {stateLabel}
                </span>
              </>
            );

            if (isClickable) {
              return (
                <Link
                  key={lesson.id}
                  href={`/practice?lessonId=${lesson.id}&courseId=${course.id}`}
                  className={`rounded-panel bg-kids-card shadow-card p-6 flex items-center gap-4 !py-4 ${config.bg} hover:shadow-card-hover focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--seed-accent)]`}
                  aria-label={`${lesson.title} — ${stateLabel}`}
                >
                  {content}
                </Link>
              );
            }

            return (
              <div
                key={lesson.id}
                className={`rounded-panel bg-kids-card shadow-card p-6 flex items-center gap-4 !py-4 ${config.bg} opacity-70`}
                aria-disabled="true"
              >
                {content}
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA + Mascot Tip */}
      {nextLesson && (
        <Card
          className="flex items-center gap-6 bg-gradient-to-r from-[var(--color-primary-wash)] to-[var(--seed-surface)]"
          data-component="CourseCTA"
        >
          <Mascot expression="encouraging" size="medium" />
          <div className="flex-1">
            <p className="font-bold text-kids-title text-lg">
              {t("doingGreat")}
            </p>
            <p className="text-kids-muted text-sm">
              {t("nextUp", { title: nextLesson.title, count: nextLesson.wordCount })}
            </p>
          </div>
          <Button variant="success" className="shrink-0" asChild>
            <Link href={`/practice?lessonId=${nextLesson.id}&courseId=${course.id}`}>
              <PlayCircle size={22} className="mr-2" />
              {t("continueLearning")}
            </Link>
          </Button>
        </Card>
      )}
    </div>
  );
}

function CoursePageInner() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get("id");

  return courseId ? (
    <CourseDetail courseId={courseId} />
  ) : (
    <CourseList />
  );
}

export default function CoursePage() {
  return (
    <AuthGate>
      <CoursePageInner />
    </AuthGate>
  );
}
