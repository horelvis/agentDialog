import { describe, expect, test } from "bun:test";
import {
  ATTRIBUTION_KEY,
  appendAttribution,
  browserStorage,
  buildSlug,
  parseAttribution,
  randomSuffix,
  readAttribution,
  rememberAttribution,
  slugify,
} from "./attribution";

function fakeStorage(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    data,
  };
}

describe("parseAttribution", () => {
  test("keeps the utm parameters and drops everything else", () => {
    const got = parseAttribution(
      "?utm_source=linkedin&utm_medium=social&utm_campaign=hitl&fbclid=xyz&page=2",
    );
    expect(got).toEqual({
      utm_source: "linkedin",
      utm_medium: "social",
      utm_campaign: "hitl",
    });
  });

  test("keeps ref as a shorthand for utm_source", () => {
    expect(parseAttribution("?ref=hn")).toEqual({ ref: "hn" });
  });

  test("returns nothing for a bare or empty search", () => {
    expect(parseAttribution("")).toEqual({});
    expect(parseAttribution("?")).toEqual({});
    expect(parseAttribution("?page=2")).toEqual({});
  });

  test("ignores empty values and trims whitespace", () => {
    expect(parseAttribution("?utm_source=&utm_campaign=%20hitl%20")).toEqual({
      utm_campaign: "hitl",
    });
  });

  test("caps a value at 128 characters so nobody stuffs the database", () => {
    const got = parseAttribution(`?utm_campaign=${"a".repeat(500)}`);
    expect(got.utm_campaign).toHaveLength(128);
  });
});

describe("rememberAttribution", () => {
  test("stores what the url carried", () => {
    const storage = fakeStorage();
    const got = rememberAttribution("?utm_source=linkedin", storage);

    expect(got).toEqual({ utm_source: "linkedin" });
    expect(JSON.parse(storage.data[ATTRIBUTION_KEY])).toEqual({ utm_source: "linkedin" });
  });

  test("first touch wins — a later clean url does not erase the origin", () => {
    const storage = fakeStorage({
      [ATTRIBUTION_KEY]: JSON.stringify({ utm_source: "linkedin" }),
    });

    expect(rememberAttribution("", storage)).toEqual({ utm_source: "linkedin" });
  });

  test("a later campaign does overwrite an older one", () => {
    const storage = fakeStorage({
      [ATTRIBUTION_KEY]: JSON.stringify({ utm_source: "linkedin" }),
    });

    expect(rememberAttribution("?utm_source=hn", storage)).toEqual({ utm_source: "hn" });
  });

  test("survives storage that throws, because private windows do", () => {
    const hostile = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };

    expect(rememberAttribution("?utm_source=linkedin", hostile)).toEqual({
      utm_source: "linkedin",
    });
  });
});

describe("readAttribution", () => {
  test("reads back what was stored", () => {
    const storage = fakeStorage({
      [ATTRIBUTION_KEY]: JSON.stringify({ utm_source: "linkedin" }),
    });
    expect(readAttribution(storage)).toEqual({ utm_source: "linkedin" });
  });

  test("returns nothing when the slot is empty or corrupt", () => {
    expect(readAttribution(fakeStorage())).toEqual({});
    expect(readAttribution(fakeStorage({ [ATTRIBUTION_KEY]: "not json" }))).toEqual({});
  });

  test("refuses a stored value that is not a flat object of strings", () => {
    expect(readAttribution(fakeStorage({ [ATTRIBUTION_KEY]: "[1,2,3]" }))).toEqual({});
    expect(
      readAttribution(fakeStorage({ [ATTRIBUTION_KEY]: '{"utm_source":{"a":1}}' })),
    ).toEqual({});
  });
});

describe("slugify", () => {
  test("lowercases and hyphenates", () => {
    expect(slugify("My Release Agent")).toBe("my-release-agent");
  });

  test("strips accents, because the audience writes Spanish", () => {
    expect(slugify("Agente de Validación")).toBe("agente-de-validacion");
  });

  test("collapses runs of punctuation and trims the edges", () => {
    expect(slugify("  --Hello___World!!  ")).toBe("hello-world");
  });

  test("falls back when nothing usable survives", () => {
    expect(slugify("!!!")).toBe("agent");
    expect(slugify("")).toBe("agent");
    expect(slugify("ab")).toBe("agent");
  });

  test("never exceeds the 64 characters the API accepts", () => {
    const got = slugify("a".repeat(200));
    expect(got).toHaveLength(64);
  });

  test("always matches the slug pattern the API enforces", () => {
    const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    for (const name of ["My Release Agent", "!!!", "Ñandú", "-x-", "a".repeat(200), "1"]) {
      expect(slugify(name)).toMatch(pattern);
    }
  });
});

describe("randomSuffix", () => {
  test("is four lowercase alphanumerics", () => {
    expect(randomSuffix()).toMatch(/^[a-z0-9]{4}$/);
  });

  test("is driven by the injected source of randomness", () => {
    expect(randomSuffix(() => 0)).toBe("aaaa");
  });
});

describe("buildSlug", () => {
  test("appends the suffix so two visitors do not collide", () => {
    expect(buildSlug("My Release Agent", "k3f9")).toBe("my-release-agent-k3f9");
  });

  test("keeps the whole thing within 64 characters", () => {
    const got = buildSlug("a".repeat(200), "k3f9");
    expect(got).toHaveLength(64);
    expect(got.endsWith("-k3f9")).toBe(true);
  });

  test("does not leave a double hyphen when truncation lands on one", () => {
    const got = buildSlug(`${"a".repeat(58)} tail`, "k3f9");
    expect(got).not.toContain("--");
    expect(got).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
  });
});

describe("appendAttribution", () => {
  test("carries the origin over to the docs link", () => {
    const got = appendAttribution("https://docs.agentdialog.io", { utm_source: "linkedin" });
    expect(got).toBe("https://docs.agentdialog.io/?utm_source=linkedin");
  });

  test("leaves the url untouched when there is nothing to add", () => {
    expect(appendAttribution("https://docs.agentdialog.io", {})).toBe(
      "https://docs.agentdialog.io",
    );
  });

  test("preserves an existing query and does not clobber it", () => {
    const got = appendAttribution("https://docs.agentdialog.io/?a=1", { utm_source: "hn" });
    expect(got).toContain("a=1");
    expect(got).toContain("utm_source=hn");
  });

  test("handles a relative url without inventing a host", () => {
    expect(appendAttribution("/guide.md", { ref: "hn" })).toBe("/guide.md?ref=hn");
  });
});

describe("browserStorage", () => {
  test("falls back to memory when the browser offers no session storage", () => {
    const storage = browserStorage();
    storage.setItem(ATTRIBUTION_KEY, JSON.stringify({ utm_source: "linkedin" }));

    expect(readAttribution(storage)).toEqual({ utm_source: "linkedin" });
  });
});
