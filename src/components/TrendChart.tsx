import React from "react";
import type { MasteryTrendPoint } from "@/lib/types";

/**
 * 家长周报趋势图（AI-507）。
 * 轻量原生 SVG，零图表依赖（与项目「不引新依赖」取向一致）：
 *  - 柱状：每日完成任务数（taskComplete）
 *  - 折线：每日口语平均分（avgSpeechScore），null 点断开连接
 * viewBox 固定 320×160，按容器宽度自适应缩放。
 */
export default function TrendChart({
  points,
}: {
  points: MasteryTrendPoint[];
}) {
  const W = 320;
  const H = 160;
  const padX = 26;
  const padY = 24;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const baseline = H - padY;

  const n = points.length;
  const maxTasks = Math.max(1, ...points.map((p) => p.taskComplete));
  const maxScore = 100;
  const stepX = n > 1 ? innerW / (n - 1) : 0;

  // 柱状坐标
  const bars = points.map((p, i) => {
    const x = padX + (n > 1 ? i * stepX : innerW / 2);
    const h = (p.taskComplete / maxTasks) * innerH;
    const barW = Math.min(18, (innerW / Math.max(n, 1)) * 0.5);
    return { x: x - barW / 2, y: baseline - h, h, barW, label: p.date.slice(5) };
  });

  // 折线坐标（仅非 null 的 avgSpeechScore）
  const scorePts = points
    .map((p, i) => {
      const x = padX + (n > 1 ? i * stepX : innerW / 2);
      if (p.avgSpeechScore == null) return null;
      const y = baseline - (p.avgSpeechScore / maxScore) * innerH;
      return { x, y };
    })
    .filter((v): v is { x: number; y: number } => v !== null);

  const linePath = scorePts
    .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      className="rounded-card bg-white"
      role="img"
      aria-label="本周学习趋势图"
      data-component="TrendChart"
    >
      {/* 基线 */}
      <line x1={padX} y1={baseline} x2={W - padX} y2={baseline} stroke="#EADFD2" strokeWidth={1.5} />

      {/* 柱状：每日任务完成数 */}
      {bars.map((b, i) => (
        <g key={`bar-${i}`} data-bar="task">
          <rect
            x={b.x}
            y={b.y}
            width={b.barW}
            height={Math.max(b.h, 1)}
            rx={3}
            fill="#82D5BB"
            opacity={0.85}
          />
          <text x={b.x + b.barW / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="#8a7a70">
            {b.label}
          </text>
        </g>
      ))}

      {/* 折线：口语平均分（null 点断开） */}
      {scorePts.length > 0 && (
        <path
          d={linePath}
          fill="none"
          stroke="#E8895B"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          data-trend-line="score"
        />
      )}
      {scorePts.map((pt, i) => (
        <circle key={`dot-${i}`} cx={pt.x} cy={pt.y} r={3} fill="#E8895B" />
      ))}

      {/* 图例 */}
      <g>
        <rect x={padX} y={6} width={10} height={10} rx={2} fill="#82D5BB" />
        <text x={padX + 14} y={15} fontSize={9} fill="#8a7a70">每日任务</text>
        <circle cx={padX + 78} cy={11} r={4} fill="#E8895B" />
        <text x={padX + 86} y={15} fontSize={9} fill="#8a7a70">口语分</text>
      </g>
    </svg>
  );
}
