import { describe, expect, it } from "bun:test";
import { authenticateApiKey, extractBearer } from "@/middleware/a2a-auth";

describe("extractBearer", () => {
  it("returns the token from a valid Bearer header", () => {
    expect(extractBearer("Bearer mge_ag_12345678")).toBe("mge_ag_12345678");
  });

  it("returns null for a missing header", () => {
    expect(extractBearer(undefined)).toBeNull();
  });

  it("returns null for a non-Bearer scheme", () => {
    expect(extractBearer("Basic dXNlcjpwYXNz")).toBeNull();
  });
});

describe("authenticateApiKey", () => {
  it("rejects a key with the wrong prefix without touching the database", async () => {
    const called = { count: 0 };
    const db = {
      select: () => {
        called.count += 1;
        throw new Error("should not be called");
      },
    } as never;

    const agent = await authenticateApiKey("sk_live_abc", db);
    expect(agent).toBeNull();
    expect(called.count).toBe(0);
  });

  it("rejects an empty key", async () => {
    const agent = await authenticateApiKey("");
    expect(agent).toBeNull();
  });
});