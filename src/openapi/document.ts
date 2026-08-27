// Side-effect import, and it must land before any schema calls .openapi() at
// its own module's top level (src/routes/agent/upload.ts,
// src/routes/agent/webhooks.ts, src/validators/webhook.responses.ts) — those
// files carry their own copy of this same import so evaluation order can't
// strand them without it; zod-openapi 4 otherwise emits no schema-level
// description at all, silently dropping every .describe() this document
// relied on to explain the multipart fields and the webhook event names.
import "zod-openapi/extend";
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
 * Responses no handler ever returns because something upstream of it answers
 * first: the auth wall, the rate limiter, the idempotency middleware on a
 * reused key, the body-size limit, and the error handler's own fallback.
 * Defined once here, referenced by every operation the rule below applies to,
 * so the body exists once and every operation gains a line of $ref rather
 * than a copy of the response.
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
  PayloadTooLarge: {
    description: "The request body exceeded the server's configured maximum size (see app.ts's bodyLimit).",
    content: { "application/json": { schema: apiError } },
  },
  InternalError: {
    description: "An unexpected error. The error envelope carries no further detail than `message`.",
    content: { "application/json": { schema: apiError } },
  },
};

/**
 * When a status code above collides with one a handler already documents —
 * today that is only 409, and only on POST /:id/invitations, which both
 * requires an Idempotency-Key and throws its own domain 409 for a duplicate
 * invite — the handler's response wins the merge (see the loop below): its
 * schema and description both stand, and this note is appended to that
 * description rather than replacing it, so the primary meaning (a duplicate
 * invitation) and the secondary one (a reused Idempotency-Key) are both on
 * the page. Keyed by the same name as MIDDLEWARE_RESPONSES so the next route
 * that grows a second meaning for one of these codes inherits a note for free
 * instead of the reader having to already know to branch on `error.code`.
 */
const MIDDLEWARE_COLLISION_NOTES: Record<keyof typeof MIDDLEWARE_RESPONSES, string> = {
  Unauthorized: "May also indicate a missing or invalid bearer token; the `code` field distinguishes them.",
  RateLimited: "May also indicate the request was rate limited; the `code` field distinguishes them.",
  IdempotencyKeyReused: "May also indicate a reused `Idempotency-Key`; the `code` field distinguishes them.",
  PayloadTooLarge: "May also indicate the request body was too large; the `code` field distinguishes them.",
  InternalError: "May also indicate an unexpected server error; the `code` field distinguishes them.",
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
    // Mechanical, from flags the RouteDoc already carries: 429 and 500 on
    // every route (globalRateLimit and the error handler's fallback both run
    // for all of them), 401 on every route but the one with security:
    // "none", 409 on the seven idempotent POSTs, 413 on every route with a
    // body (app.ts's bodyLimit runs ahead of all of them too).
    const middlewareEntries: Array<[number, keyof typeof MIDDLEWARE_RESPONSES]> = [
      [429, "RateLimited"],
      [500, "InternalError"],
    ];
    if (doc.security !== "none") middlewareEntries.push([401, "Unauthorized"]);
    if (doc.idempotent) middlewareEntries.push([409, "IdempotencyKeyReused"]);
    if (doc.body) middlewareEntries.push([413, "PayloadTooLarge"]);

    const responses: Record<string, { description: string; content?: unknown }> =
      Object.fromEntries(
        Object.entries(doc.responses).map(([status, r]) => [
          status,
          { description: r.description, content: { "application/json": { schema: r.schema } } },
        ]),
      );

    // A status the handler itself documents wins the slot — a duplicate-invite
    // 409 is not the idempotency middleware's 409 — so its description is
    // appended to, not replaced: the primary meaning the handler wrote stays
    // on the page alongside the secondary one this loop adds.
    for (const [status, name] of middlewareEntries) {
      const key = String(status);
      const existing = responses[key];
      if (existing) {
        existing.description = `${existing.description} ${MIDDLEWARE_COLLISION_NOTES[name]}`;
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
      // OpenAPI defaults requestBody.required to false. Every route on this
      // surface that declares a body requires one — validateBody (or, for
      // the two multipart routes, a manual c.req.formData() check) rejects a
      // missing body with 422 — so leaving this unset would tell a generated
      // client the body is optional.
      operation.requestBody = {
        required: true,
        content: { [contentType]: { schema: doc.body } },
      };
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
            "Signed per Standard Webhooks. The signature covering the timestamp makes the timestamp trustworthy, not replay-proof by itself — it's the verifier rejecting a timestamp outside its tolerance window that stops a captured delivery from being replayed. verifyWebhook from @agentdialog/sdk/webhooks checks both; an off-the-shelf implementation needs a tolerance window of its own to do the same.",
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
