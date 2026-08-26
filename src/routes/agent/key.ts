import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { idempotency } from "../../middleware/idempotency";
import { rotateApiKey } from "../../services/agent.service";

const app = new Hono<AppEnv>();

app.post("/key/rotate", idempotency(), async (c) => {
  const agentId = c.get("agentId");
  const { agent, apiKey } = await rotateApiKey(agentId);

  return c.json({
    data: {
      apiKey,
      apiKeyPrefix: agent.apiKeyPrefix,
      message: "API key rotated successfully. Store the new key securely — it won't be shown again.",
    },
  });
});

export default app;
