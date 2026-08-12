"use client";

import React, { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import Mascot from "@/components/Mascot";

/**
 * Guards authenticated screens. The session is rehydrated from localStorage on
 * mount (see AuthProvider), so a hard refresh keeps the user logged in. While
 * the session is still rehydrating (or genuinely unauthenticated) we show a
 * friendly loading state; only after rehydration do we bounce to /login.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until AuthProvider has restored (or confirmed absence of) a session,
    // otherwise a refresh would flash a redirect to /login before restoring.
    if (isInitialized && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isInitialized, isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 text-center">
        <Mascot expression="encouraging" size="large" />
        <p className="text-kids-muted font-semibold">
          Let&apos;s sign in to keep learning...
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
