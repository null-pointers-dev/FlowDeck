import { notFound } from "next/navigation";
import { requireActor } from "@/platform/session";
import { getRunView } from "@/features/runs/server/queries";
import { RunView } from "@/features/runs/ui/run-view";

export const metadata = { title: "Run" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getRunView(actor, id);
  if (!data) notFound();
  return <RunView data={data} />;
}
