import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { registerAgent } from "../../services/agent.service";
import { agentRegisterSchema } from "../../validators/agent.validators";
import { validateBody } from "../../middleware/validate";
import { registerRateLimit } from "../../middleware/rate-limit";

const app = new Hono<AppEnv>();

app.post("/", registerRateLimit(10), validateBody(agentRegisterSchema), async (c) => {
  const input = c.get("validatedBody");
  const { agent, apiKey } = await registerAgent(input);

  return c.json(
    {
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
        createdAt: agent.createdAt.toISOString(),
        apiKey, // Only returned once!
      },
    },
    201,
  );
});

export default app;
