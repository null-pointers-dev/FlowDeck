/** Reciprocal rank fusion of several ranked lists, then personal and quality boosts. */

export type Ranked = { id: string; rank: number }; // rank starts at 1

export function fuse(lists: Ranked[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) for (const item of list) scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + item.rank));
  return scores;
}

export type BoostInput = {
  status: string; // active | deprecated | retired
  myRuns90d: number;
  teamRuns30d: number;
  recentlyViewed: boolean;
};

export function boost(base: number, b: BoostInput): number {
  let s = base;
  if (b.status === "deprecated") s *= 0.6;
  if (b.status === "retired") s *= 0.2;
  s *= 1 + Math.min(b.myRuns90d, 20) * 0.03; // up to +60% for workflows you use a lot
  s *= 1 + Math.log10(1 + b.teamRuns30d) * 0.1; // popularity, gently
  if (b.recentlyViewed) s *= 1.1;
  return s;
}

/** "deploy env:prod cat:deploy" -> text + filters */
export function parseQuery(q: string): { text: string; filters: { env?: string; category?: string } } {
  const filters: { env?: string; category?: string } = {};
  const words: string[] = [];
  for (const part of q.trim().split(/\s+/)) {
    const m = part.match(/^(env|cat|category):(.+)$/i);
    if (m) {
      if (m[1].toLowerCase() === "env") filters.env = m[2];
      else filters.category = m[2];
    } else if (part) words.push(part);
  }
  return { text: words.join(" "), filters };
}
