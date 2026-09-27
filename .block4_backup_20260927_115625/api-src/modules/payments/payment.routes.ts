import { Router } from 'express';
import { z } from 'zod';
import { PaymentChannel } from '@prisma/client';
import { asyncHandler } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  confirmDepositMpin,
  createDeposit,
  getDeposit,
  handleDepositCallback,
  listDeposits,
  listWithdrawals,
  paymentConfig,
  requestWithdrawal,
} from './payment.service.js';

export const paymentRouter = Router();

/*
 * LOTTERY_PLATFORM_VIRTUAL_ONLY
 *
 * Real-money deposit / withdrawal is intentionally disabled.
 * This project operates only with virtual/test credits.
 *
 * No PSP/provider callback is exposed.
 */

paymentRouter.use((_req, res) => {
  res.status(403).json({
    ok: false,
    code: "PAYMENTS_DISABLED",
    message: "Real-money deposits and withdrawals are disabled. Use virtual test credits only.",
    virtualOnly: true,
  });
});


// Pakistani mobile-wallet number, e.g. 03001234567.
const msisdn = z.string().regex(/^03\d{9}$/, 'Enter a valid 11-digit mobile number (03XXXXXXXXX)');
const amount = z.string().regex(/^\d{1,12}$/); // minor units

paymentRouter.get(
  '/config',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: paymentConfig() });
  }),
);

// --- deposit ---------------------------------------------------------------

const depositSchema = z.object({
  channel: z.nativeEnum(PaymentChannel),
  amount,
  accountNumber: msisdn,
  cnicLast6: z.string().regex(/^\d{6}$/).optional(),
});

paymentRouter.post(
  '/deposit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = depositSchema.parse(req.body);
    const order = await createDeposit(
      req.userId!,
      input.channel,
      BigInt(input.amount),
      input.accountNumber,
      input.cnicLast6,
    );
    res.status(201).json({ ok: true, data: order });
  }),
);

paymentRouter.get(
  '/deposit/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(req.params);
    res.json({ ok: true, data: await getDeposit(req.userId!, BigInt(id)) });
  }),
);

paymentRouter.post(
  '/deposit/:id/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().regex(/^\d+$/) }).parse(req.params);
    const { mpin } = z.object({ mpin: z.string().min(4).max(6) }).parse(req.body);
    res.json({ ok: true, data: await confirmDepositMpin(req.userId!, BigInt(id), mpin) });
  }),
);

paymentRouter.get(
  '/deposits',
  requireAuth,
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 20), 50);
    res.json({ ok: true, data: await listDeposits(req.userId!, take) });
  }),
);

// --- withdrawal ------------------------------------------------------------

const withdrawSchema = z.object({
  channel: z.nativeEnum(PaymentChannel),
  amount,
  accountNumber: msisdn,
  accountName: z.string().min(2).max(64),
});

paymentRouter.post(
  '/withdraw',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = withdrawSchema.parse(req.body);
    const request = await requestWithdrawal(
      req.userId!,
      input.channel,
      BigInt(input.amount),
      input.accountNumber,
      input.accountName,
    );
    res.status(201).json({ ok: true, data: request });
  }),
);

paymentRouter.get(
  '/withdrawals',
  requireAuth,
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 20), 50);
    res.json({ ok: true, data: await listWithdrawals(req.userId!, take) });
  }),
);

// --- provider callback (live mode) -----------------------------------------
// No auth: this is called by the PSP, not the browser. In production it must
// verify the provider signature before trusting the result — left as a clear
// seam since it is exercised only with real credentials.
paymentRouter.post(
  '/callback/:channel',
  asyncHandler(async (req, res) => {
    const { channel } = z.object({ channel: z.nativeEnum(PaymentChannel) }).parse(req.params);
    const { txnRef, success, providerRef } = z
      .object({
        txnRef: z.string().min(1),
        success: z.boolean(),
        providerRef: z.string().optional(),
      })
      .parse(req.body);
    await handleDepositCallback(channel, txnRef, success, providerRef);
    res.json({ ok: true });
  }),
);
