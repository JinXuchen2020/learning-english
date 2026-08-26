"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { MessageCircle, CalendarDays, BookMarked, Mic, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

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

  const items: Item[] = [
    { href: "/chat", icon: MessageCircle, label: t("chat") },
    { href: "/plan", icon: CalendarDays, label: t("plan") },
    { href: "/word-cards", icon: BookMarked, label: t("wordCards") },
    { href: "/speech", icon: Mic, label: t("speech") },
  ];

  // child-only 语义不变：调用方（TabNav）仅在 child 端渲染本组件。
  // 弹层语义（焦点陷阱 / Esc / 焦点还原 / 遮罩关闭）统一交给 Dialog 原语收口。
  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="bottom"
      zIndex="z-[70]"
      dataComponent="MoreDrawer"
      aria-label={t("title")}
      panelClassName="w-full max-w-3xl rounded-t-[28px] bg-seed-bg p-6 pb-10 shadow-[0_-4px_20px_rgba(107,92,67,0.2)]"
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
    </Dialog>
  );
}
