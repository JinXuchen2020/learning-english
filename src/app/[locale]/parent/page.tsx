"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { logger } from "@/lib/logger";
import type {
  RewardRedemption,
  RedemptionStatus,
  ProviderConfigView,
  CreateProviderConfigDto,
  UpdateProviderConfigDto,
  ProviderTestResult,
  ProviderType,
  ProviderCapability,
} from "@/lib/types";
import { Check, X, ShieldCheck, BarChart3 } from "lucide-react";
import { Select } from "@/components/ui/select";

/** 兑换状态徽章（与 /rewards 同口径）。标签走 i18n，仅保留配色。 */
const STATUS_BADGE: Record<RedemptionStatus, { className: string }> = {
  pending: { className: "bg-kids-secondary text-kids-text" },
  approved: { className: "bg-[var(--color-success)] text-white" },
  rejected: { className: "bg-kids-sun/20 text-kids-orange" },
};

/** 状态 → 翻译 key（避免模块级调用 hook）。 */
const STATUS_LABEL_KEY: Record<RedemptionStatus, string> = {
  pending: "statusPending",
  approved: "statusApproved",
  rejected: "statusRejected",
};

function ParentInner() {
  const { user } = useAuth();
  const t = useTranslations("Parent");
  const [loading, setLoading] = useState(true);

  // 审批区
  const [approvals, setApprovals] = useState<RewardRedemption[]>([]);
  // 通用错误 / busy
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadApprovals = useCallback(async () => {
    const list = await api.getPendingApprovals("pending");
    setApprovals(list);
  }, []);

  useEffect(() => {
    if (user?.role !== "parent") {
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadApprovals()
      .catch((e) => logger.error("load approvals", e))
      .finally(() => setLoading(false));
  }, [loadApprovals, user?.role]);

  const handleApprove = useCallback(
    async (id: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await api.approveRedemption(id);
        await loadApprovals();
      } catch (err) {
        setError(t("approveFailed"));
        logger.error("approve", err);
      } finally {
        setBusy(false);
      }
    },
    [busy, loadApprovals, t],
  );

  const handleReject = useCallback(
    async (id: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await api.rejectRedemption(id);
        await loadApprovals();
      } catch (err) {
        setError(t("rejectFailed"));
        logger.error("reject", err);
      } finally {
        setBusy(false);
      }
    },
    [busy, loadApprovals, t],
  );

  if (user?.role !== "parent") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4" data-component="ParentUnauthorized">
        <Mascot expression="encouraging" size="large" />
        <h1 className="text-xl font-extrabold text-kids-title">{t("parentOnly")}</h1>
        <p className="text-kids-muted text-center max-w-md">
          {t("parentOnlyHint")}
        </p>
        <Link
          href="/"
          className="rounded-control bg-[var(--seed-primary)] text-white px-5 py-2.5 font-bold shadow-button hover:opacity-90"
          data-component="BackHomeBtn"
        >
          {t("backHome")}
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3" data-component="ParentLoading">
        <Mascot expression="thinking" size="medium" />
        <p className="text-kids-muted font-semibold">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-component="ParentPanel">
      {/* 家长首页概览（TabNav 「首页/概览」tab 对应 /parent 顶部） */}
      <section className="space-y-4" data-component="ParentOverview">
        <div className="card-kids bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)] p-5">
          <h1 className="text-2xl font-extrabold text-kids-title">
            {t("overviewGreeting", { name: user?.nickname || user?.username || "" })}
          </h1>
          <p className="text-kids-muted mt-1">{t("overviewSubtitle")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/parent#approvals"
            className="card-kids p-4 flex flex-col gap-1 hover:opacity-90"
            data-component="OverviewPending"
          >
            <span className="text-sm text-kids-muted">{t("statPending")}</span>
            <span className="text-2xl font-extrabold text-kids-title">{approvals.length}</span>
          </Link>
          <Link
            href="/parent-report"
            className="card-kids p-4 flex flex-col gap-1 hover:opacity-90"
            data-component="OverviewReport"
          >
            <span className="text-sm text-kids-muted">{t("statReport")}</span>
            <span className="text-lg font-extrabold text-kids-title">{t("viewReport")}</span>
          </Link>
          <Link
            href="/parent#settings"
            className="card-kids p-4 flex flex-col gap-1 hover:opacity-90"
            data-component="OverviewSettings"
          >
            <span className="text-sm text-kids-muted">{t("statSettings")}</span>
            <span className="text-lg font-extrabold text-kids-title">{t("goSettings")}</span>
          </Link>
        </div>
      </section>

      <section
        className="card-kids flex items-center gap-4 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
        data-component="ParentHeader"
      >
        <ShieldCheck size={36} className="text-[var(--seed-primary)]" />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-kids-title">{t("controlPanelTitle")}</h1>
          <p className="text-kids-muted">{t("controlPanelSubtitle")}</p>
        </div>
      </section>

      {error && (
        <section className="card-kids flex items-center gap-3" data-component="ParentError">
          <Mascot expression="encouraging" size="medium" />
          <p className="text-kids-muted">{error}</p>
        </section>
      )}

      {/* 奖励审批区 */}
      <section className="space-y-3" id="approvals" data-component="ParentApprovals">
        <h2 className="text-lg font-extrabold text-kids-title">{t("approvalsTitle")}</h2>
        {approvals.length === 0 ? (
          <p className="card-kids text-center text-kids-muted py-8" data-component="ApprovalsEmpty">
            {t("approvalsEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-component="ApprovalsList">
            {approvals.map((rd) => {
              const badge = STATUS_BADGE[rd.status];
              return (
                <li
                  key={rd.id}
                  data-component="ApprovalItem"
                  data-redemption-id={rd.id}
                  data-redemption-status={rd.status}
                  className="card-kids flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-kids-title truncate">{rd.rewardTitle}</p>
                    <p className="text-sm text-kids-muted">{rd.cost} {t("points")}</p>
                  </div>
                  <span
                    data-component="ApprovalStatusBadge"
                    className={`rounded-control px-3 py-1 text-sm font-bold ${badge.className}`}
                  >
                    {t(STATUS_LABEL_KEY[rd.status])}
                  </span>
                  <button
                    data-component="ApproveBtn"
                    data-redemption-id={rd.id}
                    disabled={busy}
                    onClick={() => void handleApprove(rd.id)}
                    className="flex items-center gap-1 rounded-control bg-[var(--color-success)] text-white px-3 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    <Check size={16} /> {t("approve")}
                  </button>
                  <button
                    data-component="RejectBtn"
                    data-redemption-id={rd.id}
                    disabled={busy}
                    onClick={() => void handleReject(rd.id)}
                    className="flex items-center gap-1 rounded-control bg-kids-sun/20 text-kids-orange px-3 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    <X size={16} /> {t("reject")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 家长设置区（TabNav 「家长/设置」tab 经 /parent#settings 锚定） */}
      <div id="settings" className="space-y-6">
        {/* AI 提供商配置（AI-705） */}
        <ProviderConfigSection />
      </div>

      {/* 未来 M5 报告入口预留 */}
      <section className="card-kids opacity-80" data-component="ReportPlaceholder">
        <div className="flex items-center gap-3">
          <BarChart3 size={28} className="text-kids-muted" />
          <div className="flex-1">
            <h2 className="font-extrabold text-kids-title">{t("weeklyReportTitle")}</h2>
            <p className="text-sm text-kids-muted">{t("weeklyReportHint")}</p>
          </div>
          <span className="text-xs font-semibold text-kids-muted bg-kids-secondary rounded-control px-2 py-1">
            {t("reserved")} (AI-507)
          </span>
        </div>
      </section>
    </div>
  );
}

/* ----------------------- AI Provider Config (AI-705) ----------------------- */

const PROVIDER_TYPE_LABEL_KEY: Record<string, string> = {
  "openai-compatible": "provOpenaiCompatible",
  bigmodel: "provBigModel",
  mock: "provMock",
};

const ALL_CAPABILITIES: ProviderCapability[] = [
  "chat",
  "vision",
  "stt",
  "tts",
  "pronunciation",
];
const CAPABILITY_LABEL_KEY: Record<ProviderCapability, string> = {
  chat: "capChat",
  vision: "capVision",
  stt: "capStt",
  tts: "capTts",
  pronunciation: "capPronunciation",
};

/**
 * 家长 AI 提供商配置管理（AI-705）。
 * 列出本账号全部 provider（掩码），支持增删改、设为默认、连通性探测。
 * 家长账号登录 JWT 本身 role==='parent'，可直接过 ParentGuard；
 * 明文 apiKey 仅在前端输入框短暂存在，后端加密落库、视图永不回显明文（仅掩码）。
 */
function ProviderConfigSection() {
  const t = useTranslations("Parent");
  const [configs, setConfigs] = useState<ProviderConfigView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 表单状态（新增 / 编辑共用）
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<ProviderType>("openai-compatible");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formCapabilities, setFormCapabilities] = useState<ProviderCapability[]>([
    "chat",
    "tts",
  ]);

  // 连通性探测结果（按配置 id）
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listProviderConfigs();
      setConfigs(list);
    } catch (e) {
      logger.error("load provider configs", e);
      setError(t("loadProviderFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormType("openai-compatible");
    setFormBaseUrl("");
    setFormApiKey("");
    setFormCapabilities(["chat", "tts"]);
  }, []);

  const openAdd = useCallback(() => {
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  const openEdit = useCallback((c: ProviderConfigView) => {
    setEditingId(c.id);
    setFormName(c.name);
    setFormType(c.type);
    setFormBaseUrl(c.baseUrl ?? "");
    setFormApiKey(""); // 编辑不回显明文 key；留空表示沿用原值
    setFormCapabilities(c.capabilities.length ? c.capabilities : ["chat", "tts"]);
    setShowForm(true);
  }, []);

  const toggleCapability = useCallback((cap: ProviderCapability) => {
    setFormCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (busy) return;
    if (!formName.trim()) {
      setError(t("configNameRequired"));
      return;
    }
    if (formType !== "mock" && !formBaseUrl.trim()) {
      setError(t("baseUrlRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    const dto: CreateProviderConfigDto & UpdateProviderConfigDto = {
      name: formName.trim(),
      type: formType,
      baseUrl: formBaseUrl.trim() || undefined,
      // 仅当填写了 key 才传：新增非 mock 必填，编辑留空=不改
      apiKey: formApiKey.trim() || undefined,
      capabilities: formCapabilities,
    };
    try {
      if (editingId) {
        await api.updateProviderConfig(editingId, dto);
      } else {
        await api.createProviderConfig(dto);
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof api.ApiError ? e.message : t("saveFailed"));
      logger.error("save provider config", e);
    } finally {
      setBusy(false);
    }
  }, [busy, formName, formType, formBaseUrl, formApiKey, formCapabilities, editingId, resetForm, load, t]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await api.deleteProviderConfig(id);
        await load();
      } catch (e) {
        setError(e instanceof api.ApiError ? e.message : t("deleteFailed"));
        logger.error("delete provider config", e);
      } finally {
        setBusy(false);
      }
    },
    [busy, load, t],
  );

  const handleSetDefault = useCallback(
    async (id: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await api.setDefaultProviderConfig(id);
        await load();
      } catch (e) {
        setError(e instanceof api.ApiError ? e.message : t("setDefaultFailed"));
        logger.error("set default provider", e);
      } finally {
        setBusy(false);
      }
    },
    [busy, load, t],
  );

  const handleTest = useCallback(
    async (id: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await api.testProviderConfig(id);
        setTestResults((prev) => ({ ...prev, [id]: res }));
      } catch (e) {
        setTestResults((prev) => ({
          ...prev,
          [id]: { ok: false, message: e instanceof api.ApiError ? e.message : t("probeFailed") },
        }));
      } finally {
        setBusy(false);
      }
    },
    [busy, t],
  );

  return (
    <section className="space-y-3" data-component="ProviderConfigSection">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-kids-title">{t("aiProviderConfig")}</h2>
        {!showForm && (
          <button
            data-component="AddProviderBtn"
            onClick={() => void openAdd()}
            className="rounded-control bg-[var(--seed-primary)] text-white px-3 py-2 text-sm font-bold shadow-button hover:opacity-90"
          >
            {t("addProvider")}
          </button>
        )}
      </div>

      {error && (
        <p className="text-kids-orange text-sm font-semibold" data-component="ProviderConfigError">
          {error}
        </p>
      )}

      {loading ? (
        <p className="card-kids text-center text-kids-muted py-8" data-component="ProviderConfigLoading">
          {t("providerLoading")}
        </p>
      ) : configs.length === 0 ? (
        <p className="card-kids text-center text-kids-muted py-8" data-component="ProviderConfigEmpty">
          {t("providerEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-component="ProviderConfigList">
          {configs.map((c) => {
            const test = testResults[c.id];
            return (
              <li
                key={c.id}
                data-component="ProviderConfigItem"
                data-config-id={c.id}
                data-config-name={c.name}
                data-config-type={c.type}
                data-config-default={c.isDefault ? "true" : "false"}
                className="card-kids space-y-2"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-kids-title">{c.name}</span>
                  <span className="rounded-control bg-kids-secondary px-2 py-0.5 text-xs font-bold text-kids-text">
                    {t(PROVIDER_TYPE_LABEL_KEY[c.type] ?? c.type)}
                  </span>
                  {c.isDefault && (
                    <span className="rounded-control bg-[var(--color-success)] px-2 py-0.5 text-xs font-bold text-white">
                      {t("defaultBadge")}
                    </span>
                  )}
                  {c.hasKey ? (
                    <span className="text-xs text-kids-muted">{t("keyMasked", { masked: c.masked })}</span>
                  ) : (
                    <span className="text-xs text-kids-muted">{t("noKey")}</span>
                  )}
                </div>
                {c.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1" data-component="ProviderCapabilities">
                    {c.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="rounded-full bg-kids-secondary/60 px-2 py-0.5 text-xs text-kids-muted"
                      >
                        {t(CAPABILITY_LABEL_KEY[cap])}
                      </span>
                    ))}
                  </div>
                )}
                {test && (
                  <p
                    data-component="ProviderTestResult"
                    data-config-id={c.id}
                    className={`text-xs font-semibold ${test.ok ? "text-[var(--color-success)]" : "text-kids-orange"}`}
                  >
                    {test.ok ? "✓ " : "✗ "}
                    {test.message}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    data-component="TestProviderBtn"
                    data-config-id={c.id}
                    disabled={busy}
                    onClick={() => void handleTest(c.id)}
                    className="rounded-control bg-kids-secondary px-3 py-1.5 text-sm font-bold text-kids-title hover:opacity-90 disabled:opacity-50"
                  >
                    {t("testConnection")}
                  </button>
                  {!c.isDefault && (
                    <button
                      data-component="SetDefaultProviderBtn"
                      data-config-id={c.id}
                      disabled={busy}
                      onClick={() => void handleSetDefault(c.id)}
                      className="rounded-control bg-[var(--seed-primary)] px-3 py-1.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {t("setDefault")}
                    </button>
                  )}
                  <button
                    data-component="EditProviderBtn"
                    data-config-id={c.id}
                    disabled={busy}
                    onClick={() => void openEdit(c)}
                    className="rounded-control border border-kids-border px-3 py-1.5 text-sm font-bold text-kids-title hover:opacity-90 disabled:opacity-50"
                  >
                    {t("edit")}
                  </button>
                  <button
                    data-component="DeleteProviderBtn"
                    data-config-id={c.id}
                    disabled={busy}
                    onClick={() => void handleDelete(c.id)}
                    className="rounded-control bg-kids-sun/20 px-3 py-1.5 text-sm font-bold text-kids-orange hover:opacity-90 disabled:opacity-50"
                  >
                    {t("delete")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <section className="card-kids space-y-3" data-component="ProviderConfigForm">
          <h3 className="font-bold text-kids-title">
            {editingId ? t("editProviderTitle") : t("addProviderTitle")}
          </h3>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-kids-title">{t("nameLabel")}</label>
            <input
              data-component="ProviderNameInput"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t("namePlaceholder")}
              autoComplete="off"
              className="rounded-control border border-kids-border px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-kids-title">{t("typeLabel")}</label>
            <Select
              data-component="ProviderTypeSelect"
              value={formType}
              onChange={(v) => setFormType(v as ProviderType)}
              options={(["openai-compatible", "mock"] as ProviderType[]).map((typeVal) => ({
                value: typeVal,
                label: t(PROVIDER_TYPE_LABEL_KEY[typeVal]),
              }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-kids-title">
              {t("baseUrlLabel")}{formType === "mock" ? t("optional") : t("required")}
            </label>
            <input
              data-component="ProviderBaseUrlInput"
              value={formBaseUrl}
              onChange={(e) => setFormBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              autoComplete="off"
              className="rounded-control border border-kids-border px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-kids-title">
              {t("apiKeyLabel")}{formType === "mock" ? t("optional") : editingId ? t("apiKeyEditHint") : t("required")}
            </label>
            <input
              data-component="ProviderApiKeyInput"
              type="password"
              value={formApiKey}
              onChange={(e) => setFormApiKey(e.target.value)}
              placeholder={editingId ? t("apiKeyPlaceholderEdit") : t("apiKeyPlaceholderNew")}
              autoComplete="new-password"
              className="rounded-control border border-kids-border px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-kids-title">{t("capabilitiesLabel")}</label>
            <div className="flex flex-wrap gap-3" data-component="ProviderCapabilitiesForm">
              {ALL_CAPABILITIES.map((cap) => (
                <label key={cap} className="flex items-center gap-1 text-sm text-kids-title">
                  <input
                    data-component="ProviderCapabilityCheckbox"
                    data-capability={cap}
                    type="checkbox"
                    checked={formCapabilities.includes(cap)}
                    onChange={() => toggleCapability(cap)}
                    className="rounded-control"
                  />
                  {t(CAPABILITY_LABEL_KEY[cap])}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-component="SaveProviderBtn"
              disabled={busy}
              onClick={() => void handleSubmit()}
              className="rounded-control bg-[var(--seed-primary)] text-white px-4 py-2 font-bold shadow-button hover:opacity-90 disabled:opacity-50"
            >
              {busy ? t("saving") : t("save")}
            </button>
            <button
              data-component="CancelProviderBtn"
              disabled={busy}
              onClick={() => resetForm()}
              className="rounded-control border border-kids-border px-4 py-2 font-bold text-kids-title hover:opacity-90 disabled:opacity-50"
            >
              {t("cancel")}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

export default function ParentPage() {
  return (
    <AuthGate>
      <ParentInner />
    </AuthGate>
  );
}
