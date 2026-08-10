"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Home, BookOpen, Gamepad2, Gift, BarChart3, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type TabDef = {
  /** 实际跳转链接（可带 hash）。 */
  href: string;
  /** 用于 active 匹配的纯净路径（不含 query/hash）。 */
  path: string;
  key: string;
  icon: typeof Home;
  /** 精确匹配（用于首页 `/`）。 */
  exact?: boolean;
  /** 该 tab 对应的 hash（用于同路径多 tab，如 /parent 概览 vs 设置）。 */
  hash?: string;
};

/** 孩子端：学习相关 4 个主入口。 */
const childTabs: TabDef[] = [
  { href: "/", path: "/", key: "home", icon: Home, exact: true },
  { href: "/course", path: "/course", key: "courses", icon: BookOpen },
  { href: "/practice", path: "/practice", key: "practice", icon: Gamepad2 },
  { href: "/rewards", path: "/rewards", key: "rewards", icon: Gift },
];

/** 家长端：概览 + 周报 + 设置 3 个主入口。 */
const parentTabs: TabDef[] = [
  { href: "/parent", path: "/parent", key: "parentHome", icon: Home },
  { href: "/parent-report", path: "/parent-report", key: "report", icon: BarChart3 },
  {
    href: "/parent#settings",
    path: "/parent",
    key: "parentSettings",
    icon: ShieldCheck,
    hash: "#settings",
  },
];

export default function TabNav() {
  const pathname = usePathname();
  const t = useTranslations("TabNav");
  const { isParent } = useAuth();

  // 用 hash 区分 /parent 的「概览」与「设置」两个 tab，
  // 避免 useSearchParams() 触发 next build 的 Suspense 边界要求。
  const [hash, setHash] = useState("");
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // 登录页全屏，无底栏。
  if (pathname === "/login") {
    return null;
  }

  const tabs = isParent ? parentTabs : childTabs;

  const isActive = (tab: TabDef) => {
    if (tab.path === "/parent-report") {
      return pathname === "/parent-report" || pathname.startsWith("/parent-report/");
    }
    if (tab.path === "/parent") {
      const onSettings = hash === "#settings";
      if (tab.hash === "#settings") return pathname === "/parent" && onSettings;
      // 概览 tab：在 /parent 且不在设置视图时高亮。
      return pathname === "/parent" && !onSettings;
    }
    if (tab.exact) return pathname === tab.path;
    return pathname === tab.path || pathname.startsWith(tab.path + "/");
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-kids-card/95 backdrop-blur-sm rounded-t-[28px] shadow-[0_-4px_20px_rgba(107,92,67,0.1)]"
      data-component="TabNav"
      aria-label={t("mainNav")}
    >
      <div className="flex items-center justify-around max-w-3xl mx-auto px-4 py-2">
        {tabs.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-1 rounded-control px-6 py-3 transition-all duration-200 touch-target-lg ${
                active
                  ? "bg-[var(--seed-primary)] text-white shadow-button scale-105"
                  : "text-kids-muted hover:text-kids-title hover:bg-kids-secondary"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={26} strokeWidth={2.2} />
              <span className="text-xs font-bold tracking-wide">
                {t(tab.key)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
