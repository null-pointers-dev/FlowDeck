import { describe, expect, it } from "vitest";
import { chunkDoc, familyIdFromPath, parseDoc } from "@/features/catalog/domain/doc";

const doc = `---
id: deploy-aks-service
title: Deploy a service to AKS
summary: Builds and deploys one service.
category: deploy
versions:
  - { version: v3, file: .github/workflows/deploy-v3.yml, status: current }
  - { version: v2, file: .github/workflows/deploy-v2.yml, status: deprecated, superseded_by: v3 }
aliases: [ship to aks]
---

## Purpose
Deploys a service.

## Inputs
| Input | Meaning |
| --- | --- |
| version | Release |
`;

describe("workflow docs", () => {
  it("parses front matter", () => {
    const p = parseDoc(doc, "x");
    expect(p.errors).toEqual([]);
    expect(p.front.id).toBe("deploy-aks-service");
    expect(p.front.versions.map((v) => v.status)).toEqual(["current", "deprecated"]);
    expect(p.front.aliases).toEqual(["ship to aks"]);
  });
  it("chunks by section with a heading path", () => {
    const chunks = chunkDoc("Deploy a service to AKS", parseDoc(doc, "x").body);
    expect(chunks.map((c) => c.section)).toEqual(["Purpose", "Inputs"]);
    expect(chunks[1].headingPath).toBe("Deploy a service to AKS > Inputs");
  });
  it("derives family ids from file names", () => {
    expect(familyIdFromPath(".github/workflows/Deploy_AKS.yml")).toBe("deploy-aks");
  });
});
