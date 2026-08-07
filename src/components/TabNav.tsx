"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, Gamepad2, Sparkles, Mic, MessageCircle } from "lucide-react";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/course", label: "Courses", icon: BookOpen },
  { href: "/plan", label: "Plan", icon: Sparkles },
  { href: "/practice", label: "Practice", icon: Gamepad2 },
  { href: "/speech", label: "Speak", icon: Mic },
  { href: "/chat", label: "Chat", icon: MessageCircle },
];

export default function TabNav() {
  const pathname = usePathname();

  // The login screen is full-bleed and has no tab bar.
  if (pathname === "/login") {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-kids-card/95 backdrop-blur-sm rounded-t-[28px] shadow-[0_-4px_20px_rgba(107,92,67,0.1)]"
      data-component="TabNav"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around max-w-3xl mx-auto px-4 py-2">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-1 rounded-control px-6 py-3 transition-all duration-200 touch-target-lg ${
                isActive
                  ? "bg-[var(--seed-primary)] text-white shadow-button scale-105"
                  : "text-kids-muted hover:text-kids-title hover:bg-kids-secondary"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={26} strokeWidth={2.2} />
              <span className="text-xs font-bold tracking-wide">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
