import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "../globals.css";
import TabNav from "@/components/TabNav";
import RoleGuard from "@/components/RoleGuard";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { AuthProvider } from "@/lib/auth-context";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-nunito",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Fox English — Learn with Foxy!",
  description:
    "A fun English learning app for kids aged 5-10. Learn words, practice pronunciation, and earn stars with your fox friend!",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;

  if (!routing.locales.includes(locale as AppLocale)) {
    notFound();
  }

  // Enable static rendering for this locale.
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale} className={nunito.variable}>
      <body className="min-h-screen bg-seed-bg pb-32">
        <NextIntlClientProvider messages={messages}>
          <LocaleSwitcher />
          <AuthProvider>
            <RoleGuard>
              <main className="mx-auto w-full max-w-5xl px-5 pt-6 sm:px-6 lg:max-w-6xl xl:max-w-7xl">
            {children}
          </main>
              <TabNav />
            </RoleGuard>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
