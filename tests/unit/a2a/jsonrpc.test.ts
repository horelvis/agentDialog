import { describe, expect, it } from "bun:test";
import { dispatchJsonRpc } from "@/lib/a2a/jsonrpc-dispatcher";

describe("dispatchJsonRpc", () => {
  const ctx = { senderAgentId: "11111111-1111-1111-1111-111111111111", recipientAgentId: "22222222-2222-2222-2222-222222222222" };

  it("answers an unknown method with -32601", async () => {
    const response = await dispatchJsonRpc({ jsonrpc: "2.0", method: "no/such", id: 1 }, ctx);
    expect(response.error?.code).toBe(-32601);
    expect(response.id).toBe(1);
  });

  it("preserves the request id on success shape", async () => {
    const response = await dispatchJsonRpc({ jsonrpc: "2.0", method: "tasks/get", params: { taskId: "not-a-uuid" }, id: "abc" }, ctx);
    // The mailbox service would reject the uuid, but the envelope and id survive
    // whatever the service throws — that contract is what the binding depends on.
    expect(response.id).toBe("abc");
    expect(response.error).toBeDefined();
  });

  it("wraps a service error into an RPC error, not a throw", async () => {
    const response = await dispatchJsonRpc({ jsonrpc: "2.0", method: "message/send", params: {}, id: 7 }, ctx);
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32000);
  });
});