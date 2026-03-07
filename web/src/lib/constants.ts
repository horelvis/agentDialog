const API_HOST = import.meta.env.VITE_API_URL ?? "";
export const API_BASE = `${API_HOST}/api/v1`;
export const WS_URL =
  import.meta.env.VITE_WS_URL ?? (API_HOST ? API_HOST.replace(/^http/, "ws") : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);

export const RISK_COLORS = {
  low: "bg-risk-low/10 text-risk-low border-risk-low/30",
  medium: "bg-risk-medium/10 text-risk-medium border-risk-medium/30",
  high: "bg-risk-high/10 text-risk-high border-risk-high/30",
  critical: "bg-risk-critical/10 text-risk-critical border-risk-critical/30",
} as const;

export const SEVERITY_COLORS = {
  info: "bg-severity-info/10 text-severity-info border-severity-info/30",
  warning: "bg-severity-warning/10 text-severity-warning border-severity-warning/30",
  error: "bg-severity-error/10 text-severity-error border-severity-error/30",
  success: "bg-severity-success/10 text-severity-success border-severity-success/30",
} as const;

export const RISK_BADGE_COLORS = {
  low: "bg-risk-low/20 text-risk-low",
  medium: "bg-risk-medium/20 text-risk-medium",
  high: "bg-risk-high/20 text-risk-high",
  critical: "bg-risk-critical/20 text-risk-critical",
} as const;

export const SEVERITY_BADGE_COLORS = {
  info: "bg-severity-info/20 text-severity-info",
  warning: "bg-severity-warning/20 text-severity-warning",
  error: "bg-severity-error/20 text-severity-error",
  success: "bg-severity-success/20 text-severity-success",
} as const;
