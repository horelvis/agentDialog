import { describe, expect, it } from "bun:test";
import { computeProjectStatus, assertValidProjectTaskStatus } from "@/services/agent-project.service";
import { ValidationError } from "@/lib/errors";

describe("computeProjectStatus", () => {
  it("keeps an empty project active", () => {
    expect(computeProjectStatus([])).toBe("active");
  });

  it("completes a project when every task is completed", () => {
    expect(computeProjectStatus(["completed", "completed"])).toBe("completed");
  });

  it("cancels a project when every task is canceled", () => {
    expect(computeProjectStatus(["canceled", "canceled"])).toBe("canceled");
  });

  it("stays active while any task is in flight", () => {
    expect(computeProjectStatus(["in_progress", "completed"])).toBe("active");
    expect(computeProjectStatus(["assigned", "canceled"])).toBe("active");
    expect(computeProjectStatus(["review"])).toBe("active");
  });
});

describe("assertValidProjectTaskStatus", () => {
  it("accepts every declared status", () => {
    for (const s of ["pending", "assigned", "in_progress", "review", "completed", "failed", "canceled"]) {
      expect(() => assertValidProjectTaskStatus(s)).not.toThrow();
    }
  });

  it("rejects anything else", () => {
    expect(() => assertValidProjectTaskStatus("done")).toThrow(ValidationError);
  });
});