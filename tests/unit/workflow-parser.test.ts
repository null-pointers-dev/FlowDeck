import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseWorkflow } from "@/features/catalog/domain/parse-workflow";

describe("workflow parser", () => {
  it("recognizes the CI workflow as manually dispatchable", async () => {
    const text = await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(parseWorkflow(text).dispatchable).toBe(true);
  });
});