import { notFound } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { requireActor } from "@/platform/session";
import { getWorkflowPage } from "@/features/catalog/server/queries";
import { recordView } from "@/features/personal/server/service";
import { WorkflowView } from "@/features/catalog/ui/workflow-view";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: (await params).id };
}

export default async function WorkflowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string; ref?: string; preset?: string }> }) {
  const actor = await requireActor();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await getWorkflowPage(actor, id, sp.version);
  if (!data) notFound();
  // Recorded after the response is sent: feeds "Recently used" without slowing the page.
  after(() => recordView(actor.userId, id));
  return (
    <Suspense>
      <WorkflowView data={data} initialRef={sp.ref ?? null} initialPreset={sp.preset ?? null} />
    </Suspense>
  );
}
