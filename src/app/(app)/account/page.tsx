import { inArray } from "drizzle-orm";
import { requireActor } from "@/platform/session";
import { config } from "@/platform/config";
import { db } from "@/platform/db";
import { entraGroup } from "@/platform/db/schema";
import { AccountView } from "@/features/access/ui/account-view";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const actor = await requireActor();
  const ids = [...new Set(actor.grants.map((g) => g.groupId))];
  const names = new Map<string, string>(ids.length ? (await db.select().from(entraGroup).where(inArray(entraGroup.id, ids))).map((g) => [g.id, g.displayName]) : []);
  return (
    <AccountView
      name={actor.name}
      email={actor.email}
      isPlatformAdmin={actor.isPlatformAdmin}
      githubLogin={actor.githubLogin}
      githubEnabled={!!config.githubOAuth}
      grants={actor.grants.map((g) => ({
        role: g.roleName,
        group: names.get(g.groupId) ?? g.groupId,
        scope: [g.scope.category && `category ${g.scope.category}`, g.scope.familyId && `workflow ${g.scope.familyId}`, g.scope.environment && `environment ${g.scope.environment}`].filter(Boolean).join(", ") || "Everything",
      }))}
    />
  );
}
