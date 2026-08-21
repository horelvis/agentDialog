import { describe, expect, it } from "bun:test";
import { checkPayload, atLeast, type AdmissionInput } from "../../src/admission/decidability";
import type { AnswerSpace } from "../../src/lib/answer-space";

/**
 * The rules that need no history live here and are pure. What the system
 * refuses is not a malformed payload - zod already did that - but a question a
 * human could not answer.
 */

const choice: AnswerSpace = {
  kind: "choice", select: "one",
  options: [
    { id: "yes", label: "Sí", consequence: "Firmo hoy." },
    { id: "no", label: "No", consequence: "No firmo." },
  ],
};

function input(over: Partial<AdmissionInput> = {}): AdmissionInput {
  return {
    risk: "low",
    subject: { id: "asunto-1", label: "Un asunto", body: "el referente" },
    answer_space: choice,
    ...over,
  };
}

describe("el referente", () => {
  it("admits a subject with a body, a uri or attachments", () => {
    expect(checkPayload(input({ subject: { id: "a", label: "A", body: "x" } })).admit).toBe(true);
    expect(checkPayload(input({ subject: { id: "a", label: "A", uri: "https://x" } })).admit).toBe(true);
    expect(checkPayload(input({ subject: { id: "a", label: "A", attachments: ["f_1"] } })).admit).toBe(true);
  });

  // The cat photo with no photo. Undecidable at any stake.
  it("refuses a subject with no referent at all, even at low risk", () => {
    const v = checkPayload(input({ subject: { id: "a", label: "A" } }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("missing_referent");
  });

  it("admits no referent when the query declares itself self-contained", () => {
    expect(checkPayload(input({ subject: { id: "a", label: "A" }, self_contained: true })).admit).toBe(true);
  });
});

describe("text as a decision space", () => {
  const text: AnswerSpace = { kind: "text", max_length: 500 };

  it("is allowed at low risk", () => {
    expect(checkPayload(input({ answer_space: text })).admit).toBe(true);
  });

  it("is refused above low risk", () => {
    for (const risk of ["medium", "high", "critical"] as const) {
      const v = checkPayload(input({ risk, answer_space: text, subject: { id: "a", label: "A", body: "x" } }));
      expect(v.admit).toBe(false);
      if (!v.admit) expect(v.reason).toBe("text_answer_above_low_risk");
    }
  });
});

describe("fields made only of text", () => {
  const allText: AnswerSpace = {
    kind: "fields",
    fields: [{ id: "a", label: "A", kind: "text", max_length: 50 }],
    effect: "Registro lo que digas.",
  };

  it("is allowed at low risk", () => {
    expect(checkPayload(input({ answer_space: allText })).admit).toBe(true);
  });

  // Otherwise it is an open decision space wearing another name.
  it("is refused above low risk", () => {
    const v = checkPayload(input({ risk: "medium", answer_space: allText }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("fields_all_text_above_low_risk");
  });
});

describe("consequences", () => {
  it("are not required at low risk", () => {
    const noConsequence: AnswerSpace = {
      kind: "choice", select: "one",
      options: [{ id: "yes", label: "Sí" }, { id: "no", label: "No" }],
    };
    expect(checkPayload(input({ answer_space: noConsequence })).admit).toBe(true);
  });

  it("are required per branch on discrete spaces above low risk", () => {
    const partial: AnswerSpace = {
      kind: "choice", select: "one",
      options: [{ id: "yes", label: "Sí", consequence: "Firmo." }, { id: "no", label: "No" }],
    };
    const v = checkPayload(input({ risk: "medium", answer_space: partial }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("missing_consequences");
  });

  it("requires both branches of a boolean above low risk", () => {
    const half: AnswerSpace = { kind: "boolean", labels: { t: "Sí", f: "No" } };
    const v = checkPayload(input({ risk: "medium", answer_space: half }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("missing_consequences");
  });

  it("requires a single effect on continuous spaces above low risk", () => {
    const noEffect: AnswerSpace = { kind: "scalar", unit: "EUR" };
    const v = checkPayload(input({ risk: "high", answer_space: noEffect, subject: { id: "a", label: "A", body: "x", sha256: "abc" } }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("missing_consequences");
  });
});

describe("el referente en posesión, por encima de medium", () => {
  const withConsequences = choice;

  it("refuses a bare external uri at high risk", () => {
    const v = checkPayload(input({
      risk: "high",
      subject: { id: "a", label: "A", uri: "https://drive.example/x", sha256: "abc" },
      answer_space: withConsequences,
    }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("external_referent_at_high_risk");
  });

  it("accepts an attachment or an inline body at high risk", () => {
    expect(checkPayload(input({
      risk: "high",
      subject: { id: "a", label: "A", attachments: ["f_1"], sha256: "abc" },
      answer_space: withConsequences,
    })).admit).toBe(true);
  });

  // You cannot hash what you do not have.
  it("requires a sha256 at high risk", () => {
    const v = checkPayload(input({
      risk: "high",
      subject: { id: "a", label: "A", body: "x" },
      answer_space: withConsequences,
    }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("missing_referent_hash");
  });

  it("does not require a hash at medium risk", () => {
    expect(checkPayload(input({ risk: "medium", answer_space: withConsequences })).admit).toBe(true);
  });

  // `self_contained` means "no referent required", not "no rules apply". A
  // query that declares itself self-contained but still attaches a `uri` has
  // given the human something to look at, so it owes the same evidentiary bar
  // as any other referent.
  it("does not exempt an attached uri from the evidentiary bar just because self_contained is set", () => {
    const v = checkPayload(input({
      risk: "critical",
      self_contained: true,
      subject: { id: "a", label: "A", uri: "https://untrusted-host.example/doc" },
      answer_space: withConsequences,
    }));
    expect(v.admit).toBe(false);
    if (!v.admit) expect(v.reason).toBe("external_referent_at_high_risk");
  });

  it("still exempts a truly self-contained query with no referent at high risk", () => {
    expect(checkPayload(input({
      risk: "high",
      self_contained: true,
      subject: { id: "a", label: "A" },
      answer_space: withConsequences,
    })).admit).toBe(true);
  });
});

describe("cada rechazo trae remedio", () => {
  it("always carries a non-empty remedy, because an agent reads it", () => {
    const v = checkPayload(input({ subject: { id: "a", label: "A" } }));
    expect(v.admit).toBe(false);
    if (!v.admit) {
      expect(v.remedy.length).toBeGreaterThan(0);
      expect(v.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("atLeast", () => {
  it("raises to the higher of the two and never lowers", () => {
    expect(atLeast("low", "high")).toBe("high");
    expect(atLeast("critical", "medium")).toBe("critical");
    expect(atLeast("medium", "medium")).toBe("medium");
  });
});
