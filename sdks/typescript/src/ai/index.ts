// Vercel AI SDK adapter. Built against ai@7 (inputSchema shape, AI SDK v5+).
import { tool, jsonSchema } from "ai";
import type { AgentDialog } from "../client.js";
import type { AnswerSpace, QueryType, Risk, Subject } from "../queries.js";

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
}

const ASK_HUMAN_DESCRIPTION = `Ask a human a question they can actually decide, and get a query id back immediately.

The human answers by email, which takes minutes or hours. This tool does NOT
wait for them. It returns a query id; use check_answer later to see whether
they have replied.

subject is what the question is about — a stable id, a label the human will
recognise, and a referent they can look at (uri, body, or attachments).
answerSpace is the shape the answer must take: boolean, choice, scalar,
date, text, or fields. Above "low" risk, a question without a referent or
without stated consequences is refused with a 422 telling you what to add.`;

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
            "What the question is about: a stable id, a label, and a referent (uri, body, or attachments) the human can look at",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            uri: { type: "string" },
            attachments: { type: "array", items: { type: "string" } },
            body: { type: "string" },
            sha256: { type: "string" },
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
