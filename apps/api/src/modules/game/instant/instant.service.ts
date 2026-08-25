import { AccountKind, BetStatus, TransactionType, type Prisma } from '@prisma/client';
import {
  GAME_CODE_DICE,
  GAME_CODE_LIMBO,
  GAME_CODE_MINES,
  MINES_SHUFFLE_VALUES,
  MINES_TILES,
  X100,
  diceMultiplierX100,
  dicePayout,
  diceRollFromValue,
  diceWinCount,
  diceWins,
  instantPayout,
  minesPayout,
  isValidDiceTarget,
  isValidLimboTarget,
  isValidMineCount,
  limboResultFromValue,
  limboWins,
  minesMultiplierX100,
  placeMines,
  type DiceDirection,
} from '@lp/shared';
import { prisma, type Tx } from '../../../db/prisma.js';
import { badRequest, conflict, notFound } from '../../../lib/errors.js';
import {
  getOrCreateSystemAccount,
  getOrCreateUserAccount,
  postTransaction,
} from '../../ledger/ledger.service.js';
import { deriveInstant, deriveInstantSeries } from '../draw.js';
import { claimNonce, getActiveSeedPair } from './seed.service.js';

export const INSTANT_MIN_STAKE = 1_000n; // ₹10
export const INSTANT_MAX_STAKE = 10_000_000n; // ₹100,000

function assertStake(stake: bigint): void {
  if (stake < INSTANT_MIN_STAKE) throw badRequest('AMOUNT_TOO_SMALL', 'Bet is below the minimum');
  if (stake > INSTANT_MAX_STAKE) throw badRequest('AMOUNT_TOO_LARGE', 'Bet is above the maximum');
}

/** Debits the stake. Throws INSUFFICIENT_FUNDS, rolling back the bet row. */
async function debitStake(tx: Tx, userId: bigint, betId: bigint, stake: bigint, memo: string) {
  const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
  const houseAccount = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);

  const posted = await postTransaction(tx, {
    type: TransactionType.BET_STAKE,
    idempotencyKey: `instant-stake:${betId}`,
    referenceType: 'INSTANT_BET',
    referenceId: betId,
    memo,
    legs: [
      { accountId: userAccount, amount: -stake },
      { accountId: houseAccount, amount: stake },
    ],
  });

  await tx.$executeRaw`UPDATE users SET wagerRequirement = GREATEST(0, CAST(wagerRequirement AS SIGNED) - ${stake}) WHERE id = ${userId}`;

  return { posted, userAccount, houseAccount };
}

/** Credits winnings. Idempotent on the bet id. */
async function creditPayout(tx: Tx, userId: bigint, betId: bigint, payout: bigint, memo: string) {
  const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
  const houseAccount = await getOrCreateSystemAccount(tx, AccountKind.HOUSE);

  const posted = await postTransaction(tx, {
    type: TransactionType.BET_PAYOUT,
    idempotencyKey: `instant-payout:${betId}`,
    referenceType: 'INSTANT_BET',
    referenceId: betId,
    memo,
    legs: [
      { accountId: houseAccount, amount: -payout },
      { accountId: userAccount, amount: payout },
    ],
  });

  return { posted, userAccount };
}

// ===========================================================================
// Dice
// ===========================================================================

export interface DiceInput {
  userId: bigint;
  stake: bigint;
  /** 0..9999, displayed as 0.00 - 99.99. */
  target: number;
  direction: DiceDirection;
}

