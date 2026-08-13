import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

const selectTriggerVariants = cva(
  "w-full rounded-control bg-white px-4 text-kids-text shadow-input border-2 border-transparent transition-all duration-150 focus:outline-none focus:border-[var(--seed-primary)] focus:ring-2 focus:ring-[var(--seed-primary)]/30 flex items-center justify-between gap-2",
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

export interface SelectOption {
  value: string;
  label: React.ReactNode;
}

export interface SelectProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size" | "value" | "onChange">,
    VariantProps<typeof selectTriggerVariants> {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: React.ReactNode;
  /** 用于 E2E 与 a11y 的 id，会自动作用在 trigger 上。 */
  id?: string;
}

/**
 * Select — 全站统一下拉选择原语（与 Input 同款触觉风格）。
 * 支持键盘导航（↑/↓/Enter/Escape）、点击外部关闭、读屏标签关联。
 */
const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      className,
      size,
      invalid,
      value,
      options,
      onChange,
      placeholder,
      id,
      disabled,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const listId = React.useId();
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const listRef = React.useRef<HTMLDivElement>(null);

    React.useImperativeHandle(ref, () => triggerRef.current!);

    const selectedIndex = options.findIndex((o) => o.value === value);
    const selectedOption = options[selectedIndex];

    const close = React.useCallback(() => {
      setOpen(false);
      setActiveIndex(-1);
      triggerRef.current?.focus();
    }, []);

    const selectIndex = React.useCallback(
      (index: number) => {
        const option = options[index];
        if (!option) return;
        onChange(option.value);
        close();
      },
      [options, onChange, close]
    );

    React.useEffect(() => {
      if (!open) return;
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }, [open, selectedIndex]);

    React.useEffect(() => {
      if (!open) return;
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          listRef.current?.contains(target) ||
          triggerRef.current?.contains(target)
        ) {
          return;
        }
        close();
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open, close]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setActiveIndex((prev) => {
          const next = prev + 1;
          return next >= options.length ? 0 : next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setActiveIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? options.length - 1 : next;
        });
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (activeIndex >= 0) {
          selectIndex(activeIndex);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Home" && open) {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End" && open) {
        e.preventDefault();
        setActiveIndex(options.length - 1);
      }
    };

    return (
      <div className="relative">
        <button
          {...props}
          ref={triggerRef}
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={
            open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          aria-label={ariaLabel}
          onClick={() => !disabled && setOpen((v) => !v)}
          onKeyDown={handleKeyDown}
          className={cn(selectTriggerVariants({ size, invalid }), className)}
        >
          <span className={cn("truncate", !selectedOption && "text-kids-muted")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown
            size={20}
            className={cn(
              "shrink-0 text-kids-muted transition-transform duration-200",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-orientation="vertical"
            className="absolute z-50 mt-2 w-full overflow-hidden rounded-card bg-kids-card shadow-card border border-kids-secondary animate-fade-in"
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              const active = index === activeIndex;
              return (
                <div
                  key={option.value}
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={selected}
                  data-component="SelectOption"
                  data-value={option.value}
                  onClick={() => selectIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between px-4 py-3 text-kids-text transition-colors",
                    active && "bg-kids-mint-wash",
                    selected && "font-bold text-kids-title"
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {selected && (
                    <Check size={18} className="shrink-0 text-[var(--seed-primary)]" aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

export { Select, selectTriggerVariants };
