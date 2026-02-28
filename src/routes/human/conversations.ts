import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import {
  getConversationWithParticipants,
  listHumanConversations,
} from "../../services/conversation.service";
import { validateQuery } from "../../middleware/validate";
import { paginationQuery } from "../../validators/common.validators";
import { getLimit } from "../../lib/pagination";

const app = new Hono<AppEnv>();

app.get("/conversations", validateQuery(paginationQuery), async (c) => {
  const humanId = c.get("humanId");
  const query = c.get("validatedQuery") as any;
  const limit = getLimit(query.limit);
  const result = await listHumanConversations(humanId, limit, query.cursor);

  return c.json({
    data: result.data,
    pagination: { hasMore: result.hasMore, count: result.data.length },
  });
});

app.get("/conversations/:id", async (c) => {
  const conversationId = c.req.param("id");
  const conversation = await getConversationWithParticipants(conversationId);
  return c.json({ data: conversation });
});

export default app;
