import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { createQuery, getQuery, listAgentQueries, updateQuery, cancelQuery } from "../../services/query.service";
import { validateBody, validateQuery } from "../../middleware/validate";
import { idempotency } from "../../middleware/idempotency";
import { createQuerySchema, listQueriesQuerySchema, patchQuerySchema } from "../../validators/query.validators";
import { documented } from "../../openapi/documented";
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
    responses: { 201: createQueryResponse, 422: apiError },
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
      "A bare list, not a paginated one: listAgentQueries returns every matching row up to `limit`, with no cursor or hasMore.",
    query: listQueriesQuerySchema,
    responses: { 200: listQueryResponse, 422: apiError },
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
    responses: { 200: queryResponse, 404: apiError },
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
    responses: { 200: queryResponse, 404: apiError, 409: apiError, 422: apiError },
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
    responses: { 200: queryResponse, 404: apiError, 409: apiError },
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
