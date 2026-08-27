import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { updateAgent } from "../../services/agent.service";
import { agentUpdateSchema } from "../../validators/agent.validators";
import { validateBody } from "../../middleware/validate";
import { documented } from "../../openapi/documented";
import { agentProfileResponse, agentProfileUpdateResponse } from "../../validators/agent.responses";
import { apiError } from "../../validators/response.helpers";

const hono = new Hono<AppEnv>();
const app = documented(hono, { basePath: "/api/v1/agent", tag: "profile" });

app.get(
  "/me",
  {
    summary: "Get the authenticated agent's profile",
    responses: { 200: agentProfileResponse },
  },
  async (c) => {
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
  },
);

app.patch(
  "/me",
  {
    summary: "Update the authenticated agent's profile",
    body: agentUpdateSchema,
    responses: { 200: agentProfileUpdateResponse, 404: apiError, 422: apiError },
  },
  validateBody(agentUpdateSchema),
  async (c) => {
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
  },
);

// The bare Hono, not the documented() facade — app.route(...) in src/app.ts
// needs a real Hono instance to mount.
export default hono;
