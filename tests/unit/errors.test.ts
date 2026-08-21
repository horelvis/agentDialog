import { describe, expect, it } from "bun:test";
import { UndecidableQueryError } from "../../src/lib/errors";

/**
 * The MCP `human_query` tool's catch block reads `err.code`, `err.message`,
 * `err.reason` and `err.remedy` (and optionally `err.priorQueryId`) off a
 * caught error to build the JSON payload it hands back to the agent. This
 * pins the shape that mapping depends on, so a refactor of `AppError` or
 * `UndecidableQueryError` that drops one of those fields fails here instead
 * of silently degrading into a bare `{ error: message }` for MCP callers —
 * which is exactly the bug this test was added to catch.
 */
describe("UndecidableQueryError", () => {
  it("carries every field the MCP catch block reads", () => {
    const err = new UndecidableQueryError(
      "missing_referent",
      "The subject 'x' carries no uri or body.",
      "Link it with `uri`, inline it with `body`, or set `self_contained: true`.",
    );

    expect(err.code).toBe("UNDECIDABLE_QUERY");
    expect(err.statusCode).toBe(422);
    expect(err.message).toBe("The subject 'x' carries no uri or body.");
    expect(err.reason).toBe("missing_referent");
    expect(err.remedy).toBe("Link it with `uri`, inline it with `body`, or set `self_contained: true`.");
    expect(err.priorQueryId).toBeUndefined();
  });

  it("carries priorQueryId when the refusal names an earlier decision", () => {
    const err = new UndecidableQueryError(
      "prior_decision_without_delta",
      "This subject was already decided and nothing material changed.",
      "Reference the prior answer, or explain what changed.",
      "c2e522df-697d-40c8-b046-702061feb1d6",
    );

    expect(err.priorQueryId).toBe("c2e522df-697d-40c8-b046-702061feb1d6");
  });
});
