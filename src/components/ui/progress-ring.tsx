import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressRingProps
  extends React.SVGProps<SVGSVGElement> {
  /** 进度值 0–100 */
  progress: number;
  /** 直径 px，默认 56 */
  size?: number;
  /** 环线宽 px，默认 6 */
  strokeWidth?: number;
  /** 进度环颜色，默认品牌青绿 */
  color?: string;
  /** 轨道颜色，默认 kids 浅棕 */
  trackColor?: string;
  /**
   * 环心文字。默认显示百分比 `${Math.round(progress)}%`；
   * 传 `null` 可隐藏文字（纯图形）。
   */
  label?: React.ReactNode;
}

/**
 * ProgressRing — 可访问的环形进度指示器。
 * 替代各页面内联手写的 SVG 进度环（如首页 PlanProgress），
 * 统一旋转/过渡/文本渲染，并带 role="img" + aria-label 供读屏。
 */
export const ProgressRing = React.forwardRef<SVGSVGElement, ProgressRingProps>(
  (
    {
      progress,
      size = 56,
      strokeWidth = 6,
      color = "var(--seed-primary, #19C8B9)",
      trackColor = "#F0E8D8",
      label,
      className,
      ...props
    },
    ref
  ) => {
    const pct = Math.min(Math.max(progress, 0), 100);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - pct / 100);
    const center = size / 2;
    const text = label === undefined ? `${Math.round(pct)}%` : label;

    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn("shrink-0", className)}
        role="img"
        aria-label={typeof text === "string" ? text : "progress"}
        {...props}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
            transition: "stroke-dashoffset 0.5s ease",
          }}
        />
        {text != null && text !== "" && (
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-extrabold"
            fill="#725D42"
            style={{ fontSize: size * 0.22 }}
          >
            {text}
          </text>
        )}
      </svg>
    );
  }
);
ProgressRing.displayName = "ProgressRing";
