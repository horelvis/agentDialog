import { describe, expect, test } from "bun:test";
import {
  LANGUAGE_KEY,
  readStoredLanguage,
  resolveLanguage,
  writeStoredLanguage,
} from "../../web/src/i18n/resolve";
import { localeTag, narrow } from "../../web/src/i18n/languages";
import { persistentStore, type StorageLike } from "../../web/src/lib/storage";

/** A storage we control, so the test never touches a real browser. */
function fakeStorage(initial: Record<string, string> = {}): StorageLike {
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = value;
    },
  };
}

/** The Safari case: touching storage throws rather than returning null. */
const hostileStorage: StorageLike = {
  getItem() {
    throw new Error("The operation is insecure.");
  },
  setItem() {
    throw new Error("The operation is insecure.");
  },
};

describe("resolveLanguage", () => {
  test("an explicit choice beats everything else", () => {
    expect(
      resolveLanguage({ stored: "es", declared: "ca", navigator: ["en-GB"] }),
    ).toBe("es");
  });

  test("what the agent declared beats the browser", () => {
    // The office computer in English, and an agent that knows this person
    // reads Catalan. This is the case the whole precedence rule exists for.
    expect(resolveLanguage({ declared: "ca", navigator: ["en-GB", "en"] })).toBe("ca");
  });

  test("the browser decides when nothing else does", () => {
    expect(resolveLanguage({ navigator: ["es-MX", "en"] })).toBe("es");
  });

  test("the browser's own order is respected, skipping what we do not have", () => {
    expect(resolveLanguage({ navigator: ["fr-FR", "de", "ca-ES", "es"] })).toBe("ca");
  });

  test("region is dropped, case is ignored", () => {
    expect(resolveLanguage({ stored: "ca-ES" })).toBe("ca");
    expect(resolveLanguage({ stored: "ES-es" })).toBe("es");
    expect(resolveLanguage({ stored: "EN-GB" })).toBe("en");
  });

  test("a value outside the catalogue is ignored, not defaulted on", () => {
    // Basque is a real request we have not shipped. A stored `eu` must fall
    // through to the next source, not short-circuit to English.
    expect(resolveLanguage({ stored: "eu", declared: "es" })).toBe("es");
    expect(resolveLanguage({ stored: "", declared: null, navigator: ["ca"] })).toBe("ca");
  });

  test("nothing at all is English", () => {
    expect(resolveLanguage({})).toBe("en");
    expect(resolveLanguage({ stored: null, declared: null, navigator: [] })).toBe("en");
  });
});

describe("the stored choice", () => {
  test("round-trips through storage", () => {
    const storage = fakeStorage();
    writeStoredLanguage(storage, "ca");
    expect(storage.getItem(LANGUAGE_KEY)).toBe("ca");
    expect(readStoredLanguage(storage)).toBe("ca");
  });

  test("a junk value reads as nothing stored", () => {
    expect(readStoredLanguage(fakeStorage({ [LANGUAGE_KEY]: "eu" }))).toBeNull();
  });

  test("storage that throws is not a crash", () => {
    // Losing the language must never take down the page somebody opened to
    // answer a question.
    expect(readStoredLanguage(hostileStorage)).toBeNull();
    expect(() => writeStoredLanguage(hostileStorage, "es")).not.toThrow();
  });
});

describe("narrow and localeTag", () => {
  test("narrow keeps only what we can render", () => {
    expect(narrow("ca-ES")).toBe("ca");
    expect(narrow("pt-BR")).toBeNull();
    expect(narrow(undefined)).toBeNull();
    expect(narrow("  es  ")).toBe("es");
  });

  test("localeTag is what Intl gets handed", () => {
    expect(localeTag("en")).toBe("en-US");
    expect(localeTag("es")).toBe("es-ES");
    expect(localeTag("ca")).toBe("ca-ES");
  });
});

describe("persistentStore", () => {
  test("a throwing property access, not just a throwing method, falls back to memory", () => {
    // WebKit with blocked site data throws on *reading* `localStorage` itself
    // — before any method on it is ever called.
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: The operation is insecure.");
      },
    });

    try {
      const storage = persistentStore();
      expect(() => storage.setItem(LANGUAGE_KEY, "ca")).not.toThrow();
      expect(storage.getItem(LANGUAGE_KEY)).toBe("ca");
    } finally {
      if (original) {
        Object.defineProperty(globalThis, "localStorage", original);
      } else {
        // @ts-expect-error -- test-only cleanup of a property we just defined
        delete globalThis.localStorage;
      }
    }
  });
});
