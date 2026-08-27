import { z } from "zod";
import { ok } from "./response.helpers";

/**
 * description, avatarUrl, homepageUrl, provider and model are nullable
 * because their columns (src/db/schema/agents.ts) have no default and both
 * agentRegisterSchema and agentUpdateSchema treat them as optional input —
 * omitting them leaves the column NULL. agentCard is the same: no default,
 * no notNull, optional in both schemas. avatarUrl and homepageUrl can also be
 * set back to NULL explicitly, since agentUpdateSchema marks them
 * `.nullable().optional()`.
 *
 * capabilities and metadata are NOT nullable despite their columns lacking
 * notNull(): registerAgent always writes `input.capabilities || []` and
 * `input.metadata || {}` (src/services/agent.service.ts), and neither
 * validator accepts `null` for them, so no code path ever stores NULL there.
 * rateLimitRpm, trustScore and totalRatings are the same story — DB defaults
 * (60, 0, 0) and no input schema exposes them, so nothing ever writes NULL.
 */
export const agentProfileObject = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  homepageUrl: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  capabilities: z.array(z.string()),
  status: z.enum(["active", "suspended", "deactivated"]),
  apiKeyPrefix: z.string(),
  rateLimitRpm: z.number().int(),
  metadata: z.record(z.unknown()),
  agentCard: z.record(z.unknown()).nullable(),
  trustScore: z.number().int(),
  totalRatings: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** GET /me: src/routes/agent/profile.ts hand-picks these fields off `c.get("agent")`. */
export const agentProfileResponse = ok(agentProfileObject);

/**
 * PATCH /me: updateAgent's caller (src/routes/agent/profile.ts) returns a
 * narrower, hand-picked object than GET /me — no apiKeyPrefix, rateLimitRpm,
 * trustScore, totalRatings or createdAt, even though updateAgent itself
 * returns the full row.
 */
export const agentProfileUpdateResponse = ok(
  agentProfileObject.pick({
    id: true,
    slug: true,
    displayName: true,
    description: true,
    avatarUrl: true,
    homepageUrl: true,
    provider: true,
    model: true,
    capabilities: true,
    status: true,
    metadata: true,
    agentCard: true,
    updatedAt: true,
  }),
);

/**
 * POST /register: registerAgent's caller (src/routes/agent/register.ts)
 * returns yet another hand-picked shape — no agentCard or updatedAt, but adds
 * `apiKey` in clear. This is the one moment the key is ever readable again;
 * only its bcrypt-equivalent hash is stored (src/lib/crypto.ts).
 */
export const agentRegisterResponse = ok(
  agentProfileObject
    .pick({
      id: true,
      slug: true,
      displayName: true,
      description: true,
      avatarUrl: true,
      homepageUrl: true,
      provider: true,
      model: true,
      capabilities: true,
      status: true,
      apiKeyPrefix: true,
      rateLimitRpm: true,
      metadata: true,
      createdAt: true,
    })
    .extend({ apiKey: z.string() }),
);

/**
 * POST /key/rotate: rotateApiKey's caller returns just this — not the agent
 * row at all — plus a human-readable reminder that the key will not be shown
 * again.
 */
export const agentKeyRotateResponse = ok(
  z.object({
    apiKey: z.string(),
    apiKeyPrefix: z.string(),
    message: z.string(),
  }),
);
