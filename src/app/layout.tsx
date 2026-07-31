import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import TabNav from "@/components/TabNav";
import { AuthProvider } from "@/lib/auth-context";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fox English — Learn with Foxy!",
  description:
    "A fun English learning app for kids aged 5-10. Learn words, practice pronunciation, and earn stars with your fox friend!",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className="min-h-screen bg-seed-bg pb-24">
        <AuthProvider>
          <main className="max-w-5xl mx-auto px-6 pt-6">{children}</main>
          <TabNav />
        </AuthProvider>
      </body>
    </html>
  );
}