export async function playDice(input: DiceInput) {
  const { userId, stake, target, direction } = input;

  assertStake(stake);
  if (direction !== 'over' && direction !== 'under') {
    throw badRequest('BAD_DIRECTION', 'Direction must be over or under');
  }
  if (!isValidDiceTarget(target, direction)) {
    throw badRequest('BAD_TARGET', 'Win chance must be between 1% and 99%');
  }

  const pair = await getActiveSeedPair(userId);
  const winCount = diceWinCount(target, direction);
  const multiplierX100 = diceMultiplierX100(winCount);

  return prisma.$transaction(async (tx) => {
    const nonce = await claimNonce(tx, pair.id);
    const roll = diceRollFromValue(deriveInstant(pair.serverSeed, pair.clientSeed, nonce));
    const won = diceWins(roll, target, direction);
    // Priced from the exact rational, not the display multiplier.
    const payout = won ? dicePayout(stake, winCount) : 0n;

    const bet = await tx.instantBet.create({
      data: {
        userId,
        gameCode: GAME_CODE_DICE,
        seedPairId: pair.id,
        nonce,
        stake,
        params: { target, direction } as Prisma.InputJsonValue,
        resultData: { roll } as Prisma.InputJsonValue,
        multiplierX100: won ? multiplierX100 : 0,
        status: won ? BetStatus.WON : BetStatus.LOST,
        payout,
        settledAt: new Date(),
      },
    });

    const { posted: stakeTx } = await debitStake(tx, userId, bet.id, stake, `dice ${direction} ${target}`);
    let balance = stakeTx.balancesAfter.values().next().value ?? 0n;
    let payoutTxId: bigint | null = null;

    if (won) {
      const { posted, userAccount } = await creditPayout(tx, userId, bet.id, payout, `dice win`);
      payoutTxId = posted.id;
      balance = posted.balancesAfter.get(userAccount) ?? balance;
    } else {
      const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
      balance = stakeTx.balancesAfter.get(userAccount) ?? 0n;
    }

    await tx.instantBet.update({
      where: { id: bet.id },
      data: { stakeTxId: stakeTx.id, payoutTxId },
    });

    return {
      betId: bet.id,
      roll,
      won,
      multiplierX100: won ? multiplierX100 : 0,
      payout,
      balance,
      nonce,
      serverSeedHash: pair.serverSeedHash,
      clientSeed: pair.clientSeed,
    };
  });
}

// ===========================================================================
// Limbo
// ===========================================================================

export interface LimboInput {
  userId: bigint;
  stake: bigint;
  targetX100: number;
}

export async function playLimbo(input: LimboInput) {
  const { userId, stake, targetX100 } = input;

  assertStake(stake);
  if (!isValidLimboTarget(targetX100)) {
    throw badRequest('BAD_TARGET', 'Target must be between 1.01x and 10,000x');
  }

  const pair = await getActiveSeedPair(userId);

  return prisma.$transaction(async (tx) => {
    const nonce = await claimNonce(tx, pair.id);
    const resultX100 = limboResultFromValue(
      deriveInstant(pair.serverSeed, pair.clientSeed, nonce),
    );
    const won = limboWins(resultX100, targetX100);
    const payout = won ? instantPayout(stake, targetX100) : 0n;

    const bet = await tx.instantBet.create({
      data: {
        userId,
        gameCode: GAME_CODE_LIMBO,
        seedPairId: pair.id,
        nonce,
        stake,
        params: { targetX100 } as Prisma.InputJsonValue,
        resultData: { resultX100 } as Prisma.InputJsonValue,
        multiplierX100: won ? targetX100 : 0,
        status: won ? BetStatus.WON : BetStatus.LOST,
        payout,
        settledAt: new Date(),
      },
    });

    const { posted: stakeTx } = await debitStake(
      tx,
      userId,
      bet.id,
      stake,
      `limbo ${targetX100 / X100}x`,
    );
    const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);
    let balance = stakeTx.balancesAfter.get(userAccount) ?? 0n;
    let payoutTxId: bigint | null = null;

    if (won) {
      const { posted } = await creditPayout(tx, userId, bet.id, payout, 'limbo win');
      payoutTxId = posted.id;
      balance = posted.balancesAfter.get(userAccount) ?? balance;
    }

    await tx.instantBet.update({
      where: { id: bet.id },
      data: { stakeTxId: stakeTx.id, payoutTxId },
    });

    return {
      betId: bet.id,
      resultX100,
      won,
      targetX100,
      payout,
      balance,
      nonce,
      serverSeedHash: pair.serverSeedHash,
      clientSeed: pair.clientSeed,
    };
  });
}

// ===========================================================================
// Mines
//
// The one instant game that spans several requests: start, reveal, reveal...,
// then cash out. Mine positions are fixed at start and stored, but must never
// be sent to the client while the bet is still PENDING.
// ===========================================================================

interface MinesState {
  revealed: number[];
}
interface MinesResult {
  minePositions: number[];
}

