import { Hono } from "hono";
import { corsMiddleware } from "./middleware/cors";
import { requestId } from "./middleware/request-id";
import { requestLogger } from "./middleware/logger";
import { errorHandler } from "./middleware/error-handler";
import { agentAuth } from "./middleware/agent-auth";
import { humanAuth } from "./middleware/human-auth";
import { agentRateLimit } from "./middleware/rate-limit";

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

export function createApp() {
  const app = new Hono();

  // Global middleware
  app.use("*", corsMiddleware);
  app.use("*", requestId);
  app.use("*", requestLogger);
  app.onError(errorHandler);

  // Health & root
  app.route("/", healthRoutes);

  // Agent routes - register (no auth)
  app.route("/api/v1/agent/register", agentRegisterRoutes);

  // Agent routes - authenticated
  const agentApi = new Hono();
  agentApi.use("*", agentAuth);
  agentApi.use("*", agentRateLimit(60));
  agentApi.route("/", agentProfileRoutes);
  agentApi.route("/", agentKeyRoutes);
  agentApi.route("/conversations", agentConversationRoutes);
  agentApi.route("/conversations", agentMessageRoutes);
  agentApi.route("/conversations", agentUploadRoutes);
  agentApi.route("/conversations", agentInvitationRoutes);
  agentApi.route("/webhooks", agentWebhookRoutes);
  app.route("/api/v1/agent", agentApi);

  // Human routes - auth (public, no auth required)
  app.route("/api/v1/human", humanAuthRoutes);

  // Human routes - authenticated (specific path middleware to avoid catching /auth/*)
  const humanApi = new Hono();
  humanApi.use("/me", humanAuth);
  humanApi.use("/me/*", humanAuth);
  humanApi.use("/invitations", humanAuth);
  humanApi.use("/invitations/*", humanAuth);
  humanApi.use("/conversations", humanAuth);
  humanApi.use("/conversations/*", humanAuth);
  humanApi.route("/", humanProfileRoutes);
  humanApi.route("/", humanInvitationRoutes);
  humanApi.route("/", humanConversationRoutes);
  humanApi.route("/", humanMessageRoutes);
  humanApi.route("/", humanUploadRoutes);
  app.route("/api/v1/human", humanApi);

  return app;
}
