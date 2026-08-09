"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Mascot from "@/components/Mascot";
import LevelRing from "@/components/LevelRing";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";
import { logger } from "@/lib/logger";
import type { Reward, RewardRedemption, RedemptionStatus } from "@/lib/types";
import { Star } from "lucide-react";

/** 兑换状态徽章展示（pending/approved/rejected → 中文 + 配色）。 */
const STATUS_BADGE: Record<RedemptionStatus, { label: string; className: string }> = {
  pending: { label: "待审批", className: "bg-kids-secondary text-kids-text" },
  approved: { label: "已批准", className: "bg-[var(--color-success)] text-white" },
  rejected: { label: "已驳回", className: "bg-kids-sun/20 text-kids-orange" },
};

function RewardsInner() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [totalStars, setTotalStars] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [myRedemptions, setMyRedemptions] = useState<RewardRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [progress, rewardList, mine] = await Promise.all([
        api.getProgress(),
        api.listRewards(),
        api.getMyRedemptions(),
      ]);
      setBalance(progress.pointsBalance);
      setTotalStars(progress.totalStars);
      setRewards(rewardList);
      setMyRedemptions(mine);
    } catch (err) {
      logger.error("Failed to load rewards store", err);
      setError("加载奖励商城失败，请稍后再试～");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleRedeem = useCallback(
    async (reward: Reward) => {
      if (busyId) return;
      setBusyId(reward.id);
      setError(null);
      try {
        await api.redeemReward(reward.id);
        // 写后重拉：余额 + 我的兑换（异步 UI 即时刷新）。
        const progress = await api.getProgress();
        const mine = await api.getMyRedemptions();
        setBalance(progress.pointsBalance);
        setTotalStars(progress.totalStars);
        setMyRedemptions(mine);
      } catch (err) {
        if (err instanceof api.ApiError && (err as api.ApiError & { code?: string }).code === "INSUFFICIENT_POINTS") {
          setError(`积分不够啦，还差一点就能换「${reward.title}」～再去攒积分吧！`);
        } else {
          const msg = err instanceof api.ApiError ? err.message : "兑换失败，请稍后再试。";
          setError(msg);
        }
        logger.error("Failed to redeem reward", err);
      } finally {
        setBusyId(null);
      }
    },
    [busyId]
  );

  return (
    <div className="space-y-6" data-component="RewardsStore">
      {/* Header */}
      <section
        className="card-kids flex items-center gap-4 bg-gradient-to-r from-[var(--seed-surface)] to-[var(--color-primary-wash)]"
        data-component="RewardsHeader"
      >
        <Mascot expression="happy" size="large" level={undefined} />
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-kids-title">奖励商城</h1>
          <p className="text-kids-muted">攒积分，换你想要的奖励～</p>
        </div>
      </section>

      {error && (
        <section className="card-kids flex items-center gap-3" data-component="RewardsError">
          <Mascot expression="encouraging" size="medium" />
          <p className="text-kids-muted">{error}</p>
        </section>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Mascot expression="thinking" size="medium" />
          <p className="text-kids-muted font-semibold">加载奖励商城…</p>
        </div>
      ) : (
        <>
          {/* 余额 + 等级环 */}
          <section className="card-kids" data-component="RewardsBalance">
            <h2 className="font-bold text-kids-title mb-3">我的积分</h2>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 bg-kids-sun/20 rounded-control px-4 py-2" data-component="BalanceBadge">
                <Star size={22} className="text-kids-sun fill-kids-sun" />
                <span className="font-extrabold text-kids-title text-xl" data-component="BalanceValue">
                  {balance}
                </span>
                <span className="text-sm text-kids-muted">分</span>
              </div>
              <LevelRing totalStars={totalStars} size={96} />
            </div>
          </section>

          {/* 奖励商城 */}
          <section className="space-y-3" data-component="RewardStore">
            <h2 className="text-lg font-extrabold text-kids-title">可用奖励</h2>
            {rewards.length === 0 ? (
              <p className="card-kids text-center text-kids-muted py-8" data-component="RewardEmptyHint">
                暂时没有可兑换的奖励，喊爸爸妈妈来添加吧～
              </p>
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3" data-component="RewardList">
                {rewards.map((r) => {
                  const affordable = balance >= r.cost;
                  return (
                    <li
                      key={r.id}
                      data-component="RewardCard"
                      data-reward-id={r.id}
                      data-reward-cost={r.cost}
                      className="card-kids flex items-center gap-4"
                    >
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-kids-secondary text-2xl">
                        {r.emoji ?? "🎁"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-kids-title truncate">{r.title}</p>
                        {r.description && (
                          <p className="text-sm text-kids-muted truncate">{r.description}</p>
                        )}
                        <p className="text-sm font-extrabold text-[var(--seed-primary)]">
                          {r.cost} 分
                        </p>
                      </div>
                      <button
                        data-component="RedeemBtn"
                        data-reward-id={r.id}
                        disabled={!affordable || busyId === r.id}
                        onClick={() => void handleRedeem(r)}
                        className="rounded-control bg-[var(--seed-primary)] text-white px-4 py-2 font-bold shadow-button hover:opacity-90 disabled:opacity-50"
                      >
                        {busyId === r.id ? "兑换中…" : affordable ? "兑换" : "分不够"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 我的兑换 */}
          <section className="space-y-3" data-component="MyRedemptions">
            <h2 className="text-lg font-extrabold text-kids-title">我的兑换</h2>
            {myRedemptions.length === 0 ? (
              <p className="card-kids text-center text-kids-muted py-8" data-component="MyRedemptionsEmpty">
                还没有兑换记录，去上面选一个奖励吧～
              </p>
            ) : (
              <ul className="flex flex-col gap-2" data-component="MyRedemptionsList">
                {myRedemptions.map((rd) => {
                  const badge = STATUS_BADGE[rd.status];
                  return (
                    <li
                      key={rd.id}
                      data-component="MyRedemption"
                      data-redemption-id={rd.id}
                      data-redemption-status={rd.status}
                      className="card-kids flex items-center gap-3"
                    >
                      <span className="font-bold text-kids-title flex-1 truncate">
                        {rd.rewardTitle}
                      </span>
                      <span className="text-sm text-kids-muted">{rd.cost} 分</span>
                      <span
                        data-component="RedemptionStatusBadge"
                        className={`rounded-control px-3 py-1 text-sm font-bold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function RewardsPage() {
  return (
    <AuthGate>
      <RewardsInner />
    </AuthGate>
  );
}
