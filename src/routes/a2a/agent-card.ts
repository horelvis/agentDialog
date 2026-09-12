import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../../types/hono";
import { getDb } from "../../db";
import { agents } from "../../db/schema/agents";
import { buildAgentCard, buildAgentCardUrl } from "../../lib/a2a";
import { NotFoundError } from "../../lib/errors";

/**
 * The A2A discovery document. It is the one public endpoint on an agent's A2A
 * surface: a client fetches it before any message. Trust-sensitive fields are
 * derived from the platform; the agent only decorates skills and descriptions.
 */
const hono = new Hono<AppEnv>();

hono.get("/.well-known/agent.json", async (c) => {
  const slug = c.req.param("agentSlug") ?? "";
  const db = getDb();

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent || agent.status !== "active") {
    throw new NotFoundError("Agent", slug);
  }

  const host = c.req.header("x-forwarded-host") || c.req.header("host") || new URL(c.req.url).host;
  const proto = c.req.header("x-forwarded-proto") || "https";
  const baseUrl = buildAgentCardUrl(`${proto}://${host}`, agent.slug);

  return c.json(buildAgentCard(agent, baseUrl));
});

export default hono;