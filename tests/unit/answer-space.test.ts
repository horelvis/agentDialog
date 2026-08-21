import { describe, expect, it } from "bun:test";
import {
  answerSpaceSchema,
  validateAnswerAgainstSpace,
  isDiscrete,
  hasNonTextSlot,
  type AnswerSpace,
} from "../../src/lib/answer-space";

/**
 * The catalogue is the product's, not the agent's. Anything outside these six
 * shapes is rejected at the edge, which is what makes the admission guarantee
 * checkable at all.
 */

const choice: AnswerSpace = {
  kind: "choice",
  select: "one",
  options: [
    { id: "renew", label: "Renovar", consequence: "Firmo hoy." },
    { id: "decline", label: "No renovar", consequence: "Notifico la no renovación." },
  ],
};

describe("answerSpaceSchema", () => {
  it("accepts each of the six shapes", () => {
    const shapes: AnswerSpace[] = [
      { kind: "boolean", labels: { t: "Sí", f: "No" } },
      choice,
      { kind: "scalar", unit: "EUR", min: 0, max: 1000 },
      { kind: "date" },
      { kind: "text", max_length: 500 },
      { kind: "fields", fields: [{ id: "total", label: "Total", kind: "scalar", unit: "EUR" }] },
    ];
    for (const s of shapes) {
      expect(answerSpaceSchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects a kind outside the catalogue", () => {
    expect(answerSpaceSchema.safeParse({ kind: "json_schema", schema: {} }).success).toBe(false);
  });

  // Nesting would reopen the arbitrary-shape door the catalogue exists to close.
  it("rejects a fields slot that is itself fields", () => {
    const nested = {
      kind: "fields",
      fields: [{ id: "inner", label: "Inner", kind: "fields", fields: [] }],
    };
    expect(answerSpaceSchema.safeParse(nested).success).toBe(false);
  });

  it("rejects a choice with no options", () => {
    expect(answerSpaceSchema.safeParse({ kind: "choice", select: "one", options: [] }).success).toBe(false);
  });

  it("rejects duplicate option ids", () => {
    const dup = {
      kind: "choice", select: "one",
      options: [{ id: "a", label: "A" }, { id: "a", label: "Otra A" }],
    };
    expect(answerSpaceSchema.safeParse(dup).success).toBe(false);
  });

  it("rejects duplicate field ids", () => {
    const dup = {
      kind: "fields",
      fields: [
        { id: "x", label: "X", kind: "text", max_length: 10 },
        { id: "x", label: "Otra X", kind: "text", max_length: 10 },
      ],
    };
    expect(answerSpaceSchema.safeParse(dup).success).toBe(false);
  });
});

describe("isDiscrete", () => {
  it("is true for boolean and choice, false for the rest", () => {
    expect(isDiscrete({ kind: "boolean", labels: { t: "S", f: "N" } })).toBe(true);
    expect(isDiscrete(choice)).toBe(true);
    expect(isDiscrete({ kind: "scalar", unit: "EUR" })).toBe(false);
    expect(isDiscrete({ kind: "date" })).toBe(false);
    expect(isDiscrete({ kind: "text", max_length: 10 })).toBe(false);
    expect(isDiscrete({ kind: "fields", fields: [] })).toBe(false);
  });
});

describe("hasNonTextSlot", () => {
  it("is false for a fields made only of text slots", () => {
    const allText: AnswerSpace = {
      kind: "fields",
      fields: [{ id: "a", label: "A", kind: "text", max_length: 10 }],
    };
    expect(hasNonTextSlot(allText)).toBe(false);
  });

  it("is true as soon as one slot is not text", () => {
    const mixed: AnswerSpace = {
      kind: "fields",
      fields: [
        { id: "a", label: "A", kind: "text", max_length: 10 },
        { id: "b", label: "B", kind: "date" },
      ],
    };
    expect(hasNonTextSlot(mixed)).toBe(true);
  });

  it("is true for any non-fields space", () => {
    expect(hasNonTextSlot(choice)).toBe(true);
  });
});

describe("validateAnswerAgainstSpace", () => {
  it("accepts a choice answer naming a declared option", () => {
    expect(validateAnswerAgainstSpace(choice, { kind: "choice", option_ids: ["renew"] }))
      .toEqual({ ok: true });
  });

  it("rejects an option id that was never offered", () => {
    const r = validateAnswerAgainstSpace(choice, { kind: "choice", option_ids: ["inventado"] });
    expect(r.ok).toBe(false);
  });

  it("rejects more than one option when select is one", () => {
    const r = validateAnswerAgainstSpace(choice, { kind: "choice", option_ids: ["renew", "decline"] });
    expect(r.ok).toBe(false);
  });

  it("accepts several options when select is many", () => {
    const many: AnswerSpace = { ...choice, select: "many" };
    expect(validateAnswerAgainstSpace(many, { kind: "choice", option_ids: ["renew", "decline"] }))
      .toEqual({ ok: true });
  });

  it("rejects an answer whose kind does not match the space", () => {
    const r = validateAnswerAgainstSpace(choice, { kind: "boolean", value: true });
    expect(r.ok).toBe(false);
  });

  it("rejects a scalar outside its range", () => {
    const space: AnswerSpace = { kind: "scalar", unit: "EUR", min: 0, max: 100 };
    expect(validateAnswerAgainstSpace(space, { kind: "scalar", value: 50 })).toEqual({ ok: true });
    expect(validateAnswerAgainstSpace(space, { kind: "scalar", value: 101 }).ok).toBe(false);
    expect(validateAnswerAgainstSpace(space, { kind: "scalar", value: -1 }).ok).toBe(false);
  });

  it("rejects a scalar that does not respect step", () => {
    const space: AnswerSpace = { kind: "scalar", unit: "EUR", min: 0, max: 10, step: 0.5 };
    expect(validateAnswerAgainstSpace(space, { kind: "scalar", value: 2.5 })).toEqual({ ok: true });
    expect(validateAnswerAgainstSpace(space, { kind: "scalar", value: 2.3 }).ok).toBe(false);
  });

  it("rejects a date outside its window and a malformed one", () => {
    const space: AnswerSpace = { kind: "date", earliest: "2026-01-01", latest: "2026-12-31" };
    expect(validateAnswerAgainstSpace(space, { kind: "date", value: "2026-06-01" })).toEqual({ ok: true });
    expect(validateAnswerAgainstSpace(space, { kind: "date", value: "2025-12-31" }).ok).toBe(false);
    expect(validateAnswerAgainstSpace(space, { kind: "date", value: "no es fecha" }).ok).toBe(false);
  });

  it("rejects text longer than max_length", () => {
    const space: AnswerSpace = { kind: "text", max_length: 5 };
    expect(validateAnswerAgainstSpace(space, { kind: "text", value: "corto" })).toEqual({ ok: true });
    expect(validateAnswerAgainstSpace(space, { kind: "text", value: "demasiado largo" }).ok).toBe(false);
  });

  // The receipt case: every declared slot must come back, and nothing else.
  it("requires fields values to cover exactly the declared slots", () => {
    const space: AnswerSpace = {
      kind: "fields",
      fields: [
        { id: "total", label: "Total", kind: "scalar", unit: "EUR" },
        { id: "merchant", label: "Establecimiento", kind: "text", max_length: 100 },
      ],
    };
    expect(validateAnswerAgainstSpace(space, {
      kind: "fields", values: { total: 138.4, merchant: "La Tasquita" },
    })).toEqual({ ok: true });

    expect(validateAnswerAgainstSpace(space, {
      kind: "fields", values: { total: 138.4 },
    }).ok).toBe(false);

    expect(validateAnswerAgainstSpace(space, {
      kind: "fields", values: { total: 138.4, merchant: "X", sobra: 1 },
    }).ok).toBe(false);
  });

  it("validates each fields value against its own slot type", () => {
    const space: AnswerSpace = {
      kind: "fields",
      fields: [{ id: "total", label: "Total", kind: "scalar", unit: "EUR", min: 0, max: 100 }],
    };
    expect(validateAnswerAgainstSpace(space, { kind: "fields", values: { total: 200 } }).ok).toBe(false);
    expect(validateAnswerAgainstSpace(space, { kind: "fields", values: { total: "no es número" } }).ok).toBe(false);
  });
});
