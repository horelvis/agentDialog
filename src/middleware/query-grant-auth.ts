import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/hono";
import { resolveQueryGrant } from "../services/query-grant.service";

/**
 * Resolves a link token to the one query it may resolve. It never issues a
 * session and never sets `human` — a grant is a capability, not an identity,
 * and the difference is the blast radius of a forwarded email.
 */
export const queryGrantAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = c.req.param("token") ?? "";
  const { grantId, queryId, humanEmail } = await resolveQueryGrant(token);

  c.set("grantId", grantId);
  c.set("grantQueryId", queryId);
  c.set("grantEmail", humanEmail);
  await next();
};
