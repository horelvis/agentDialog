import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { createQuery, getQuery, listAgentQueries } from "../../services/query.service";
import { validateBody, validateQuery } from "../../middleware/validate";
import { createQuerySchema, listQueriesQuerySchema } from "../../validators/query.validators";

const app = new Hono<AppEnv>();

app.post("/", validateBody(createQuerySchema), async (c) => {
  const agentId = c.get("agentId");
  const input = c.get("validatedBody");
  const result = await createQuery(agentId, input);
  return c.json({ data: result }, 201);
});

app.get("/", validateQuery(listQueriesQuerySchema), async (c) => {
  const agentId = c.get("agentId");
  const { status, limit } = c.get("validatedQuery");
  const queries = await listAgentQueries(agentId, { status, limit });
  return c.json({ data: queries });
});

app.get("/:id", async (c) => {
  const agentId = c.get("agentId");
  const query = await getQuery(c.req.param("id"), agentId);
  return c.json({ data: query });
});

export default app;
