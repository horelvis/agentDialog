import { createDocument } from "zod-openapi";
import { appVersion } from "../lib/app-version";
import { registeredRoutes } from "./documented";
import { apiError } from "../validators/response.helpers";

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  in: "header" as const,
  required: false,
  description:
    "Repeat a POST with the same key and the original response comes back instead of the work happening twice. Only successful responses are remembered, so a refusal leaves the key free for the corrected retry.",
  schema: { type: "string" as const },
};

export function buildDocument(env: Record<string, string | undefined> = process.env) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of registeredRoutes()) {
    const { doc } = route;
    const operation: Record<string, unknown> = {
      tags: [route.tag],
      summary: doc.summary,
      ...(doc.description ? { description: doc.description } : {}),
      responses: Object.fromEntries(
        Object.entries(doc.responses).map(([status, schema]) => [
          status,
          { description: "", content: { "application/json": { schema } } },
        ]),
      ),
    };

    if (doc.body) {
      operation.requestBody = { content: { "application/json": { schema: doc.body } } };
    }
    if (doc.idempotent) operation.parameters = [IDEMPOTENCY_HEADER];
    if (doc.security === "none") operation.security = [];

    paths[route.path] ??= {};
    paths[route.path][route.method.toLowerCase()] = operation;
  }

  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "AgentDialog Agent API",
      // The same source the root endpoint uses. See src/lib/app-version.ts.
      version: appVersion(env),
      description:
        "The surface an AI agent integrates against: conversations, messages, human queries and webhooks.",
    },
    servers: [{ url: "https://api.agentdialog.io" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "An agent API key, prefixed `mge_ag_`.",
        },
      },
      schemas: { ApiError: apiError },
    },
    paths,
  });
}
