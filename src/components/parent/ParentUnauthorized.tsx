"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Mascot from "@/components/Mascot";

/**
 * 家长专属页（概览 /parent 与 控制面板 /parent/settings 共用）的权限拒绝视图：
 * 非家长账号访问时展示，并提供一个返回首页的入口。
 * 抽成共享组件，避免两个路由各自内联重复 JSX。
 */
export default function ParentUnauthorized() {
  const t = useTranslations("Parent");
  return (
    <div
      className="flex flex-col items-center justify-center py-16 gap-4"
      data-component="ParentUnauthorized"
    >
      <Mascot expression="encouraging" size="large" />
      <h1 className="text-xl font-extrabold text-kids-title">{t("parentOnly")}</h1>
      <p className="text-kids-muted text-center max-w-md">{t("parentOnlyHint")}</p>
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
