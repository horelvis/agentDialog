/**
 * Where a visitor came from, carried from the landing page into the agent they
 * register. The API's register endpoint already accepts a free-form `metadata`
 * object, so the attribution rides along with the row instead of needing an
 * analytics vendor: `select metadata->>'utm_campaign' from agents`.
 */

import { sessionStore, type StorageLike } from "./storage";

export type { StorageLike };

export const ATTRIBUTION_KEY = "agentdialog:attribution";

/** Parameters we keep. Anything else in the URL is somebody else's business. */
const TRACKED = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"];

const MAX_VALUE_LENGTH = 128;
const MAX_SLUG_LENGTH = 64;
const MIN_SLUG_LENGTH = 3;
const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SUFFIX_LENGTH = 4;
const SLUG_FALLBACK = "agent";

export type Attribution = Record<string, string>;

/** Attribution is a per-visit thing, so it lives in session storage. */
export const browserStorage = sessionStore;

export function parseAttribution(search: string): Attribution {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const found: Attribution = {};

  for (const key of TRACKED) {
    const value = params.get(key)?.trim();
    if (value) found[key] = value.slice(0, MAX_VALUE_LENGTH);
  }

  return found;
}

/**
 * Remember where this visit came from. First touch wins: once we know the
 * origin, a later click on a clean in-page link must not erase it. A URL that
 * carries a fresh campaign does replace the old one — that is a new visit.
 *
 * Private windows and blocked site data make storage throw on access, so every
 * call is guarded; attribution is a nice-to-have, never a reason to break the
 * page.
 */
export function rememberAttribution(search: string, storage: StorageLike): Attribution {
  const incoming = parseAttribution(search);

  if (Object.keys(incoming).length === 0) return readAttribution(storage);

  try {
    storage.setItem(ATTRIBUTION_KEY, JSON.stringify(incoming));
  } catch {
    // No storage. The value still serves this page view.
  }

  return incoming;
}

export function readAttribution(storage: StorageLike): Attribution {
  let raw: string | null;
  try {
    raw = storage.getItem(ATTRIBUTION_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

  const clean: Attribution = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") return {};
    clean[key] = value;
  }

  return clean;
}

/**
 * Turn what somebody typed into a slug the API will accept — see
 * `agentRegisterSchema`: 3 to 64 characters of `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // drop the accents Spanish names carry
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");

  return slug.length >= MIN_SLUG_LENGTH ? slug : SLUG_FALLBACK;
}

export function randomSuffix(rand: () => number = Math.random): string {
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += SUFFIX_ALPHABET[Math.floor(rand() * SUFFIX_ALPHABET.length)];
  }
  return suffix;
}

/**
 * A slug nobody else has taken. `my-agent` is gone the moment this form is
 * public, and the API answers a taken slug with a 409, so we never offer the
 * bare one.
 */
export function buildSlug(name: string, suffix: string): string {
  const room = MAX_SLUG_LENGTH - suffix.length - 1;
  const base = slugify(name).slice(0, room).replace(/-+$/, "");

  return `${base.length >= MIN_SLUG_LENGTH ? base : SLUG_FALLBACK}-${suffix}`;
}

/** Carry the origin across to an outbound link, keeping whatever it already had. */
export function appendAttribution(url: string, attribution: Attribution): string {
  if (Object.keys(attribution).length === 0) return url;

  const relative = !/^[a-z][a-z0-9+.-]*:/i.test(url);
  const parsed = new URL(url, "https://agentdialog.io");

  for (const [key, value] of Object.entries(attribution)) {
    parsed.searchParams.set(key, value);
  }

  return relative ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.toString();
}
