import { NotificationKind, TicketStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { notify } from '../notifications/notification.service.js';

/**
 * Customer-service tickets. A player opens a ticket; an operator answers it from
 * the back-office. The reply lands in the player's notifications, closing the
 * loop without a live-chat backend.
 */

export async function createTicket(userId: bigint, subject: string, message: string) {
  if (subject.trim().length < 3) throw badRequest('BAD_SUBJECT', 'Subject is too short');
  if (message.trim().length < 5) throw badRequest('BAD_MESSAGE', 'Please describe your issue');

  const ticket = await prisma.supportTicket.create({
    data: {
      userId,
      subject: subject.trim().slice(0, 120),
      message: message.trim().slice(0, 4000),
    },
  });
  return serialize(ticket);
}

export async function listMyTickets(userId: bigint, take: number) {
  const rows = await prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    take,
  });
  return rows.map(serialize);
}

// --- admin -----------------------------------------------------------------

export async function listTicketsAdmin(status: TicketStatus | undefined, take: number) {
  const rows = await prisma.supportTicket.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: 'asc' }, { id: 'desc' }],
    take,
    include: { user: { select: { nickname: true, phone: true } } },
  });
  return rows.map((t) => ({ ...serialize(t), nickname: t.user.nickname, phone: t.user.phone }));
}

export async function replyTicket(adminId: bigint, id: bigint, reply: string) {
  if (reply.trim().length < 2) throw badRequest('BAD_REPLY', 'Reply is empty');
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw notFound('Ticket not found');

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: {
      reply: reply.trim().slice(0, 4000),
      repliedById: adminId,
      repliedAt: new Date(),
      status: TicketStatus.ANSWERED,
    },
  });

  // The reply reaches the player as a notification.
  await notify(
    ticket.userId,
    NotificationKind.SYSTEM,
    'Support replied to your ticket',
    `Re: ${ticket.subject} — ${reply.trim().slice(0, 200)}`,
  ).catch(() => {});

  return serialize(updated);
}

export async function closeTicket(id: bigint) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw notFound('Ticket not found');
  return serialize(
    await prisma.supportTicket.update({ where: { id }, data: { status: TicketStatus.CLOSED } }),
  );
}

function serialize(t: {
  id: bigint;
  subject: string;
  message: string;
  status: TicketStatus;
  reply: string | null;
  createdAt: Date;
  repliedAt: Date | null;
}) {
  return {
    id: t.id.toString(),
    subject: t.subject,
    message: t.message,
    status: t.status,
    reply: t.reply,
    createdAt: t.createdAt,
    repliedAt: t.repliedAt,
  };
}
