import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { installBigIntJson } from './lib/json.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { meRouter } from './modules/me/me.routes.js';
import { agencyRouter } from './modules/agency/agency.routes.js';
import { activityRouter } from './modules/activity/activity.routes.js';
import { walletRouter } from './modules/wallet/wallet.routes.js';
import { gameRouter } from './modules/game/game.routes.js';
import { crashRouter } from './modules/game/crash/crash.routes.js';
import { instantRouter } from './modules/game/instant/instant.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { paymentRouter } from './modules/payments/payment.routes.js';
import { supportRouter } from './modules/support/support.routes.js';
import { announcementRouter } from './modules/announcements/announcement.routes.js';
import { notificationRouter } from './modules/notifications/notification.routes.js';
import { initSocket } from './realtime/io.js';
import { startScheduler, stopScheduler } from './realtime/scheduler.js';
import { startCrashLoop, stopCrashLoop } from './realtime/crash.loop.js';
import { optionalAuth } from './middleware/auth.js';
import { prisma } from './db/prisma.js';

installBigIntJson();

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(','), credentials: true }));
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'lottery-platform-api', time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/agency', agencyRouter);
app.use('/api/activity', activityRouter);
app.use('/api/wallet', walletRouter);
app.use('/api', gameRouter);
app.use('/api/crash', optionalAuth, crashRouter);
app.use('/api/instant', instantRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/support', supportRouter);
app.use('/api/announcements', announcementRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/admin', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = createServer(app);
initSocket(server);

server.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  startScheduler();
  startCrashLoop();
});

async function shutdown(signal: string) {
  console.log(`\n[api] ${signal} received, shutting down`);
  stopScheduler();
  stopCrashLoop();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
