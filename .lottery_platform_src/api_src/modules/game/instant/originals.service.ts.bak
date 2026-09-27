import { AccountKind, BetStatus, TransactionType, type Prisma } from '@prisma/client';
import {
  AB_SHUFFLE_VALUES,
  DT_DRAW_VALUES,
  GAME_CODE_ANDAR_BAHAR,
  GAME_CODE_DRAGON_TIGER,
  dtDraw,
  dtMultiplierX100,
  dtPayout,
  dtWinner,
  isValidDTSide,
  GAME_CODE_HILO,
  GAME_CODE_KENO,
  GAME_CODE_PLINKO,
  abCardFromIndex,
  abDeal,
  abMultiplierX100,
  abPayout,
  abShuffle,
  firstSideFor,
  type ABCard,
  type ABSide,
  KENO_DRAW_VALUES,
  cardFromValue,
  hiloMultiplierX100,
  hiloPayout,
  hiloWins,
  isTrivialCall,
  isValidKenoPicks,
  isValidPlinkoRisk,
  isValidPlinkoRows,
  kenoDraw,
  kenoHits,
  kenoPayout,
  kenoTable,
  plinkoBucket,
  plinkoPath,
  plinkoPayout,
  plinkoTable,
  GAME_CODE_WHEEL,
  isValidWheelRisk,
  wheelMultiplierX100,
  wheelPayout,
  wheelSpin,
  GAME_CODE_MOTORACE,
  isValidMotoRacePick,
  motoRaceMultiplierX100,
  motoRacePayout,
  motoRaceWinner,
  type HiloCall,
  type HiloCard,
  type PlinkoRisk,
  type WheelRisk,
  GAME_CODE_CHICKEN,
  isValidTowerMineCount,
  towerMultiplierX100,
  towerPayout,
  towerRowMinesFromValues,
  TOWER_ROWS,
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
import { INSTANT_MAX_STAKE, INSTANT_MIN_STAKE } from './instant.service.js';

function assertStake(stake: bigint): void {
  if (stake < INSTANT_MIN_STAKE) throw badRequest('AMOUNT_TOO_SMALL', 'Bet is below the minimum');
  if (stake > INSTANT_MAX_STAKE) throw badRequest('AMOUNT_TOO_LARGE', 'Bet is above the maximum');
}

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

  return { posted, userAccount };
}

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
// Plinko — single shot
// ===========================================================================

export async function playPlinko(
  userId: bigint,
  stake: bigint,
  rows: number,
  risk: string,
) {
  assertStake(stake);
  if (!isValidPlinkoRows(rows)) throw badRequest('BAD_ROWS', 'Rows must be 8, 12 or 16');
  if (!isValidPlinkoRisk(risk)) throw badRequest('BAD_RISK', 'Risk must be low, medium or high');

  const pair = await getActiveSeedPair(userId);

  return prisma.$transaction(async (tx) => {
    const nonce = await claimNonce(tx, pair.id);
    const path = plinkoPath(deriveInstant(pair.serverSeed, pair.clientSeed, nonce), rows);
    const bucket = plinkoBucket(path);

    const payout = plinkoPayout(stake, rows as PlinkoRows, risk as PlinkoRisk, bucket);
    const multiplierX100 = plinkoTable(rows as PlinkoRows, risk as PlinkoRisk).multiplierX100(
      bucket,
    );
    // A bucket can pay less than the stake — that is still a settled win, not
    // a loss, so status follows whether anything came back.
    const won = payout > 0n;

    const bet = await tx.instantBet.create({
      data: {
        userId,
        gameCode: GAME_CODE_PLINKO,
        seedPairId: pair.id,
        nonce,
        stake,
        params: { rows, risk } as Prisma.InputJsonValue,
        resultData: { path, bucket } as Prisma.InputJsonValue,
        multiplierX100,
        status: won ? BetStatus.WON : BetStatus.LOST,
        payout,
        settledAt: new Date(),
      },
    });

    const { posted: stakeTx, userAccount } = await debitStake(
      tx,
      userId,
      bet.id,
      stake,
      `plinko ${rows}/${risk}`,
    );
    let balance = stakeTx.balancesAfter.get(userAccount) ?? 0n;
    let payoutTxId: bigint | null = null;

    if (payout > 0n) {
      const { posted } = await creditPayout(tx, userId, bet.id, payout, 'plinko');
      payoutTxId = posted.id;
      balance = posted.balancesAfter.get(userAccount) ?? balance;
    }

    await tx.instantBet.update({
      where: { id: bet.id },
      data: { stakeTxId: stakeTx.id, payoutTxId },
    });

    return { betId: bet.id, path, bucket, multiplierX100, payout, balance, nonce };
  });
}

