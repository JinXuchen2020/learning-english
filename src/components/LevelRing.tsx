"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { buildLevelInfo, levelName, MAX_LEVEL } from "@/lib/mascotLevel";

/**
 * 等级环（AI-701，复刻 `ProgressRing` 思路的 SVG 环）。
 * 输入累计星星 totalStars → 经 `buildLevelInfo` 展示「Lv.X + 档名 + 本级进度 + 距下一级」。
 * 用于 Home「我的奖励」卡与 `/rewards` 页余额区。
 */
export default function LevelRing({
  totalStars,
  size = 88,
}: {
  /** 累计星星（驱动等级推导）。 */
  totalStars: number;
  /** 环直径（px），默认 88。 */
  size?: number;
}) {
  const t = useTranslations("Home");
  const info = buildLevelInfo(totalStars);
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // 本级进度比例（已得星 / 本级跨度）。
  const span = info.isMaxLevel
    ? 1
    : Math.max(1, info.nextLevelStars - (info.totalStars - info.levelStars));
  const progress = info.isMaxLevel
    ? 1
    : Math.max(0, Math.min(1, info.levelStars / span));
  const offset = circumference * (1 - progress);
  const center = size / 2;

  return (
    <div className="flex items-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        data-component="LevelRing"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#F0E8D8"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--seed-primary, #F59E0B)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
        <text
          x={center}
          y={center - 4}
          textAnchor="middle"
          dominantBaseline="central"
          className="font-extrabold"
          fill="#725D42"
          style={{ fontSize: size * 0.2 }}
        >
          Lv.{info.level}
        </text>
        <text
          x={center}
          y={center + size * 0.16}
          textAnchor="middle"
          dominantBaseline="central"
          className="font-bold"
          fill="#A08A6A"
          style={{ fontSize: size * 0.11 }}
        >
          {info.totalStars}★
        </text>
      </svg>
      <div className="flex-1">
        <p className="font-extrabold text-kids-title text-lg">{levelName(info.level)}</p>
        <p className="text-sm text-kids-muted">
          {info.isMaxLevel
            ? t("mascotMax", { stars: info.totalStars })
            : t("mascotNext", { need: info.nextLevelStars - info.totalStars, level: Math.min(MAX_LEVEL, info.level + 1) })}
        </p>
      </div>
    </div>
  );
}
