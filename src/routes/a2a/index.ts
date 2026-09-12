import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import agentCardRoutes from "./agent-card";
import taskRoutes from "./tasks";
import streamRoutes from "./stream";
import jsonRpcRoutes from "./jsonrpc";

/**
 * The public A2A surface of one agent, mounted at `/a2a/:agentSlug`. It carries
 * the discovery card plus both bindings (HTTP+JSON and JSON-RPC) that the card
 * advertises.
 */
export function createA2ARoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.route("/", agentCardRoutes);
  app.route("/", taskRoutes);
  app.route("/", streamRoutes);
  app.route("/", jsonRpcRoutes);
  return app;
}