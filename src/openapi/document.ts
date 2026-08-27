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

/**
 * When a status code above collides with one a handler already documents —
 * today that is only 409, and only on POST /:id/invitations, which both
 * requires an Idempotency-Key and throws its own domain 409 for a duplicate
 * invite — the handler's response wins the merge (see the loop below) but its
 * description was empty, silently hiding the other meaning. This is what gets
 * appended in that case, keyed by the same name as MIDDLEWARE_RESPONSES so
 * the next route that grows a second meaning for one of these codes inherits
 * a note for free instead of the reader having to already know to branch on
 * `error.code`.
 */
const MIDDLEWARE_COLLISION_NOTES: Record<keyof typeof MIDDLEWARE_RESPONSES, string> = {
  Unauthorized: "May also indicate a missing or invalid bearer token; the `code` field distinguishes them.",
  RateLimited: "May also indicate the request was rate limited; the `code` field distinguishes them.",
  IdempotencyKeyReused: "May also indicate a reused `Idempotency-Key`; the `code` field distinguishes them.",
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
    // one with security: "none", 409 on the seven idempotent POSTs.
    const middlewareEntries: Array<[number, keyof typeof MIDDLEWARE_RESPONSES]> = [
      [429, "RateLimited"],
    ];
    if (doc.security !== "none") middlewareEntries.push([401, "Unauthorized"]);
    if (doc.idempotent) middlewareEntries.push([409, "IdempotencyKeyReused"]);

    const responses: Record<string, { description: string; content?: unknown }> =
      Object.fromEntries(
        Object.entries(doc.responses).map(([status, schema]) => [
          status,
          { description: "", content: { "application/json": { schema } } },
        ]),
      );

    // A status the handler itself documents wins the slot — a duplicate-invite
    // 409 is not the idempotency middleware's 409 — but its own description
    // was blank, which silently hid that the same code has a second, unrelated
    // meaning here. Append a note instead of overwriting.
    for (const [status, name] of middlewareEntries) {
      const key = String(status);
      const existing = responses[key];
      if (existing) {
        existing.description = MIDDLEWARE_COLLISION_NOTES[name];
      } else {
        responses[key] = { $ref: `#/components/responses/${name}` } as unknown as {
          description: string;
        };
      }
    }

    const operation: Record<string, unknown> = {
      tags: [route.tag],
      summary: doc.summary,
      ...(doc.description ? { description: doc.description } : {}),
      responses,
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
                "Identifies the message rather than the delivery attempt, so a redelivery would carry the same id.",
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
