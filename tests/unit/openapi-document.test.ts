import { describe, expect, test } from "bun:test";
import { buildDocument } from "../../src/openapi/document";

// Side-effect import: `documented()` registers a route the moment its file is
// evaluated, and this test imports document.ts directly rather than going
// through the server, so nothing would otherwise have loaded
// src/routes/agent/queries.ts and the registry documented() reads from would
// be empty. `../../src/app` is the one place that statically imports every
// route file, so importing it — rather than each route file by name — means
// this test doesn't need updating as tasks 2-4 document more resources. In
// the running server this import is redundant: app.ts already imports every
// route (including the one serving /openapi.json) before any request can
// arrive, so buildDocument() always sees a full registry there.
import "../../src/app";

describe("the OpenAPI document", () => {
  test("reports the version the service reports", () => {
    // Not a constant. The root endpoint stamps appVersion() and so does this;
    // a second source is a second thing that can be wrong, which is the drift
    // PR #22 removed from the root in the first place.
    const doc = buildDocument({ APP_VERSION: "v9.9.9" });
    expect(doc.info.version).toBe("v9.9.9");
    expect(buildDocument({}).info.version).toBe("dev");
  });

  test("is OpenAPI 3.1 and points at production", () => {
    const doc = buildDocument({});
    expect(doc.openapi).toStartWith("3.1");
    expect(doc.servers).toEqual([{ url: "https://api.agentdialog.io" }]);
  });

  test("declares one bearer scheme, applied by default", () => {
    const doc = buildDocument({});
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
  });

  test("describes POST /api/v1/agent/queries, with its request schema", () => {
    const doc = buildDocument({});
    const op = doc.paths["/api/v1/agent/queries"].post;

    expect(op.tags).toEqual(["queries"]);
    expect(op.summary).toBeString();

    // The body schema is the very object that validates the request, so this
    // asserts the reuse rather than a copy: query_type is snake_case on the
    // wire, and would be queryType if somebody had retyped it from the SDK.
    const body = op.requestBody.content["application/json"].schema;
    expect(Object.keys(body.properties)).toContain("query_type");
    expect(Object.keys(body.properties)).toContain("target_human_email");

    expect(Object.keys(op.responses)).toContain("201");
    expect(Object.keys(op.responses)).toContain("422");
  });

  test("marks the idempotent POST, and only as a header", () => {
    const doc = buildDocument({});
    const op = doc.paths["/api/v1/agent/queries"].post;
    const header = op.parameters.find((p: any) => p.name === "Idempotency-Key");
    expect(header).toMatchObject({ in: "header", required: false });
  });

  // OpenAPI 3.1 requires every {template} expression in a path to have a
  // matching `parameters` entry with `in: "path"`. document.ts builds
  // `requestParams: { path: doc.params }` from RouteDoc's `params`, and
  // zod-openapi expands that object schema into one parameter per property —
  // but only where a route actually sets `params`. A route with :id and no
  // `params` (or a typo passing the wrong schema there) produces a document a
  // strict validator (Spectral, Redocly, swagger-parser) rejects, and nothing
  // else in this suite would catch it: createDocument doesn't check it, and
  // the other tests here only look at one hand-picked route.
  test("every path template declares its parameter", () => {
    const doc = buildDocument({});
    const missing: string[] = [];

    for (const [path, item] of Object.entries<any>(doc.paths)) {
      const templated = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      if (!templated.length) continue;
      for (const [method, op] of Object.entries<any>(item)) {
        const declared = new Set(
          (op.parameters ?? []).filter((p: any) => p.in === "path").map((p: any) => p.name),
        );
        for (const name of templated) {
          if (!declared.has(name)) missing.push(`${method.toUpperCase()} ${path} → ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
