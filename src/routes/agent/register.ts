import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { registerAgent } from "../../services/agent.service";
import { agentRegisterSchema } from "../../validators/agent.validators";
import { validateBody } from "../../middleware/validate";
import { registerRateLimit } from "../../middleware/rate-limit";
import { getLimitsConfig } from "../../config/limits";
import { documented } from "../../openapi/documented";
import { res } from "../../openapi/types";
import { agentRegisterResponse } from "../../validators/agent.responses";
import { apiError } from "../../validators/response.helpers";
import { buildBootstrapPrompt } from "../../lib/bootstrap";

const hono = new Hono<AppEnv>();
// Mounted at app.ts's own "/api/v1/agent/register" — a separate app.route()
// call from the authenticated agentApi, outside the auth wall, so this is
// the one route file whose basePath is its own full mount point rather than
// a prefix shared with sibling files.
const app = documented(hono, { basePath: "/api/v1/agent/register", tag: "register" });

app.post(
  "/",
  {
    summary: "Register a new agent",
    description: "The only route on this surface with no bearer auth. The response carries the new API key in clear, once — only its hash is stored thereafter.",
    body: agentRegisterSchema,
    responses: {
      201: res(agentRegisterResponse, "The agent, registered. `apiKey` is returned in clear this one time — only its hash is stored from here on."),
      409: res(apiError, "`slug` is already taken by another agent."),
      422: res(apiError, "The request body failed validation."),
    },
    security: "none",
  },
  registerRateLimit(getLimitsConfig().registerRph),
  validateBody(agentRegisterSchema),
  async (c) => {
    const input = c.get("validatedBody");
    const { agent, apiKey } = await registerAgent(input);

    // The prompt the customer pastes into their AI. The key only exists here,
    // and the base URL is the instance that answered the request — the same
    // derivation the Agent Card uses for x-forwarded-host. The protocol falls
    // back to the request's own, so a plain-http localhost sandbox yields a
    // URL the agent can actually reach instead of a broken https guess.
    const host = c.req.header("x-forwarded-host") || c.req.header("host") || new URL(c.req.url).host;
    const proto = c.req.header("x-forwarded-proto") || new URL(c.req.url).protocol.replace(":", "");
    const bootstrapPrompt = buildBootstrapPrompt({
      apiKey,
      apiBaseUrl: `${proto}://${host}`,
    });

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
          expiresAt: agent.expiresAt ? agent.expiresAt.toISOString() : null,
          createdAt: agent.createdAt.toISOString(),
          apiKey, // Only returned once!
          bootstrapPrompt,
        },
      },
      201,
    );
  },
);

// The bare Hono, not the documented() facade — app.route(...) in src/app.ts
// needs a real Hono instance to mount.
export default hono;
