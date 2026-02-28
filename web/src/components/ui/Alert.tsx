import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SEVERITY_COLORS } from "@/lib/constants";
import type { Severity } from "@/api/types";

interface AlertProps {
  severity: Severity;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Alert({ severity, title, children, className }: AlertProps) {
  return (
    <div className={cn("rounded-lg border p-4", SEVERITY_COLORS[severity], className)}>
      {title && <p className="font-medium">{title}</p>}
      <div className={cn(title && "mt-1 text-sm opacity-90")}>{children}</div>
    </div>
  );
}
