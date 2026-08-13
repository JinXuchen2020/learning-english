import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge — 标签 / 计数胶囊。用于弱项词、完成计数、状态标记等。
 * 圆角与控制件一致（rounded-control），保证全站视觉语言统一。
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-control font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-kids-secondary text-kids-text",
        primary: "bg-[var(--seed-primary)]/15 text-[var(--seed-primary)]",
        sun: "bg-kids-sun/20 text-kids-sun",
        success: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
        danger: "bg-kids-pink/40 text-kids-danger",
        outline: "border-2 border-kids-disabled text-kids-muted",
      },
      size: {
        sm: "px-2.5 py-0.5 text-xs",
        md: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
