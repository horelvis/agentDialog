import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createQuery, getQuery, listAgentQueries } from "../services/query.service";

export function createMcpServer() {
  const server = new McpServer({
    name: "AgentDialog",
    version: "1.0.0",
  });

  // Tool: human_query
  server.tool(
    "human_query",
    "Create a query for a human to answer. Creates a conversation, invites the human, and sends the question. Returns a query_id to poll for the response.",
    {
      query_type: z.enum(["validation", "interpretation", "expert_query", "labeling"])
        .describe("Type of query: validation (yes/no), interpretation (explain), expert_query (domain knowledge), labeling (classify/tag)"),
      question: z.string().min(1).max(10_000)
        .describe("The question to ask the human"),
      context: z.string().max(100_000).optional()
        .describe("Additional context (code, data, etc.) to help the human answer"),
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
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Authentication required" }) }],
          isError: true,
        };
      }

      try {
        const result = await createQuery(agentId, {
          query_type: args.query_type,
          question: args.question,
          context: args.context,
          target_human_email: args.target_human_email,
          confidence: args.confidence,
          timeout_minutes: args.timeout_minutes,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  // Tool: get_query
  server.tool(
    "get_query",
    "Get the status and response of a human query. Use this to poll for the human's answer after creating a query with human_query.",
    {
      query_id: z.string().uuid().describe("The query ID returned by human_query"),
    },
    async (args, extra) => {
      const agentId = (extra as any).agentId as string;
      if (!agentId) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Authentication required" }) }],
          isError: true,
        };
      }

      try {
        const result = await getQuery(args.query_id, agentId);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err: any) {
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
    "List your human queries with optional status filter.",
    {
      status: z.enum(["pending", "assigned", "answered", "expired"]).optional()
        .describe("Filter by query status"),
      limit: z.number().int().min(1).max(100).default(20)
        .describe("Maximum number of queries to return"),
    },
    async (args, extra) => {
      const agentId = (extra as any).agentId as string;
      if (!agentId) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Authentication required" }) }],
          isError: true,
        };
      }

      try {
        const queries = await listAgentQueries(agentId, {
          status: args.status,
          limit: args.limit,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ queries }) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  return server;
}
