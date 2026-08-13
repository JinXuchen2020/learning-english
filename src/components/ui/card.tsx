import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Card — 全站统一卡片原语。
 * 视觉等价于既有 .card-kids（圆角 24px / 奶油面 / 柔和投影），
 * 但作为组件提供 padding / interactive 变体与 ref 转发，
 * 供各页面统一复用，消除内联手写 .card-kids 的碎片。
 */
const cardVariants = cva(
  "rounded-panel bg-kids-card shadow-card transition-all duration-200",
  {
    variants: {
      interactive: {
        true: "cursor-pointer hover:-translate-y-1 hover:shadow-card-hover focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--seed-accent)]",
        false: "",
      },
      padding: {
        none: "p-0",
        sm: "p-4",
        default: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: {
      interactive: false,
      padding: "default",
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ interactive, padding }), className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

export { Card, cardVariants };
