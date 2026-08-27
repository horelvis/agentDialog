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
import { idempotency } from "../../middleware/idempotency";
import { paginationQuery, uuidParam } from "../../validators/common.validators";
import { getLimit } from "../../lib/pagination";
import { documented } from "../../openapi/documented";
import {
  conversationResponse,
  conversationWithParticipantsResponse,
  conversationListResponse,
} from "../../validators/conversation.responses";
import { apiError } from "../../validators/response.helpers";

const hono = new Hono<AppEnv>();
const app = documented(hono, { basePath: "/api/v1/agent/conversations", tag: "conversations" });

app.post(
  "/",
  {
    summary: "Start a conversation",
    body: createConversationSchema,
    responses: { 201: conversationResponse, 422: apiError },
    idempotent: true,
  },
  idempotency(),
  validateBody(createConversationSchema),
  async (c) => {
    const agentId = c.get("agentId");
    const input = c.get("validatedBody");
    const conversation = await createConversation(agentId, input);

    return c.json({ data: conversation }, 201);
  },
);

app.get(
  "/",
  {
    summary: "List your conversations",
    description:
      "Paginated, but not with the API's usual envelope: this route builds its own pagination object with only hasMore and count, and never returns nextCursor or prevCursor even though the cursor query param is accepted.",
    query: paginationQuery,
    responses: { 200: conversationListResponse, 422: apiError },
  },
  validateQuery(paginationQuery),
  async (c) => {
    const agentId = c.get("agentId");
    const query = c.get("validatedQuery") as any;
    const limit = getLimit(query.limit);
    const result = await listAgentConversations(agentId, limit, query.cursor);

    return c.json({
      data: result.data,
      pagination: { hasMore: result.hasMore, count: result.data.length },
    });
  },
);

app.get(
  "/:id",
  {
    summary: "Get a conversation and its participants",
    params: uuidParam,
    responses: { 200: conversationWithParticipantsResponse, 403: apiError, 404: apiError },
  },
  async (c) => {
    const conversationId = c.req.param("id");
    const agentId = c.get("agentId");

    if (!(await isParticipant(conversationId, "agent", agentId))) {
      throw new ForbiddenError("Not a participant in this conversation");
    }

    const conversation = await getConversationWithParticipants(conversationId);
    return c.json({ data: conversation });
  },
);

app.patch(
  "/:id",
  {
    summary: "Update a conversation",
    params: uuidParam,
    body: updateConversationSchema,
    responses: { 200: conversationResponse, 403: apiError, 404: apiError, 422: apiError },
  },
  validateBody(updateConversationSchema),
  async (c) => {
    const conversationId = c.req.param("id");
    const agentId = c.get("agentId");
    const input = c.get("validatedBody");
    const conversation = await updateConversation(conversationId, agentId, input);

    return c.json({ data: conversation });
  },
);

// The bare Hono, not the documented() facade — app.route(...) in src/app.ts
// needs a real Hono instance to mount.
export default hono;
