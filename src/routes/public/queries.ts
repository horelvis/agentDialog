import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../../types/hono";
import { getDb } from "../../db";
import { humans } from "../../db/schema/humans";
import { getQueryForGrant, respondQuery } from "../../services/query.service";
import { consumeQueryGrant } from "../../services/query-grant.service";
import { respondQuerySchema } from "../../validators/query.validators";
import { validateBody } from "../../middleware/validate";
import { queryGrantAuth } from "../../middleware/query-grant-auth";
import { canonicaliseEmail } from "../../lib/email-identity";

const app = new Hono<AppEnv>();

app.use("/:token", queryGrantAuth);
app.use("/:token/*", queryGrantAuth);

app.get("/:token", async (c) => {
  const query = await getQueryForGrant(c.get("grantQueryId"));
  return c.json({ data: query });
});

app.post("/:token/respond", validateBody(respondQuerySchema), async (c) => {
  const input = c.get("validatedBody");
  const queryId = c.get("grantQueryId");
  const email = canonicaliseEmail(c.get("grantEmail"));

  // respondQuery works in terms of a human row, and its own entitlement check
  // independently requires that human's address to be the one the query was
  // addressed to. Creating the row grants nothing: it has no session token, so
  // there is nothing to sign in with.
  const db = getDb();
  const [existing] = await db.select().from(humans).where(eq(humans.email, email)).limit(1);
  const human = existing ?? (await db.insert(humans).values({ email }).returning())[0];

  const result = await respondQuery(queryId, human.id, input);

  // Only a real answer spends the link. `insufficient_context` hands the turn
  // back to the agent, and that person has to be able to return by the same
  // link once the agent has clarified.
  if (input.outcome === "answer") {
    await consumeQueryGrant(c.get("grantId"));
  }

  return c.json({ data: result });
});

export default app;
