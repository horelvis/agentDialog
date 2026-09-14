import { describe, expect, test } from "bun:test";
import {
  generateProjectShareToken,
  projectShareTokenPrefix,
} from "../../../src/lib/a2a/project-contract-token";

describe("project contract share token", () => {
  test("carries the a2p_ prefix and a long body", () => {
    const token = generateProjectShareToken();
    expect(token.startsWith("a2p_")).toBe(true);
    expect(token.length).toBeGreaterThan(30);
  });

  test("prefix is short, unique enough to index, and stable per token", () => {
    const token = generateProjectShareToken();
    const prefix = projectShareTokenPrefix(token);
    expect(prefix).toBe(token.slice(0, 12));
    expect(prefix.startsWith("a2p_")).toBe(true);
  });

  test("two tokens differ", () => {
    expect(generateProjectShareToken()).not.toBe(generateProjectShareToken());
  });
});