// ===========================================================================
// Wheel — single shot
// ===========================================================================

export async function playWheel(userId: bigint, stake: bigint, risk: string) {
  assertStake(stake);
  if (!isValidWheelRisk(risk)) throw badRequest('BAD_RISK', 'Risk must be low, medium or high');

  const pair = await getActiveSeedPair(userId);

  return prisma.$transaction(async (tx) => {
    const nonce = await claimNonce(tx, pair.id);
    const segment = wheelSpin(deriveInstant(pair.serverSeed, pair.clientSeed, nonce));

    const payout = wheelPayout(stake, risk as WheelRisk, segment);
    const multiplierX100 = wheelMultiplierX100(risk as WheelRisk, segment);
    const won = payout > 0n;

    const bet = await tx.instantBet.create({
      data: {
        userId,
        gameCode: GAME_CODE_WHEEL,
        seedPairId: pair.id,
        nonce,
        stake,
        params: { risk } as Prisma.InputJsonValue,
        resultData: { segment, multiplierX100 } as Prisma.InputJsonValue,
        multiplierX100,
        status: won ? BetStatus.WON : BetStatus.LOST,
        payout,
        settledAt: new Date(),
      },
    });

    const { posted: stakeTx, userAccount } = await debitStake(
      tx,
      userId,
      bet.id,
      stake,
      `wheel ${risk}`,
    );
    let balance = stakeTx.balancesAfter.get(userAccount) ?? 0n;
    let payoutTxId: bigint | null = null;

    if (payout > 0n) {
      const { posted } = await creditPayout(tx, userId, bet.id, payout, 'wheel');
      payoutTxId = posted.id;
      balance = posted.balancesAfter.get(userAccount) ?? balance;
    }

    await tx.instantBet.update({
      where: { id: bet.id },
      data: { stakeTxId: stakeTx.id, payoutTxId },
    });

    return { betId: bet.id, segment, multiplierX100, payout, balance, nonce };
  });
}

// ===========================================================================
// MotoRace — single shot
// ===========================================================================

export async function playMotoRace(userId: bigint, stake: bigint, pick: number) {
  assertStake(stake);
  if (!isValidMotoRacePick(pick)) throw badRequest('BAD_PICK', 'Pick an in-range racer');

  const pair = await getActiveSeedPair(userId);

  return prisma.$transaction(async (tx) => {
    const nonce = await claimNonce(tx, pair.id);
    const winner = motoRaceWinner(deriveInstant(pair.serverSeed, pair.clientSeed, nonce));

    const payout = motoRacePayout(stake, pick, winner);
    const multiplierX100 = motoRaceMultiplierX100();
    const won = payout > 0n;

    const bet = await tx.instantBet.create({
      data: {
        userId,
        gameCode: GAME_CODE_MOTORACE,
        seedPairId: pair.id,
        nonce,
        stake,
        params: { pick } as Prisma.InputJsonValue,
        resultData: { winner } as Prisma.InputJsonValue,
        multiplierX100: won ? multiplierX100 : 0,
        status: won ? BetStatus.WON : BetStatus.LOST,
        payout,
        settledAt: new Date(),
      },
    });

    const { posted: stakeTx, userAccount } = await debitStake(
      tx,
      userId,
      bet.id,
      stake,
      `motorace pick ${pick}`,
    );
    let balance = stakeTx.balancesAfter.get(userAccount) ?? 0n;
    let payoutTxId: bigint | null = null;

    if (payout > 0n) {
      const { posted } = await creditPayout(tx, userId, bet.id, payout, 'motorace');
      payoutTxId = posted.id;
      balance = posted.balancesAfter.get(userAccount) ?? balance;
    }

    await tx.instantBet.update({
      where: { id: bet.id },
      data: { stakeTxId: stakeTx.id, payoutTxId },
    });

    return { betId: bet.id, pick, winner, multiplierX100, payout, balance, nonce };
  });
}

