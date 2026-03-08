import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import {
  createConversation,
  getConversationWithParticipants,
  isParticipant,
  listAgentConversations,
  updateConversation,
} from "../../services/conversation.service";
import { ForbiddenError } from "../../lib/errors";
import { createConversationSchema, updateConversationSchema } from "../../validators/conversation.validators";
import { validateBody, validateQuery } from "../../middleware/validate";
import { paginationQuery } from "../../validators/common.validators";
import { getLimit } from "../../lib/pagination";

const app = new Hono<AppEnv>();

app.post("/", validateBody(createConversationSchema), async (c) => {
  const agentId = c.get("agentId");
  const input = c.get("validatedBody");
  const conversation = await createConversation(agentId, input);

  return c.json({ data: conversation }, 201);
});

app.get("/", validateQuery(paginationQuery), async (c) => {
  const agentId = c.get("agentId");
  const query = c.get("validatedQuery") as any;
  const limit = getLimit(query.limit);
  const result = await listAgentConversations(agentId, limit, query.cursor);

  return c.json({
    data: result.data,
    pagination: { hasMore: result.hasMore, count: result.data.length },
  });
});

app.get("/:id", async (c) => {
  const conversationId = c.req.param("id");
  const agentId = c.get("agentId");

  if (!(await isParticipant(conversationId, "agent", agentId))) {
    throw new ForbiddenError("Not a participant in this conversation");
  }

  const conversation = await getConversationWithParticipants(conversationId);
  return c.json({ data: conversation });
});

app.patch("/:id", validateBody(updateConversationSchema), async (c) => {
  const conversationId = c.req.param("id");
  const agentId = c.get("agentId");
  const input = c.get("validatedBody");
  const conversation = await updateConversation(conversationId, agentId, input);

  return c.json({ data: conversation });
});

export default app;
