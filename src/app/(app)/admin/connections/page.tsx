import { requirePermission } from "@/platform/session";
import { listConnections } from "@/features/admin/server/connections";
import { ConnectionsView } from "@/features/admin/ui/connections-view";

export const metadata = { title: "Connections" };

export default async function ConnectionsPage() {
  await requirePermission("admin.connections");
  const rows = await listConnections();
  return (
    <ConnectionsView
      rows={rows.map((r) => ({
        id: r.id,
        name: r.name,
        owner: r.owner,
        kind: r.kind,
        purpose: r.purpose,
        appId: r.appId,
        actsAs: r.actsAs,
        status: r.status,
        lastError: r.lastError,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
        quota: r.quota,
      }))}
    />
  );
}
