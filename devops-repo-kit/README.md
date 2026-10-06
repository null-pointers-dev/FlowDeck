# DevOps repository kit

Copy these files into the DevOps repository (the one in `CATALOG_REPOSITORY`). FlowDeck reads exactly these formats.

| File | What it is |
| --- | --- |
| `.github/agents/catalog-curator.agent.md` | GitHub Copilot custom agent that builds the catalog with you, phase by phase, through pull requests |
| `.github/instructions/workflow-docs.instructions.md` | Rules Copilot applies whenever it edits a workflow doc |
| `catalog/doc-template.md` | The template every workflow doc follows |
| `catalog/taxonomy.example.yaml` | Shape of `catalog/taxonomy.yaml` (categories) |
| `catalog/families.example.yaml` | Shape of `catalog/families.yaml` (families and versions) |
| `docs/workflows/deploy/deploy-aks-service.md` | A complete example doc |

FlowDeck works before any of this exists: every workflow file becomes its own entry, named from its file. As families, versions and docs land, entries get richer.
