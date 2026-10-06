import { requirePermission } from "@/platform/session";
import { health } from "@/features/admin/server/overview";
import { HealthView } from "@/features/admin/ui/health-view";

export const metadata = { title: "Admin" };

export default async function AdminOverview() {
  await requirePermission("admin.audit");
  return <HealthView data={await health()} />;
}
