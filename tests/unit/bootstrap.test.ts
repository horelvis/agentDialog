import { describe, expect, test } from "bun:test";
import { buildBootstrapPrompt } from "../../src/lib/bootstrap";

describe("buildBootstrapPrompt", () => {
  test("embeds the API key and the base URL, and points at the served context", () => {
    const prompt = buildBootstrapPrompt({
      apiKey: "mge_ag_abc123",
      apiBaseUrl: "https://api.agentdialog.io",
    });

    expect(prompt).toContain("mge_ag_abc123");
    expect(prompt).toContain("https://api.agentdialog.io");
    expect(prompt).toContain("https://api.agentdialog.io/agent-context.md");
  });

  test("works with a local sandbox base and a trailing slash", () => {
    const prompt = buildBootstrapPrompt({
      apiKey: "mge_ag_xyz",
      apiBaseUrl: "http://localhost:3000/",
    });

    expect(prompt).toContain("http://localhost:3000");
    expect(prompt).not.toContain("3000//agent-context");
    expect(prompt).toContain("http://localhost:3000/agent-context.md");
  });
});