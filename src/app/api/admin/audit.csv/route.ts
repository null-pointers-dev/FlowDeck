import { actorFromRequest } from "@/platform/session";
import { can } from "@/features/access/domain/permissions";
import { listAudit, toCsv } from "@/features/admin/server/overview";

export async function GET(req: Request) {
  const actor = await actorFromRequest(req);
  if (!actor || !can(actor, "admin.audit")) return new Response("Forbidden", { status: 403 });
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  const csv = toCsv(await listAudit({ q, limit: 10_000 }));
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="flowdeck-audit-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
