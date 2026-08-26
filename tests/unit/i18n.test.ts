import { describe, expect, it } from "bun:test";
import { messagesFor, negotiateLanguage, localeTag, SUPPORTED_LANGUAGES } from "../../src/i18n";

describe("messagesFor", () => {
  it("returns the catalogue for a supported language", () => {
    expect(messagesFor("ca").about).toBe("SOBRE");
    expect(messagesFor("es").about).toBe("SOBRE");
    expect(messagesFor("en").about).toBe("ABOUT");
  });

  it("falls back to English for anything else", () => {
    // Rows written before the enum existed, or a language removed from the
    // catalogue later, must not crash an email.
    expect(messagesFor("eu")).toBe(messagesFor("en"));
    expect(messagesFor("")).toBe(messagesFor("en"));
  });

  it("has every key in every language", () => {
    const keys = Object.keys(messagesFor("en")).sort();
    for (const language of SUPPORTED_LANGUAGES) {
      expect(Object.keys(messagesFor(language)).sort()).toEqual(keys);
    }
  });
});

describe("negotiateLanguage", () => {
  it("takes the first supported language, ignoring region", () => {
    expect(negotiateLanguage("ca-ES,ca;q=0.9,es;q=0.8")).toBe("ca");
    expect(negotiateLanguage("es-MX,es;q=0.9")).toBe("es");
  });

  it("skips languages it does not have", () => {
    expect(negotiateLanguage("eu-ES,eu;q=0.9,es;q=0.7")).toBe("es");
  });

  it("falls back to English", () => {
    expect(negotiateLanguage(undefined)).toBe("en");
    expect(negotiateLanguage("")).toBe("en");
    expect(negotiateLanguage("de,fr;q=0.9")).toBe("en");
  });
});

describe("localeTag", () => {
  it("maps a language to the tag a date formatter wants", () => {
    expect(localeTag("ca")).toBe("ca-ES");
    expect(localeTag("es")).toBe("es-ES");
    expect(localeTag("en")).toBe("en-US");
  });

  it("falls back for a value read from an old row", () => {
    expect(localeTag("eu")).toBe("en-US");
  });
});
