import * as React from "react";
import { cn } from "@/lib/utils";

interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

const Slot = React.forwardRef<HTMLElement, SlotProps>(
  ({ children, ...props }, ref) => {
    if (React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...props,
        ...children.props,
        className: cn(props.className, children.props.className),
        ref,
      } as Record<string, unknown>);
    }
    return <>{children}</>;
  }
);
Slot.displayName = "Slot";

export { Slot };
