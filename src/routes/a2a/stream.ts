import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../../types/hono";
import { a2aSenderAuth, a2aResolveRecipient } from "../../middleware/a2a-auth";
import { getTaskAsSender } from "../../services/a2a-mailbox.service";
import { taskEventChannel } from "../../services/a2a-delivery.service";
import { getSubscriber } from "../../lib/redis";

/**
 * Server-sent events for one task. The sender watches a task it dropped into a
 * recipient's mailbox; status and artifact updates published by the recipient
 * on Redis are fanned out here. Access is verified up front: only the task's
 * sender can open this stream on the public surface.
 */
const hono = new Hono<AppEnv>();

hono.use("*", a2aSenderAuth);
hono.use("*", a2aResolveRecipient);

hono.get("/tasks/:id/stream", async (c) => {
  const taskId = c.req.param("id") ?? "";
  await getTaskAsSender(taskId, c.get("a2aSenderAgentId"));

  const sub = getSubscriber();
  const channelName = taskEventChannel(taskId);

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  return streamSSE(c, async (stream) => {
    await sub.subscribe(channelName);

    let closed = false;
    let resolve!: () => void;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      sub.off("message", onMessage);
      sub.unsubscribe(channelName).catch(() => {});
      resolve();
    };

    const onMessage = (channel: string, message: string) => {
      if (channel !== channelName) return;
      try {
        const envelope = JSON.parse(message) as { event?: string; payload?: unknown };
        stream.writeSSE({
          event: envelope.event ?? "message",
          data: JSON.stringify(envelope.payload ?? {}),
        }).catch(() => {});
      } catch {
        // A malformed message on the channel is not a reason to drop the stream.
      }
    };

    sub.on("message", onMessage);
    stream.onAbort(cleanup);

    await new Promise<void>((r) => {
      resolve = r;
    });
  });
});

export default hono;