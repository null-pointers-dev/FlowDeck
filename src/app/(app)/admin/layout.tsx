import { redirect } from "next/navigation";
import { requireActor } from "@/platform/session";
import { ADMIN_PERMISSIONS, can } from "@/features/access/domain/permissions";
import { AdminTabs } from "@/features/admin/ui/admin-tabs";
import { PageHeader } from "@/ui/page-header";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const allowed = ADMIN_PERMISSIONS.filter((p) => can(actor, p));
  if (allowed.length === 0) redirect("/no-access?reason=permission");
  return (
    <>
      <PageHeader title="Admin" description="GitHub connections, who can do what, who approves, and how the system is keeping up." />
      <AdminTabs allowed={allowed} />
      {children}
    </>
  );
}