// ===========================================================================
// Keno — single shot
// ===========================================================================

export async function playKeno(userId: bigint, stake: bigint, picks: number[]) {
  assertStake(stake);
  if (!isValidKenoPicks(picks)) {
    throw badRequest('BAD_PICKS', 'Pick 1 to 10 distinct numbers from 1 to 40');
  }

  const pair = await getActiveSeedPair(userId);
  const sorted = [...picks].sort((a, b) => a - b);

  return prisma.$transaction(async (tx) => {
    const nonce = await claimNonce(tx, pair.id);
    const values = deriveInstantSeries(pair.serverSeed, pair.clientSeed, nonce, KENO_DRAW_VALUES);
    const drawn = kenoDraw(values);
    const hits = kenoHits(sorted, drawn);

    const payout = kenoPayout(stake, sorted.length, hits.length);
    const multiplierX100 = kenoTable(sorted.length).multiplierX100(hits.length);
    const won = payout > 0n;

    const bet = await tx.instantBet.create({
      data: {
        userId,
        gameCode: GAME_CODE_KENO,
        seedPairId: pair.id,
        nonce,
        stake,
        params: { picks: sorted } as Prisma.InputJsonValue,
        resultData: { drawn, hits } as Prisma.InputJsonValue,
        multiplierX100,
        status: won ? BetStatus.WON : BetStatus.LOST,
        payout,
        settledAt: new Date(),
      },
    });

    const { posted: stakeTx, userAccount } = await debitStake(
      tx,
      userId,
      bet.id,
      stake,
      `keno ${sorted.length} picks`,
    );
    let balance = stakeTx.balancesAfter.get(userAccount) ?? 0n;
    let payoutTxId: bigint | null = null;

    if (payout > 0n) {
      const { posted } = await creditPayout(tx, userId, bet.id, payout, 'keno');
      payoutTxId = posted.id;
      balance = posted.balancesAfter.get(userAccount) ?? balance;
    }

    await tx.instantBet.update({
      where: { id: bet.id },
      data: { stakeTxId: stakeTx.id, payoutTxId },
    });

    return {
      betId: bet.id,
      picks: sorted,
      drawn,
      hits,
      multiplierX100,
      payout,
      balance,
      nonce,
    };
  });
}

// ===========================================================================
// Hi-Lo — multi-step, like Mines
// ===========================================================================

interface HiloState {
  /** The card currently face up. */
  current: HiloCard;
  /** Calls made so far, each recorded with the rank it was called against. */
  steps: Array<{ rank: number; call: HiloCall; drawn: HiloCard }>;
  /** Cursor into the derived series — one card per draw. */
  cursor: number;
}

