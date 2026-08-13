import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";

export interface SectionTitleProps {
  /** 标题文本或节点 */
  title: React.ReactNode;
  /** 右侧计数胶囊（如 "3/5 已完成"） */
  count?: React.ReactNode;
  /** 前缀图标 */
  icon?: React.ReactNode;
  className?: string;
  id?: string;
}

/**
 * SectionTitle — 页面区块标题原语。
 * 统一 h2 的字号/字重/间距与可选计数胶囊，
 * 取代各页面手写的 `<h2 className="mb-4 flex ..."><span chip></span></h2>`。
 */
export function SectionTitle({
  title,
  count,
  icon,
  className,
  id,
}: SectionTitleProps) {
  return (
    <h2
      id={id}
      className={cn(
        "mb-4 flex items-center gap-2 font-bold text-kids-title",
        className
      )}
    >
      {icon}
      <span>{title}</span>
      {count != null && <Badge variant="neutral">{count}</Badge>}
    </h2>
  );
}
