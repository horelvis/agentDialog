import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { createQuery, getQuery, listAgentQueries, updateQuery, cancelQuery } from "../../services/query.service";
import { validateBody, validateQuery } from "../../middleware/validate";
import { idempotency } from "../../middleware/idempotency";
import { createQuerySchema, listQueriesQuerySchema, patchQuerySchema } from "../../validators/query.validators";
import { documented } from "../../openapi/documented";
import { res } from "../../openapi/types";
import { createQueryResponse, queryResponse, listQueryResponse } from "../../validators/query.responses";
import { apiError } from "../../validators/response.helpers";
import { uuidParam } from "../../validators/common.validators";

const hono = new Hono<AppEnv>();
const app = documented(hono, { basePath: "/api/v1/agent/queries", tag: "queries" });

app.post(
  "/",
  {
    summary: "Ask a human a question",
    body: createQuerySchema,
    responses: {
      201: res(createQueryResponse, "The query, admitted and sent to the human."),
      422: res(
        apiError,
        "The request body failed validation, or the admission gate refused an undecidable question — see `reason`, `detail` and `remedy` in the error envelope.",
      ),
    },
    idempotent: true,
  },
  idempotency(),
  validateBody(createQuerySchema),
  async (c) => {
    const agentId = c.get("agentId");
    const input = c.get("validatedBody");
    const result = await createQuery(agentId, input);
    return c.json({ data: result }, 201);
  },
);

app.get(
  "/",
  {
    summary: "List your queries",
    description:
      "A bare list, not a paginated one: this returns every matching row up to `limit`, with no cursor or hasMore.",
    query: listQueriesQuerySchema,
    responses: {
      200: res(listQueryResponse, "Queries the authenticated agent has asked."),
      422: res(apiError, "The `status` or `limit` query parameter failed validation."),
    },
  },
  validateQuery(listQueriesQuerySchema),
  async (c) => {
    const agentId = c.get("agentId");
    const { status, limit } = c.get("validatedQuery");
    const queries = await listAgentQueries(agentId, { status, limit });
    return c.json({ data: queries });
  },
);

app.get(
  "/:id",
  {
    summary: "Get a query",
    params: uuidParam,
    responses: {
      200: res(queryResponse, "The query."),
      404: res(apiError, "No such query, or it wasn't created by the authenticated agent."),
    },
  },
  async (c) => {
    const agentId = c.get("agentId");
    const query = await getQuery(c.req.param("id"), agentId);
    return c.json({ data: query });
  },
);

app.patch(
  "/:id",
  {
    summary: "Answer a needs_context query with what was missing",
    params: uuidParam,
    body: patchQuerySchema,
    responses: {
      200: res(queryResponse, "The query, updated with what was missing and re-admitted."),
      404: res(apiError, "No such query, or it wasn't created by the authenticated agent."),
      409: res(
        apiError,
        "The query is not awaiting clarification (its status is not `needs_context`), or it changed underneath this request between the check and the write.",
      ),
      422: res(
        apiError,
        "The request body failed validation, or the admission gate refused the patched question.",
      ),
    },
  },
  validateBody(patchQuerySchema),
  async (c) => {
    const agentId = c.get("agentId");
    const input = c.get("validatedBody");
    const query = await updateQuery(c.req.param("id"), agentId, input);
    return c.json({ data: query });
  },
);

app.post(
  "/:id/cancel",
  {
    summary: "Withdraw a query",
    params: uuidParam,
    responses: {
      200: res(queryResponse, "The query, cancelled."),
      404: res(apiError, "No such query, or it wasn't created by the authenticated agent."),
      409: res(apiError, "The query already reached a terminal state and cannot be cancelled."),
    },
  },
  async (c) => {
    const agentId = c.get("agentId");
    const query = await cancelQuery(c.req.param("id"), agentId);
    return c.json({ data: query });
  },
);

// The bare Hono, not the documented() facade — app.route(...) in src/app.ts
// needs a real Hono instance to mount.
export default hono;