export async function hiloStart(userId: bigint, stake: bigint) {
  assertStake(stake);

  const open = await prisma.instantBet.findFirst({
    where: { userId, gameCode: GAME_CODE_HILO, status: BetStatus.PENDING },
    select: { id: true },
  });
  if (open) throw conflict('GAME_IN_PROGRESS', 'Finish or cash out your current game first');

  const pair = await getActiveSeedPair(userId);

  return prisma.$transaction(async (tx) => {
    const nonce = await claimNonce(tx, pair.id);
    // Cursor 0 is the opening card; every call consumes the next cursor.
    const current = cardFromValue(deriveInstant(pair.serverSeed, pair.clientSeed, nonce, 0));

    const bet = await tx.instantBet.create({
      data: {
        userId,
        gameCode: GAME_CODE_HILO,
        seedPairId: pair.id,
        nonce,
        stake,
        params: {} as Prisma.InputJsonValue,
        state: { current, steps: [], cursor: 0 } as unknown as Prisma.InputJsonValue,
        multiplierX100: 100,
        status: BetStatus.PENDING,
      },
    });

    const { posted, userAccount } = await debitStake(tx, userId, bet.id, stake, 'hilo');
    await tx.instantBet.update({ where: { id: bet.id }, data: { stakeTxId: posted.id } });

    return {
      betId: bet.id,
      current,
      steps: [] as HiloState['steps'],
      multiplierX100: 100,
      balance: posted.balancesAfter.get(userAccount) ?? 0n,
      nonce,
    };
  });
}

