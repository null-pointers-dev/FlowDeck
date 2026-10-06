import { requireActor } from "@/platform/session";
import { listRuns, type RunsFilter } from "@/features/runs/server/queries";
import { RunsView } from "@/features/runs/ui/runs-view";

export const metadata = { title: "Runs" };
const FILTERS: RunsFilter[] = ["all", "mine", "active", "waiting", "failed"];

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const actor = await requireActor();
  const f = (await searchParams).filter;
  const filter = (FILTERS.includes(f as RunsFilter) ? f : "all") as RunsFilter;
  const rows = await listRuns(actor, filter);
  return (
    <RunsView
      filter={filter}
      rows={rows.map((r) => ({
        id: r.id,
        phase: r.phase,
        ref: r.ref,
        createdAt: r.createdAt.toISOString(),
        familyId: r.familyId,
        title: r.title,
        requester: r.requester,
        actorLogin: r.actorLogin,
        runNumber: r.runNumber,
        durationSeconds: r.startedAt && r.completedAt ? (r.completedAt.getTime() - r.startedAt.getTime()) / 1000 : null,
      }))}
    />
  );
}
