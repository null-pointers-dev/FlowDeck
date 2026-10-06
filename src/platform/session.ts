import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { loadActor } from "@/features/access/server/actor";
import { can, type Actor, type Permission, type Resource } from "@/features/access/domain/permissions";

/** The signed-in person with their permissions, once per request (React cache). Web only. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  return loadActor(s.user.id);
});

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  if (!actor.hasAccess) redirect("/no-access");
  return actor;
}

export async function requirePermission(permission: Permission, resource?: Resource): Promise<Actor> {
  const actor = await requireActor();
  if (!can(actor, permission, resource)) redirect("/no-access?reason=permission");
  return actor;
}

/** For route handlers. */
export async function actorFromRequest(req: Request): Promise<Actor | null> {
  const s = await auth.api.getSession({ headers: req.headers });
  return s ? loadActor(s.user.id) : null;
}