export async function hiloCall(userId: bigint, call: HiloCall) {
  if (call !== 'higher' && call !== 'lower') {
    throw badRequest('BAD_CALL', 'Call must be higher or lower');
  }

  return prisma.$transaction(async (tx) => {
    const open = await tx.instantBet.findFirst({
      where: { userId, gameCode: GAME_CODE_HILO, status: BetStatus.PENDING },
      orderBy: { id: 'desc' },
    });
    if (!open) throw notFound('No game in progress');

    // Lock so two rapid taps cannot both consume a card.
    await tx.$queryRawUnsafe('SELECT id FROM instant_bets WHERE id = ? FOR UPDATE', open.id);

    const state = open.state as unknown as HiloState;
    const shown = state.current;

    if (isTrivialCall(shown.rank, call)) {
      throw badRequest('TRIVIAL_CALL', 'That call cannot lose, so it is not offered');
    }

    const pair = await tx.seedPair.findUniqueOrThrow({ where: { id: open.seedPairId } });
    const cursor = state.cursor + 1;
    const drawn = cardFromValue(
      deriveInstant(pair.serverSeed, pair.clientSeed, open.nonce, cursor),
    );

    const survived = hiloWins(shown, drawn, call);
    const steps = [...state.steps, { rank: shown.rank, call, drawn }];

    if (!survived) {
      await tx.instantBet.update({
        where: { id: open.id },
        data: {
          status: BetStatus.LOST,
          payout: 0n,
          multiplierX100: 0,
          state: { current: drawn, steps, cursor } as unknown as Prisma.InputJsonValue,
          settledAt: new Date(),
        },
      });
      return {
        betId: open.id,
        drawn,
        survived: false,
        steps,
        multiplierX100: 0,
        status: 'LOST' as const,
        payout: 0n,
        balance: null as bigint | null,
      };
    }

    const priced = steps.map((s) => ({ rank: s.rank, call: s.call }));
    const multiplierX100 = hiloMultiplierX100(priced);

    await tx.instantBet.update({
      where: { id: open.id },
      data: {
        multiplierX100,
        state: { current: drawn, steps, cursor } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      betId: open.id,
      drawn,
      survived: true,
      steps,
      multiplierX100,
      status: 'PENDING' as const,
      payout: 0n,
      balance: null as bigint | null,
    };
  });
}

export async function hiloCashout(userId: bigint) {
  return prisma.$transaction(async (tx) => {
    const open = await tx.instantBet.findFirst({
      where: { userId, gameCode: GAME_CODE_HILO, status: BetStatus.PENDING },
      orderBy: { id: 'desc' },
    });
    if (!open) throw notFound('No game in progress');

    await tx.$queryRawUnsafe('SELECT id FROM instant_bets WHERE id = ? FOR UPDATE', open.id);

    const state = open.state as unknown as HiloState;
    if (state.steps.length === 0) {
      throw conflict('NOTHING_CALLED', 'Make at least one call before cashing out');
    }

    const priced = state.steps.map((s) => ({ rank: s.rank, call: s.call }));
    const payout = hiloPayout(open.stake, priced);
    const multiplierX100 = hiloMultiplierX100(priced);

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
      `hilo cashout ${multiplierX100 / 100}x`,
    );
    await tx.instantBet.update({ where: { id: open.id }, data: { payoutTxId: posted.id } });

    return {
      betId: open.id,
      multiplierX100,
      payout,
      steps: state.steps,
      balance: posted.balancesAfter.get(userAccount) ?? 0n,
    };
  });
}

// ===========================================================================
// Dragon Tiger — single shot
// ===========================================================================

export async function playDragonTiger(userId: bigint, stake: bigint, side: string) {
  assertStake(stake);
  if (!isValidDTSide(side)) throw badRequest('BAD_SIDE', 'Side must be dragon, tiger or tie');

  const pair = await getActiveSeedPair(userId);

  return prisma.$transaction(async (tx) => {
    const nonce = await claimNonce(tx, pair.id);
    const draw = dtDraw(
      deriveInstantSeries(pair.serverSeed, pair.clientSeed, nonce, DT_DRAW_VALUES),
    );
    const winner = dtWinner(draw);

    const won = winner === side;
    const payout = dtPayout(stake, side, winner);
    const multiplierX100 = won ? dtMultiplierX100(side) : 0;

    const bet = await tx.instantBet.create({
      data: {
        userId,
        gameCode: GAME_CODE_DRAGON_TIGER,
        seedPairId: pair.id,
        nonce,
        stake,
        params: { side } as Prisma.InputJsonValue,
        resultData: { ...draw, winner } as unknown as Prisma.InputJsonValue,
        multiplierX100,
        status: won ? BetStatus.WON : BetStatus.LOST,
        payout,
        settledAt: new Date(),
      },
    });

    const { posted: stakeTx, userAccount } = await debitStake(
      tx,
      userId,
      bet.id,
      stake,
      `dragon tiger ${side}`,
    );
    let balance = stakeTx.balancesAfter.get(userAccount) ?? 0n;
    let payoutTxId: bigint | null = null;

    if (payout > 0n) {
      const { posted } = await creditPayout(tx, userId, bet.id, payout, 'dragon tiger');
      payoutTxId = posted.id;
      balance = posted.balancesAfter.get(userAccount) ?? balance;
    }

    await tx.instantBet.update({
      where: { id: bet.id },
      data: { stakeTxId: stakeTx.id, payoutTxId },
    });

    return {
      betId: bet.id,
      side,
      dragon: draw.dragon,
      tiger: draw.tiger,
      winner,
      won,
      multiplierX100,
      payout,
      balance,
      nonce,
    };
  });
}

/** Odds board for the UI — quoted from the same table that pays. */
export function dragonTigerOdds() {
  return {
    dragon: dtMultiplierX100('dragon'),
    tiger: dtMultiplierX100('tiger'),
    tie: dtMultiplierX100('tie'),
  };
}

// ===========================================================================
// Andar Bahar — two steps: the joker is turned, then the side is chosen.
//
// The stake is taken when the joker is dealt, so the player is committed to
// the hand before seeing which pile goes first. The whole deck is derived from
// one nonce, so the joker shown at start and the deal revealed at pick come
// from the same committed shuffle and cannot disagree.
// ===========================================================================

interface ABState {
  joker: ABCard;
  firstSide: ABSide;
}

export async function abStart(userId: bigint, stake: bigint) {
  assertStake(stake);

  const open = await prisma.instantBet.findFirst({
    where: { userId, gameCode: GAME_CODE_ANDAR_BAHAR, status: BetStatus.PENDING },
    select: { id: true },
  });
  if (open) throw conflict('GAME_IN_PROGRESS', 'Finish your current hand first');

  const pair = await getActiveSeedPair(userId);

  return prisma.$transaction(async (tx) => {
    const nonce = await claimNonce(tx, pair.id);
    const deck = abShuffle(
      deriveInstantSeries(pair.serverSeed, pair.clientSeed, nonce, AB_SHUFFLE_VALUES),
    );
    const joker = abCardFromIndex(deck[0]);
    const firstSide = firstSideFor(joker);

    const bet = await tx.instantBet.create({
      data: {
        userId,
        gameCode: GAME_CODE_ANDAR_BAHAR,
        seedPairId: pair.id,
        nonce,
        stake,
        params: {} as Prisma.InputJsonValue,
        state: { joker, firstSide } as unknown as Prisma.InputJsonValue,
        multiplierX100: 0,
        status: BetStatus.PENDING,
      },
    });

    const { posted, userAccount } = await debitStake(tx, userId, bet.id, stake, 'andar bahar');
    await tx.instantBet.update({ where: { id: bet.id }, data: { stakeTxId: posted.id } });

    return {
      betId: bet.id,
      joker,
      firstSide,
      // Both sides quoted up front so the choice is made on visible odds.
      odds: {
        andar: abMultiplierX100('andar', firstSide),
        bahar: abMultiplierX100('bahar', firstSide),
      },
      balance: posted.balancesAfter.get(userAccount) ?? 0n,
      nonce,
    };
  });
}

export async function abPick(userId: bigint, side: ABSide) {
  if (side !== 'andar' && side !== 'bahar') {
    throw badRequest('BAD_SIDE', 'Side must be andar or bahar');
  }

  return prisma.$transaction(async (tx) => {
    const open = await tx.instantBet.findFirst({
      where: { userId, gameCode: GAME_CODE_ANDAR_BAHAR, status: BetStatus.PENDING },
      orderBy: { id: 'desc' },
    });
    if (!open) throw notFound('No hand in progress');

    // Lock so two rapid taps cannot both settle the hand.
    await tx.$queryRawUnsafe('SELECT id FROM instant_bets WHERE id = ? FOR UPDATE', open.id);

    const pair = await tx.seedPair.findUniqueOrThrow({ where: { id: open.seedPairId } });
    const deck = abShuffle(
      deriveInstantSeries(pair.serverSeed, pair.clientSeed, open.nonce, AB_SHUFFLE_VALUES),
    );
    const hand = abDeal(deck);

    const won = hand.winner === side;
    const payout = abPayout(open.stake, side, hand.firstSide, hand.winner);
    const multiplierX100 = won ? abMultiplierX100(side, hand.firstSide) : 0;

    const claimed = await tx.instantBet.updateMany({
      where: { id: open.id, status: BetStatus.PENDING },
      data: {
        status: won ? BetStatus.WON : BetStatus.LOST,
        payout,
        multiplierX100,
        params: { side } as Prisma.InputJsonValue,
        resultData: hand as unknown as Prisma.InputJsonValue,
        settledAt: new Date(),
      },
    });
    if (claimed.count === 0) throw conflict('ALREADY_SETTLED', 'This hand is already finished');

    let balance: bigint | null = null;
    if (won && payout > 0n) {
      const { posted, userAccount } = await creditPayout(
        tx,
        userId,
        open.id,
        payout,
        `andar bahar ${side}`,
      );
      await tx.instantBet.update({ where: { id: open.id }, data: { payoutTxId: posted.id } });
      balance = posted.balancesAfter.get(userAccount) ?? null;
    }

    return { betId: open.id, side, hand, won, multiplierX100, payout, balance };
  });
}

/** The caller's in-progress hand, if any — restores UI state on reload. */
export async function abCurrent(userId: bigint) {
  const open = await prisma.instantBet.findFirst({
    where: { userId, gameCode: GAME_CODE_ANDAR_BAHAR, status: BetStatus.PENDING },
    orderBy: { id: 'desc' },
  });
  if (!open) return null;

  const state = open.state as unknown as ABState;
  return {
    betId: open.id,
    stake: open.stake,
    joker: state.joker,
    firstSide: state.firstSide,
    odds: {
      andar: abMultiplierX100('andar', state.firstSide),
      bahar: abMultiplierX100('bahar', state.firstSide),
    },
  };
}

/** The caller's in-progress Hi-Lo game, if any. */
export async function hiloCurrent(userId: bigint) {
  const open = await prisma.instantBet.findFirst({
    where: { userId, gameCode: GAME_CODE_HILO, status: BetStatus.PENDING },
    orderBy: { id: 'desc' },
  });
  if (!open) return null;

  const state = open.state as unknown as HiloState;
  return {
    betId: open.id,
    stake: open.stake,
    current: state.current,
    steps: state.steps,
    multiplierX100: open.multiplierX100,
  };
}

// ===========================================================================
// Chicken Road (Tower) — step by step
// ===========================================================================

export type ChickenState = {
  minesCount: number;
  row: number;
  path: number[]; // the lanes chosen so far
};

export async function startChicken(userId: bigint, stake: bigint, minesCount: number) {
  assertStake(stake);
  if (!isValidTowerMineCount(minesCount)) {
    throw badRequest('BAD_MINES', 'Mines count must be between 1 and 4');
  }

  const open = await prisma.instantBet.findFirst({
    where: { userId, gameCode: GAME_CODE_CHICKEN, status: BetStatus.PENDING },
    select: { id: true },
  });
  if (open) throw conflict('GAME_IN_PROGRESS', 'Finish your current game first');

  const pair = await getActiveSeedPair(userId);

  return prisma.$transaction(async (tx) => {
    const nonce = await claimNonce(tx, pair.id);

    const bet = await tx.instantBet.create({
      data: {
        userId,
        gameCode: GAME_CODE_CHICKEN,
        seedPairId: pair.id,
        nonce,
        stake,
        params: { mines: minesCount } as Prisma.InputJsonValue,
        state: { minesCount, row: 0, path: [] } as unknown as Prisma.InputJsonValue,
        multiplierX100: 0,
        status: BetStatus.PENDING,
      },
    });

    const { posted, userAccount } = await debitStake(tx, userId, bet.id, stake, `chicken road ${minesCount}m`);
    await tx.instantBet.update({ where: { id: bet.id }, data: { stakeTxId: posted.id } });

    return {
      betId: bet.id,
      state: bet.state as unknown as ChickenState,
      balance: posted.balancesAfter.get(userAccount) ?? 0n,
      nonce,
    };
  });
}

export async function stepChicken(userId: bigint, lane: number) {
  if (!Number.isInteger(lane) || lane < 0 || lane > 4) {
    throw badRequest('BAD_LANE', 'Lane must be between 0 and 4');
  }

  return prisma.$transaction(async (tx) => {
    const open = await tx.instantBet.findFirst({
      where: { userId, gameCode: GAME_CODE_CHICKEN, status: BetStatus.PENDING },
      orderBy: { id: 'desc' },
    });
    if (!open) throw notFound('No game in progress');

    await tx.$queryRawUnsafe('SELECT id FROM instant_bets WHERE id = ? FOR UPDATE', open.id);

    const pair = await tx.seedPair.findUniqueOrThrow({ where: { id: open.seedPairId } });
    const state = open.state as unknown as ChickenState;
    
    // Generate mines for the current row
    // We need 4 random values to shuffle the row. We'll use deriveInstantSeries.
    // The series index will offset by state.row * 4.
    const rowValues = deriveInstantSeries(pair.serverSeed, pair.clientSeed, open.nonce, 4, state.row * 4);
    const rowMines = towerRowMinesFromValues(rowValues, state.minesCount);
    
    const hitMine = rowMines.includes(lane);
    
    let won = false;
    let finished = false;
    let payout = 0n;
    let multiplierX100 = 0;
    
    if (hitMine) {
      finished = true;
      won = false;
    } else {
      state.row += 1;
      state.path.push(lane);
      multiplierX100 = towerMultiplierX100(state.minesCount, state.row);
      
      if (state.row === TOWER_ROWS) {
        finished = true;
        won = true;
        payout = towerPayout(open.stake, state.minesCount, state.row);
      }
    }

    const nextState = hitMine ? open.state : (state as unknown as Prisma.InputJsonValue);
    
    const data: Prisma.InstantBetUpdateInput = {
      state: nextState,
      multiplierX100,
    };

    if (finished) {
      data.status = won ? BetStatus.WON : BetStatus.LOST;
      data.payout = payout;
      data.settledAt = new Date();
      data.resultData = { finalRow: state.row, path: state.path, bombHit: hitMine ? lane : null, rowMines } as Prisma.InputJsonValue;
    }

    const claimed = await tx.instantBet.updateMany({
      where: { id: open.id, status: BetStatus.PENDING },
      data,
    });
    if (claimed.count === 0) throw conflict('ALREADY_SETTLED', 'This game is already finished');

    let balance: bigint | null = null;
    if (finished && payout > 0n) {
      const { posted, userAccount } = await creditPayout(tx, userId, open.id, payout, 'chicken road win');
      await tx.instantBet.update({ where: { id: open.id }, data: { payoutTxId: posted.id } });
      balance = posted.balancesAfter.get(userAccount) ?? null;
    }

    return { 
      betId: open.id, 
      hitMine, 
      rowMines, // reveal where the mines were on this row
      state: state as ChickenState, 
      finished, 
      won, 
      multiplierX100, 
      payout, 
      balance 
    };
  });
}

export async function cashoutChicken(userId: bigint) {
  return prisma.$transaction(async (tx) => {
    const open = await tx.instantBet.findFirst({
      where: { userId, gameCode: GAME_CODE_CHICKEN, status: BetStatus.PENDING },
      orderBy: { id: 'desc' },
    });
    if (!open) throw notFound('No game in progress');

    await tx.$queryRawUnsafe('SELECT id FROM instant_bets WHERE id = ? FOR UPDATE', open.id);

    const state = open.state as unknown as ChickenState;
    if (state.row === 0) {
      throw badRequest('CANNOT_CASHOUT', 'Must clear at least one row');
    }

    const payout = towerPayout(open.stake, state.minesCount, state.row);
    const multiplierX100 = towerMultiplierX100(state.minesCount, state.row);

    const claimed = await tx.instantBet.updateMany({
      where: { id: open.id, status: BetStatus.PENDING },
      data: {
        status: BetStatus.WON,
        payout,
        multiplierX100,
        settledAt: new Date(),
        resultData: { finalRow: state.row, path: state.path, cashedOut: true } as Prisma.InputJsonValue,
      },
    });
    if (claimed.count === 0) throw conflict('ALREADY_SETTLED', 'This game is already finished');

    const { posted, userAccount } = await creditPayout(tx, userId, open.id, payout, 'chicken road cashout');
    await tx.instantBet.update({ where: { id: open.id }, data: { payoutTxId: posted.id } });

    return { betId: open.id, state, multiplierX100, payout, balance: posted.balancesAfter.get(userAccount) ?? 0n };
  });
}

export async function chickenCurrent(userId: bigint) {
  const open = await prisma.instantBet.findFirst({
    where: { userId, gameCode: GAME_CODE_CHICKEN, status: BetStatus.PENDING },
    orderBy: { id: 'desc' },
  });
  if (!open) return null;

  return {
    betId: open.id,
    stake: open.stake,
    state: open.state as unknown as ChickenState,
    multiplierX100: open.multiplierX100,
  };
}