export async function minesStart(userId: bigint, stake: bigint, mines: number) {
  assertStake(stake);
  if (!isValidMineCount(mines)) throw badRequest('BAD_MINES', 'Mines must be between 1 and 24');

  const open = await prisma.instantBet.findFirst({
    where: { userId, gameCode: GAME_CODE_MINES, status: BetStatus.PENDING },
    select: { id: true },
  });
  if (open) throw conflict('GAME_IN_PROGRESS', 'Finish or cash out your current game first');

  const pair = await getActiveSeedPair(userId);

  return prisma.$transaction(async (tx) => {
    const nonce = await claimNonce(tx, pair.id);
    const values = deriveInstantSeries(
      pair.serverSeed,
      pair.clientSeed,
      nonce,
      MINES_SHUFFLE_VALUES,
    );
    const minePositions = placeMines(mines, values);

    const bet = await tx.instantBet.create({
      data: {
        userId,
        gameCode: GAME_CODE_MINES,
        seedPairId: pair.id,
        nonce,
        stake,
        params: { mines } as Prisma.InputJsonValue,
        state: { revealed: [] } as Prisma.InputJsonValue,
        resultData: { minePositions } as Prisma.InputJsonValue,
        multiplierX100: X100,
        status: BetStatus.PENDING,
      },
    });

    const { posted } = await debitStake(tx, userId, bet.id, stake, `mines ${mines}`);
    await tx.instantBet.update({ where: { id: bet.id }, data: { stakeTxId: posted.id } });

    const userAccount = await getOrCreateUserAccount(tx, userId, AccountKind.USER_CASH);

    return {
      betId: bet.id,
      mines,
      revealed: [] as number[],
      multiplierX100: X100,
      balance: posted.balancesAfter.get(userAccount) ?? 0n,
      nonce,
      serverSeedHash: pair.serverSeedHash,
    };
  });
}

export async function minesReveal(userId: bigint, tile: number) {
  if (!Number.isInteger(tile) || tile < 0 || tile >= MINES_TILES) {
    throw badRequest('BAD_TILE', `Tile must be 0-${MINES_TILES - 1}`);
  }

  return prisma.$transaction(async (tx) => {
    const open = await tx.instantBet.findFirst({
      where: { userId, gameCode: GAME_CODE_MINES, status: BetStatus.PENDING },
      orderBy: { id: 'desc' },
    });
    if (!open) throw notFound('No game in progress');

    // Lock the row so two rapid taps cannot both reveal.
    await tx.$queryRawUnsafe('SELECT id FROM instant_bets WHERE id = ? FOR UPDATE', open.id);

    const state = open.state as unknown as MinesState;
    const result = open.resultData as unknown as MinesResult;
    const mines = (open.params as unknown as { mines: number }).mines;

    if (state.revealed.includes(tile)) throw conflict('ALREADY_REVEALED', 'Tile already revealed');

    const hitMine = result.minePositions.includes(tile);

    if (hitMine) {
      await tx.instantBet.update({
        where: { id: open.id },
        data: {
          status: BetStatus.LOST,
          payout: 0n,
          multiplierX100: 0,
          state: { revealed: [...state.revealed, tile] } as Prisma.InputJsonValue,
          settledAt: new Date(),
        },
      });

      return {
        betId: open.id,
        tile,
        hitMine: true,
        revealed: [...state.revealed, tile],
        multiplierX100: 0,
        status: 'LOST' as const,
        // Safe to expose now: the game is over.
        minePositions: result.minePositions,
        payout: 0n,
        balance: null as bigint | null,
      };
    }

    const revealed = [...state.revealed, tile];
    const multiplierX100 = minesMultiplierX100(mines, revealed.length);
    const safeTiles = MINES_TILES - mines;

    // Clearing every safe tile auto-cashes at the top of the ladder — there is
    // nothing left to reveal, so making the player press cash out would just
    // be a trap.
    if (revealed.length === safeTiles) {
      const payout = minesPayout(open.stake, mines, revealed.length);
      await tx.instantBet.update({
        where: { id: open.id },
        data: {
          status: BetStatus.WON,
          payout,
          multiplierX100,
          state: { revealed } as Prisma.InputJsonValue,
          settledAt: new Date(),
        },
      });
      const { posted, userAccount } = await creditPayout(
        tx,
        userId,
        open.id,
        payout,
        'mines cleared',
      );
      await tx.instantBet.update({ where: { id: open.id }, data: { payoutTxId: posted.id } });

      return {
        betId: open.id,
        tile,
        hitMine: false,
        revealed,
        multiplierX100,
        status: 'WON' as const,
        minePositions: result.minePositions,
        payout,
        balance: posted.balancesAfter.get(userAccount) ?? null,
      };
    }

    await tx.instantBet.update({
      where: { id: open.id },
      data: { state: { revealed } as Prisma.InputJsonValue, multiplierX100 },
    });

    return {
      betId: open.id,
      tile,
      hitMine: false,
      revealed,
      multiplierX100,
      status: 'PENDING' as const,
      minePositions: null,
      payout: 0n,
      balance: null as bigint | null,
    };
  });
}

