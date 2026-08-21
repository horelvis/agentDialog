/**
 * Tests against the BUILT output in dist/, not the sources in src/.
 *
 * The suite under tests/ imports from ../src, so it validates the code but says
 * nothing about the artifact we actually publish. That gap shipped a real bug:
 * the package compiled during development only because TypeScript inherited
 * @types/bun from the monorepo root, and every unit test passed while the
 * package could not be built on its own.
 *
 * These tests require `bun run build` to have run first — use `bun run test:dist`,
 * which builds and then runs them.
 */
import { describe, expect, it, afterEach } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DIST = join(import.meta.dir, "..", "dist");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(payload: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

describe("built artifact", () => {
  it("emits every file the exports map points at", () => {
    for (const file of [
      "index.js",
      "index.d.ts",
      "ai/index.js",
      "ai/index.d.ts",
      "langchain/index.js",
      "langchain/index.d.ts",
    ]) {
      expect(existsSync(join(DIST, file))).toBe(true);
    }
  });

  it("emits relative imports with explicit .js extensions", async () => {
    // Node's ESM resolver does not add extensions. An emitted `from "./client"`
    // resolves under a bundler and fails at runtime for a real consumer.
    const source = await Bun.file(join(DIST, "index.js")).text();
    const specifiers = [...source.matchAll(/from\s+"(\.[^"]+)"/g)].map((m) => m[1]);
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier.endsWith(".js")).toBe(true);
    }
  });
});

describe("root entry point, from dist", () => {
  it("exports the client and the error types", async () => {
    const mod = await import(join(DIST, "index.js"));
    expect(typeof mod.AgentDialog).toBe("function");
    expect(typeof mod.AgentDialogError).toBe("function");
    expect(typeof mod.QueryTimeoutError).toBe("function");
    expect(typeof mod.NotFoundError).toBe("function");
  });

  it("still maps queries between camelCase and the wire format", async () => {
    const { AgentDialog } = await import(join(DIST, "index.js"));
    const calls = mockFetch({
      data: {
        query_id: "q1",
        status: "pending",
        conversation_id: "c1",
        expires_at: "2026-08-20T12:00:00.000Z",
      },
    });

    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    const created = await client.createQuery({
      queryType: "validation",
      subject: { id: "deploy-v2.3", label: "Deploy v2.3 to production" },
      answerSpace: { kind: "boolean", labels: { t: "Yes", f: "No" } },
      question: "Ship it?",
      targetHumanEmail: "someone@example.com",
    });

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.target_human_email).toBe("someone@example.com");
    expect(body.answer_space).toEqual({ kind: "boolean", labels: { t: "Yes", f: "No" } });
    expect(created.queryId).toBe("q1");
    expect(created.conversationId).toBe("c1");
  });

  it("does not pull a framework into the root entry point", async () => {
    const source = await Bun.file(join(DIST, "index.js")).text();
    const client = await Bun.file(join(DIST, "client.js")).text();
    for (const framework of ['"ai"', '"@langchain/core', '"zod"']) {
      expect(source.includes(framework)).toBe(false);
      expect(client.includes(framework)).toBe(false);
    }
  });
});

describe("adapter subpaths, from dist", () => {
  it("the ai subpath exposes both tools", async () => {
    const mod = await import(join(DIST, "ai", "index.js"));
    expect(typeof mod.askHumanTool).toBe("function");
    expect(typeof mod.checkAnswerTool).toBe("function");
  });

  it("the langchain subpath exposes both tools", async () => {
    const mod = await import(join(DIST, "langchain", "index.js"));
    expect(typeof mod.askHumanTool).toBe("function");
    expect(typeof mod.checkAnswerTool).toBe("function");
  });

  it("a built tool still reaches the client", async () => {
    const { AgentDialog } = await import(join(DIST, "index.js"));
    const { askHumanTool } = await import(join(DIST, "ai", "index.js"));

    const calls = mockFetch({
      data: {
        query_id: "q2",
        status: "pending",
        conversation_id: "c2",
        expires_at: "2026-08-20T12:00:00.000Z",
      },
    });

    const client = new AgentDialog({ apiKey: "mge_ag_test", baseUrl: "https://example.test" });
    const tool = askHumanTool(client, { defaultEmail: "owner@example.com" });
    const result = await tool.execute(
      {
        question: "Ship it?",
        queryType: "validation",
        subject: { id: "deploy-v2.3", label: "Deploy v2.3 to production" },
        answerSpace: { kind: "boolean", labels: { t: "Yes", f: "No" } },
      },
      {},
    );

    expect(result.queryId).toBe("q2");
    expect(calls[0].url).toBe("https://example.test/api/v1/agent/queries");
  });
});
