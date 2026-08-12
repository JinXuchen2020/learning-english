"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * 角色化路由守卫（AI-707）：孩子账号只能进学习类页面，家长账号只能进家长类页面。
 * 越权时重定向到各自首页，落实「不同种类账号显示不同页面」。
 */

// 仅孩子端可访问的学习类路由。
const CHILD_ONLY = [
  "/",
  "/course",
  "/plan",
  "/word-cards",
  "/practice",
  "/speech",
  "/chat",
  "/picture-book",
  "/scan",
  "/rewards",
];

// 家长模式页（AI-702）：孩子账号经 PIN 门禁解锁、家长账号直接访问，二者皆可到达。
// 访问管控交由页面自身（PIN 门禁 / 家长会话令牌），因此【不】纳入下方角色重定向——
// 否则会把孩子账号从 /parent、/parent-report 误弹回首页，导致整个家长模式不可用。
const PARENT_MODE = ["/parent", "/parent-report"];

// 仅「家长账号」可访问的严格家长页。当前没有脱离家长模式页的独立严格家长页
// （家长模式页已单列于 PARENT_MODE，孩子亦可经 PIN 解锁），故此处为空。
const PARENT_ONLY: string[] = [];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function RoleGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isParent, isChild, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return; // 未登录由 AuthGate 处理
    // 家长账号误入学习类页面 → 拉回家长首页；家长模式页（PARENT_MODE）对孩子与家长
    // 双开，不在此拦截。孩子账号不会被弹离家长模式页。
    if (isParent && matches(pathname, CHILD_ONLY)) {
      router.replace("/parent");
    }
  }, [pathname, isParent, isChild, isAuthenticated, router]);

  return <>{children}</>;
}
