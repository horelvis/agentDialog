import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkPayload } from "../../src/admission/decidability";
import { createQuerySchema } from "../../src/validators/query.validators";

describe("contract-renewal video request", () => {
  test("the exact scene payload passes schema and admission validation", () => {
    const scenes = JSON.parse(
      readFileSync(
        join(
          import.meta.dir,
          "../../docs-site/video-src/langgraph-contract-renewal/scenes.json",
        ),
        "utf8",
      ),
    );
    const caption = scenes.find(
      (scene: { id: string }) => scene.id === "03-query",
    ).caption;
    const prefix = "POST https://api.agentdialog.io/api/v1/agent/queries ";
    expect(caption.startsWith(prefix)).toBe(true);
    const payload = JSON.parse(caption.slice(prefix.length));

    const parsed = createQuerySchema.parse(payload);
    expect(checkPayload(parsed)).toEqual({ admit: true });
  });
});
