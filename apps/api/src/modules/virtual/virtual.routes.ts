import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { prisma } from '../../db/prisma.js'
import { getOrCreateSystemAccount, getOrCreateUserAccount, getBalance, postTransaction } from '../ledger/ledger.service.js';

const router = Router()

function authUserId(req: any) {
  return (
    req.user?.id ??
    req.auth?.userId ??
    req.userId ??
    null
  )
}

function numeric(value: any) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/*
 * Virtual-only platform endpoints.
 *
 * These endpoints intentionally do not connect to:
 * - UPI
 * - bank accounts
 * - cards
 * - payment gateways
 * - real-money wallets
 */

router.get('/mode', (_req, res) => {
  res.json({
    ok: true,
    data: {
      mode: 'VIRTUAL_ONLY',
      deposit: false,
      withdrawal: false,
      recharge: false,
      realMoney: false,
    },
  })
})

router.get('/balance', requireAuth, async (req: any, res) => {
  try {
    const userId = authUserId(req)

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'AUTH_REQUIRED',
      })
    }

    const account = await prisma.ledgerAccount.findFirst({
      where: {
        ownerType: 'USER',
        ownerId: BigInt(userId),
      },
      orderBy: {
        id: 'asc',
      },
    })

    return res.json({
      ok: true,
      data: {
        balance: String(account?.balance ?? 0),
        currency: 'TEST',
        virtualOnly: true,
      },
    })
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'VIRTUAL_BALANCE_ERROR',
    })
  }
})

router.get('/ledger', requireAuth, async (req: any, res) => {
  try {
    const userId = authUserId(req)

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'AUTH_REQUIRED'
      })
    }

    const accounts = await prisma.ledgerAccount.findMany({
      where: {
        ownerType: 'USER',
        ownerId: BigInt(userId),
      },
      select: {
        id: true,
        kind: true,
        currency: true,
        balance: true,
      },
    })

    const accountIds = accounts.map((x: any) => x.id)

    if (!accountIds.length) {
      return res.json({
        ok: true,
        data: {
          accounts: [],
          entries: [],
        },
      })
    }

    const entries = await prisma.ledgerEntry.findMany({
      where: {
        accountId: {
          in: accountIds,
        },
      },
      orderBy: {
        id: 'desc',
      },
      take: Math.min(
        Math.max(Number(req.query.limit ?? 50), 1),
        100
      ),
      include: {
        transaction: true,
      },
    })

    return res.json({
      ok: true,
      data: {
        accounts: accounts.map((a: any) => ({
          id: String(a.id),
          kind: a.kind,
          currency: a.currency,
          balance: String(a.balance),
        })),
        entries: entries.map((e: any) => ({
          id: String(e.id),
          accountId: String(e.accountId),
          transactionId: String(e.transactionId),
          amount: String(e.amount),
          balanceAfter: String(e.balanceAfter),
          type: e.transaction?.type ?? null,
          referenceType: e.transaction?.referenceType ?? null,
          referenceId: e.transaction?.referenceId != null
            ? String(e.transaction.referenceId)
            : null,
          memo: e.transaction?.memo ?? null,
          createdAt: e.createdAt,
        })),
      },
    })
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message ?? 'LEDGER_ERROR',
    })
  }
})

router.post('/credit', requireAuth, async (req: any, res) => {
  const amount = String(req.body?.amount ?? '').trim();
  const reason = String(req.body?.reason ?? 'virtual_credit').trim() || 'virtual_credit';
  const idempotencyKey =
    String(req.body?.idempotencyKey ?? '').trim() ||
    `virtual-credit:${req.userId}:${amount}:${reason}`;

  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'INVALID_AMOUNT',
        message: 'amount must be a positive virtual credit amount',
      },
    });
  }

  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100000000) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'INVALID_AMOUNT',
        message: 'amount must be greater than zero',
      },
    });
  }

  const minor = BigInt(Math.round(numeric * 100));

  const result = await prisma.$transaction(async (tx) => {
    const userAccount = await getOrCreateUserAccount(tx, BigInt(req.userId!));
    const clearing = await getOrCreateSystemAccount(tx, 'DEPOSIT_CLEARING' as any);

    const posted = await postTransaction(tx, {
      type: 'ADJUSTMENT' as any,
      idempotencyKey,
      referenceType: 'VIRTUAL_CREDIT',
      referenceId: BigInt(req.userId!),
      memo: reason,
      legs: [
        { accountId: clearing, amount: -minor },
        { accountId: userAccount, amount: minor },
      ],
    });

    return {
      posted,
      userAccount,
      balance: posted.balancesAfter.get(userAccount) ?? 0n,
      minor,
    };
  });

  res.json({
    ok: true,
    data: {
      amount,
      amountMinor: result.minor.toString(),
      balance: result.balance.toString(),
      before: (result.balance - result.minor).toString(),
      after: result.balance.toString(),
      reason,
      transactionId: result.posted.id.toString(),
      transactionType: 'ADJUSTMENT',
      currency: 'INR',
      virtualOnly: true,
      realMoney: false,
      replayed: result.posted.replayed,
    },
  });
});

export default router;
