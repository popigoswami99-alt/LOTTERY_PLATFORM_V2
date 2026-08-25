import { NotificationKind } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { emitToUser } from '../../realtime/io.js';

/**
 * In-app notifications — the "push" channel for this platform. There is no
 * external push provider wired up, so events fan out to a per-player feed the
 * client polls / receives over the existing socket, shown as a bell with an
 * unread count.
 *
 * `notify` is the one entry point other modules call (deposit credited,
 * withdrawal paid, etc.). It is best-effort: a failure here must never roll
 * back the money movement that triggered it, so callers wrap it in a catch.
 */
export async function notify(
  userId: bigint,
  kind: NotificationKind,
  title: string,
  body: string,
): Promise<void> {
  const n = await prisma.notification.create({
    data: { userId, kind, title: title.slice(0, 160), body: body.slice(0, 500) },
  });
  // Nudge any live client to refresh its unread badge.
  emitToUser(userId, 'notification', { id: n.id.toString(), kind, title, body });
}

export async function listNotifications(userId: bigint, take: number) {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    take,
  });
  return rows.map((n) => ({
    id: n.id.toString(),
    kind: n.kind,
    title: n.title,
    body: n.body,
    read: n.readAt !== null,
    createdAt: n.createdAt,
  }));
}

export async function unreadCount(userId: bigint): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** Marks one notification read, or all of them when no id is given. */
export async function markRead(userId: bigint, id?: bigint): Promise<{ unread: number }> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  return { unread: await unreadCount(userId) };
}
