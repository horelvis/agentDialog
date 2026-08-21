import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createQuerySchema, patchQueryFields } from "../../src/validators/query.validators";

/**
 * The MCP tool is the surface agents actually call. Its schema is what an LLM
 * reads to decide what to send, so it has to describe the obligations rather
 * than only the fields.
 *
 * `human_query`'s argument schema in src/mcp/server.ts is built from the same
 * validators as `createQuerySchema` (subjectSchema, changeSchema,
 * answerSpaceSchema), so exercising `createQuerySchema` here documents that
 * contract without depending on the tool registration internals. These three
 * tests were already passing before this task started — the schema change
 * landed in an earlier task — so they document and guard the contract rather
 * than being TDD evidence for it.
 */
describe("el contrato que ve un agente (human_query)", () => {
  it("requires a subject and an answer space", () => {
    const withoutSubject = {
      query_type: "validation", question: "¿Sí?",
      answer_space: { kind: "boolean", labels: { t: "Sí", f: "No" } },
      target_human_email: "a@example.com",
    };
    expect(createQuerySchema.safeParse(withoutSubject).success).toBe(false);
  });

  it("defaults risk to low and self_contained to false", () => {
    const parsed = createQuerySchema.parse({
      query_type: "validation",
      subject: { id: "s", label: "S", body: "x" },
      question: "¿Sí?",
      answer_space: { kind: "boolean", labels: { t: "Sí", f: "No" } },
      target_human_email: "a@example.com",
    });
    expect(parsed.risk).toBe("low");
    expect(parsed.self_contained).toBe(false);
  });

  it("rejects an answer space outside the catalogue", () => {
    const parsed = createQuerySchema.safeParse({
      query_type: "validation",
      subject: { id: "s", label: "S", body: "x" },
      question: "¿Sí?",
      answer_space: { kind: "freeform" },
      target_human_email: "a@example.com",
    });
    expect(parsed.success).toBe(false);
  });
});

/**
 * `clarify_query`'s argument schema in src/mcp/server.ts is `query_id` plus
 * `patchQueryFields` spread directly — the same field schemas
 * `patchQuerySchema` (the REST PATCH validator) is built from, so a subject
 * or answer_space clarify_query rejects is one the REST route would reject
 * too, and vice versa. Unlike `patchQuerySchema`, the tool schema is not
 * wrapped in the "nothing to update" refine, since a bare query_id is a
 * legitimate MCP call shape (zod just validates the fields present).
 *
 * The tool's actual zod object is defined inline in src/mcp/server.ts and
 * is not exported, so this rebuilds it here from the same exported
 * `patchQueryFields` used there — it does not import the literal object the
 * tool registers, only the field definitions it is built from.
 */
describe("el contrato que ve un agente (clarify_query)", () => {
  const clarifyArgsSchema = z.object({ query_id: z.string().uuid(), ...patchQueryFields });
  const validQueryId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

  it("requires query_id to be a uuid", () => {
    const parsed = clarifyArgsSchema.safeParse({ query_id: "not-a-uuid" });
    expect(parsed.success).toBe(false);
  });

  it("accepts a bare query_id with no clarification fields", () => {
    const parsed = clarifyArgsSchema.safeParse({ query_id: validQueryId });
    expect(parsed.success).toBe(true);
  });

  it("accepts a changes delta with a materiality on each entry", () => {
    const parsed = clarifyArgsSchema.safeParse({
      query_id: validQueryId,
      changes: [{ path: "amount", before: "100", after: "150", materiality: "material" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a changes entry missing materiality", () => {
    const parsed = clarifyArgsSchema.safeParse({
      query_id: validQueryId,
      changes: [{ path: "amount", before: "100", after: "150" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an answer_space outside the catalogue, same as human_query", () => {
    const parsed = clarifyArgsSchema.safeParse({
      query_id: validQueryId,
      answer_space: { kind: "freeform" },
    });
    expect(parsed.success).toBe(false);
  });
});

/**
 * `cancel_query` takes only `query_id`. Its schema in src/mcp/server.ts is
 * not exported, so this rebuilds the same single-field shape to document the
 * contract: a valid uuid is required, and nothing else is accepted as input.
 */
describe("el contrato que ve un agente (cancel_query)", () => {
  const cancelArgsSchema = z.object({ query_id: z.string().uuid() });

  it("requires query_id", () => {
    expect(cancelArgsSchema.safeParse({}).success).toBe(false);
  });

  it("requires query_id to be a uuid, not an arbitrary string", () => {
    expect(cancelArgsSchema.safeParse({ query_id: "abc123" }).success).toBe(false);
  });

  it("accepts a well-formed query_id", () => {
    expect(cancelArgsSchema.safeParse({ query_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }).success).toBe(true);
  });
});
