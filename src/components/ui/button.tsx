import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-tight select-none",
    "cursor-pointer transition-all duration-150 active:scale-[0.99] active:transition-none motion-reduce:active:scale-100 motion-reduce:transform-none motion-reduce:transition-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:cursor-not-allowed",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "data-[state=open]:bg-sand-deep data-[state=selected]:bg-brand-soft/80 data-[state=selected]:text-brand-deep aria-pressed:bg-brand-soft aria-pressed:text-brand-deep data-[state=active]:bg-brand-soft/80",
    "data-[pending=true]:pointer-events-none data-[pending=true]:opacity-80 data-[pending=true]:cursor-wait aria-busy:pointer-events-none aria-busy:opacity-80 aria-busy:cursor-wait",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-brand-deep shadow-xs",
        primary: "bg-primary text-primary-foreground hover:bg-brand-deep shadow-xs",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-95 shadow-xs",
        outline:
          "border border-input bg-card text-foreground hover:bg-secondary shadow-xs",
        secondary: "bg-secondary text-secondary-foreground hover:bg-sand-deep shadow-xs",
        ghost: "bg-transparent text-foreground hover:bg-secondary",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto font-normal",
        ink: "bg-ink text-ink-foreground hover:bg-brand-deep shadow-xs",
        clay: "bg-clay text-primary-foreground hover:brightness-95 shadow-xs",
      },
      size: {
        default: "h-11 px-5 text-sm gap-2",
        md: "h-11 px-5 text-sm gap-2",
        sm: "h-9 px-3 text-sm gap-1.5",
        lg: "h-13 px-6 text-base gap-2",
        icon: "size-9 p-0 min-h-9 min-w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  pending?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, pending = false, disabled, children, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      );
    }
    return (
      <button
        className={cn(
          buttonVariants({ variant, size, className }),
          pending && "relative !text-transparent transition-none hover:!text-transparent",
        )}
        ref={ref}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        data-pending={pending ? "true" : undefined}
        {...props}
      >
        {children}
        {pending ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-current"
          >
            <Loader2 className="size-4 animate-spin text-foreground motion-reduce:animate-none" />
          </span>
        ) : null}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
