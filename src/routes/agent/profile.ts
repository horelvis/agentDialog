import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { updateAgent } from "../../services/agent.service";
import { agentUpdateSchema } from "../../validators/agent.validators";
import { validateBody } from "../../middleware/validate";

const app = new Hono<AppEnv>();

app.get("/me", async (c) => {
  const agent = c.get("agent");
  return c.json({
    data: {
      id: agent.id,
      slug: agent.slug,
      displayName: agent.displayName,
      description: agent.description,
      avatarUrl: agent.avatarUrl,
      homepageUrl: agent.homepageUrl,
      provider: agent.provider,
      model: agent.model,
      capabilities: agent.capabilities,
      status: agent.status,
      apiKeyPrefix: agent.apiKeyPrefix,
      rateLimitRpm: agent.rateLimitRpm,
      metadata: agent.metadata,
      agentCard: agent.agentCard,
      trustScore: agent.trustScore,
      totalRatings: agent.totalRatings,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    },
  });
});

app.patch("/me", validateBody(agentUpdateSchema), async (c) => {
  const agentId = c.get("agentId");
  const input = c.get("validatedBody");
  const agent = await updateAgent(agentId, input);

  return c.json({
    data: {
      id: agent.id,
      slug: agent.slug,
      displayName: agent.displayName,
      description: agent.description,
      avatarUrl: agent.avatarUrl,
      homepageUrl: agent.homepageUrl,
      provider: agent.provider,
      model: agent.model,
      capabilities: agent.capabilities,
      status: agent.status,
      metadata: agent.metadata,
      agentCard: agent.agentCard,
      updatedAt: agent.updatedAt.toISOString(),
    },
  });
});

export default app;
