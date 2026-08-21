import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createQuery, getQuery, listAgentQueries } from "../services/query.service";
import { subjectSchema, changeSchema } from "../validators/query.validators";
import { answerSpaceSchema } from "../lib/answer-space";

export function createMcpServer() {
  const server = new McpServer({
    name: "AgentDialog",
    version: "1.0.0",
  });

  // Tool: human_query
  server.tool(
    "human_query",
    `Create a query for a human to answer. Creates a conversation, invites the human, and sends the question. Returns a query_id to poll for the response.

IMPORTANT workflow:
- If the human has NOT previously accepted a query from you, they will receive an invitation email they must accept first. Status will be "pending".
- If the human has previously accepted (trusted agent), they are auto-assigned. Status will be "assigned".
- After creating a query, use get_query to poll for the answer. Wait at least 10-30 seconds between polls.
- Queries expire after timeout_minutes (default: 60 min).

The query is admitted only if a human could actually decide it: give it a
'subject' the human can look at (a uri, an inline 'body', or attachments), or
set self_contained to true for a question that needs no referent. Give it an
'answer_space' describing the shape of an acceptable answer — a boolean,
a choice among options, a scalar, a date, free text, or a set of fields.
Above 'low' risk, free text is refused and each branch must state its
consequence. A refused query returns reason, detail and remedy so you can
correct the payload and retry.`,
    {
      query_type: z.enum(["validation", "interpretation", "expert_query", "labeling"])
        .describe("Type of query: validation (yes/no), interpretation (explain), expert_query (domain knowledge), labeling (classify/tag)"),
      risk: z.enum(["low", "medium", "high", "critical"]).default("low")
        .describe("Stakes of the decision. Above 'low', free text is refused and consequences must be stated."),
      subject: subjectSchema
        .describe("What the question is about: a uri, inline body, attachments, or a hash of the referent"),
      self_contained: z.boolean().default(false)
        .describe("Set true only if the question truly needs no referent"),
      question: z.string().min(1).max(10_000)
        .describe("The question to ask the human"),
      context: z.string().max(100_000).optional()
        .describe("Additional context (code, data, etc.) to help the human answer"),
      changes: z.array(changeSchema).max(100).optional()
        .describe("Optional list of before/after changes this decision covers"),
      answer_space: answerSpaceSchema
        .describe("The closed shape the answer must take: boolean, choice, scalar, date, text or fields"),
      target_human_email: z.string().email()
        .describe("Email of the human to ask"),
      confidence: z.number().min(0).max(1).optional()
        .describe("Agent's confidence level (0-1) in its own assessment, if applicable"),
      timeout_minutes: z.number().int().min(1).max(10080).default(60)
        .describe("Minutes to wait for a response before the query expires"),
    },
    async (args, extra) => {
      const agentId = (extra as any).agentId as string;
      if (!agentId) {
        console.warn("[MCP:TOOL] human_query called without agentId");
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Authentication required" }) }],
          isError: true,
        };
      }

      console.log(`[MCP:TOOL] human_query called by ${agentId} (type: ${args.query_type}, email: ${args.target_human_email})`);

      try {
        const result = await createQuery(agentId, {
          query_type: args.query_type,
          risk: args.risk,
          subject: args.subject,
          self_contained: args.self_contained,
          question: args.question,
          context: args.context,
          changes: args.changes,
          answer_space: args.answer_space,
          target_human_email: args.target_human_email,
          confidence: args.confidence,
          timeout_minutes: args.timeout_minutes,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err: any) {
        // A refusal is actionable, so hand the agent the whole shape rather than
        // just the message: reason and remedy are what let it retry correctly.
        const payload = err?.code === "UNDECIDABLE_QUERY"
          ? { error: err.message, code: err.code, reason: err.reason,
              remedy: err.remedy, prior_query_id: err.priorQueryId }
          : { error: err.message };
        console.error(`[MCP:TOOL] human_query error for ${agentId}:`, err);
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          isError: true,
        };
      }
    },
  );

  // Tool: get_query
  server.tool(
    "get_query",
    `Get the status and response of a human query. Use this to poll for the human's answer after creating a query with human_query.

Status meanings:
- "pending": The human has been invited but hasn't accepted the invitation yet. They need to check their email and accept first.
- "assigned": The human has accepted (or was auto-trusted) and can see the query, but hasn't answered yet.
- "answered": The human has responded. Check the "answer" field for their response.
- "expired": The timeout elapsed without a response. The query is closed.

Polling tips: Wait 10-30 seconds between checks. If status is "pending" for a long time, the human may not have seen the invitation email.`,
    {
      query_id: z.string().uuid().describe("The query ID returned by human_query"),
    },
    async (args, extra) => {
      const agentId = (extra as any).agentId as string;
      if (!agentId) {
        console.warn("[MCP:TOOL] get_query called without agentId");
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Authentication required" }) }],
          isError: true,
        };
      }

      console.log(`[MCP:TOOL] get_query called by ${agentId} (queryId: ${args.query_id})`);

      try {
        const result = await getQuery(args.query_id, agentId);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err: any) {
        console.error(`[MCP:TOOL] get_query error for ${agentId}:`, err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  // Tool: list_queries
  server.tool(
    "list_queries",
    `List your human queries with optional status filter.

Returns queries ordered by creation date (newest first). Use status filter to find specific queries:
- "pending": Queries waiting for human to accept invitation
- "assigned": Queries where human accepted but hasn't answered yet
- "answered": Completed queries with responses
- "expired": Timed-out queries`,
    {
      status: z.enum(["pending", "assigned", "answered", "expired"]).optional()
        .describe("Filter by query status"),
      limit: z.number().int().min(1).max(100).default(20)
        .describe("Maximum number of queries to return"),
    },
    async (args, extra) => {
      const agentId = (extra as any).agentId as string;
      if (!agentId) {
        console.warn("[MCP:TOOL] list_queries called without agentId");
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Authentication required" }) }],
          isError: true,
        };
      }

      console.log(`[MCP:TOOL] list_queries called by ${agentId} (status: ${args.status || "all"}, limit: ${args.limit})`);

      try {
        const queries = await listAgentQueries(agentId, {
          status: args.status,
          limit: args.limit,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ queries }) }],
        };
      } catch (err: any) {
        console.error(`[MCP:TOOL] list_queries error for ${agentId}:`, err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  return server;
}
