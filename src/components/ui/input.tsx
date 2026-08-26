import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Input — 全站统一文本输入原语（与 Button 同款触觉风格）。
 * 用于 /plan、/login、/parent、/rewards、/scan 等表单页，
 * 取代各页内联的 input 类名，保证焦点环与触控尺寸一致。
 */
const inputVariants = cva(
  "w-full rounded-control bg-white px-4 text-kids-text shadow-input border-2 border-transparent transition-all duration-150 placeholder:text-kids-muted focus:outline-none focus:border-[var(--seed-primary)] focus:ring-2 focus:ring-[var(--seed-primary)]/30",
  {
    variants: {
      size: {
        default: "min-h-[56px] text-base",
        sm: "min-h-[44px] text-sm",
      },
      invalid: {
        true: "border-kids-danger focus:border-kids-danger focus:ring-kids-danger/30",
        false: "",
      },
    },
    defaultVariants: {
      size: "default",
      invalid: false,
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, invalid, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(inputVariants({ size, invalid }), className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
);
Input.displayName = "Input";

export interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Field — label + 控件 + 提示/错误 三件套，无障碍关联。
 * 调用方无需手写 id：未传 `htmlFor` 时用 `useId` 生成稳定 id，
 * 并自动写到唯一子控件上（label `htmlFor` 关联 + `aria-describedby` 关联 hint/error）。
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: FieldProps) {
  const generatedId = React.useId();
  const controlId = htmlFor ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  const childArray = React.Children.toArray(children);
  const single = childArray.length === 1 ? childArray[0] : null;
  const enhancedChild =
    single && React.isValidElement(single)
      ? React.cloneElement(single as React.ReactElement<{
          id?: string;
          "aria-invalid"?: boolean;
          "aria-describedby"?: string;
        }>, {
          id: (single.props as { id?: string }).id ?? controlId,
          "aria-invalid": error ? true : (single.props as { "aria-invalid"?: boolean })["aria-invalid"],
          "aria-describedby":
            [hintId, errorId].filter(Boolean).join(" ") ||
            (single.props as { "aria-describedby"?: string })["aria-describedby"],
        })
      : children;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={controlId} className="font-bold text-kids-title">
        {label}
      </label>
      {enhancedChild}
      {error ? (
        <p id={errorId} className="text-sm font-semibold text-kids-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-kids-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export { Input, inputVariants };
