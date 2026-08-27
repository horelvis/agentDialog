import { describe, expect, test } from "bun:test";
import { createApp } from "../../src/app";
import { registeredRoutes } from "../../src/openapi/documented";

/** Hono says /:id, OpenAPI says {id}. Compare like with like. */
function normalise(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

describe("every agent route is in the contract", () => {
  test("no route under /api/v1/agent is undocumented", () => {
    const app = createApp();
    // app.routes carries one entry per handler in a chain (validateBody,
    // idempotency, the final handler, ...) sharing the same method/path, and
    // "*"-mounted middleware (agentAuth, agentRateLimit, ...) shows up as
    // method ALL on the router's own path — confirmed with a console.log of
    // app.routes before trusting this filter. Both are why real is
    // deduplicated below rather than compared as-is.
    const real = app.routes
      .filter((r) => r.path.startsWith("/api/v1/agent") && r.method !== "ALL")
      .map((r) => `${r.method} ${normalise(r.path)}`);

    const documented = new Set(
      registeredRoutes().map((r) => `${r.method} ${r.path}`),
    );

    const missing = [...new Set(real)].filter((r) => !documented.has(r));
    expect(missing).toEqual([]);
  });

  test("nothing is documented that does not exist", () => {
    // Catches a wrong basePath in a route file, which would otherwise publish a
    // path nobody can call.
    const app = createApp();
    const real = new Set(
      app.routes
        .filter((r) => r.method !== "ALL")
        .map((r) => `${r.method} ${normalise(r.path)}`),
    );
    const ghosts = registeredRoutes()
      .map((r) => `${r.method} ${r.path}`)
      .filter((r) => !real.has(r));
    expect(ghosts).toEqual([]);
  });
});
