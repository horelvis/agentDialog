import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { validateBody } from "../../middleware/validate";
import { respondQuerySchema } from "../../validators/query.validators";
import { listHumanQueries, getQueryForHuman, respondQuery } from "../../services/query.service";

const app = new Hono<AppEnv>();

// GET /queries — list pending/assigned queries for this human
app.get("/queries", async (c) => {
  const humanId = c.get("humanId");
  const queries = await listHumanQueries(humanId);
  return c.json({ data: queries });
});

// GET /queries/:id — get a specific query
app.get("/queries/:id", async (c) => {
  const humanId = c.get("humanId");
  const queryId = c.req.param("id");
  const query = await getQueryForHuman(queryId, humanId);
  return c.json({ data: query });
});

// POST /queries/:id/respond — respond to a query
app.post("/queries/:id/respond", validateBody(respondQuerySchema), async (c) => {
  const humanId = c.get("humanId");
  const queryId = c.req.param("id");
  const input = c.get("validatedBody");
  const query = await respondQuery(queryId, humanId, input);
  return c.json({ data: query });
});

export default app;
