import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { createQuery, getQuery, listAgentQueries, updateQuery, cancelQuery } from "../../services/query.service";
import { validateBody, validateQuery } from "../../middleware/validate";
import { idempotency } from "../../middleware/idempotency";
import { createQuerySchema, listQueriesQuerySchema, patchQuerySchema } from "../../validators/query.validators";
import { documented } from "../../openapi/documented";
import { createQueryResponse } from "../../validators/query.responses";
import { apiError } from "../../validators/response.helpers";

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

// These four still register on the bare Hono instance, undocumented, until
// task 2 gives them their own RouteDoc.
hono.get("/", validateQuery(listQueriesQuerySchema), async (c) => {
  const agentId = c.get("agentId");
  const { status, limit } = c.get("validatedQuery");
  const queries = await listAgentQueries(agentId, { status, limit });
  return c.json({ data: queries });
});

hono.get("/:id", async (c) => {
  const agentId = c.get("agentId");
  const query = await getQuery(c.req.param("id"), agentId);
  return c.json({ data: query });
});

hono.patch("/:id", validateBody(patchQuerySchema), async (c) => {
  const agentId = c.get("agentId");
  const input = c.get("validatedBody");
  const query = await updateQuery(c.req.param("id"), agentId, input);
  return c.json({ data: query });
});

hono.post("/:id/cancel", async (c) => {
  const agentId = c.get("agentId");
  const query = await cancelQuery(c.req.param("id"), agentId);
  return c.json({ data: query });
});

// The bare Hono, not the documented() facade — app.route(...) in src/app.ts
// needs a real Hono instance to mount.
export default hono;
