import { prisma } from '../../db/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';

/**
 * Operator-managed broadcasts. Players see the active ones (pinned first) in the
 * home marquee and the announcements panel; operators manage them from the
 * back-office. Replaces the hard-coded marquee string.
 */

export async function listActive() {
  const rows = await prisma.announcement.findMany({
    where: { active: true },
    orderBy: [{ pinned: 'desc' }, { id: 'desc' }],
    take: 20,
  });
  return rows.map(serialize);
}

// --- admin -----------------------------------------------------------------

export async function listAll(take: number) {
  const rows = await prisma.announcement.findMany({ orderBy: { id: 'desc' }, take });
  return rows.map(serialize);
}

export async function createAnnouncement(
  adminId: bigint,
  title: string,
  body: string,
  pinned: boolean,
) {
  if (title.trim().length < 3) throw badRequest('BAD_TITLE', 'Title is too short');
  if (body.trim().length < 3) throw badRequest('BAD_BODY', 'Body is too short');
  return serialize(
    await prisma.announcement.create({
      data: {
        title: title.trim().slice(0, 160),
        body: body.trim().slice(0, 4000),
        pinned,
        createdById: adminId,
      },
    }),
  );
}

export async function updateAnnouncement(
  id: bigint,
  patch: { active?: boolean; pinned?: boolean },
) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw notFound('Announcement not found');
  return serialize(await prisma.announcement.update({ where: { id }, data: patch }));
}

export async function deleteAnnouncement(id: bigint) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw notFound('Announcement not found');
  await prisma.announcement.delete({ where: { id } });
  return { id: id.toString() };
}

function serialize(a: {
  id: bigint;
  title: string;
  body: string;
  active: boolean;
  pinned: boolean;
  createdAt: Date;
}) {
  return {
    id: a.id.toString(),
    title: a.title,
    body: a.body,
    active: a.active,
    pinned: a.pinned,
    createdAt: a.createdAt,
  };
}
