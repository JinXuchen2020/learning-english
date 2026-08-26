"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DialogProps {
  /** 是否打开（受控）。open=false 时组件渲染 null，不在 DOM 中残留弹层。 */
  open: boolean;
  /** Esc / 遮罩点击 / 显式调用时触发关闭。 */
  onClose: () => void;
  children: React.ReactNode;
  /** "center" 居中弹层（默认） | "bottom" 底部抽屉（如 MoreDrawer）。 */
  variant?: "center" | "bottom";
  /** 遮罩层 z-index 工具类，默认 z-50；抽屉用 z-[70]。 */
  zIndex?: string;
  /** 点击遮罩是否关闭，默认 true。 */
  closeOnBackdrop?: boolean;
  /** 遮罩层附加 className（如 bg-black/50 调整遮罩浓度；与默认 bg-black/40 由 tailwind-merge 去重）。 */
  className?: string;
  /** 弹层（role=dialog 容器）附加 className（尺寸 / 圆角 / 阴影 / 滚动由调用方提供）。 */
  panelClassName?: string;
  /** 无障碍可访问名：直接标签。与 ariaLabelledby 二选一。 */
  "aria-label"?: string;
  /** 无障碍可访问名：指向弹层内标题元素的 id。 */
  "aria-labelledby"?: string;
  /** 透传到遮罩层的 data-component（保持 E2E 选择器与既有弹层一致）。 */
  dataComponent?: string;
}

// Tab 循环陷阱可聚焦目标（跳过 disabled 与负 tabindex）。
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0,
  );
}

/**
 * Dialog — 全站共享弹层原语（AI-805）。
 *
 * 取代此前首页 MascotStoryModal / 绘本 reader modal / MoreDrawer 各自手写的
 * fixed-overlay 样板，统一收口无障碍语义：
 *   - 弹层容器 `role="dialog"` + `aria-modal="true"` + 可访问名（label / labelledby）
 *   - 打开时聚焦弹层内首个可聚焦元素、Tab 循环陷阱（焦点不逃逸到背景）
 *   - Esc 关闭；点击遮罩（target===currentTarget）关闭
 *   - 关闭后把焦点还原到触发元素（触发按钮），避免键盘用户丢失位置
 *   - 打开期间锁定 body 滚动（移动端底部抽屉尤其必要）
 *
 * 设计为「零新增依赖」：不引入 Radix，焦点管理与键盘处理全部自建。
 */
export function Dialog({
  open,
  onClose,
  children,
  variant = "center",
  zIndex = "z-50",
  closeOnBackdrop = true,
  className,
  panelClassName,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  dataComponent,
}: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  // 打开：捕获触发焦点 + 锁定背景滚动 + 聚焦弹层内首焦点元素。
  // 关闭（或卸载）：还原触发焦点 + 还原滚动。
  React.useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = getFocusable(panel);
      (focusables[0] ?? panel).focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      if (prevFocus && document.contains(prevFocus)) {
        prevFocus.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "Tab") {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = getFocusable(panel);
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  const overlayClassName = cn(
    "fixed inset-0 flex p-4 bg-black/40",
    variant === "bottom" ? "items-end justify-center" : "items-center justify-center",
    zIndex,
    className,
  );

  const panelClassNameResolved = cn("outline-none", panelClassName);

  return (
    <div
      data-component={dataComponent}
      className={overlayClassName}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        tabIndex={-1}
        className={panelClassNameResolved}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default Dialog;
