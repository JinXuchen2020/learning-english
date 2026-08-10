"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = {
  zh: "中文",
  en: "EN",
};

export default function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div
      className="fixed top-3 right-3 z-[60] flex items-center gap-1 rounded-full bg-white/85 backdrop-blur px-2 py-1 shadow-sm text-xs font-bold"
      data-component="LocaleSwitcher"
      aria-label="Language switcher"
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => router.replace(pathname, { locale: l })}
          className={`px-2 py-0.5 rounded-full transition-colors ${
            l === locale
              ? "bg-[var(--seed-primary)] text-white"
              : "text-kids-muted hover:text-kids-title"
          }`}
          aria-pressed={l === locale}
        >
          {LABELS[l] ?? l}
        </button>
      ))}
    </div>
  );
}
