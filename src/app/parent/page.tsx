"use client";

import React, { useCallback, useEffect, useState } from "react";
import Mascot from "@/components/Mascot";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { logger } from "@/lib/logger";
import type { RewardRedemption, RedemptionStatus } from "@/lib/types";
import { Check, X, ShieldCheck, LogOut, BarChart3 } from "lucide-react";

/** 兑换状态徽章（与 /rewards 同口径）。 */
const STATUS_BADGE: Record<RedemptionStatus, { label: string; className: string }> = {
  pending: { label: "待审批", className: "bg-kids-secondary text-kids-text" },
  approved: { label: "已批准", className: "bg-[var(--color-success)] text-white" },
  rejected: { label: "已驳回", className: "bg-kids-sun/20 text-kids-orange" },
};

type View = "loading" | "gate" | "panel";

function ParentInner() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("loading");
  const [hasPin, setHasPin] = useState(false);

  // PIN 门禁输入
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  // 审批区
  const [approvals, setApprovals] = useState<RewardRedemption[]>([]);
  // PIN 管理
  const [oldPinInput, setOldPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  // 通用错误 / busy
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadApprovals = useCallback(async () => {
    const list = await api.getPendingApprovals("pending");
    setApprovals(list);
  }, []);

  // 初始判定：持家长 token → 直接进面板；否则查 hasPin 决定门禁文案。
  useEffect(() => {
    if (api.getParentToken()) {
      setView("panel");
      void loadApprovals().catch((e) => logger.error("load approvals", e));
      return;
    }
    api
      .getParentStatus()
      .then((r) => {
        setHasPin(r.hasPin);
        setView("gate");
      })
      .catch((e) => {
        logger.error("get parent status", e);
        setError("加载家长模式失败，请稍后再试。");
        setView("gate");
      });
  }, [loadApprovals]);

  const handlePinSubmit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setPinError(null);
    setError(null);
    try {
      const res = hasPin
        ? await api.verifyParentPin(pin)
        : await api.setupParentPin(pin);
      api.setParentToken(res.parentToken);
      setView("panel");
      await loadApprovals();
    } catch (err) {
      setPinError(
        err instanceof api.ApiError ? err.message : "操作失败，请稍后再试。",
      );
      logger.error("parent pin submit", err);
    } finally {
      setBusy(false);
    }
  }, [busy, hasPin, pin, loadApprovals]);

  const handleExit = useCallback(async () => {
    api.clearParentToken();
    setPin("");
    setOldPinInput("");
    setNewPinInput("");
    setError(null);
    try {
      const r = await api.getParentStatus();
      setHasPin(r.hasPin);
    } catch (e) {
      logger.error("get parent status", e);
    }
    setView("gate");
  }, []);

  const handleApprove = useCallback(
    async (id: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await api.approveRedemption(id);
        await loadApprovals();
      } catch (err) {
        setError("批准失败，请稍后再试。");
        logger.error("approve", err);
      } finally {
        setBusy(false);
      }
    },
    [busy, loadApprovals],
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
        setError("驳回失败，请稍后再试。");
        logger.error("reject", err);
      } finally {
        setBusy(false);
      }
    },
    [busy, loadApprovals],
  );

  const handleChangePin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.changeParentPin(oldPinInput, newPinInput);
      if (res.parentToken) api.setParentToken(res.parentToken);
      setOldPinInput("");
      setNewPinInput("");
      setError(null);
    } catch (err) {
      setError(
        err instanceof api.ApiError ? err.message : "修改 PIN 失败，请稍后再试。",
      );
      logger.error("change pin", err);
    } finally {
      setBusy(false);
    }
  }, [busy, oldPinInput, newPinInput]);

  if (view === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3" data-component="ParentLoading">
        <Mascot expression="thinking" size="medium" />
        <p className="text-kids-muted font-semibold">加载家长模式…</p>
      </div>
    );
  }

  if (view === "gate") {
    return (
      <div className="space-y-6" data-component="ParentPanel">
        <section
          className="card-kids flex items-center gap-4 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
          data-component="ParentHeader"
        >
          <Mascot expression="happy" size="large" level={undefined} />
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-kids-title">家长模式</h1>
            <p className="text-kids-muted">输入 PIN 进入家长控制面板</p>
          </div>
        </section>

        <section className="card-kids space-y-4" data-component="ParentPinGate">
          <h2 className="font-bold text-kids-title">
            {hasPin ? "输入家长 PIN" : "设置家长 PIN（首次）"}
          </h2>
          <p className="text-sm text-kids-muted">
            {hasPin
              ? "请输入 4 位数字 PIN 以进入家长模式。"
              : "为当前孩子账号设置一个 4 位数字 PIN，用于进入家长模式。"}
          </p>
          <div className="flex items-center gap-3">
            <input
              data-component="PinInput"
              type="text"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="rounded-control border border-kids-border px-4 py-2 text-center text-2xl tracking-[0.5em] w-40"
            />
            <button
              data-component="PinSubmit"
              disabled={busy || pin.length !== 4}
              onClick={() => void handlePinSubmit()}
              className="rounded-control bg-[var(--seed-primary)] text-white px-4 py-2 font-bold shadow-button hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "处理中…" : hasPin ? "进入" : "设置"}
            </button>
          </div>
          {pinError && (
            <p className="text-kids-orange text-sm font-semibold" data-component="PinError">
              {pinError}
            </p>
          )}
        </section>
      </div>
    );
  }

  // view === "panel"
  return (
    <div className="space-y-6" data-component="ParentPanel">
      <section
        className="card-kids flex items-center gap-4 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
        data-component="ParentHeader"
      >
        <ShieldCheck size={36} className="text-[var(--seed-primary)]" />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-kids-title">家长控制面板</h1>
          <p className="text-kids-muted">你好，家长～ 这里可以审批兑换与管理设置</p>
        </div>
        <button
          data-component="ExitParentBtn"
          onClick={() => void handleExit()}
          className="flex items-center gap-1 rounded-control bg-kids-secondary px-3 py-2 text-sm font-bold text-kids-title hover:opacity-90"
        >
          <LogOut size={16} /> 退出家长模式
        </button>
      </section>

      {error && (
        <section className="card-kids flex items-center gap-3" data-component="ParentError">
          <Mascot expression="encouraging" size="medium" />
          <p className="text-kids-muted">{error}</p>
        </section>
      )}

      {/* 奖励审批区 */}
      <section className="space-y-3" data-component="ParentApprovals">
        <h2 className="text-lg font-extrabold text-kids-title">奖励审批</h2>
        {approvals.length === 0 ? (
          <p className="card-kids text-center text-kids-muted py-8" data-component="ApprovalsEmpty">
            暂无待审批的兑换申请～
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
                    <p className="text-sm text-kids-muted">{rd.cost} 分</p>
                  </div>
                  <span
                    data-component="ApprovalStatusBadge"
                    className={`rounded-control px-3 py-1 text-sm font-bold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  <button
                    data-component="ApproveBtn"
                    data-redemption-id={rd.id}
                    disabled={busy}
                    onClick={() => void handleApprove(rd.id)}
                    className="flex items-center gap-1 rounded-control bg-[var(--color-success)] text-white px-3 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    <Check size={16} /> 批准
                  </button>
                  <button
                    data-component="RejectBtn"
                    data-redemption-id={rd.id}
                    disabled={busy}
                    onClick={() => void handleReject(rd.id)}
                    className="flex items-center gap-1 rounded-control bg-kids-sun/20 text-kids-orange px-3 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    <X size={16} /> 驳回
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* PIN 管理区 */}
      <section className="space-y-3 card-kids" data-component="PinManage">
        <h2 className="text-lg font-extrabold text-kids-title">修改家长 PIN</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            data-component="OldPinInput"
            type="text"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="旧 PIN"
            value={oldPinInput}
            onChange={(e) => setOldPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="rounded-control border border-kids-border px-3 py-2 text-center text-xl tracking-[0.3em] w-28"
          />
          <input
            data-component="NewPinInput"
            type="text"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="新 PIN"
            value={newPinInput}
            onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="rounded-control border border-kids-border px-3 py-2 text-center text-xl tracking-[0.3em] w-28"
          />
          <button
            data-component="ChangePinBtn"
            disabled={busy || oldPinInput.length !== 4 || newPinInput.length !== 4}
            onClick={() => void handleChangePin()}
            className="rounded-control bg-[var(--seed-primary)] text-white px-4 py-2 font-bold shadow-button hover:opacity-90 disabled:opacity-50"
          >
            修改 PIN
          </button>
        </div>
      </section>

      {/* 未来 M5 报告入口预留 */}
      <section className="card-kids opacity-80" data-component="ReportPlaceholder">
        <div className="flex items-center gap-3">
          <BarChart3 size={28} className="text-kids-muted" />
          <div className="flex-1">
            <h2 className="font-extrabold text-kids-title">家长周报</h2>
            <p className="text-sm text-kids-muted">查看孩子学习趋势与弱项（即将上线）</p>
          </div>
          <span className="text-xs font-semibold text-kids-muted bg-kids-secondary rounded-control px-2 py-1">
            预留 (AI-507)
          </span>
        </div>
      </section>
    </div>
  );
}

export default function ParentPage() {
  return (
    <AuthGate>
      <ParentInner />
    </AuthGate>
  );
}
