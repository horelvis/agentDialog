import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { resolveProjectContract } from "../../services/a2a-project-share.service";

/**
 * The project's collaboration contract. Public in the same way a query grant
 * is public: the token in the query string is the credential, and the response
 * tells the holder nothing more than the contract of that one project. No
 * session, no agent key — the share URL is what is shared.
 *
 * Mounted at /a2a/projects before /a2a/:agentSlug so "projects" is never read
 * as an agent slug.
 */
const hono = new Hono<AppEnv>();

hono.get("/:projectId/contract", async (c) => {
  const projectId = c.req.param("projectId") ?? "";
  const token = c.req.query("token") ?? "";

  const host = c.req.header("x-forwarded-host") || c.req.header("host") || new URL(c.req.url).host;
  const proto = c.req.header("x-forwarded-proto") || "https";
  const apiBaseUrl = `${proto}://${host}`;

  const contract = await resolveProjectContract(token, projectId, apiBaseUrl);
  return c.json(contract);
});

export default hono;