import { Hono } from "hono";
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
import humanAuthRoutes from "./routes/human/auth";
import humanProfileRoutes from "./routes/human/profile";
import humanInvitationRoutes from "./routes/human/invitations";
import humanConversationRoutes from "./routes/human/conversations";
import humanMessageRoutes from "./routes/human/messages";
import humanUploadRoutes from "./routes/human/upload";
import humanTrustedAgentsRoutes from "./routes/human/trusted-agents";
import humanQueryRoutes from "./routes/human/queries";
import mcpRoutes from "./routes/mcp";
import {
  getProtectedResourceMetadata,
  getAuthServerMetadata,
} from "./mcp/oauth";

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
  app.route("/api/v1/agent", agentApi);

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

  // OAuth 2.1 well-known metadata (before static files)
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

  // MCP server endpoint (agent auth handled internally, OAuth routes included)
  app.route("/mcp", mcpRoutes);

  // Serve frontend static files in production
  if (env().NODE_ENV === "production") {
    app.use("/assets/*", serveStatic({ root: "./web/dist" }));
    app.get("*", serveStatic({ root: "./web/dist", path: "index.html" }));
  }

  return app;
}
