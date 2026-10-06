"use client";

import { ScrollArea, Text } from "@mantine/core";
import { buildGraph, type GraphNode, type JobMeta, type LiveJob } from "@/features/runs/domain/graph";
import { formatDuration } from "@/lib/format";

const ROW = 52;
const PAD = 70;
const SINGLE = 190;
const MULTI = 300;
const TOP = 46;

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
function sub(n: GraphNode, short: boolean) {
  if (n.status === "waiting") return short ? "waiting" : "Waiting for approval";
  if (n.status === "running") return short ? "running" : "Running";
  if (n.status === "failed") return short ? "failed" : n.durationMs ? `Failed after ${formatDuration(n.durationMs)}` : "Failed";
  if (n.status === "skipped") return short ? "skipped" : "Skipped";
  if (n.status === "todo") return short ? "" : "Not started";
  return formatDuration(n.durationMs);
}

/** Jobs as stations on a line; parallel jobs branch and rejoin; approval gates pulse. */
export function StageMap({ meta, jobs }: { meta: JobMeta[]; jobs: LiveJob[] }) {
  const nodes = buildGraph(meta, jobs);
  if (!nodes.length) return <Text c="dimmed" size="sm">Jobs appear here as soon as GitHub starts the run.</Text>;

  const levels = [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b);
  const columns = levels.map((l) => nodes.filter((n) => n.level === l));
  const maxRows = Math.max(...columns.map((c) => c.length));
  const half = ((maxRows - 1) / 2) * ROW;
  const mid = TOP + half;
  const height = Math.max(mid + half + 26, mid + 66);
  const pos = new Map<string, { x: number; y: number; multi: boolean }>();
  let x = PAD;
  columns.forEach((col, i) => {
    const multi = col.length > 1;
    col.forEach((n, j) => pos.set(n.key, { x, y: mid + (j - (col.length - 1) / 2) * ROW, multi }));
    if (i < columns.length - 1) x += multi ? MULTI : SINGLE;
  });
  const width = x + PAD + 60;
  const byKey = new Map(nodes.map((n) => [n.key, n]));

  const edges = nodes.flatMap((n) =>
    n.needs.flatMap((need) => {
      const from = pos.get(need);
      const to = pos.get(n.key)!;
      const src = byKey.get(need);
      if (!from || !src) return [];
      const start = from.multi && !to.multi ? to.x - 60 : from.x;
      const d = from.y === to.y ? `M${from.x} ${from.y}H${to.x}` : `M${from.x} ${from.y}H${start}C${start + 30} ${from.y} ${start + 30} ${to.y} ${start + 60} ${to.y}H${to.x}`;
      const cls = src.status === "done" || src.status === "skipped" ? "ln-done" : src.status === "failed" ? "ln-fail" : "ln-todo";
      return [{ d, cls, key: `${need}-${n.key}` }];
    }),
  );
  edges.sort((a) => (a.cls === "ln-todo" ? -1 : 0));

  return (
    <ScrollArea type="auto" offsetScrollbars>
      <svg className="fd-map" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={nodes.map((n) => `${n.label}: ${sub(n, false) || "done"}`).join(". ")}>
        {edges.map((e) => (
          <path key={e.key} className={`ln ${e.cls}`} d={e.d} />
        ))}
        {nodes.map((n) => {
          const p = pos.get(n.key)!;
          const r = p.multi ? 10 : 12;
          const cls = n.status === "waiting" ? "t-waiting" : n.status === "failed" ? "t-failed" : "";
          return (
            <g key={n.key}>
              {(n.status === "waiting" || n.status === "running") && <circle className={`ring ring-${n.status}`} cx={p.x} cy={p.y} r={r + 5} />}
              {n.status === "waiting" ? (
                <rect className="st-waiting" x={p.x - 11} y={p.y - 11} width={22} height={22} rx={4} transform={`rotate(45 ${p.x} ${p.y})`} />
              ) : (
                <circle className={`st-${n.status}`} cx={p.x} cy={p.y} r={r} />
              )}
              {n.status === "done" && <path className="glyph" d={`M${p.x - 5} ${p.y + 0.5}l3.3 3.3 6.2-6.6`} />}
              {n.status === "failed" && <path className="glyph" d={`M${p.x - 4} ${p.y - 4}l8 8M${p.x + 4} ${p.y - 4}l-8 8`} />}
              {p.multi ? (
                <text x={p.x + 16} y={p.y - 10} className={cls}>
                  {truncate(n.label, 24)} <tspan className="sub">{sub(n, true)}</tspan>
                </text>
              ) : (
                <>
                  <text x={p.x} y={p.y + 36} textAnchor="middle" className={cls}>
                    {truncate(n.label, 22)}
                  </text>
                  <text x={p.x} y={p.y + 53} textAnchor="middle" className="sub">
                    {sub(n, false)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </ScrollArea>
  );
}
