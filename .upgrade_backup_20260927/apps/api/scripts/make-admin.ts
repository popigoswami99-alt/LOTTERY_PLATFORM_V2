/**
 * Creates (or updates) the development admin account and moves a balance onto
 * it.
 *
 *   npx tsx scripts/make-admin.ts
 *
 * The balance move is posted as a normal double-entry ADJUSTMENT through the
 * ledger — it is a transfer between two accounts, not a direct balance write,
 * so global conservation still holds afterwards.
 */

import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { AccountKind, Role, TransactionType } from '@prisma/client';
import { formatMinor } from '@lp/shared';
import { prisma } from '../src/db/prisma.js';
import {
  getOrCreateSystemAccount,
  getOrCreateUserAccount,
  postTransaction,
  verifyGlobalBalance,
} from '../src/modules/ledger/ledger.service.js';

const ADMIN_PHONE = '9000000000';
const ADMIN_PASSWORD = 'admin123';
const TARGET_COINS = 500_000n;
const TARGET_MINOR = TARGET_COINS * 100n;

/** Drain this account into the admin, if it exists — the earlier test player. */
const DRAIN_FROM_PHONE = '9000000001';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const inviteCode = () =>
  Array.from({ length: 8 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join('');

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    update: { role: Role.ADMIN, passwordHash, nickname: 'Admin' },
    create: {
      phone: ADMIN_PHONE,
      passwordHash,
      nickname: 'Admin',
      role: Role.ADMIN,
      inviteCode: inviteCode(),
    },
  });
  console.log(`admin user id ${admin.id} (${admin.phone}), role ${admin.role}`);

  await prisma.$transaction(async (tx) => {
    const adminAccount = await getOrCreateUserAccount(tx, admin.id, AccountKind.USER_CASH);

    // Prefer moving the balance off the earlier test account so no coins are
    // conjured; fall back to a clearing-account deposit if it is not there.
    const donor = await tx.user.findUnique({ where: { phone: DRAIN_FROM_PHONE } });
    let sourceAccountId: bigint;
    let label: string;

    if (donor) {
      sourceAccountId = await getOrCreateUserAccount(tx, donor.id, AccountKind.USER_CASH);
      label = `transfer from ${donor.nickname}`;
    } else {
      sourceAccountId = await getOrCreateSystemAccount(tx, AccountKind.DEPOSIT_CLEARING);
      label = 'deposit clearing';
    }

    const source = await tx.ledgerAccount.findUniqueOrThrow({
      where: { id: sourceAccountId },
      select: { balance: true },
    });

    const adminAcc = await tx.ledgerAccount.findUniqueOrThrow({
      where: { id: adminAccount },
      select: { balance: true },
    });

    const needed = TARGET_MINOR - adminAcc.balance;
    if (needed <= 0n) {
      console.log(`admin already holds ${formatMinor(adminAcc.balance)} coins — nothing to do`);
      return;
    }

    // Only drain what the donor actually has; top up the rest from clearing.
    const fromDonor = donor && source.balance > 0n ? (source.balance < needed ? source.balance : needed) : 0n;
    const fromClearing = needed - fromDonor;

    if (fromDonor > 0n) {
      await postTransaction(tx, {
        type: TransactionType.ADJUSTMENT,
        idempotencyKey: `admin-fund-transfer:${admin.id}:${Date.now()}`,
        referenceType: 'ADMIN_FUND',
        referenceId: admin.id,
        memo: `admin funding — ${label}`,
        legs: [
          { accountId: sourceAccountId, amount: -fromDonor },
          { accountId: adminAccount, amount: fromDonor },
        ],
      });
      console.log(`moved ${formatMinor(fromDonor)} coins — ${label}`);
    }

    if (fromClearing > 0n) {
      const clearing = await getOrCreateSystemAccount(tx, AccountKind.DEPOSIT_CLEARING);
      await postTransaction(tx, {
        type: TransactionType.DEPOSIT,
        idempotencyKey: `admin-fund-deposit:${admin.id}:${Date.now()}`,
        referenceType: 'ADMIN_FUND',
        referenceId: admin.id,
        memo: 'admin funding — development credit',
        legs: [
          { accountId: clearing, amount: -fromClearing },
          { accountId: adminAccount, amount: fromClearing },
        ],
      });
      console.log(`credited ${formatMinor(fromClearing)} coins from deposit clearing`);
    }
  });

  const finalAccount = await prisma.ledgerAccount.findFirstOrThrow({
    where: { ownerId: admin.id, kind: AccountKind.USER_CASH },
    select: { balance: true },
  });
  const integrity = await verifyGlobalBalance();

  console.log(`\nadmin balance : ${formatMinor(finalAccount.balance)} coins`);
  console.log(`ledger total  : ${integrity.total} (ok=${integrity.ok})`);

  await prisma.$disconnect();
  if (!integrity.ok) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
