import { parse } from "yaml";

/** A workflow doc: YAML front matter + Markdown body with fixed "## " sections. */

export type FrontMatter = {
  id: string;
  title: string;
  summary: string;
  category: string | null;
  subcategory: string | null;
  scope: string;
  kind: string;
  owner: string | null;
  status: string;
  versions: Array<{ version: string; file: string; status: string; superseded_by?: string }>;
  facets: { cloud?: string; environments?: string[]; action?: string };
  tags: string[];
  aliases: string[];
  approval: { environments?: string[]; approvers?: string } | null;
  typical_duration: string | null;
  related: string[];
  last_reviewed: string | null;
};

export type ParsedDoc = { front: FrontMatter; body: string; errors: string[] };

const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? null : String(v));
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

export function parseDoc(text: string, fallbackId: string): ParsedDoc {
  const errors: string[] = [];
  let raw: Record<string, unknown> = {};
  let body = text;
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (m) {
    try {
      raw = (parse(m[1]) as Record<string, unknown>) ?? {};
    } catch (e) {
      errors.push(`Front matter is not valid YAML: ${e instanceof Error ? e.message : String(e)}`);
    }
    body = m[2];
  } else {
    errors.push("Missing front matter.");
  }
  const versions = Array.isArray(raw.versions)
    ? (raw.versions as Array<Record<string, unknown>>).map((v) => ({
        version: String(v.version ?? ""),
        file: String(v.file ?? ""),
        status: String(v.status ?? "current"),
        superseded_by: v.superseded_by ? String(v.superseded_by) : undefined,
      }))
    : [];
  const facets = (raw.facets ?? {}) as Record<string, unknown>;
  const approval = raw.approval && typeof raw.approval === "object" ? (raw.approval as Record<string, unknown>) : null;
  const front: FrontMatter = {
    id: str(raw.id) ?? fallbackId,
    title: str(raw.title) ?? fallbackId,
    summary: str(raw.summary) ?? "",
    category: str(raw.category),
    subcategory: str(raw.subcategory),
    scope: str(raw.scope) ?? "generic",
    kind: str(raw.kind) ?? "entrypoint",
    owner: str(raw.owner),
    status: str(raw.status) ?? "active",
    versions,
    facets: { cloud: str(facets.cloud) ?? undefined, environments: arr(facets.environments), action: str(facets.action) ?? undefined },
    tags: arr(raw.tags),
    aliases: arr(raw.aliases),
    approval: approval ? { environments: arr(approval.environments), approvers: str(approval.approvers) ?? undefined } : null,
    typical_duration: str(raw.typical_duration),
    related: arr(raw.related),
    last_reviewed: str(raw.last_reviewed),
  };
  if (versions.length && versions.filter((v) => v.status === "current").length !== 1) errors.push("Exactly one version must be current.");
  return { front, body: body.trim(), errors };
}

export type Chunk = { position: number; section: string; headingPath: string; content: string };

/** Split at "## " headings, then into ~400-token pieces (about 1,600 characters) on paragraph breaks. */
export function chunkDoc(title: string, body: string, maxChars = 1600): Chunk[] {
  const chunks: Chunk[] = [];
  const sections: Array<{ heading: string; text: string }> = [];
  let current = { heading: "Overview", text: "" };
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      if (current.text.trim()) sections.push(current);
      current = { heading: h[1], text: "" };
    } else current.text += `${line}\n`;
  }
  if (current.text.trim()) sections.push(current);

  let position = 0;
  for (const s of sections) {
    const paras = s.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let buf = "";
    const flush = () => {
      if (!buf.trim()) return;
      chunks.push({ position: position++, section: s.heading, headingPath: `${title} > ${s.heading}`, content: buf.trim() });
      buf = "";
    };
    for (const p of paras) {
      if (buf && buf.length + p.length > maxChars) flush();
      buf += (buf ? "\n\n" : "") + p;
    }
    flush();
  }
  return chunks;
}

/** Families file written by the catalog agent (catalog/families.yaml). */
export type FamilyEntry = {
  id: string;
  title?: string;
  category?: string;
  owner?: string;
  versions: Array<{ version: string; file: string; status: string; superseded_by?: string }>;
};

export function parseFamilies(text: string): FamilyEntry[] {
  const raw = parse(text) as { families?: unknown } | unknown[];
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { families?: unknown })?.families) ? ((raw as { families: unknown[] }).families) : [];
  return (list as Array<Record<string, unknown>>)
    .filter((f) => f && f.id)
    .map((f) => ({
      id: String(f.id),
      title: f.title ? String(f.title) : undefined,
      category: f.category ? String(f.category) : undefined,
      owner: f.owner ? String(f.owner) : undefined,
      versions: Array.isArray(f.versions)
        ? (f.versions as Array<Record<string, unknown>>).map((v) => ({
            version: String(v.version),
            file: String(v.file),
            status: String(v.status ?? "current"),
            superseded_by: v.superseded_by ? String(v.superseded_by) : undefined,
          }))
        : [],
    }));
}

export type Taxonomy = { categories: Array<{ key: string; name: string; parent: string | null }> };

export function parseTaxonomy(text: string): Taxonomy {
  const raw = (parse(text) ?? {}) as { categories?: unknown };
  const out: Taxonomy["categories"] = [];
  const walk = (items: unknown, parent: string | null) => {
    if (!Array.isArray(items)) return;
    for (const c of items as Array<Record<string, unknown>>) {
      if (!c?.key) continue;
      out.push({ key: String(c.key), name: String(c.name ?? c.key), parent });
      walk(c.subcategories, String(c.key));
    }
  };
  walk(raw.categories, null);
  return { categories: out };
}

/** A family id from a workflow file path when no doc exists yet: ".github/workflows/deploy-aks.yml" -> "deploy-aks". */
export function familyIdFromPath(path: string): string {
  return path.split("/").pop()!.replace(/\.(ya?ml)$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
