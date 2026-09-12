import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { a2aSenderAuth, a2aResolveRecipient } from "../../middleware/a2a-auth";
import { validateBody } from "../../middleware/validate";
import { jsonRpcRequestSchema, type JsonRpcRequest } from "../../lib/a2a";
import { dispatchJsonRpc } from "../../lib/a2a/jsonrpc-dispatcher";

/**
 * The A2A JSON-RPC endpoint. The card advertises both bindings at the same URL;
 * a JSON body with `jsonrpc: "2.0"` is dispatched here, anything else is the
 * HTTP+JSON binding.
 */
const hono = new Hono<AppEnv>();

hono.use("*", a2aSenderAuth);
hono.use("*", a2aResolveRecipient);

hono.post("/", validateBody(jsonRpcRequestSchema), async (c) => {
  const request = c.get("validatedBody") as JsonRpcRequest;
  const response = await dispatchJsonRpc(request, {
    senderAgentId: c.get("a2aSenderAgentId"),
    recipientAgentId: c.get("a2aRecipientAgentId"),
  });
  return c.json(response);
});

export default hono;