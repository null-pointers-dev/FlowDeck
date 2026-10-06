import { describe, expect, it } from "vitest";
import { isTerminal, phaseFromGitHub, rank } from "@/features/runs/domain/phases";
import { buildGraph, resolveEnvironment, type JobMeta } from "@/features/runs/domain/graph";

describe("phases", () => {
  it("maps GitHub status and conclusion", () => {
    expect(phaseFromGitHub("waiting", null)).toBe("waiting");
    expect(phaseFromGitHub("completed", "startup_failure")).toBe("failed");
    expect(phaseFromGitHub("pending", null)).toBe("queued");
  });
  it("ranks so a run never moves backwards", () => {
    expect(rank("succeeded")).toBeGreaterThan(rank("in_progress"));
    expect(rank("waiting")).toBe(rank("in_progress"));
    expect(isTerminal("cancelled")).toBe(true);
  });
});

describe("job graph", () => {
  const meta: JobMeta[] = [
    { id: "build", name: "Build", needs: [] },
    { id: "unit", name: "Unit tests", needs: ["build"] },
    { id: "lint", name: "Lint", needs: ["build"] },
    { id: "deploy", name: "Deploy to ${{ inputs.environment }}", needs: ["unit", "lint"], environment: "${{ inputs.environment }}" },
  ];
  it("levels jobs by their needs and matches live jobs", () => {
    const g = buildGraph(meta, [
      { name: "Build", status: "completed", conclusion: "success", startedAt: "2026-10-01T10:00:00Z", completedAt: "2026-10-01T10:02:00Z" },
      { name: "deploy", status: "waiting", conclusion: null, startedAt: null, completedAt: null },
    ]);
    const by = Object.fromEntries(g.map((n) => [n.key, n]));
    expect([by.build.level, by.unit.level, by.deploy.level]).toEqual([0, 1, 2]);
    expect(by.build.status).toBe("done");
    expect(by.deploy.status).toBe("waiting");
  });
  it("resolves environment expressions from inputs", () => {
    expect(resolveEnvironment("${{ inputs.environment }}", { environment: "production" })).toBe("production");
    expect(resolveEnvironment("staging", {})).toBe("staging");
  });
});
