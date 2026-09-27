import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { ROOM_BY_KEY, SOCKET_EVENTS } from '@lp/shared';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../modules/auth/auth.service.js';

let io: SocketServer | null = null;

/** Private per-user channel, used for balance pushes. */
export const userChannel = (userId: bigint | string) => `user:${userId}`;

export function initSocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: { origin: env.CORS_ORIGIN.split(','), credentials: true },
    // Long-lived rooms with 1s ticks; keep the default transports but be
    // generous about latency on mobile networks.
    pingInterval: 20_000,
    pingTimeout: 25_000,
  });

  io.on('connection', (socket: Socket) => {
    // Auth is optional: guests may watch the countdown and results, only
    // balance events require a valid token.
    const token = socket.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        const claims = verifyAccessToken(token);
        socket.data.userId = claims.sub;
        socket.join(userChannel(claims.sub));
      } catch {
        /* stay a guest */
      }
    }

    socket.on(SOCKET_EVENTS.JOIN_ROOM, (roomKey: unknown) => {
      if (typeof roomKey !== 'string') return;
      // Period-game rooms, plus Crash's single continuous channel.
      if (!ROOM_BY_KEY[roomKey] && roomKey !== 'CRASH') return;
      socket.join(roomKey);
    });

    socket.on(SOCKET_EVENTS.LEAVE_ROOM, (roomKey: unknown) => {
      if (typeof roomKey === 'string') socket.leave(roomKey);
    });
  });

  return io;
}

export function getIo(): SocketServer {
  if (!io) throw new Error('Socket server not initialised');
  return io;
}

export function emitToRoom(roomKey: string, event: string, payload: unknown): void {
  io?.to(roomKey).emit(event, payload);
}

export function emitToUser(userId: bigint | string, event: string, payload: unknown): void {
  io?.to(userChannel(userId)).emit(event, payload);
}
