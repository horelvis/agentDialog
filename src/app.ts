import { Hono } from "hono";
import { createHash } from "node:crypto";
import type { AppEnv } from "./types/hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/bun";
import { corsMiddleware } from "./middleware/cors";
import { requestId } from "./middleware/request-id";
import { requestLogger } from "./middleware/logger";
import { errorHandler } from "./middleware/error-handler";
import { agentAuth } from "./middleware/agent-auth";
import { humanAuth } from "./middleware/human-auth";
import {
  globalRateLimit,
  agentRateLimit,
  humanRateLimit,
  authRateLimit,
  grantRateLimit,
} from "./middleware/rate-limit";
import { getLimitsConfig } from "./config/limits";
import { env } from "./env";

// Routes
import healthRoutes from "./routes/health";
import agentRegisterRoutes from "./routes/agent/register";
import agentProfileRoutes from "./routes/agent/profile";
import agentKeyRoutes from "./routes/agent/key";
import agentConversationRoutes from "./routes/agent/conversations";
import agentMessageRoutes from "./routes/agent/messages";
import agentUploadRoutes from "./routes/agent/upload";
import agentInvitationRoutes from "./routes/agent/invitations";
import agentWebhookRoutes from "./routes/agent/webhooks";
import agentQueryRoutes from "./routes/agent/queries";
import humanAuthRoutes from "./routes/human/auth";
import publicQueryRoutes from "./routes/public/queries";
import humanProfileRoutes from "./routes/human/profile";
import humanInvitationRoutes from "./routes/human/invitations";
import humanConversationRoutes from "./routes/human/conversations";
import humanMessageRoutes from "./routes/human/messages";
import humanUploadRoutes from "./routes/human/upload";
import humanTrustedAgentsRoutes from "./routes/human/trusted-agents";
import humanQueryRoutes from "./routes/human/queries";
import mcpRoutes from "./routes/mcp";
import emailInboundRoutes from "./routes/webhooks/email-inbound";
import { buildDocument } from "./openapi/document";
import {
  getProtectedResourceMetadata,
  getAuthServerMetadata,
} from "./mcp/oauth";

/**
 * buildDocument() walked all 26 operations' Zod schemas on every single
 * request to this public, unauthenticated route — 4.4ms and 57KB of work
 * repeated for a document that cannot change mid-process: the registry
 * documented() fills is frozen at import time, and appVersion() reads
 * process.env, which is constant once the process starts. Computed once,
 * lazily, on the first request rather than at module load, so a test that
 * imports this file before every route has registered itself (there is none
 * today, but nothing enforces that) still sees the full registry.
 */
let cachedOpenApiDocument: { json: string; etag: string } | undefined;
function getOpenApiDocument() {
  if (!cachedOpenApiDocument) {
    const json = JSON.stringify(buildDocument());
    const etag = `"${createHash("sha256").update(json).digest("hex")}"`;
    cachedOpenApiDocument = { json, etag };
  }
  return cachedOpenApiDocument;
}

