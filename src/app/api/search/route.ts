import { actorFromRequest } from "@/platform/session";
import { searchWorkflows } from "@/features/search/server/search";

/**
 * Search as you type. A GET route handler rather than a server action: typing needs
 * parallel, cancellable requests, and server actions run one at a time per tab.
 */
export async function GET(req: Request) {
  const actor = await actorFromRequest(req);
  if (!actor?.hasAccess) return Response.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const hits = await searchWorkflows(actor, q.slice(0, 200), {}, 8);
  return Response.json(hits.map((h) => ({ id: h.id, title: h.title, summary: h.summary, category: h.category, version: h.currentVersion, status: h.status })), {
    headers: { "cache-control": "private, max-age=10" },
  });
}
