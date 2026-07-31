import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "@/components/ui/slot";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-bold rounded-control transition-all duration-150 select-none cursor-pointer focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--seed-accent)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--seed-primary)] text-white shadow-button hover:bg-[var(--color-primary-hover)] hover:shadow-button-hover hover:-translate-y-px active:bg-[var(--color-primary-active)] active:shadow-button-active active:translate-y-0.5",
        success:
          "bg-[var(--color-success)] text-white shadow-[0_5px_0_0_var(--color-success-shadow)] hover:shadow-[0_6px_0_0_var(--color-success-shadow)] hover:-translate-y-px active:shadow-[0_1px_0_0_var(--color-success-shadow)] active:translate-y-0.5",
        secondary:
          "bg-kids-secondary text-kids-title shadow-button hover:bg-kids-disabled/30 hover:shadow-button-hover hover:-translate-y-px active:shadow-button-active active:translate-y-0.5",
        soft:
          "bg-[var(--seed-primary)]/15 text-[var(--seed-primary)] shadow-none hover:bg-[var(--seed-primary)]/25 active:bg-[var(--seed-primary)]/30",
      },
      size: {
        default: "min-h-[56px] px-7 text-base",
        sm: "min-h-[44px] px-5 text-sm",
        lg: "min-h-[64px] px-9 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