export function createApp() {
  const app = new Hono();
  const limits = getLimitsConfig();

  // Global middleware
  app.use("*", corsMiddleware);
  app.use("*", requestId);
  app.use("*", globalRateLimit());
  app.use(
    "*",
    bodyLimit({
      maxSize: limits.maxBodySize,
      onError: (c) =>
        c.json(
          { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" } },
          413,
        ),
    }),
  );
  app.use("*", requestLogger);
  app.onError(errorHandler);

  // Health & root
  app.route("/", healthRoutes);

  // The contract, from the running service: what somebody reads is the version
  // that is answering them, not what is on main. Cached (see
  // getOpenApiDocument above) and ETag'd so a client that already has it can
  // send If-None-Match and get a 304 instead of the full 57KB back.
  app.get("/openapi.json", (c) => {
    const { json, etag } = getOpenApiDocument();
    if (c.req.header("if-none-match") === etag) {
      return c.body(null, 304);
    }
    c.header("ETag", etag);
    return c.body(json, 200, { "Content-Type": "application/json" });
  });

  // Webhook routes (public, verified by provider signature)
  app.route("/api/v1/webhooks/email", emailInboundRoutes);

  // Agent routes - register (no auth)
  app.route("/api/v1/agent/register", agentRegisterRoutes);

  // Agent routes - authenticated
  const agentApi = new Hono();
  agentApi.use("*", agentAuth);
  agentApi.use("*", agentRateLimit(limits.agentRpm));
  agentApi.route("/", agentProfileRoutes);
  agentApi.route("/", agentKeyRoutes);
  agentApi.route("/conversations", agentConversationRoutes);
  agentApi.route("/conversations", agentMessageRoutes);
  agentApi.route("/conversations", agentUploadRoutes);
  agentApi.route("/conversations", agentInvitationRoutes);
  agentApi.route("/webhooks", agentWebhookRoutes);
  agentApi.route("/queries", agentQueryRoutes);
  app.route("/api/v1/agent", agentApi);

  // Public query links: no session at all, resolved by the token in the path.
  // Mounted before the human routes so nothing here inherits humanAuth.
  const publicQueryApp = new Hono<AppEnv>();
  publicQueryApp.use("*", grantRateLimit(30));
  publicQueryApp.route("/", publicQueryRoutes);
  app.route("/api/v1/public/queries", publicQueryApp);

  // Human routes - auth (public, rate limited per IP)
  const humanAuthApp = new Hono();
  humanAuthApp.use("/auth/send-code", authRateLimit("send-code", limits.authSendCodeRpm));
  humanAuthApp.use("/auth/verify", authRateLimit("verify", limits.authVerifyRpm));
  humanAuthApp.route("/", humanAuthRoutes);
  app.route("/api/v1/human", humanAuthApp);

  // Human routes - authenticated (specific path middleware to avoid catching /auth/*)
  const humanApi = new Hono();
  humanApi.use("/me", humanAuth);
  humanApi.use("/me/*", humanAuth);
  humanApi.use("/invitations", humanAuth);
  humanApi.use("/invitations/*", humanAuth);
  humanApi.use("/trusted-agents", humanAuth);
  humanApi.use("/trusted-agents/*", humanAuth);
  humanApi.use("/queries", humanAuth);
  humanApi.use("/queries/*", humanAuth);
  humanApi.use("/conversations", humanAuth);
  humanApi.use("/conversations/*", humanAuth);
  humanApi.use("*", humanRateLimit(limits.humanRpm));
  humanApi.route("/", humanProfileRoutes);
  humanApi.route("/", humanInvitationRoutes);
  humanApi.route("/", humanConversationRoutes);
  humanApi.route("/", humanMessageRoutes);
  humanApi.route("/", humanUploadRoutes);
  humanApi.route("/", humanTrustedAgentsRoutes);
  humanApi.route("/", humanQueryRoutes);
  app.route("/api/v1/human", humanApi);

  // OAuth 2.1 well-known metadata (for Claude Web MCP integration)
  app.get("/.well-known/oauth-protected-resource/mcp", (c) => {
    const host = c.req.header("x-forwarded-host") || c.req.header("host") || new URL(c.req.url).host;
    const proto = c.req.header("x-forwarded-proto") || "https";
    const baseUrl = `${proto}://${host}`;
    return c.json(getProtectedResourceMetadata(baseUrl));
  });
  app.get("/.well-known/oauth-authorization-server", (c) => {
    const host = c.req.header("x-forwarded-host") || c.req.header("host") || new URL(c.req.url).host;
    const proto = c.req.header("x-forwarded-proto") || "https";
    const baseUrl = `${proto}://${host}`;
    return c.json(getAuthServerMetadata(baseUrl));
  });

  // MCP server endpoint
  app.route("/mcp", mcpRoutes);

  // Serve frontend static files in production
  if (env().NODE_ENV === "production") {
    app.use("/assets/*", serveStatic({ root: "./web/dist" }));
    app.get("*", serveStatic({ root: "./web/dist", path: "index.html" }));
  }

  return app;
}
