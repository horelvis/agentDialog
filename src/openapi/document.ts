import { createDocument } from "zod-openapi";
import { appVersion } from "../lib/app-version";
import { registeredRoutes } from "./documented";
import { apiError } from "../validators/response.helpers";
import { webhookDeliveryBody } from "../validators/webhook-delivery.responses";

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  in: "header" as const,
  required: false,
  description:
    "Repeat a POST with the same key and the original response comes back instead of the work happening twice. Only successful responses are remembered, so a refusal leaves the key free for the corrected retry.",
  schema: { type: "string" as const },
};

/**
 * The three responses no handler ever returns because middleware answers
 * before a handler runs: the auth wall, the rate limiter and the idempotency
 * middleware on a reused key. Defined once here, referenced by every
 * operation the rule below applies to, so the body exists once and every
 * operation gains three lines of $ref rather than a copy of the response.
 */
const MIDDLEWARE_RESPONSES = {
  Unauthorized: {
    description: "The bearer token is missing, malformed, or does not match a live agent.",
    content: { "application/json": { schema: apiError } },
  },
  RateLimited: {
    description:
      "Too many requests. `retryAfter` in the error envelope is the number of seconds to wait before trying again.",
    content: { "application/json": { schema: apiError } },
  },
  IdempotencyKeyReused: {
    description:
      "The Idempotency-Key header was reused, either by a request still in flight or by one whose original request had a different body.",
    content: { "application/json": { schema: apiError } },
  },
};

/** One entry per resource, so a generated client groups its methods recognisably. */
const TAGS = [
  { name: "register", description: "Registering a new agent and obtaining its API key." },
  { name: "profile", description: "Reading and updating the agent's own profile." },
  { name: "key", description: "Rotating the agent's API key." },
  { name: "conversations", description: "Conversations an agent holds with humans." },
  { name: "messages", description: "Messages posted to a conversation." },
  { name: "invitations", description: "Inviting a human into a conversation." },
  { name: "queries", description: "Human queries an agent asks, and the answers it reads back." },
  { name: "webhooks", description: "Registering delivery URLs for outbound webhook events." },
  { name: "upload", description: "Uploading a file attachment to a message." },
];

export function buildDocument(env: Record<string, string | undefined> = process.env) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of registeredRoutes()) {
    const { doc } = route;
    // Mechanical, from flags the RouteDoc already carries: 429 on every route
    // (globalRateLimit runs before all of them), 401 on every route but the
    // one with security: "none", 409 on the seven idempotent POSTs. Spread
    // first so a status code the handler itself documents (e.g. invitations'
    // own 409 conflict) wins the collision instead of being overwritten.
    const middlewareRefs: Record<string, unknown> = {
      429: { $ref: "#/components/responses/RateLimited" },
      ...(doc.security !== "none"
        ? { 401: { $ref: "#/components/responses/Unauthorized" } }
        : {}),
      ...(doc.idempotent ? { 409: { $ref: "#/components/responses/IdempotencyKeyReused" } } : {}),
    };

    const operation: Record<string, unknown> = {
      tags: [route.tag],
      summary: doc.summary,
      ...(doc.description ? { description: doc.description } : {}),
      responses: {
        ...middlewareRefs,
        ...Object.fromEntries(
          Object.entries(doc.responses).map(([status, schema]) => [
            status,
            { description: "", content: { "application/json": { schema } } },
          ]),
        ),
      },
    };

    if (doc.body) {
      const contentType = doc.bodyContentType ?? "application/json";
      operation.requestBody = { content: { [contentType]: { schema: doc.body } } };
    }
    // zod-openapi's own special key, not a raw OpenAPI `parameters` entry: handed
    // an object schema under `path`/`query`, it expands each property into its
    // own parameter, deriving `required` from whether that property is optional
    // (src/openapi/documented.ts's uuidParam and this repo's *QuerySchema are
    // both plain z.object()s, so this covers every route path/query docs
    // written so far). A raw `{ in: "path", schema: doc.params }` entry under
    // `parameters` is not a Zod schema, so createManualParameters would pass it
    // through unconverted — OpenAPI 3.1 requires one parameter per {template}
    // expression, and every :id route would still fail that with a whole
    // ZodObject sitting where a JSON schema belongs.
    if (doc.params || doc.query) {
      operation.requestParams = {
        ...(doc.params ? { path: doc.params } : {}),
        ...(doc.query ? { query: doc.query } : {}),
      };
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
    tags: TAGS,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "An agent API key, prefixed `mge_ag_`.",
        },
      },
      schemas: { ApiError: apiError },
      responses: MIDDLEWARE_RESPONSES,
    },
    paths,
    // Not a route we serve: the opposite direction, a delivery to the URL an
    // agent registered with POST /agent/webhooks. OpenAPI 3.1's `webhooks` is
    // the section built for exactly this; putting it under `paths` would
    // claim we host that endpoint.
    webhooks: {
      delivery: {
        post: {
          tags: ["webhooks"],
          summary: "A delivery to the URL you registered",
          description:
            "Signed per Standard Webhooks. The signed content covers the timestamp, so a captured delivery cannot be replayed. Verify with verifyWebhook from @agentdialog/sdk/webhooks, or any off-the-shelf implementation.",
          parameters: [
            {
              name: "webhook-id",
              in: "header",
              required: true,
              description:
                "Identifies the message, not the delivery attempt: a retry of the same event reuses this id, which is what makes deduplication on it possible.",
              schema: { type: "string" },
            },
            {
              name: "webhook-timestamp",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "webhook-signature",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: { content: { "application/json": { schema: webhookDeliveryBody } } },
          responses: { 200: { description: "Any 2xx is treated as delivered." } },
        },
      },
    },
  });
}
