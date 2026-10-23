import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors",
  {
    variants: {
      variant: {
        default:     "bg-foreground/10 text-foreground ring-foreground/20",
        secondary:   "bg-secondary text-secondary-foreground ring-border",
        outline:     "text-foreground ring-border",
        success:     "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
        warning:     "bg-amber-500/10  text-amber-700  ring-amber-500/20",
        destructive: "bg-red-500/10    text-red-700    ring-red-500/20",
        muted:       "bg-muted         text-muted-foreground ring-border",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
