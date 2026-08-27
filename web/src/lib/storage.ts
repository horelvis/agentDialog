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

const fallbackStore: Record<string, string> = {};

function memoryStore(): StorageLike {
  return {
    getItem: (key) => (key in fallbackStore ? fallbackStore[key] : null),
    setItem: (key, value) => {
      fallbackStore[key] = value;
    },
  };
}

const PROBE_KEY = "agentdialog:probe";

function usable(store: Storage | undefined): store is Storage {
  try {
    if (!store) return false;
    store.getItem(PROBE_KEY); // throws when site data is blocked
    return true;
  } catch {
    return false;
  }
}

/** Lives for this tab only. Where attribution goes. */
export function sessionStore(): StorageLike {
  const store = globalThis.sessionStorage;
  return usable(store) ? store : memoryStore();
}

/** Survives closing the tab. Where a deliberate language choice goes. */
export function persistentStore(): StorageLike {
  const store = globalThis.localStorage;
  return usable(store) ? store : memoryStore();
}
