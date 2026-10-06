import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/platform/db";
import { notification } from "@/platform/db/schema";
import { jobs } from "@/platform/jobs/client";
import { publish } from "@/platform/events";

export async function notify(userId: string, n: { kind: string; title: string; body?: string; link?: string; email?: boolean }) {
  const [row] = await db
    .insert(notification)
    .values({ userId, kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null, email: !!n.email })
    .returning({ id: notification.id });
  await publish(`user:${userId}`, { notification: row.id });
  if (n.email) await jobs.send("notify.deliver", { notificationId: row.id });
}

export async function latestFor(userId: string) {
  const [items, [{ unread }]] = await Promise.all([
    db.select().from(notification).where(eq(notification.userId, userId)).orderBy(desc(notification.createdAt)).limit(12),
    db.select({ unread: sql<number>`count(*)`.mapWith(Number) }).from(notification).where(and(eq(notification.userId, userId), isNull(notification.readAt))),
  ]);
  return {
    unread,
    items: items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: !!n.readAt, at: n.createdAt.toISOString() })),
  };
}

export async function markAllRead(userId: string) {
  await db.update(notification).set({ readAt: new Date() }).where(and(eq(notification.userId, userId), isNull(notification.readAt)));
}
