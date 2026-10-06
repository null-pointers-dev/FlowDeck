import { requirePermission } from "@/platform/session";
import { listAudit } from "@/features/admin/server/overview";
import { AuditView } from "@/features/admin/ui/audit-view";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission("admin.audit");
  const { q } = await searchParams;
  const rows = await listAudit({ q });
  return <AuditView rows={rows} q={q ?? ""} />;
}
