/**
 * Browser storage that never throws. Private windows and blocked site data make
 * the accessor itself throw — not the read, the *access* — so every entry point
 * probes first and falls back to memory. Nothing here is important enough to
 * take a page down over.
 */

/** A `Storage`, narrowed to what we use, so tests can hand us a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function createMemoryStore(): StorageLike {
  const data: Record<string, string> = {};
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

// One fallback per kind, not shared — otherwise blocking both real stores
// would quietly merge session and persistent state into a single bucket.
const sessionFallback = createMemoryStore();
const persistentFallback = createMemoryStore();

const PROBE_KEY = "agentdialog:probe";

/**
 * `get` is called inside the try because reading the property itself —
 * `globalThis.localStorage`, not just calling a method on it — is what
 * throws in WebKit when site data is blocked.
 */
function usable(get: () => Storage | undefined): Storage | null {
  try {
    const store = get();
    if (!store) return null;
    store.getItem(PROBE_KEY); // throws when site data is blocked
    return store;
  } catch {
    return null;
  }
}

/** Lives for this tab only. Where attribution goes. */
export function sessionStore(): StorageLike {
  return usable(() => globalThis.sessionStorage) ?? sessionFallback;
}

/** Survives closing the tab. Where a deliberate language choice goes. */
export function persistentStore(): StorageLike {
  return usable(() => globalThis.localStorage) ?? persistentFallback;
}
