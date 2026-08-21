// LangChain.js adapter. Built against @langchain/core@1 (DynamicStructuredTool class).
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentDialog } from "../client.js";

export interface AskHumanOptions {
  /** Used when the model does not supply a target email. */
  defaultEmail?: string;
  timeoutMinutes?: number;
}

const queryTypeSchema = z.enum(["validation", "interpretation", "expert_query", "labeling"]);
const riskSchema = z.enum(["low", "medium", "high", "critical"]);

const subjectSchema = z.object({
  id: z.string().describe("A stable id you reuse for the same thing"),
  label: z.string().describe("A human-readable label"),
  uri: z.string().optional().describe("An http(s) link to the referent"),
  body: z.string().optional().describe("The referent inline, if there is no stable link"),
  sha256: z.string().optional().describe("Hash of the referent as you read it. Required above medium risk."),
}).describe(
  "What the question is about: a stable id, a label, and a referent the human can look at — a uri, or the artefact inline in body",
);

// The two fields a 422 can demand. Without them on the tool surface, a model
// handed `prior_decision_without_delta` or a genuine `missing_referent` has
// nowhere to put the fix its own remedy just asked for.
const changeSchema = z.object({
  path: z.string().describe('What changed, e.g. "price"'),
  before: z.string(),
  after: z.string(),
  materiality: z.enum(["minor", "material"]),
});

const labelsSchema = z.object({ t: z.string(), f: z.string() });
const choiceOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  consequence: z.string().optional(),
});
const slotSchema = z.object({
  id: z.string(),
  label: z.string(),
  proposed: z.unknown().optional(),
}).and(
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("boolean"), labels: labelsSchema }),
    z.object({ kind: z.literal("choice"), options: z.array(z.object({ id: z.string(), label: z.string() })) }),
    z.object({
      kind: z.literal("scalar"),
      unit: z.string(),
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
    }),
    z.object({ kind: z.literal("date"), earliest: z.string().optional(), latest: z.string().optional() }),
    z.object({ kind: z.literal("text"), maxLength: z.number() }),
  ]),
);

// Mirrors the server's answer-space catalogue in camelCase. Kept in sync by
// hand with sdks/typescript/src/queries.ts's AnswerSpace type — the server
// still has final say and refuses anything that doesn't fit with a 422.
const answerSpaceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("boolean"), labels: labelsSchema, consequences: labelsSchema.optional() }),
  z.object({
    kind: z.literal("choice"),
    select: z.enum(["one", "many"]),
    options: z.array(choiceOptionSchema),
  }),
  z.object({
    kind: z.literal("scalar"),
    unit: z.string(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    effect: z.string().optional(),
  }),
  z.object({
    kind: z.literal("date"),
    earliest: z.string().optional(),
    latest: z.string().optional(),
    effect: z.string().optional(),
  }),
  z.object({ kind: z.literal("text"), maxLength: z.number() }),
  z.object({
    kind: z.literal("fields"),
    fields: z.array(slotSchema),
    effect: z.string().optional(),
  }),
]).describe(
  "The shape the answer must take. Above 'low' risk, every branch must state its consequence/effect.",
);

export function askHumanTool(client: AgentDialog, options: AskHumanOptions = {}) {
  return new DynamicStructuredTool({
    name: "ask_human",
    description:
      "Ask a human a question they can actually decide, and get a query id back immediately. The human answers by email, which takes minutes or hours, so this does not wait. Use check_answer later. If the call comes back 422 with reason prior_decision_without_delta, retry with `changes`; if it comes back missing_referent and the question genuinely needs nothing to look at, retry with `selfContained: true`.",
    schema: z.object({
      question: z.string().describe("The question to ask the human"),
      queryType: queryTypeSchema.describe(
        "validation (yes/no), interpretation (explain), expert_query (domain knowledge), labeling (classify)",
      ),
      subject: subjectSchema,
      answerSpace: answerSpaceSchema,
      context: z.string().optional().describe("Extra context that helps them answer"),
      targetHumanEmail: z.string().optional().describe("Email of the human to ask"),
      risk: riskSchema.optional().describe(
        "Stakes of the decision. Defaults to low. The server raises it on its own; it never lowers it.",
      ),
      changes: z.array(changeSchema).optional().describe(
        "What changed since this person last decided about this subject. Required when a 422 comes back with reason prior_decision_without_delta.",
      ),
      selfContained: z.boolean().optional().describe(
        "Set true only when the question genuinely needs nothing to look at — the answer to a missing_referent 422 on a judgement call, not a way around supplying the artefact.",
      ),
    }),
    func: async (args) => {
      const email = args.targetHumanEmail ?? options.defaultEmail;
      if (!email) {
        throw new Error(
          "No target email: pass targetHumanEmail in the tool call or defaultEmail in askHumanTool options",
        );
      }
      const created = await client.createQuery({
        queryType: args.queryType,
        subject: args.subject,
        answerSpace: args.answerSpace,
        question: args.question,
        context: args.context,
        targetHumanEmail: email,
        risk: args.risk,
        changes: args.changes,
        selfContained: args.selfContained,
        timeoutMinutes: options.timeoutMinutes,
      });
      return JSON.stringify({
        queryId: created.queryId,
        status: created.status,
        expiresAt: created.expiresAt,
      });
    },
  });
}

export function checkAnswerTool(client: AgentDialog) {
  return new DynamicStructuredTool({
    name: "check_answer",
    description:
      'Check whether a human has answered a query created with ask_human. Returns the status and, once answered, their typed answer. If status is "needs_context", read insufficientReason.',
    schema: z.object({
      queryId: z.string().describe("The id returned by ask_human"),
    }),
    func: async ({ queryId }) => {
      const query = await client.getQuery(queryId);
      return JSON.stringify({
        status: query.status,
        answer: query.answer,
        comment: query.comment,
        insufficientReason: query.insufficientReason,
      });
    },
  });
}
