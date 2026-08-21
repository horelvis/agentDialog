// Vercel AI SDK adapter. Built against ai@7 (inputSchema shape, AI SDK v5+).
import { tool, jsonSchema } from "ai";
import type { AgentDialog } from "../client.js";
import type { AnswerSpace, Change, QueryType, Risk, Subject } from "../queries.js";

export interface AskHumanOptions {
  /** Used when the model does not supply a target email. */
  defaultEmail?: string;
  timeoutMinutes?: number;
}

interface AskHumanArgs {
  question: string;
  queryType: QueryType;
  subject: Subject;
  answerSpace: AnswerSpace;
  context?: string;
  targetHumanEmail?: string;
  risk?: Risk;
  // The two fields a 422 can demand. Without them on the tool surface, a
  // model that receives `prior_decision_without_delta` or a genuine
  // `missing_referent` judgement has no way to comply with the remedy it
  // was just handed.
  changes?: Change[];
  selfContained?: boolean;
}

const ASK_HUMAN_DESCRIPTION = `Ask a human a question they can actually decide, and get a query id back immediately.

The human answers by email, which takes minutes or hours. This tool does NOT
wait for them. It returns a query id; use check_answer later to see whether
they have replied.

subject is what the question is about — a stable id, a label the human will
recognise, and a referent they can look at: a uri, or the artefact inline in
body. answerSpace is the shape the answer must take: boolean, choice, scalar,
date, text, or fields. Above "low" risk, a question without a referent or
without stated consequences is refused with a 422 telling you what to add.

Two refusals are answered with the other two fields. If the 422 says
prior_decision_without_delta, retry with changes listing what moved since the
human last decided. If it says missing_referent and the question genuinely
needs nothing to look at, retry with selfContained: true.`;

// A generic "object" schema, not a fully-typed oneOf per answer_space kind:
// the server is the authority on the catalogue and rejects anything that
// doesn't fit with a 422 carrying a remedy, so duplicating its full shape
// here would only be another place for the two descriptions to drift.
const ANSWER_SPACE_DESCRIPTION =
  'One of: {kind:"boolean",labels:{t,f}}, {kind:"choice",select:"one"|"many",options:[{id,label}]}, ' +
  '{kind:"scalar",unit,min?,max?,step?}, {kind:"date",earliest?,latest?}, {kind:"text",maxLength}, ' +
  '{kind:"fields",fields:[...]}.';

export function askHumanTool(client: AgentDialog, options: AskHumanOptions = {}) {
  return tool({
    description: ASK_HUMAN_DESCRIPTION,
    inputSchema: jsonSchema<AskHumanArgs>({
      type: "object",
      properties: {
        question: { type: "string", description: "The question to ask the human" },
        queryType: {
          type: "string",
          enum: ["validation", "interpretation", "expert_query", "labeling"],
          description:
            "validation (yes/no), interpretation (explain), expert_query (domain knowledge), labeling (classify)",
        },
        subject: {
          type: "object",
          description:
            "What the question is about: a stable id, a label, and a referent the human can look at — a uri, or the artefact inline in body",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            uri: { type: "string", description: "An http(s) link to the referent" },
            body: { type: "string", description: "The referent inline, if there is no stable link" },
            sha256: { type: "string", description: "Hash of the referent as you read it. Required above medium risk." },
          },
          required: ["id", "label"],
        },
        answerSpace: {
          type: "object",
          description: ANSWER_SPACE_DESCRIPTION,
        },
        context: { type: "string", description: "Extra context: code, data, anything that helps them answer" },
        targetHumanEmail: { type: "string", description: "Email of the human to ask" },
        risk: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Stakes of the decision. Defaults to low. The server raises it on its own; it never lowers it.",
        },
        changes: {
          type: "array",
          description:
            "What changed since this person last decided about this subject. Required when a 422 comes back with reason prior_decision_without_delta.",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "What changed, e.g. \"price\"" },
              before: { type: "string" },
              after: { type: "string" },
              materiality: { type: "string", enum: ["minor", "material"] },
            },
            required: ["path", "before", "after", "materiality"],
          },
        },
        selfContained: {
          type: "boolean",
          description:
            "Set true only when the question genuinely needs nothing to look at — it is the answer to a missing_referent 422 on a judgement call, not a way around attaching the artefact.",
        },
      },
      required: ["question", "queryType", "subject", "answerSpace"],
    }),
    execute: async (args: AskHumanArgs) => {
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
      return {
        queryId: created.queryId,
        status: created.status,
        expiresAt: created.expiresAt,
      };
    },
  });
}

export function checkAnswerTool(client: AgentDialog) {
  return tool({
    description:
      'Check whether a human has answered a query created with ask_human. Returns the status and, once answered, their typed answer. If status is "needs_context", read insufficientReason — there is no tool for this, so fix the query by calling the AgentDialog client\'s clarifyQuery(queryId, input) directly, then wait and check_answer again.',
    inputSchema: jsonSchema<{ queryId: string }>({
      type: "object",
      properties: {
        queryId: { type: "string", description: "The id returned by ask_human" },
      },
      required: ["queryId"],
    }),
    execute: async ({ queryId }: { queryId: string }) => {
      const query = await client.getQuery(queryId);
      return {
        status: query.status,
        answer: query.answer,
        comment: query.comment,
        insufficientReason: query.insufficientReason,
      };
    },
  });
}
