import { localeTag, type Language } from "@/i18n/languages";

/**
 * These are not components and cannot read a hook, so the language arrives as
 * an argument. It is required rather than defaulted on purpose: a default is a
 * silent way to keep rendering English inside a Catalan page.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelativeTime(date: string | Date, language: Language): string {
  const seconds = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  const elapsed = Math.abs(seconds);
  // `numeric: "auto"` is what turns -1 day into "yesterday" / "ayer" / "ahir"
  // instead of "1 day ago", in every language, without a plural rule of ours.
  const relative = new Intl.RelativeTimeFormat(localeTag(language), { numeric: "auto" });

  if (elapsed < MINUTE) return relative.format(0, "second");
  if (elapsed < HOUR) return relative.format(Math.round(seconds / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(Math.round(seconds / HOUR), "hour");
  if (elapsed < WEEK) return relative.format(Math.round(seconds / DAY), "day");

  return formatDate(date, language);
}

export function formatTime(date: string | Date, language: Language): string {
  return new Date(date).toLocaleTimeString(localeTag(language), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A date formatted anywhere outside this file is a second, hidden source of
 * language — QueryContextHeader.tsx used to call toLocaleDateString directly.
 */
export function formatDate(date: string | Date, language: Language): string {
  return new Date(date).toLocaleDateString(localeTag(language));
}

/**
 * Units, not words: ms, s and m read the same in the three languages. What does
 * change is the decimal separator — 1.5s is 1,5s in Spanish and Catalan.
 */
export function formatDuration(ms: number, language: Language): string {
  const number = new Intl.NumberFormat(localeTag(language), { maximumFractionDigits: 1 });

  if (ms < 1000) return `${number.format(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${number.format(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${number.format(minutes)}m ${number.format(remaining)}s`;
}

export function formatFileSize(bytes: number, language: Language): string {
  const number = new Intl.NumberFormat(localeTag(language), { maximumFractionDigits: 1 });

  if (bytes < 1024) return `${number.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${number.format(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${number.format(bytes / (1024 * 1024))} MB`;
  return `${number.format(bytes / (1024 * 1024 * 1024))} GB`;
}
