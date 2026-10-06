import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { dashboardItem, savedInput, workflowFamily, workflowView } from "@/platform/db/schema";
import { conflict, notFound } from "@/platform/errors";
import { can, type Actor } from "@/features/access/domain/permissions";

/* ---------------------------------------------------------------- saved inputs */

export async function listSavedInputs(userId: string, familyId: string) {
  return db.select().from(savedInput).where(and(eq(savedInput.userId, userId), eq(savedInput.familyId, familyId))).orderBy(desc(savedInput.isDefault), asc(savedInput.name));
}

export async function saveInputs(actor: Actor, input: { familyId: string; name: string; ref: string | null; inputs: Record<string, string | number | boolean>; isDefault: boolean }) {
  const name = input.name.trim();
  const [family] = await db.select({ id: workflowFamily.id, category: workflowFamily.category }).from(workflowFamily).where(eq(workflowFamily.id, input.familyId));
  if (!family || !can(actor, "catalog.view", { category: family.category, familyId: family.id })) throw notFound("This workflow");
  return db.transaction(async (tx) => {
    if (input.isDefault) await tx.update(savedInput).set({ isDefault: false }).where(and(eq(savedInput.userId, actor.userId), eq(savedInput.familyId, input.familyId)));
    const [row] = await tx
      .insert(savedInput)
      .values({ userId: actor.userId, familyId: input.familyId, name, ref: input.ref, inputs: input.inputs, isDefault: input.isDefault })
      .onConflictDoUpdate({ target: [savedInput.userId, savedInput.familyId, savedInput.name], set: { ref: input.ref, inputs: input.inputs, isDefault: input.isDefault, updatedAt: new Date() } })
      .returning({ id: savedInput.id, name: savedInput.name });
    return row;
  });
}

export async function deleteSavedInput(actor: Actor, id: string) {
  const res = await db.delete(savedInput).where(and(eq(savedInput.id, id), eq(savedInput.userId, actor.userId))).returning({ id: savedInput.id });
  if (!res.length) throw notFound("That saved input");
}

export async function setDefaultSavedInput(actor: Actor, id: string) {
  const [row] = await db.select().from(savedInput).where(and(eq(savedInput.id, id), eq(savedInput.userId, actor.userId)));
  if (!row) throw notFound("That saved input");
  await db.transaction(async (tx) => {
    await tx.update(savedInput).set({ isDefault: false }).where(and(eq(savedInput.userId, actor.userId), eq(savedInput.familyId, row.familyId), ne(savedInput.id, id)));
    await tx.update(savedInput).set({ isDefault: !row.isDefault, updatedAt: new Date() }).where(eq(savedInput.id, id));
  });
}

/* ---------------------------------------------------------------- dashboard */

export async function pin(actor: Actor, input: { familyId: string; ref: string; savedInputName: string | null }) {
  const [family] = await db.select({ id: workflowFamily.id, category: workflowFamily.category }).from(workflowFamily).where(eq(workflowFamily.id, input.familyId));
  if (!family || !can(actor, "catalog.view", { category: family.category, familyId: family.id })) throw notFound("This workflow");
  const [{ count }] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(dashboardItem).where(eq(dashboardItem.userId, actor.userId));
  if (count >= 24) throw conflict("Your dashboard holds 24 workflows. Remove one to add another.");
  await db
    .insert(dashboardItem)
    .values({ userId: actor.userId, familyId: input.familyId, ref: input.ref, savedInputName: input.savedInputName, position: count })
    .onConflictDoUpdate({ target: [dashboardItem.userId, dashboardItem.familyId, dashboardItem.ref], set: { savedInputName: input.savedInputName } });
}

export async function unpin(actor: Actor, id: string) {
  await db.delete(dashboardItem).where(and(eq(dashboardItem.id, id), eq(dashboardItem.userId, actor.userId)));
}

export async function moveDashboardItem(actor: Actor, id: string, direction: "up" | "down") {
  const items = await db.select().from(dashboardItem).where(eq(dashboardItem.userId, actor.userId)).orderBy(asc(dashboardItem.position), asc(dashboardItem.createdAt));
  const i = items.findIndex((x) => x.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  await db.transaction(async (tx) => {
    for (const [pos, item] of items.entries()) await tx.update(dashboardItem).set({ position: pos }).where(eq(dashboardItem.id, item.id));
  });
}

/* ---------------------------------------------------------------- recently used */

export async function recordView(userId: string, familyId: string) {
  await db.insert(workflowView).values({ userId, familyId }).onConflictDoUpdate({ target: [workflowView.userId, workflowView.familyId], set: { viewedAt: new Date() } });
}

/** The last 10 workflows the person ran or opened. */
export async function recentlyUsed(actor: Actor, limit = 10) {
  const res = (await db.execute(sql`
    select family_id, max(t) as last from (
      select family_id, created_at as t from run_request where requested_by = ${actor.userId}
      union all
      select family_id, viewed_at as t from workflow_view where user_id = ${actor.userId}
    ) x group by family_id order by last desc limit ${limit}`)) as unknown as { rows: Array<{ family_id: string; last: Date | string }> };
  const ids = res.rows.map((r) => r.family_id);
  if (!ids.length) return [];
  const families = await db.select({ id: workflowFamily.id, title: workflowFamily.title, summary: workflowFamily.summary, category: workflowFamily.category }).from(workflowFamily).where(inArray(workflowFamily.id, ids));
  const byId = new Map(families.map((f) => [f.id, f]));
  return res.rows
    .map((r) => ({ family: byId.get(r.family_id), last: new Date(r.last).toISOString() }))
    .filter((x): x is { family: NonNullable<typeof x.family>; last: string } => !!x.family && can(actor, "catalog.view", { category: x.family.category, familyId: x.family.id }));
}
