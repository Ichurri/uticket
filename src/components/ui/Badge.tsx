import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "primary";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-muted text-muted-foreground",
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  primary: "bg-primary/10 text-primary",
};

export function Badge({
  variant = "default",
  className,
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
