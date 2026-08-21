import { describe, expect, it } from "bun:test";
import { createMcpServer } from "../../src/mcp/server";
import { readyInNeedsContext } from "../helpers/queries";

/**
 * These call the registered `clarify_query`/`cancel_query` handlers directly,
 * the same way the MCP transport does once it has resolved `extra.agentId`
 * from the request's Bearer token — bypassing only the session/transport
 * plumbing (nothing else in this suite exercises that either), not the tool
 * logic itself.
 */
function toolHandler(server: ReturnType<typeof createMcpServer>, name: string) {
  const registered = (server as any)._registeredTools[name];
  if (!registered) throw new Error(`No such tool registered: ${name}`);
  return registered.handler as (args: any, extra: any) => Promise<any>;
}

function parse(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text);
}

const INTERNAL_COLUMNS = ["id", "agentId", "humanId", "conversationId", "queryMessageId", "responseMessageId"];

describe("clarify_query and cancel_query return the shaped response, not the raw row", () => {
  it("clarify_query", async () => {
    const { queryId, agentId } = await readyInNeedsContext(`mcp-clarify-${Date.now()}@example.com`);
    const server = createMcpServer();
    const handler = toolHandler(server, "clarify_query");

    const result = await handler(
      { query_id: queryId, context: "más contexto" },
      { agentId },
    );
    expect(result.isError).toBeFalsy();
    const body = parse(result);

    expect(body.query_id).toBe(queryId);
    expect(body.status).toBe("assigned");
    for (const leaked of INTERNAL_COLUMNS) {
      expect(body[leaked]).toBeUndefined();
    }
  });

  it("cancel_query", async () => {
    const { queryId, agentId } = await readyInNeedsContext(`mcp-cancel-${Date.now()}@example.com`);
    const server = createMcpServer();
    const handler = toolHandler(server, "cancel_query");

    const result = await handler({ query_id: queryId }, { agentId });
    expect(result.isError).toBeFalsy();
    const body = parse(result);

    expect(body.query_id).toBe(queryId);
    expect(body.status).toBe("cancelled");
    for (const leaked of INTERNAL_COLUMNS) {
      expect(body[leaked]).toBeUndefined();
    }
  });
});

describe("clarify_query refuses a patch that supplies nothing", () => {
  it("rejects a bare query_id — server.tool()'s shape does not run patchQuerySchema's own refine on its own", async () => {
    const { queryId, agentId } = await readyInNeedsContext(`mcp-clarify-empty-${Date.now()}@example.com`);
    const server = createMcpServer();
    const handler = toolHandler(server, "clarify_query");

    const result = await handler({ query_id: queryId }, { agentId });
    expect(result.isError).toBe(true);
    const body = parse(result);
    expect(body.error).toContain("nothing to update");
  });

  it("does not resume the clock or spend a clarification round on a rejected empty patch", async () => {
    const { queryId, agentId } = await readyInNeedsContext(`mcp-clarify-empty2-${Date.now()}@example.com`);
    const server = createMcpServer();
    const handler = toolHandler(server, "clarify_query");

    await handler({ query_id: queryId }, { agentId });

    const getHandler = toolHandler(server, "get_query");
    const after = parse(await getHandler({ query_id: queryId }, { agentId }));
    expect(after.status).toBe("needs_context");
  });
});
