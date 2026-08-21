import { describe, expect, it, afterEach } from "bun:test";
import { AgentDialog } from "../src/client.js";
import { UndecidableQueryError, ValidationError } from "../src/errors.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(payload: unknown, status: number) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

const subject = { id: "deploy-v2.3", label: "Deploy v2.3 to production" };
const answerSpace = { kind: "boolean" as const, labels: { t: "Yes", f: "No" } };

describe("422 error mapping", () => {
  it("maps an UNDECIDABLE_QUERY body to UndecidableQueryError, carrying reason/remedy/priorQueryId", async () => {
    mockFetch(
      {
        error: {
          code: "UNDECIDABLE_QUERY",
          message: "This person decided about 'deploy-v2.3' on 2026-08-01.",
          reason: "prior_decision_without_delta",
          detail: "This person decided about 'deploy-v2.3' on 2026-08-01.",
          remedy: "Send `changes` with what has changed since then.",
          prior_query_id: "q0",
        },
      },
      422,
    );
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });

    const err = await client
      .createQuery({ queryType: "validation", subject, answerSpace, question: "Ship it?", targetHumanEmail: "someone@example.com" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UndecidableQueryError);
    expect(err).not.toBeInstanceOf(ValidationError);
    expect(err.message).toBe("This person decided about 'deploy-v2.3' on 2026-08-01.");
    expect(err.reason).toBe("prior_decision_without_delta");
    expect(err.remedy).toBe("Send `changes` with what has changed since then.");
    expect(err.priorQueryId).toBe("q0");
    expect(err.status).toBe(422);
  });

  it("leaves priorQueryId undefined when the refusal isn't a repeat-decision one", async () => {
    mockFetch(
      {
        error: {
          code: "UNDECIDABLE_QUERY",
          message: "This subject has no referent for the human to look at.",
          reason: "missing_referent",
          detail: "This subject has no referent for the human to look at.",
          remedy: "Add a uri or body to subject, or set self_contained to true.",
        },
      },
      422,
    );
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });

    const err = await client
      .createQuery({ queryType: "validation", subject, answerSpace, question: "Ship it?", targetHumanEmail: "someone@example.com" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UndecidableQueryError);
    expect(err.reason).toBe("missing_referent");
    expect(err.priorQueryId).toBeUndefined();
  });

  it("still maps an ordinary 422 to plain ValidationError, not UndecidableQueryError", async () => {
    mockFetch(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: { question: ["Required"] },
        },
      },
      422,
    );
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });

    const err = await client.getQuery("q1").catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect(err).not.toBeInstanceOf(UndecidableQueryError);
    expect(err.message).toBe("Invalid request data");
    expect(err.details).toEqual({ question: ["Required"] });
  });

  it("clarifyQuery also surfaces UndecidableQueryError on refusal", async () => {
    mockFetch(
      {
        error: {
          code: "UNDECIDABLE_QUERY",
          message: "This query has already been clarified 2 times.",
          reason: "clarification_rounds_exhausted",
          detail: "This query has already been clarified 2 times.",
          remedy: "Create a new query instead of clarifying this one again.",
        },
      },
      422,
    );
    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });

    const err = await client
      .clarifyQuery("q1", { context: "more context" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UndecidableQueryError);
    expect(err.reason).toBe("clarification_rounds_exhausted");
    expect(err.remedy).toBe("Create a new query instead of clarifying this one again.");
  });
});
