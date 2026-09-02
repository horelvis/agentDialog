import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { idempotency } from "../../middleware/idempotency";
import { rotateApiKey } from "../../services/agent.service";
import { documented } from "../../openapi/documented";
import { res } from "../../openapi/types";
import { agentKeyRotateResponse } from "../../validators/agent.responses";
import { apiError } from "../../validators/response.helpers";

const hono = new Hono<AppEnv>();
const app = documented(hono, { basePath: "/api/v1/agent", tag: "key" });

app.post(
  "/key/rotate",
  {
    summary: "Rotate the authenticated agent's API key",
    description: "The response carries the new key in clear, once — only its hash is stored.",
    responses: {
      200: res(agentKeyRotateResponse, "The new API key, returned in clear this one time."),
      404: res(apiError, "The authenticated agent no longer exists."),
      // idempotency() calls assertValidIdempotencyKey before this route has a
      // body to blame it on — the only 422 on this surface with no doc.body.
      422: res(apiError, "The Idempotency-Key header is empty or longer than 255 characters."),
    },
    idempotent: true,
  },
  idempotency(),
  async (c) => {
    const agentId = c.get("agentId");
    const { agent, apiKey } = await rotateApiKey(agentId);

    return c.json({
      data: {
        apiKey,
        apiKeyPrefix: agent.apiKeyPrefix,
        message: "API key rotated successfully. Store the new key securely — it won't be shown again.",
      },
    });
  },
);

// The bare Hono, not the documented() facade — app.route(...) in src/app.ts
// needs a real Hono instance to mount.
export default hono;
