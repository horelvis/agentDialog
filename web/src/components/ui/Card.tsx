import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CardProps {
  children: ReactNode;
  className?: string;
  borderColor?: string;
}

export function Card({ children, className, borderColor }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-surface-border bg-surface-secondary",
        borderColor && `border-l-4 ${borderColor}`,
        className
      )}
    >
      {children}
    </div>
  );
}
