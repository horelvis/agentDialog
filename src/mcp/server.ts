import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createQuery, getQuery, listAgentQueries, updateQuery, cancelQuery } from "../services/query.service";
import { subjectSchema, changeSchema, patchQueryFields, patchQuerySchema } from "../validators/query.validators";
import { answerSpaceSchema } from "../lib/answer-space";

/**
 * The agent the transport authenticated for THIS request.
 *
 * It arrives inside `authInfo` because that is the only part of the
 * transport's `extra` the SDK forwards to a tool handler; see
 * `authInfoFor` in ../mcp/transport.ts. Reading it from anywhere else
 * silently yields undefined, which is how every tool came to answer
 * "Authentication required" in production.
 */
function callerAgentId(extra: unknown): string | undefined {
  return (extra as { authInfo?: { extra?: { agentId?: string } } })?.authInfo?.extra?.agentId;
}

export function createMcpServer() {
  const server = new McpServer({
    name: "AgentDialog",
    version: "1.0.0",
  });

  // Tool: human_query
  server.tool(
    "human_query",
    `Ask a human a question they can actually decide, and get a structured answer back.

WHAT YOU MUST PROVIDE:
- subject: what this is about. A stable id you reuse for the same thing, a label the human will recognise, and a referent they can look at — a uri, or the artefact inline in body. A question about a thing without the thing is refused.
- answer_space: how they answer. Pick one of boolean, choice, scalar, date, text or fields. Free text is only accepted at low risk.
- risk: your honest floor. The system raises it on its own when it sees money or a prior decision; it never lowers it.

WHAT THE SYSTEM DEMANDS OF YOU:
- Above low risk, every branch must say what it causes (consequence / effect).
- If this person already decided about this subject, you must send \`changes\` saying what changed since. The system checks its own records, so omitting it does not help.
- Above medium risk, we must hold the artefact ourselves (inline body, not a bare uri) and you must send its sha256.

A refusal comes back as 422 with a \`remedy\` field telling you exactly what to add. Read it and retry.

The human may answer, or reply that they lack context — in which case the query returns to you as needs_context and you clarify with clarify_query.`,
    {
      query_type: z.enum(["validation", "interpretation", "expert_query", "labeling"])
        .describe("Type of query: validation (yes/no), interpretation (explain), expert_query (domain knowledge), labeling (classify/tag)"),
      risk: z.enum(["low", "medium", "high", "critical"]).default("low")
        .describe("Stakes of the decision. Above 'low', free text is refused and consequences must be stated."),
      subject: subjectSchema
        .describe("What the question is about: a stable id, a label, and a referent — a uri or an inline body — plus its sha256 above medium risk"),
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
      const agentId = callerAgentId(extra);
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

  // Tool: clarify_query
  server.tool(
    "clarify_query",
    `Supply what a human said was missing, after get_query reports status "needs_context".

Only valid from that status — calling it on any other query is refused. The
query's clock is paused while it sits in needs_context, so there is no rush,
but there is a limit on how many times a single query may be clarified; once
that cap is reached the query is refused with a remedy telling you to open a
new query instead.

Send only the fields that address what the human flagged as missing:
subject (if the referent itself needs fixing), changes (if this is a delta on
a prior decision), answer_space, question or context. Anything you omit keeps
its previous value, but you must send at least one of them — a bare query_id
with nothing else is refused, the same as it would be over the REST PATCH
route. On success the query returns to "assigned" and the human can answer
again.`,
    {
      query_id: z.string().uuid().describe("The query ID, currently in needs_context"),
      subject: patchQueryFields.subject
        .describe("Replacement referent, if the human said they could not find or trust it"),
      changes: patchQueryFields.changes
        .describe("Before/after delta, if the human said this looks like a prior decision they need updated"),
      answer_space: patchQueryFields.answer_space
        .describe("Replacement answer shape, if the human said they could not answer in the one offered"),
      question: patchQueryFields.question
        .describe("Reworded question, if the human said the original was unclear"),
      context: patchQueryFields.context
        .describe("Additional context to resolve what the human flagged as missing"),
    },
    async (args, extra) => {
      const agentId = callerAgentId(extra);
      if (!agentId) {
        console.warn("[MCP:TOOL] clarify_query called without agentId");
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Authentication required" }) }],
          isError: true,
        };
      }

      console.log(`[MCP:TOOL] clarify_query called by ${agentId} (queryId: ${args.query_id})`);

      // server.tool()'s argument shape is a plain object of field schemas, so
      // patchQuerySchema's own "nothing to update" refine never runs merely by
      // declaring these fields inline above. Run it explicitly, or a bare
      // {query_id} silently resumes the clock and spends a clarification round
      // without supplying anything the human said was missing — a rule the
      // REST PATCH route enforces and this tool otherwise would not.
      const { query_id, ...patch } = args;
      const parsed = patchQuerySchema.safeParse(patch);
      if (!parsed.success) {
        const message = parsed.error.issues
          .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
          .join("; ");
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `Validation failed: ${message}` }) }],
          isError: true,
        };
      }

      try {
        const result = await updateQuery(query_id, agentId, parsed.data);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err: any) {
        // Same reasoning as human_query: a refusal is actionable, so hand the
        // agent the whole shape rather than just the message.
        const payload = err?.code === "UNDECIDABLE_QUERY"
          ? { error: err.message, code: err.code, reason: err.reason,
              remedy: err.remedy, prior_query_id: err.priorQueryId }
          : { error: err.message };
        console.error(`[MCP:TOOL] clarify_query error for ${agentId}:`, err);
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          isError: true,
        };
      }
    },
  );

  // Tool: cancel_query
  server.tool(
    "cancel_query",
    `Withdraw a query whose context has moved on, before the human answers.

An answer that already landed wins: if the human answered first, this call
returns a conflict rather than silently discarding their decision, so check
the result rather than assuming the withdrawal took effect. Once cancelled,
the query is closed for good — create a new one if you still need an answer.`,
    {
      query_id: z.string().uuid().describe("The query ID to withdraw"),
    },
    async (args, extra) => {
      const agentId = callerAgentId(extra);
      if (!agentId) {
        console.warn("[MCP:TOOL] cancel_query called without agentId");
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Authentication required" }) }],
          isError: true,
        };
      }

      console.log(`[MCP:TOOL] cancel_query called by ${agentId} (queryId: ${args.query_id})`);

      try {
        const result = await cancelQuery(args.query_id, agentId);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err: any) {
        // cancelQuery only ever throws NotFoundError or ConflictError — never
        // UndecidableQueryError, so unlike human_query/clarify_query there is
        // no reason/remedy/prior_query_id shape to forward here.
        console.error(`[MCP:TOOL] cancel_query error for ${agentId}:`, err);
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
    `Get the status and response of a human query. Use this to poll for the human's answer after creating a query with human_query.

Status meanings:
- "pending": The human has been invited but hasn't accepted the invitation yet. They need to check their email and accept first.
- "assigned": The human has accepted (or was auto-trusted) and can see the query, but hasn't answered yet.
- "answered": The human has responded. Check the "answer" field for their response.
- "needs_context": The human could not decide with what you gave them. Read the reason and use clarify_query to supply what is missing. The clock is paused until you do.
- "cancelled": You withdrew this query with cancel_query.
- "expired": The timeout elapsed without a response. The query is closed.

Polling tips: Wait 10-30 seconds between checks. If status is "pending" for a long time, the human may not have seen the invitation email.`,
    {
      query_id: z.string().uuid().describe("The query ID returned by human_query"),
    },
    async (args, extra) => {
      const agentId = callerAgentId(extra);
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
- "needs_context": Queries waiting on you — the human could not decide with what you gave them. This is the filter to reach for after any needs_context turn: it finds every query waiting on you in one call instead of polling each one individually with get_query. Clarify each with clarify_query.
- "cancelled": Queries you withdrew with cancel_query
- "expired": Timed-out queries`,
    {
      status: z.enum(["pending", "assigned", "answered", "needs_context", "cancelled", "expired"]).optional()
        .describe("Filter by query status. Use \"needs_context\" to find every query currently waiting on you to clarify, in one call"),
      limit: z.number().int().min(1).max(100).default(20)
        .describe("Maximum number of queries to return"),
    },
    async (args, extra) => {
      const agentId = callerAgentId(extra);
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
