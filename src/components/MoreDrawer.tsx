"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { MessageCircle, CalendarDays, BookMarked, Mic, X } from "lucide-react";

type Item = {
  href: string;
  icon: typeof MessageCircle;
  /** 字面量 i18n key（i18n-messages.spec 扫描要求），勿用模板字符串。 */
  label: string;
};

export default function MoreDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("MoreDrawer");

  // Esc 关闭抽屉。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const items: Item[] = [
    { href: "/chat", icon: MessageCircle, label: t("chat") },
    { href: "/plan", icon: CalendarDays, label: t("plan") },
    { href: "/word-cards", icon: BookMarked, label: t("wordCards") },
    { href: "/speech", icon: Mic, label: t("speech") },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40"
      onClick={onClose}
      data-component="MoreDrawer"
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
    >
      <div
        className="w-full max-w-3xl rounded-t-[28px] bg-seed-bg p-6 pb-10 shadow-[0_-4px_20px_rgba(107,92,67,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-kids-title">{t("title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-kids-secondary text-kids-title transition-colors hover:bg-kids-orange/20"
          >
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                data-component="MoreDrawerCard"
                className="card-kids flex flex-col items-center gap-3 py-6 text-center transition-transform hover:scale-[1.02] active:scale-95"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--seed-primary)]/15 text-[var(--seed-primary)]">
                  <Icon size={28} />
                </span>
                <span className="font-bold text-kids-title">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
