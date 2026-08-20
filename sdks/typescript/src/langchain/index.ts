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

export function askHumanTool(client: AgentDialog, options: AskHumanOptions = {}) {
  return new DynamicStructuredTool({
    name: "ask_human",
    description:
      "Ask a human a question and get a query id back immediately. The human answers by email, which takes minutes or hours, so this does not wait. Use check_answer later.",
    schema: z.object({
      question: z.string().describe("The question to ask the human"),
      queryType: queryTypeSchema.describe(
        "validation (yes/no), interpretation (explain), expert_query (domain knowledge), labeling (classify)",
      ),
      context: z.string().optional().describe("Extra context that helps them answer"),
      targetHumanEmail: z.string().optional().describe("Email of the human to ask"),
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
        question: args.question,
        context: args.context,
        targetHumanEmail: email,
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
      "Check whether a human has answered a query created with ask_human. Returns the status and, once answered, their answer.",
    schema: z.object({
      queryId: z.string().describe("The id returned by ask_human"),
    }),
    func: async ({ queryId }) => {
      const query = await client.getQuery(queryId);
      return JSON.stringify({
        status: query.status,
        answer: query.answer,
        comment: query.comment,
      });
    },
  });
}
