// Vercel AI SDK adapter. Built against ai@7 (inputSchema shape, AI SDK v5+).
import { tool, jsonSchema } from "ai";
import type { AgentDialog } from "../client.js";
import type { QueryType } from "../queries.js";

export interface AskHumanOptions {
  /** Used when the model does not supply a target email. */
  defaultEmail?: string;
  timeoutMinutes?: number;
}

interface AskHumanArgs {
  question: string;
  queryType: QueryType;
  context?: string;
  targetHumanEmail?: string;
}

const ASK_HUMAN_DESCRIPTION = `Ask a human a question and get a query id back immediately.

The human answers by email, which takes minutes or hours. This tool does NOT
wait for them. It returns a query id; use check_answer later to see whether
they have replied.`;

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
        context: { type: "string", description: "Extra context: code, data, anything that helps them answer" },
        targetHumanEmail: { type: "string", description: "Email of the human to ask" },
      },
      required: ["question", "queryType"],
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
        question: args.question,
        context: args.context,
        targetHumanEmail: email,
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
      "Check whether a human has answered a query created with ask_human. Returns the status and, once answered, their answer.",
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
      };
    },
  });
}
