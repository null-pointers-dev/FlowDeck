---
applyTo: "docs/workflows/**"
---
- Follow catalog/doc-template.md exactly: front matter keys and `##` headings in the same order.
- `id` equals the file name without `.md` and the family id in catalog/families.yaml.
- Inputs: one table row per YAML input, with meaning and a realistic example. Never invent behaviour; write `TODO(owner): …` when unsure.
- Keep each section under 250 words. FAQ questions are phrased the way people ask them.
