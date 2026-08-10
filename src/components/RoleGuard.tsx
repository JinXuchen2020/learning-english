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

// 仅家长端可访问的路由。
const PARENT_ONLY = ["/parent", "/parent-report"];

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
    if (isParent && matches(pathname, CHILD_ONLY)) {
      router.replace("/parent");
    } else if (isChild && matches(pathname, PARENT_ONLY)) {
      router.replace("/");
    }
  }, [pathname, isParent, isChild, isAuthenticated, router]);

  return <>{children}</>;
}
