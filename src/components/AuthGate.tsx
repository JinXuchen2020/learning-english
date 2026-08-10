"use client";

import React, { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";
import Mascot from "@/components/Mascot";

/**
 * Guards authenticated screens. Because the session token lives in memory,
 * a hard refresh returns the user to the login page — acceptable for this
 * prototype. While unauthenticated we show a friendly loading state and
 * redirect to /login.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

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
