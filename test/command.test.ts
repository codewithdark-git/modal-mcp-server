import { describe, expect, it } from "vitest";
import { RunFunctionInputSchema, RunTestsInputSchema } from "../src/schemas/inputs.js";

describe("input schemas", () => {
  it("defaults test runs to waiting", () => {
    const parsed = RunTestsInputSchema.parse({
      project_path: process.cwd(),
    });

    expect(parsed.test_command).toBe("pytest");
    expect(parsed.wait).toBe(true);
    expect(parsed.extra_packages).toEqual([]);
  });

  it("rejects relative project paths", () => {
    expect(() => RunFunctionInputSchema.parse({ project_path: "relative", script_path: "x.py" })).toThrow();
  });
});
