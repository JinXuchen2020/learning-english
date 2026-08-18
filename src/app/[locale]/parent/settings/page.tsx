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
  ProviderValidateResult,
  ProviderType,
  ProviderCapability,
  ChildView,
} from "@/lib/types";
import { Check, X, ShieldCheck, BarChart3, UserPlus } from "lucide-react";
import { Select } from "@/components/ui/select";
import ParentUnauthorized from "@/components/parent/ParentUnauthorized";

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

function ParentSettingsInner() {
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
    return <ParentUnauthorized />;
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
      {/* 家长控制面板标题（TabNav 「家长/设置」tab 对应 /parent/settings 顶部） */}
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

      {/* 家长设置区（TabNav 「家长/设置」tab 对应 /parent/settings） */}
      <div id="settings" className="space-y-6">
        {/* 我的孩子（AI-710 家庭绑定） */}
        <ChildrenSection />
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
  const [formModel, setFormModel] = useState("");
  // 能力默认不勾选（AI-714）：能力是模型级、需用户按实际模型勾选并验证；
  // 空数组 ≡ 该 provider 具备全部能力（assertCapability 对空数组放行），
  // 避免默认勾选 tts 导致 gpt-4o-mini 等不支持 tts 的模型被保存前验证拦截。
  const [formCapabilities, setFormCapabilities] = useState<ProviderCapability[]>([]);

  // 连通性探测结果（按配置 id）
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});

  // 保存前能力验证预览（按 model 真发请求的分能力结果）
  const [validateResult, setValidateResult] = useState<ProviderValidateResult | null>(null);

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
    setFormModel("");
    setFormCapabilities([]);
    setValidateResult(null);
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
    setFormModel(c.model ?? "");
    setFormCapabilities(c.capabilities.length ? c.capabilities : []);
    setValidateResult(null);
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
    if (!formBaseUrl.trim()) {
      setError(t("baseUrlRequired"));
      return;
    }
    if (!formModel.trim()) {
      setError(t("modelRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    const dto: CreateProviderConfigDto = {
      name: formName.trim(),
      type: formType,
      model: formModel.trim(),
      baseUrl: formBaseUrl.trim() || undefined,
      // 仅当填写了 key 才传：新增非 mock 必填，编辑留空=不改
      apiKey: formApiKey.trim() || undefined,
      capabilities: formCapabilities,
    };
    try {
      // AI-714：保存前按 model 真验证所有勾选能力，预览分能力结果；任一失败则不保存。
      const v = await api.validateProviderConfig(dto);
      setValidateResult(v);
      if (!v.ok) {
        const failed = Object.entries(v.results)
          .filter(([, r]) => !r.ok)
          .map(([cap, r]) => `${t(CAPABILITY_LABEL_KEY[cap as ProviderCapability])}(${r.reason ?? ""})`)
          .join("; ");
        setError(`${t("capabilityVerifyFailed")} ${failed}`);
        setBusy(false);
        return;
      }
      if (editingId) {
        const updateDto: UpdateProviderConfigDto = {
          name: formName.trim() || undefined,
          baseUrl: formBaseUrl.trim() || undefined,
          model: formModel.trim() || undefined,
          apiKey: formApiKey.trim() || undefined,
          capabilities: formCapabilities,
        };
        await api.updateProviderConfig(editingId, updateDto);
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
  }, [busy, formName, formType, formBaseUrl, formApiKey, formModel, formCapabilities, editingId, resetForm, load, t]);

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
              options={(["openai-compatible"] as ProviderType[]).map((typeVal) => ({
                value: typeVal,
                label: t(PROVIDER_TYPE_LABEL_KEY[typeVal]),
              }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-kids-title">
              {t("baseUrlLabel")}{t("required")}
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
              {t("apiKeyLabel")}{editingId ? t("apiKeyEditHint") : t("required")}
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
            <label className="text-sm font-semibold text-kids-title">
              {t("modelLabel")}{t("required")}
            </label>
            <input
              data-component="ProviderModelInput"
              value={formModel}
              onChange={(e) => setFormModel(e.target.value)}
              placeholder={t("modelPlaceholder")}
              autoComplete="off"
              className="rounded-control border border-kids-border px-3 py-2"
            />
            <p className="text-xs text-kids-muted">{t("modelHint")}</p>
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
          {validateResult && (
            <div className="flex flex-col gap-1" data-component="ProviderValidateResult">
              <p className="text-sm font-semibold text-kids-title">{t("capabilityVerifyTitle")}</p>
              <ul className="flex flex-col gap-1">
                {Object.entries(validateResult.results).map(([cap, r]) => (
                  <li
                    key={cap}
                    data-component="CapabilityCheck"
                    data-capability={cap}
                    data-ok={r.ok ? "true" : "false"}
                    className="flex items-center gap-2 text-sm"
                  >
                    {r.ok ? (
                      <Check size={16} className="text-[var(--color-success)]" />
                    ) : (
                      <X size={16} className="text-kids-orange" />
                    )}
                    <span className="font-semibold text-kids-title">{t(CAPABILITY_LABEL_KEY[cap as ProviderCapability])}</span>
                    {!r.ok && <span className="text-kids-muted">{r.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
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

/* ----------------------- Family Binding (AI-710) ----------------------- */

/**
 * 家长「我的孩子」管理区块。
 * 列出名下孩子（昵称/用户名/等级/星星），支持创建/认领/解除绑定。
 */
function ChildrenSection() {
  const t = useTranslations("Parent");
  const [children, setChildren] = useState<ChildView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 解除绑定前的内联二次确认（替代 window.confirm：原生 confirm 在自动化
  // 测试与移动端体验上都有问题，且 Playwright 默认自动 dismiss 导致解绑无效）。
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);

  // AI-711：每孩 provider 覆盖下拉
  const [providerOptions, setProviderOptions] = useState<ProviderConfigView[] | null>(null);
  const [childOverrides, setChildOverrides] = useState<Record<string, string | null>>({});

  // 表单状态
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "claim">("create");
  const [formNickname, setFormNickname] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listChildren();
      setChildren(list);
      // AI-711：用任一孩子 id 拉取家长名下可选项（同父同集合），并初始化各孩覆盖值
      if (list.length > 0) {
        const init: Record<string, string | null> = {};
        list.forEach((c) => {
          init[c.id] = c.providerConfigId ?? null;
        });
        setChildOverrides(init);
        try {
          const opts = await api.getChildProviderOptions(list[0].id);
          setProviderOptions(opts);
        } catch (e) {
          logger.error("load child provider options", e);
          setProviderOptions([]);
        }
      } else {
        setProviderOptions(null);
        setChildOverrides({});
      }
    } catch (e) {
      logger.error("load children", e);
      setError(t("createChildFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = useCallback(() => {
    setShowForm(false);
    setFormMode("create");
    setFormNickname("");
    setFormUsername("");
    setFormPassword("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (busy) return;
    if (!formUsername.trim() || !formPassword.trim()) return;
    if (formMode === "create" && !formNickname.trim()) return;

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (formMode === "create") {
        await api.createChild({
          nickname: formNickname.trim(),
          username: formUsername.trim(),
          password: formPassword,
        });
        setSuccess(t("childCreated"));
      } else {
        await api.claimChild({
          username: formUsername.trim(),
          password: formPassword,
        });
        setSuccess(t("childClaimed"));
      }
      resetForm();
      await load();
    } catch (e) {
      if (e instanceof api.ApiError) {
        if (e.status === 409) {
          setError(formMode === "create" ? t("childUsernameTaken") : t("childClaimConflict"));
        } else if (e.status === 401) {
          setError(t("claimChildFailed"));
        } else {
          setError(e.message);
        }
      } else {
        setError(formMode === "create" ? t("createChildFailed") : t("claimChildFailed"));
      }
      logger.error("submit child form", e);
    } finally {
      setBusy(false);
    }
  }, [busy, formMode, formNickname, formUsername, formPassword, resetForm, load, t]);

  const handleUnlink = useCallback(
    (childId: string) => {
      if (busy) return;
      // 仅打开内联二次确认，实际解绑在 confirmUnlink 中执行。
      setConfirmUnlinkId(childId);
    },
    [busy],
  );

  const confirmUnlink = useCallback(async () => {
    if (confirmUnlinkId == null || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.unlinkChild(confirmUnlinkId);
      await load();
    } catch (e) {
      setError(t("unlinkFailed"));
      logger.error("unlink child", e);
    } finally {
      setBusy(false);
      setConfirmUnlinkId(null);
    }
  }, [confirmUnlinkId, busy, load, t]);

  const cancelUnlink = useCallback(() => {
    setConfirmUnlinkId(null);
  }, []);

  const handleChildProviderChange = useCallback(
    async (childId: string, value: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setSuccess(null);
      try {
        await api.setChildProvider(childId, { providerConfigId: value || null });
        // 同步刷新 children 状态，使徽标 / data-child-override 立即反映新值
        setChildren((prev) =>
          prev.map((c) =>
            c.id === childId
              ? { ...c, providerConfigId: value || null, hasProviderOverride: !!value }
              : c,
          ),
        );
        setChildOverrides((prev) => ({ ...prev, [childId]: value || null }));
        setSuccess(t("childProviderUpdated"));
      } catch (e) {
        setError(t("childProviderUpdateFailed"));
        logger.error("set child provider", e);
      } finally {
        setBusy(false);
      }
    },
    [busy, t],
  );

  return (
    <section className="space-y-3" data-component="ChildrenSection">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-kids-title">{t("myChildren")}</h2>
        {!showForm && (
          <button
            data-component="AddChildBtn"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 rounded-control bg-[var(--seed-primary)] text-white px-3 py-2 text-sm font-bold shadow-button hover:opacity-90"
          >
            <UserPlus size={16} /> {t("addChild")}
          </button>
        )}
      </div>

      {success && (
        <p
          className="text-sm font-bold text-[var(--color-success)] bg-[var(--color-success)]/10 rounded-control px-4 py-2.5"
          role="status"
          data-component="ChildSuccess"
        >
          {success}
        </p>
      )}

      {error && (
        <p
          className="text-sm font-bold text-[var(--color-danger)] bg-[var(--color-danger)]/10 rounded-control px-4 py-2.5"
          role="alert"
          data-component="ChildError"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p className="card-kids text-center text-kids-muted py-8" data-component="ChildrenLoading">
          {t("childrenLoading")}
        </p>
      ) : children.length === 0 && !showForm ? (
        <div className="card-kids text-center py-8 space-y-2" data-component="ChildrenEmpty">
          <Mascot expression="encouraging" size="medium" />
          <p className="font-bold text-kids-title">{t("noChildren")}</p>
          <p className="text-sm text-kids-muted">{t("noChildrenHint")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" data-component="ChildrenList">
          {children.map((child) => (
            <li
              key={child.id}
              data-component="ChildItem"
              data-child-id={child.id}
              data-child-username={child.username}
              data-child-override={child.providerConfigId ?? ""}
              className="card-kids flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold text-kids-title truncate">{child.nickname}</p>
                <p className="text-sm text-kids-muted">@{child.username}</p>
                {child.providerConfigId ? (
                  <span className="inline-block mt-1 rounded-control bg-[var(--seed-primary)]/15 text-[var(--seed-primary)] px-2 py-0.5 text-xs font-bold">
                    {t("providerOverrideBadge")}
                  </span>
                ) : (
                  <span className="inline-block mt-1 rounded-control bg-kids-secondary px-2 py-0.5 text-xs font-bold text-kids-muted">
                    {t("providerDefaultBadge")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 whitespace-nowrap">
                <span className="text-xs font-semibold text-kids-muted">
                  {t("childLevel")} {child.level}
                </span>
                <span className="text-xs font-semibold text-kids-sun">
                  ★ {child.totalStars}
                </span>
              </div>
              {providerOptions && providerOptions.length > 0 && (
                <div className="flex flex-col gap-1 w-full sm:w-56" data-component="ChildProviderSelectWrap">
                  <label className="text-xs font-semibold text-kids-muted">
                    {t("childProviderLabel")}
                  </label>
                  <Select
                    data-component="ChildProviderSelect"
                    data-child-id={child.id}
                    value={childOverrides[child.id] ?? child.providerConfigId ?? ""}
                    disabled={busy}
                    onChange={(v) => void handleChildProviderChange(child.id, v)}
                    options={[
                      { value: "", label: t("useParentDefault") },
                      ...providerOptions.map((c) => ({
                        value: c.id,
                        label: c.masked ? `${c.name} · ${c.masked}` : c.name,
                      })),
                    ]}
                  />
                </div>
              )}
              {confirmUnlinkId === child.id ? (
                <div
                  className="flex flex-col gap-2 sm:flex-row sm:items-center"
                  data-component="UnlinkConfirmWrap"
                  data-child-id={child.id}
                >
                  <span className="text-sm font-semibold text-kids-title">
                    {t("unlinkConfirm")}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      data-component="UnlinkConfirmYesBtn"
                      data-child-id={child.id}
                      disabled={busy}
                      onClick={() => void confirmUnlink()}
                      className="rounded-control bg-kids-orange px-3 py-1.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {t("unlinkConfirmYes")}
                    </button>
                    <button
                      data-component="UnlinkConfirmNoBtn"
                      data-child-id={child.id}
                      disabled={busy}
                      onClick={cancelUnlink}
                      className="rounded-control bg-kids-secondary px-3 py-1.5 text-sm font-bold text-kids-muted hover:opacity-90 disabled:opacity-50"
                    >
                      {t("unlinkConfirmNo")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  data-component="UnlinkChildBtn"
                  data-child-id={child.id}
                  disabled={busy}
                  onClick={() => handleUnlink(child.id)}
                  className="rounded-control bg-kids-sun/20 px-3 py-1.5 text-sm font-bold text-kids-orange hover:opacity-90 disabled:opacity-50"
                >
                  {t("unlink")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <section className="card-kids space-y-3" data-component="AddChildForm">
          {/* Tab switch: create / claim */}
          <div className="grid grid-cols-2 gap-2 bg-kids-secondary rounded-control p-1.5">
            <button
              type="button"
              data-testid="add-child-tab-create"
              onClick={() => setFormMode("create")}
              className={`rounded-control py-2.5 font-bold transition-all touch-target ${
                formMode === "create"
                  ? "bg-white text-[var(--seed-primary)] shadow-sm"
                  : "text-kids-muted"
              }`}
              aria-pressed={formMode === "create"}
            >
              {t("createChildTab")}
            </button>
            <button
              type="button"
              data-testid="add-child-tab-claim"
              onClick={() => setFormMode("claim")}
              className={`rounded-control py-2.5 font-bold transition-all touch-target ${
                formMode === "claim"
                  ? "bg-white text-[var(--seed-primary)] shadow-sm"
                  : "text-kids-muted"
              }`}
              aria-pressed={formMode === "claim"}
            >
              {t("claimChildTab")}
            </button>
          </div>

          {formMode === "create" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-kids-title">{t("childNicknameLabel")}</label>
              <input
                data-component="ChildNicknameInput"
                value={formNickname}
                onChange={(e) => setFormNickname(e.target.value)}
                autoComplete="off"
                className="rounded-control border border-kids-border px-3 py-2"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-kids-title">{t("childUsernameLabel")}</label>
            <input
              data-component="ChildUsernameInput"
              value={formUsername}
              onChange={(e) => setFormUsername(e.target.value)}
              autoComplete="off"
              className="rounded-control border border-kids-border px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-kids-title">{t("childPasswordLabel")}</label>
            <input
              data-component="ChildPasswordInput"
              type="password"
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              autoComplete={formMode === "create" ? "new-password" : "current-password"}
              className="rounded-control border border-kids-border px-3 py-2"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              data-component="SubmitChildBtn"
              disabled={busy}
              onClick={() => void handleSubmit()}
              className="rounded-control bg-[var(--seed-primary)] text-white px-4 py-2 font-bold shadow-button hover:opacity-90 disabled:opacity-50"
            >
              {busy ? t("saving") : t("addChild")}
            </button>
            <button
              data-component="CancelChildBtn"
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

export default function ParentSettingsPage() {
  return (
    <AuthGate>
      <ParentSettingsInner />
    </AuthGate>
  );
}
