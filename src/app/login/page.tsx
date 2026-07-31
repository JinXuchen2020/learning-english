"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Mascot from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { LogIn, UserPlus, Sparkles } from "lucide-react";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError("Please fill in your username and password.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password, nickname.trim() || undefined);
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 409
            ? "That username is already taken. Try another!"
            : err.status === 401
            ? "Oops! Wrong username or password."
            : err.message
        );
      } else {
        setError("Could not reach the server. Is the API running?");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-[80vh] flex flex-col items-center justify-center"
      data-component="LoginPage"
    >
      <div className="w-full max-w-md card-kids space-y-6" data-component="AuthCard">
        {/* Mascot greeting */}
        <div className="flex flex-col items-center text-center gap-2">
          <Mascot expression="happy" size="large" />
          <h1 className="text-3xl">
            {mode === "login" ? "Welcome Back!" : "Join Foxy!"}
          </h1>
          <p className="text-kids-muted">
            {mode === "login"
              ? "Sign in to keep learning with Foxy."
              : "Create an account and start your adventure."}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 bg-kids-secondary rounded-control p-1.5">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`rounded-control py-2.5 font-bold transition-all touch-target ${
              mode === "login"
                ? "bg-white text-[var(--seed-primary)] shadow-sm"
                : "text-kids-muted"
            }`}
            aria-pressed={mode === "login"}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`rounded-control py-2.5 font-bold transition-all touch-target ${
              mode === "register"
                ? "bg-white text-[var(--seed-primary)] shadow-sm"
                : "text-kids-muted"
            }`}
            aria-pressed={mode === "register"}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label
                htmlFor="nickname"
                className="block text-sm font-bold text-kids-title mb-1.5"
              >
                Nickname
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="What should Foxy call you?"
                className="w-full rounded-control border-2 border-kids-secondary bg-white px-4 py-3 text-kids-title font-semibold focus:border-[var(--seed-primary)] focus:outline-none touch-target"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="username"
              className="block text-sm font-bold text-kids-title mb-1.5"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              autoComplete="username"
              className="w-full rounded-control border-2 border-kids-secondary bg-white px-4 py-3 text-kids-title font-semibold focus:border-[var(--seed-primary)] focus:outline-none touch-target"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-bold text-kids-title mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your secret password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full rounded-control border-2 border-kids-secondary bg-white px-4 py-3 text-kids-title font-semibold focus:border-[var(--seed-primary)] focus:outline-none touch-target"
            />
          </div>

          {error && (
            <p
              className="text-sm font-bold text-[var(--color-danger)] bg-[var(--color-danger)]/10 rounded-control px-4 py-2.5"
              role="alert"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="success"
            className="w-full justify-center"
            disabled={loading}
          >
            {loading ? (
              "One moment..."
            ) : mode === "login" ? (
              <>
                <LogIn size={22} className="mr-2" />
                Sign In
              </>
            ) : (
              <>
                <UserPlus size={22} className="mr-2" />
                Create Account
              </>
            )}
          </Button>
        </form>

        <p className="flex items-center justify-center gap-1.5 text-xs text-kids-muted text-center">
          <Sparkles size={14} className="text-kids-sun" />
          Ask a grown-up to help you set up your account.
        </p>
      </div>
    </div>
  );
}
