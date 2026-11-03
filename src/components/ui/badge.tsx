import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-transform focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow",
        outline: "text-foreground",
        /* Physical "sticker" tags — crisp border, tiny offset shadow, organic tilt. */
        sticker: "sticker-badge tilt-left bg-cream text-foreground",
        terracotta: "sticker-badge tilt-right bg-terracotta/25 text-terracotta-foreground",
        sage: "sticker-badge tilt-left bg-sage/30 text-sage-foreground",
        ochre: "sticker-badge tilt-right bg-ochre/25 text-ochre-foreground",
        matcha: "sticker-badge tilt-left bg-accent text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
