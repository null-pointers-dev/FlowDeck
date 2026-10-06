import { requireActor } from "@/platform/session";
import { dashboardCards, homeTiles } from "@/features/personal/server/insights";
import { recentlyUsed } from "@/features/personal/server/service";
import { myActiveRuns } from "@/features/runs/server/queries";
import { inboxFor } from "@/features/approvals/server/queries";
import { HomeView } from "@/features/personal/ui/home-view";

export const metadata = { title: "Home" };

/** Server component: loads data through services, renders one client view. */
export default async function HomePage() {
  const actor = await requireActor();
  const [tiles, cards, recent, active, inbox] = await Promise.all([homeTiles(actor), dashboardCards(actor), recentlyUsed(actor), myActiveRuns(actor), inboxFor(actor)]);
  return (
    <HomeView
      name={actor.name}
      tiles={tiles}
      cards={cards}
      recent={recent}
      active={active.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
      waiting={inbox.slice(0, 5).map((w) => ({ id: w.id, runRequestId: w.runRequestId, title: w.title, environment: w.environment, createdAt: w.createdAt }))}
    />
  );
}
