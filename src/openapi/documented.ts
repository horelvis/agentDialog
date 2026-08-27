import type { Hono, MiddlewareHandler } from "hono";
import type { RegisteredRoute, RouteDoc } from "./types";

/**
 * Why a wrapper rather than a middleware.
 *
 * A middleware handed to app.post("/", mw, handler) never learns its own method
 * or path — it can read them from the context at request time, but the document
 * has to exist before any traffic arrives. The wrapper sees both arguments at
 * registration, so the description lives on the same line as the route it
 * describes and nothing is written twice.
 *
 * basePath is declared per route file because a route file only knows its own
 * relative paths; the prefix lives in app.ts. A wrong one is caught by
 * tests/unit/openapi-coverage.test.ts, which compares this registry against
 * Hono's own route table.
 */
const registry: RegisteredRoute[] = [];

export function registeredRoutes(): RegisteredRoute[] {
  return registry;
}

/** Hono says /:id, OpenAPI says /{id}. */
function toOpenApiPath(basePath: string, path: string): string {
  const joined = `${basePath}${path === "/" ? "" : path}`;
  return joined.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

type Method = "get" | "post" | "patch" | "delete";

export function documented(
  app: Hono<any>,
  opts: { basePath: string; tag: string },
) {
  function register(method: Method) {
    return (path: string, doc: RouteDoc, ...handlers: MiddlewareHandler[]) => {
      registry.push({
        method: method.toUpperCase(),
        path: toOpenApiPath(opts.basePath, path),
        tag: opts.tag,
        doc,
      });
      // The doc is metadata, not behaviour: it never reaches Hono.
      (app as any)[method](path, ...handlers);
      return app;
    };
  }

  return {
    get: register("get"),
    post: register("post"),
    patch: register("patch"),
    delete: register("delete"),
    app,
  };
}
