import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { RISK_BADGE_COLORS, SEVERITY_BADGE_COLORS } from "@/lib/constants";
import type { RiskLevel, Severity } from "@/api/types";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "risk" | "severity";
  risk?: RiskLevel;
  severity?: Severity;
  className?: string;
}

export function Badge({ children, variant = "default", risk, severity, className }: BadgeProps) {
  let colorClass = "bg-surface-tertiary text-gray-300";

  if (variant === "risk" && risk) {
    colorClass = RISK_BADGE_COLORS[risk];
  } else if (variant === "severity" && severity) {
    colorClass = SEVERITY_BADGE_COLORS[severity];
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorClass,
        className
      )}
    >
      {children}
    </span>
  );
}
