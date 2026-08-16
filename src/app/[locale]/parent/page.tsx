"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { logger } from "@/lib/logger";
import type { ChildProgressSummary } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressRing } from "@/components/ui/progress-ring";
import Mascot from "@/components/Mascot";
import ParentUnauthorized from "@/components/parent/ParentUnauthorized";

/** 概览页「待审批」计数：轻量拉取，仅展示数字，链接到设置页审批区。 */
function PendingCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .getPendingApprovals("pending")
      .then((list) => {
        if (active) setCount(list.length);
      })
      .catch((e) => logger.error("load pending count", e));
    return () => {
      active = false;
    };
  }, []);
  return <span className="text-2xl font-extrabold text-kids-title">{count}</span>;
}

function ParentOverviewInner() {
  const { user } = useAuth();
  const t = useTranslations("Parent");

  if (user?.role !== "parent") {
    return <ParentUnauthorized />;
  }

  return (
    <div className="space-y-6" data-component="ParentOverviewPanel">
      {/* 家长首页概览（TabNav 「概览」tab 对应 /parent） */}
      <section className="space-y-4" data-component="ParentOverview">
        <div className="card-kids bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)] p-5">
          <h1 className="text-2xl font-extrabold text-kids-title">
            {t("overviewGreeting", { name: user?.nickname || user?.username || "" })}
          </h1>
          <p className="text-kids-muted mt-1">{t("overviewSubtitle")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/parent/settings#approvals"
            className="card-kids p-4 flex flex-col gap-1 hover:opacity-90"
            data-component="OverviewPending"
          >
            <span className="text-sm text-kids-muted">{t("statPending")}</span>
            <PendingCount />
          </Link>
          <Link
            href="/parent-report"
            className="card-kids p-4 flex flex-col gap-1 hover:opacity-90"
            data-component="OverviewReport"
          >
            <span className="text-sm text-kids-muted">{t("statReport")}</span>
            <span className="text-lg font-extrabold text-kids-title">{t("viewReport")}</span>
          </Link>
          <Link
            href="/parent/settings"
            className="card-kids p-4 flex flex-col gap-1 hover:opacity-90"
            data-component="OverviewSettings"
          >
            <span className="text-sm text-kids-muted">{t("statSettings")}</span>
            <span className="text-lg font-extrabold text-kids-title">{t("goSettings")}</span>
          </Link>
        </div>
      </section>

      {/* AI-712：家庭总览（多孩子进度卡片网格） */}
      <DashboardSection />
    </div>
  );
}

/* ----------------------- Family Dashboard (AI-712) ----------------------- */

/**
 * 家长「家庭总览」：卡片网格展示名下每个孩子的进度摘要
 * （昵称/等级/星星/连续天数/计划完成度/独立配置标识），复用 cozy-kids
 * `Card` / `Badge` / `ProgressRing` 原语。点开卡片进入
 * `/parent/children/:childId` 详情页。无孩子时引导去添加孩子。
 */
function DashboardSection() {
  const t = useTranslations("Parent");
  const [children, setChildren] = useState<ChildProgressSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getDashboard()
      .then((list) => {
        if (active) setChildren(list);
      })
      .catch((e) => logger.error("load dashboard", e))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="space-y-3" data-component="FamilyDashboard">
      <div className="flex items-center gap-3">
        <Mascot expression="happy" size="medium" />
        <div className="flex-1">
          <h2 className="text-lg font-extrabold text-kids-title">{t("dashboardTitle")}</h2>
          <p className="text-sm text-kids-muted">{t("dashboardSubtitle")}</p>
        </div>
        <Link
          href="/parent/settings"
          className="shrink-0 rounded-control bg-kids-secondary px-3 py-2 text-sm font-bold text-kids-title hover:bg-[var(--seed-primary)] hover:text-white transition-colors"
          data-component="DashboardManageLink"
        >
          {t("manageFamily")} →
        </Link>
      </div>

      {loading ? (
        <p className="card-kids text-center text-kids-muted py-8" data-component="DashboardLoading">
          {t("childrenLoading")}
        </p>
      ) : children.length === 0 ? (
        <div
          className="card-kids text-center text-kids-muted py-8 space-y-3"
          data-component="DashboardEmpty"
        >
          <p>{t("noChildrenDashboard")}</p>
          <Link
            href="/parent/settings"
            className="inline-block rounded-control bg-[var(--seed-primary)] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            data-component="DashboardAddChildLink"
          >
            {t("goToAddChild")}
          </Link>
        </div>
      ) : (
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
          data-component="DashboardGrid"
        >
          {children.map((c) => (
            <li key={c.childId} data-component="DashboardChildCard" data-child-id={c.childId}>
              <Link
                href={`/parent/children/${c.childId}`}
                className="block h-full rounded-panel bg-kids-card shadow-card p-6 hover:opacity-90"
                data-component="DashboardChildLink"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-extrabold text-kids-title truncate">{c.nickname}</h3>
                  {c.hasProviderOverride && (
                    <Badge variant="primary" size="sm" data-component="DashboardOverrideBadge">
                      {t("providerOverrideBadge")}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-3">
                  <ProgressRing
                    progress={Math.round(c.planCompletionRatio * 100)}
                    size={64}
                    color="var(--seed-primary)"
                    label={`${Math.round(c.planCompletionRatio * 100)}%`}
                  />
                  <div className="flex flex-col gap-1 text-sm">
                    <span className="text-kids-muted">
                      {t("childCardLevel")} <b className="text-kids-title">{c.level}</b>
                    </span>
                    <span className="text-kids-sun font-bold">
                      ★ {c.totalStars}
                    </span>
                    <span className="text-kids-muted">
                      {t("childCardStreak")} <b className="text-kids-title">{c.streakDays}</b>
                    </span>
                  </div>
                </div>

                <div className="mt-3 text-sm font-bold text-[var(--seed-primary)]">
                  {t("viewDetail")} →
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ParentOverviewPage() {
  return (
    <AuthGate>
      <ParentOverviewInner />
    </AuthGate>
  );
}
