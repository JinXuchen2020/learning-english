"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { logger } from "@/lib/logger";
import type { ScanCard } from "@/lib/types";
import { Camera, BookMarked } from "lucide-react";

/** 拍照学单词页主体（已登录态由 `AuthGate` 包裹，AI-606）。 */
function ScanInner() {
  const { user } = useAuth();
  const t = useTranslations("Scan");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [cards, setCards] = useState<ScanCard[]>([]);
  const [vocab, setVocab] = useState<ScanCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const loadVocab = useCallback(async () => {
    try {
      const list = await api.listScannedWords();
      setVocab(list);
    } catch (err) {
      logger.error("Failed to load vocab book", err);
    }
  }, []);

  useEffect(() => {
    void loadVocab();
  }, [loadVocab]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
    setHint(null);
    if (f) setCards([]); // 换图清空上一次结果
  }, []);

  const handleScan = useCallback(async () => {
    if (!file) {
      setError(t("errorNoFile"));
      return;
    }
    setRecognizing(true);
    setError(null);
    setHint(null);
    setCards([]);
    try {
      const res = await api.recognizeImage(file, user?.nickname);
      if (res.recognized && res.cards.length > 0) {
        setCards(res.cards);
      } else {
        setHint(res.message ?? t("hintNone"));
      }
    } catch (err) {
      const msg = err instanceof api.ApiError ? err.message : t("errorRecognize");
      logger.error("Failed to recognize image", err);
      setError(msg);
    } finally {
      setRecognizing(false);
    }
  }, [file, user?.nickname, t]);

  const refreshAfterConfirm = useCallback(
    async (confirmed: ScanCard[]) => {
      // 从待确认列表移除已加入的卡，并刷新生词本
      const ids = new Set(confirmed.map((c) => c.id));
      setCards((prev) => prev.filter((c) => !ids.has(c.id)));
      await loadVocab();
    },
    [loadVocab],
  );

  const handleAddAll = useCallback(async () => {
    if (!cards.length) return;
    try {
      const confirmed = await api.confirmScanWords(cards.map((c) => c.id));
      await refreshAfterConfirm(confirmed);
    } catch (err) {
      logger.error("Failed to add all to vocab", err);
      setError(t("errorAddVocab"));
    }
  }, [cards, refreshAfterConfirm, t]);

  const handleAddOne = useCallback(
    async (id: string) => {
      try {
        const confirmed = await api.confirmScanWords([id]);
        await refreshAfterConfirm(confirmed);
      } catch (err) {
        logger.error("Failed to add word to vocab", err);
        setError(t("errorAddVocab"));
      }
    },
    [refreshAfterConfirm, t],
  );

  return (
    <div className="space-y-6" data-component="ScanPage">
      {/* Header */}
      <section
        className="card-kids flex items-center gap-4 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
        data-component="ScanHeader"
      >
        <Mascot expression="happy" size="large" />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-kids-title">{t("title")}</h1>
          <p className="text-kids-muted">{t("subtitle")}</p>
        </div>
      </section>

      {/* Uploader */}
      <section className="card-kids space-y-3" data-component="ScanUploader">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          data-component="ImageUploadInput"
          className="block w-full text-sm text-kids-muted file:mr-3 file:rounded-control file:border-0 file:bg-[var(--seed-primary)] file:px-4 file:py-2 file:font-bold file:text-white"
          onChange={handleFileChange}
        />
        <button
          data-component="ScanButton"
          onClick={() => void handleScan()}
          disabled={recognizing || !file}
          className="rounded-control bg-[var(--seed-primary)] px-5 py-3 font-bold text-white shadow-button transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {recognizing ? t("recognizing") : t("start")}
        </button>
        {file && (
          <p data-component="SelectedFile" className="text-sm text-kids-muted">
            {t("selected", { name: file.name })}
          </p>
        )}
      </section>

      {error && (
        <section className="card-kids flex items-center gap-3" data-component="ScanError">
          <Mascot expression="encouraging" size="medium" />
          <p className="text-kids-muted">{error}</p>
        </section>
      )}

      {hint && (
        <section
          className="card-kids flex items-center gap-3"
          data-component="ScanNothingHint"
        >
          <Mascot expression="thinking" size="medium" />
          <p className="text-kids-muted">{hint}</p>
        </section>
      )}

      {/* Recognized cards */}
      {cards.length > 0 && (
        <section className="space-y-3" data-component="ScanResult">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-kids-title">{t("recognized")}</h2>
            <button
              data-component="ScanAddAllBtn"
              onClick={() => void handleAddAll()}
              className="flex items-center gap-1 rounded-control bg-[var(--seed-primary)] px-4 py-2 text-sm font-bold text-white shadow-button"
            >
              <BookMarked size={16} /> {t("addAll")}
            </button>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3" data-component="ScanCardList">
            {cards.map((c) => (
              <li
                key={c.id}
                data-component="ScanCardItem"
                data-card-id={c.id}
                className="card-kids space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl font-extrabold text-kids-title">{c.wordText}</span>
                </div>
                <p className="text-kids-text">{c.meaning}</p>
                {c.example && <p className="text-sm text-kids-muted">{c.example}</p>}
                <button
                  data-component="ScanAddBtn"
                  onClick={() => void handleAddOne(c.id)}
                  className="rounded-control bg-kids-secondary px-3 py-2 text-sm font-bold text-kids-text"
                >
                  {t("addOne")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Vocab book */}
      <section className="space-y-3" data-component="VocabBook">
        <h2 className="text-lg font-extrabold text-kids-title">{t("myVocab")}</h2>
        {vocab.length === 0 ? (
          <p data-component="VocabEmptyHint" className="card-kids text-center text-kids-muted py-8">
            {t("vocabEmpty")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3" data-component="VocabBookList">
            {vocab.map((c) => (
              <li
                key={c.id}
                data-component="VocabWordItem"
                data-word-text={c.wordText}
                className="card-kids space-y-1"
              >
                <span className="text-xl font-extrabold text-kids-title">{c.wordText}</span>
                <p className="text-kids-text">{c.meaning}</p>
                {c.example && <p className="text-sm text-kids-muted">{c.example}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function ScanPage() {
  return (
    <AuthGate>
      <ScanInner />
    </AuthGate>
  );
}