export async function minesCashout(userId: bigint) {
  return prisma.$transaction(async (tx) => {
    const open = await tx.instantBet.findFirst({
      where: { userId, gameCode: GAME_CODE_MINES, status: BetStatus.PENDING },
      orderBy: { id: 'desc' },
    });
    if (!open) throw notFound('No game in progress');

    await tx.$queryRawUnsafe('SELECT id FROM instant_bets WHERE id = ? FOR UPDATE', open.id);

    const state = open.state as unknown as MinesState;
    const result = open.resultData as unknown as MinesResult;
    const mines = (open.params as unknown as { mines: number }).mines;

    if (state.revealed.length === 0) {
      throw conflict('NOTHING_REVEALED', 'Reveal at least one tile before cashing out');
    }

    const multiplierX100 = minesMultiplierX100(mines, state.revealed.length);
    const payout = minesPayout(open.stake, mines, state.revealed.length);

    const claimed = await tx.instantBet.updateMany({
      where: { id: open.id, status: BetStatus.PENDING },
      data: { status: BetStatus.WON, payout, multiplierX100, settledAt: new Date() },
    });
    if (claimed.count === 0) throw conflict('ALREADY_SETTLED', 'This game is already finished');

    const { posted, userAccount } = await creditPayout(
      tx,
      userId,
      open.id,
      payout,
      `mines cashout ${multiplierX100 / X100}x`,
    );
    await tx.instantBet.update({ where: { id: open.id }, data: { payoutTxId: posted.id } });

    return {
      betId: open.id,
      multiplierX100,
      payout,
      revealed: state.revealed,
      minePositions: result.minePositions,
      balance: posted.balancesAfter.get(userAccount) ?? 0n,
    };
  });
}

/** The caller's in-progress Mines game, if any — restores UI state on reload. */
export async function minesCurrent(userId: bigint) {
  const open = await prisma.instantBet.findFirst({
    where: { userId, gameCode: GAME_CODE_MINES, status: BetStatus.PENDING },
    orderBy: { id: 'desc' },
  });
  if (!open) return null;

  const state = open.state as unknown as MinesState;
  const mines = (open.params as unknown as { mines: number }).mines;

  return {
    betId: open.id,
    stake: open.stake,
    mines,
    revealed: state.revealed,
    multiplierX100: minesMultiplierX100(mines, state.revealed.length),
    // Deliberately omits minePositions — the game is still running.
  };
}

// ===========================================================================
// History
// ===========================================================================

export async function instantHistory(userId: bigint, gameCode?: string, take = 30) {
  const rows = await prisma.instantBet.findMany({
    where: { userId, ...(gameCode ? { gameCode } : {}) },
    orderBy: { id: 'desc' },
    take,
    include: { seedPair: { select: { serverSeedHash: true, clientSeed: true, active: true } } },
  });

  return rows.map((b) => ({
    id: b.id,
    gameCode: b.gameCode,
    stake: b.stake,
    params: b.params,
    /**
     * Play state — tiles revealed, cards already turned. Always safe to send:
     * the player has seen all of it. The HIDDEN information (Mines board, the
     * undealt deck) lives in resultData, which is withheld below.
     */
    state: b.state,
    // A running Mines game must not leak its board.
    resultData: b.status === BetStatus.PENDING && b.gameCode === GAME_CODE_MINES ? null : b.resultData,
    multiplierX100: b.multiplierX100,
    status: b.status,
    payout: b.payout,
    nonce: b.nonce,
    serverSeedHash: b.seedPair.serverSeedHash,
    clientSeed: b.seedPair.clientSeed,
    createdAt: b.createdAt,
  }));
}
