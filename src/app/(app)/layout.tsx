import { requireActor } from "@/platform/session";
import { can, ADMIN_PERMISSIONS } from "@/features/access/domain/permissions";
import { inboxFor } from "@/features/approvals/server/queries";
import { latestFor } from "@/features/notify/server/service";
import { LiveRefresh } from "@/ui/live-refresh";
import { Shell } from "@/ui/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [inbox, notifications] = await Promise.all([inboxFor(actor).catch(() => []), latestFor(actor.userId)]);
  return (
    <>
      <LiveRefresh topics={[]} />
      <Shell user={{ name: actor.name, email: actor.email }} approvals={inbox.length} showAdmin={ADMIN_PERMISSIONS.some((p) => can(actor, p))} notifications={notifications}>
        {children}
      </Shell>
    </>
  );
}
