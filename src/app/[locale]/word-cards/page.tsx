"use client";

import React, { useCallback, useEffect, useState } from "react";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { filterWordCards, countByStatus } from "@/lib/wordCards";
import { logger } from "@/lib/logger";
import type { WordCard, WordCardStatus } from "@/lib/types";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";

/** 审核状态 → 中文标签。 */
const STATUS_LABEL: Record<WordCardStatus, string> = {
  pending: "statusPending",
  approved: "statusApproved",
  rejected: "statusRejected",
};

/** 单词卡片页主体（已登录态由 `AuthGate` 包裹）。 */
function WordCardsInner() {
  const { user } = useAuth();
  const t = useTranslations("WordCards");
  const [interest, setInterest] = useState("");
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [cards, setCards] = useState<WordCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<WordCardStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listWordCards();
      setCards(list);
    } catch (err) {
      logger.error("Failed to load word cards", err);
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerate = useCallback(async () => {
    const text = interest.trim();
    if (!text) {
      setError(t('interestEmpty'));
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await api.generateWordCards({ interest: text, count });
      setDegraded(res.degraded);
      // 新卡片置顶（倒序展示），保持已有卡片状态
      setCards((prev) => [...res.cards, ...prev]);
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : t('genError');
      logger.error("Failed to generate word cards", err);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }, [interest, count]);

  const handleApprove = useCallback(async (id: string) => {
    try {
      const updated = await api.approveWordCard(id);
      setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      logger.error("Failed to approve word card", err);
      setError(t('approveError'));
    }
  }, []);

  const handleReject = useCallback(async (id: string) => {
    try {
      const updated = await api.rejectWordCard(id);
      setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      logger.error("Failed to reject word card", err);
      setError(t('rejectError'));
    }
  }, []);

  const visible = filterWordCards(cards, filter);
  const counts = countByStatus(cards);

  return (
    <div className="space-y-6" data-component="WordCards">
      {/* Header */}
      <section
        className="card-kids flex items-center gap-4 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
        data-component="WordCardHeader"
      >
        <Mascot expression="happy" size="large" />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-kids-title">{t('title')}</h1>
          <p className="text-kids-muted">{t('subtitle')}</p>
        </div>
      </section>

      {/* Generator */}
      <section className="card-kids space-y-3" data-component="WordCardGenerator">
        <label className="block font-bold text-kids-title" htmlFor="wc-interest">
          {t('interestLabel')}
        </label>
        <input
          id="wc-interest"
          data-component="InterestInput"
          className="w-full rounded-control border border-kids-secondary bg-white px-4 py-3 text-kids-text outline-none focus:border-[var(--seed-primary)]"
          placeholder="{t('interestPlaceholder')}"
          value={interest}
          maxLength={80}
          onChange={(e) => setInterest(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <label className="font-bold text-kids-title" htmlFor="wc-count">
            {t('countLabel')}
          </label>
          <input
            id="wc-count"
            type="number"
            min={1}
            max={10}
            data-component="CountInput"
            className="w-20 rounded-control border border-kids-secondary bg-white px-3 py-2 text-kids-text outline-none focus:border-[var(--seed-primary)]"
            value={count}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) setCount(Math.min(10, Math.max(1, v)));
            }}
          />
          <button
            data-component="GenerateButton"
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="ml-auto rounded-control bg-[var(--seed-primary)] px-5 py-3 font-bold text-white shadow-button transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {generating ? t('generating') : t('generate')}
          </button>
        </div>
        {degraded && (
          <p data-component="DegradedHint" className="text-sm text-kids-muted">
            {t('degradedHint')}
          </p>
        )}
      </section>

      {error && (
        <section
          className="card-kids flex items-center gap-3"
          data-component="WordCardError"
        >
          <Mascot expression="encouraging" size="medium" />
          <p className="text-kids-muted">{error}</p>
        </section>
      )}

      {/* Status filter */}
      <section className="flex flex-wrap gap-2" data-component="StatusFilter">
        {(["pending", "approved", "rejected"] as WordCardStatus[]).map((s) => (
          <button
            key={s}
            data-component="StatusTab"
            data-status={s}
            onClick={() => setFilter((f) => (f === s ? null : s))}
            className={`rounded-control px-3 py-2 text-sm font-semibold transition-colors ${
              filter === s
                ? "bg-[var(--seed-primary)] text-white"
                : "bg-kids-secondary text-kids-text"
            }`}
          >
            {t(STATUS_LABEL[s])} ({counts[s]})
          </button>
        ))}
      </section>

      {/* Cards */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Mascot expression="thinking" size="medium" />
          <p className="text-kids-muted font-semibold">{t('loading')}</p>
        </div>
      ) : visible.length === 0 ? (
        <section className="card-kids text-center text-kids-muted py-10" data-component="EmptyState">
          {t('empty')}
        </section>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3" data-component="WordCardList">
          {visible.map((c) => (
            <li
              key={c.id}
              data-component="WordCardItem"
              data-status={c.status}
              data-card-id={c.id}
              className="card-kids space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xl font-extrabold text-kids-title">{c.wordText}</span>
                <span
                  data-component="StatusBadge"
                  data-status={c.status}
                  className="rounded-full bg-kids-secondary px-2 py-0.5 text-xs font-bold text-kids-text"
                >
                  {t(STATUS_LABEL[c.status])}
                </span>
              </div>
              <p className="text-kids-text">{c.meaning}</p>
              <p className="text-sm text-kids-muted">{c.example}</p>
              {c.exampleTrans && (
                <p className="text-sm text-kids-muted">{c.exampleTrans}</p>
              )}
              <p className="text-xs text-kids-muted">{t('interest')}：{c.interest}</p>
              {c.status === "pending" && (
                <div className="flex gap-2 pt-1" data-component="ReviewActions">
                  <button
                    data-component="ApproveButton"
                    onClick={() => void handleApprove(c.id)}
                    aria-label={t('approveCardAria', { word: c.wordText })}
                    className="flex items-center gap-1 rounded-control bg-[var(--seed-primary)] px-3 py-2 text-sm font-bold text-white"
                  >
                    <Check size={16} /> {t('approve')}
                  </button>
                  <button
                    data-component="RejectButton"
                    onClick={() => void handleReject(c.id)}
                    aria-label={t('rejectCardAria', { word: c.wordText })}
                    className="flex items-center gap-1 rounded-control bg-kids-secondary px-3 py-2 text-sm font-bold text-kids-text"
                  >
                    <X size={16} /> {t('reject')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function WordCardsPage() {
  return (
    <AuthGate>
      <WordCardsInner />
    </AuthGate>
  );
}
