import { requireActor } from "@/platform/session";
import { inboxFor, recentDecisions } from "@/features/approvals/server/queries";
import { loadApprovalContext } from "@/features/approvals/server/context";
import { can } from "@/features/access/domain/permissions";
import { ApprovalsView } from "@/features/approvals/ui/approvals-view";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const actor = await requireActor();
  const [items, decisions, ctx] = await Promise.all([inboxFor(actor), recentDecisions(actor), loadApprovalContext()]);
  const usesGithubMode = ctx.rules.length === 0 || ctx.rules.some((r) => r.mode === "github");
  return (
    <ApprovalsView
      items={items}
      decisions={decisions.map((d) => ({ ...d, decidedAt: d.decidedAt?.toISOString() ?? null }))}
      needsGithubLink={usesGithubMode && !actor.githubLogin && can(actor, "approval.decide")}
    />
  );
}
