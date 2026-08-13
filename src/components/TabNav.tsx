"use client";

import { useEffect, useState } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  BookOpen,
  Gamepad2,
  Gift,
  BarChart3,
  ShieldCheck,
  LayoutGrid,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import MoreDrawer from "./MoreDrawer";

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

/** child 端「更多」抽屉收纳的二级路由（孤儿页接入口）。 */
const MORE_ROUTES = ["/chat", "/plan", "/word-cards", "/speech"];

/** 孩子端：学习相关 4 个主入口 + 第 5 个「更多」抽屉。 */
const childTabs: TabDef[] = [
  { href: "/", path: "/", key: "home", icon: Home, exact: true },
  { href: "/course", path: "/course", key: "courses", icon: BookOpen },
  { href: "/practice", path: "/practice", key: "practice", icon: Gamepad2 },
  { href: "/rewards", path: "/rewards", key: "rewards", icon: Gift },
  { href: "#more", path: "#more", key: "more", icon: LayoutGrid },
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
  const router = useRouter();
  const t = useTranslations("TabNav");
  const { isParent, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  // 任意登录账号（child / parent）皆可从此处退出登录。登录页无底栏，不受影响。
  const handleSignOut = () => {
    logout();
    router.push("/login");
  };

  // 用 hash 区分 /parent 的「概览」与「设置」两个 tab，
  // 避免 useSearchParams() 触发 next build 的 Suspense 边界要求。
  const [hash, setHash] = useState("");
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // 路由变化（含从抽屉点卡片导航）时关闭「更多」抽屉。
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // 登录页全屏，无底栏。
  if (pathname === "/login") {
    return null;
  }

  const tabs = isParent ? parentTabs : childTabs;

  const isActive = (tab: TabDef) => {
    if (tab.key === "more") {
      return (
        MORE_ROUTES.includes(pathname) ||
        MORE_ROUTES.some((r) => pathname.startsWith(r + "/"))
      );
    }
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
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-[60] mb-[env(safe-area-inset-bottom)] bg-kids-card border-t border-kids-secondary/50 rounded-t-[28px] shadow-[0_-6px_24px_rgba(107,92,67,0.15)]"
        data-component="TabNav"
        aria-label={t("mainNav")}
      >
        <div className="flex items-center overflow-x-auto scrollbar-hide max-w-3xl mx-auto px-2 sm:px-4 py-2">
          {tabs.map((tab) => {
            const active = isActive(tab);
            const Icon = tab.icon;

            // 「更多」是按钮而非链接：打开底部抽屉，不导航。
            if (tab.key === "more") {
              return (
                <button
                  key="more"
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={moreOpen}
                  aria-label={t("more")}
                  className={`flex flex-col flex-1 min-w-[64px] sm:min-w-[72px] items-center justify-center gap-1 rounded-control px-1 sm:px-2 py-3 transition-all duration-200 touch-target-lg ${
                    active
                      ? "bg-[var(--seed-primary)] text-white shadow-button scale-105"
                      : "text-kids-muted hover:text-kids-title hover:bg-kids-secondary"
                  }`}
                >
                  <Icon size={26} strokeWidth={2.2} />
                  <span className="text-[10px] sm:text-xs font-bold tracking-wide whitespace-nowrap">
                    {t("more")}
                  </span>
                </button>
              );
            }

            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={`flex flex-col flex-1 min-w-[64px] sm:min-w-[72px] items-center justify-center gap-1 rounded-control px-1 sm:px-2 py-3 transition-all duration-200 touch-target-lg ${
                  active
                    ? "bg-[var(--seed-primary)] text-white shadow-button scale-105"
                    : "text-kids-muted hover:text-kids-title hover:bg-kids-secondary"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={26} strokeWidth={2.2} />
                <span className="text-[10px] sm:text-xs font-bold tracking-wide whitespace-nowrap">
                  {t(tab.key)}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={handleSignOut}
            aria-label={t("logout")}
            data-component="SignOutBtn"
            className="flex flex-col flex-1 min-w-[64px] sm:min-w-[72px] items-center justify-center gap-1 rounded-control px-1 sm:px-2 py-3 transition-all duration-200 touch-target-lg text-kids-muted hover:text-[var(--color-danger)] hover:bg-kids-pink/20"
          >
            <LogOut size={26} strokeWidth={2.2} />
            <span className="text-[10px] sm:text-xs font-bold tracking-wide whitespace-nowrap">{t("logout")}</span>
          </button>
        </div>
      </nav>
      {!isParent && (
        <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} />
      )}
    </>
  );
}
