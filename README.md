# Lottery Platform

A period-lottery gaming platform (WinGo / colour prediction) built on Node + TypeScript
and Vue 3. This is milestone 1: the money layer and one complete, live, provably-fair
game.

> **Status:** development build. Test balance only — no payment provider is connected.
> 18+. Real-money operation requires a gaming licence in a jurisdiction that permits it;
> India's Online Gaming Act 2025 bans real-money online gaming nationally.

## Stack

| Layer     | Choice                                            |
| --------- | ------------------------------------------------- |
| API       | Node 24, TypeScript, Express, Prisma, socket.io v4 |
| Database  | MySQL 8 (`lottery_platform`)                       |
| Web       | Vue 3, Vite, Pinia, vue-router, socket.io-client   |
| Shared    | `packages/shared` — game rules used by BOTH sides  |

The rules module is deliberately shared: the odds the bet panel advertises and the
payout the server settles with are literally the same function.

## Running it

MySQL must be up (XAMPP is fine). First time only:

```bash
npm install
```

```bash
npm run db:push
```

Then start both processes:

```bash
npm run dev
```

- API → http://localhost:4000
- Web → http://localhost:5173

The web dev server proxies `/api` and `/socket.io` to the API, so there is no CORS
setup to do locally.

## Verifying it works

Unit tests — payout maths against every digit, RTP, the draw, period windows:

```bash
npm test
```

End-to-end against a running server — for every registered game it registers a player,
bets every type on a live period, waits for the real scheduler to draw it, then checks
payouts, the fairness commitment and ledger conservation:

```bash
npx tsx apps/api/scripts/smoke.ts
```

Or one specific room:

```bash
npx tsx apps/api/scripts/smoke.ts K3_1M
```

Crash has its own end-to-end test — it plays real rounds against the live loop and
checks manual cash-out, auto cash-out firing at its exact target, riding past the
bust, betting after take-off being refused, and the seed commitment:

```bash
npx tsx apps/api/scripts/smoke-crash.ts
```

The instant games have their own too — it plays Dice, Limbo and Mines, then rotates the
seed pair and **re-derives every outcome independently** from the revealed seed to prove
they were never altered:

```bash
npx tsx apps/api/scripts/smoke-instant.ts
```

Plinko / Keno / Hi-Lo and Andar Bahar have their own, both of which re-derive every
recorded outcome from the revealed seed:

```bash
npx tsx apps/api/scripts/smoke-originals.ts
```

```bash
npx tsx apps/api/scripts/smoke-andarbahar.ts
```

```bash
npx tsx apps/api/scripts/smoke-dragontiger.ts
```

## How the money works

Every amount is a `BigInt` of **minor units** (paise). No floats touch money anywhere —
not in the DB, not in JS, not over the wire (amounts cross as strings).

The ledger is **double-entry with signed amounts**. Instead of a debit/credit column
that can be applied backwards, each transaction has legs that must sum to exactly zero:

```
player bets ₹100   ->  user account −10000, house +10000
player wins ₹196   ->  house −19600, user account +19600
```

Three invariants are enforced in `ledger.service.ts` and nowhere else:

1. **Balance** — legs sum to zero, or the transaction throws before writing.
2. **Idempotence** — every transaction carries a caller-supplied key
   (`bet-payout:1234`). Posting it twice returns the first one. This is what makes
   retries and scheduler restarts safe.
3. **No negative player balances** — the last line of defence against two concurrent
   bets racing the same balance.

`GET /api/wallet/integrity` recomputes the global sum of every entry ever written. It
must be `0`. If it is not, money was created or destroyed.

## How the draw works

Provably fair, via a commit–reveal scheme:

1. When a period opens the server generates a random 32-byte seed and publishes **only
   its SHA-256 hash**. Players see this before betting.
2. The result is `HMAC-SHA256(seed, periodNo) % 10` — fully determined the instant the
   seed exists, before any bet is placed.
3. After the draw the seed is revealed. Anyone can re-hash it against the published
   commitment and re-derive the digit.

The operator therefore cannot see the betting book and pick a result — doing so would
produce a seed whose hash does not match what was already published.

Periods are **derived from the wall clock**, not counted. A restart, a missed tick, or a
second API instance all converge on the same period number.

## Games

Adding a game means writing one rules module and adding one line to the registry.
The scheduler, period service, bet placement, settlement, ledger and socket layer are
all game-agnostic.

A rules module is **pure** — no DB, no clock, no network — so it can be exhaustively
tested and the web client imports the exact same module the server settles with. It
declares how many random values its draw needs (`draw`), how to shape them into a
result (`buildResult`), which bets are legal, what they pay, and how to describe a
result for the history table.

### Win Go — 5 rooms (30s / 1 / 3 / 5 / 10 min)

One digit 0-9 per period.

| Bet         | Odds | Wins on    | RTP   |
| ----------- | ---- | ---------- | ----- |
| Number      | 9x   | that digit | 88.2% |
| Green / Red | 2x   | 4 digits   | 93.1% |
| — on 0 or 5 | 1.5x | dual digit |       |
| Violet      | 4.5x | 0 and 5    | 88.2% |
| Big / Small | 2x   | 5 digits   | 98.0% |

### K3 — 4 rooms (1 / 3 / 5 / 10 min)

Three dice, 216 equally likely outcomes. Bet types: total (3-18), big/small,
odd/even, any triple, exact triple, exact double, two-face combination.

Every K3 payout is the **true odds** of the bet (216 / winning outcomes) as an exact
rational, so the only house edge is the 2% rake — a uniform 98% RTP across every bet
type. The test suite enumerates all 216 outcomes and asserts both the winning counts
and the RTP.

Note the rule that is most often got wrong: **big/small and odd/even both lose on any
triple**, not just on 3 and 18. That is what makes them 105/216 rather than 108/216,
and it is asserted directly.

### Crash — continuous rounds

A **different engine shape**. There are no clock-derived periods: rounds run back to
back, each lasting exactly as long as its own crash point dictates.

```
WAITING (7s, bets open) -> RUNNING (multiplier climbing) -> CRASHED (4s hold) -> next
```

The curve is `1.00x * e^(k·t)` with `k = ln(2)/6`, so 2.00x lands at six seconds. The
crash point is fixed when the round is created — before it is visible and before any
bet exists — and only its hash is public until the bust.

**The distribution is exactly fair:** `P(crash >= t) = 100/t` for any target `t`. There
is no hidden instant-bust edge baked into the curve, so the 2% rake is the only house
edge and **every cash-out target has the same 98% RTP** — 1.50x and 50x face identical
odds. The test suite verifies this empirically over 60,000 derived seeds.

Two properties the implementation depends on:

- **The server's clock prices every cash-out.** The cashout endpoint takes no
  multiplier from the client, so there is nothing for a client to lie about. The
  browser computes the climbing number with the same shared function purely so the
  display and the payout cannot diverge.
- **Auto cash-out pays its exact target**, not whatever multiplier the 100ms sweeper
  tick happened to land on — clamped to the live curve so it can never pay above it.

Rounds are driven off the database row rather than in-memory state, so a process
restart resumes the live round; a round stranded mid-flight by a kill is settled on
boot rather than leaving players hanging.

### Dice, Limbo, Mines — instant games

A **third engine shape**: single-player, resolved immediately, no shared round at all.

That changes the fairness scheme. With no round to commit to, each player holds a
**seed pair** — a secret server seed (only its hash is shown), a client seed they
choose, and a nonce that increments on every bet. Outcomes are
`HMAC-SHA256(serverSeed, "clientSeed:nonce:cursor")`.

Rotating the pair reveals the old server seed and issues a new commitment, letting the
player re-derive and check **every** bet made under it. Because the player supplies the
client seed, the operator cannot pick a server seed that is favourable against a known
sequence of bets.

| Game  | Bet                            | Odds                                    |
| ----- | ------------------------------ | --------------------------------------- |
| Dice  | roll over/under a target       | `10000 / winCount`, 1%–99% win chance    |
| Limbo | pick a target multiplier       | pays the target; `P(win) = 100/target`   |
| Mines | reveal tiles, cash out any time | ladder = `C(25,k) / C(25-m,k)`          |

**Payouts use the exact rational, not the displayed multiplier.** This matters more than
it sounds: Mines at 1 mine / 2 reveals is truly `1.0869x`, and paying the rounded
`1.08x` would take an extra 0.64% from the player on top of the rake — a second, hidden
house edge of exactly the kind this design exists to avoid. The displayed multiplier is
rounded *down*, so the player is never paid less than advertised. The test suite
asserts 98% RTP at every rung of every mine count, and at every dice win chance.

Mines is the one instant game that spans requests (start → reveal → reveal → cash out).
Its board is fixed at start but **never disclosed while the game is PENDING** — not
through the reveal endpoint and not through history.

### Plinko, Keno, Hi-Lo — generated paytables

These three also run on the instant engine and the same seed pair, but they share
something more interesting: **their paytables are generated, not hand-written.**

Each supplies integer *weights* describing the shape it wants, plus the exact outcome
counts. `fairTable` then normalises them so expected value is exactly 1x before the
rake:

```
multiplier(i) = weight(i) * total / SUM(count(j) * weight(j))
```

The consequence is worth stating plainly: **any weight profile yields exactly 98% RTP.**
Weights choose how spiky the paytable is; the normalisation keeps the house edge
fixed. That is what lets Plinko offer three risk levels and Keno a different paytable
per pick count without either quietly changing the edge — a risk setting moves
variance and nothing else. The tests assert 98% for every rows/risk pair, every Keno
pick count, and every Hi-Lo call.

All of it is BigInt: `C(40,10)` is ~8.5e8 and the Plinko normaliser for 16 rows exceeds
2^32, so a double would start losing exact integers — and a rounding error in
`combinatorics.ts` would be a payout error in three games at once.

| Game   | Play                                      | Distribution                    |
| ------ | ----------------------------------------- | ------------------------------- |
| Plinko | 8/12/16 rows, low/medium/high risk        | binomial `C(N,k)/2^N`           |
| Keno   | pick 1-10 of 40, ten drawn                | hypergeometric                  |
| Hi-Lo  | higher/lower, compounds, cash out any time | `P(next >= r) = (14-r)/13`     |

Hi-Lo draws with replacement, so each step's odds depend only on the visible card, and
ties pay the caller. A call that *cannot lose* is refused outright — offering it would
only cost the player the rake. The compounded multiplier is kept as one unreduced
fraction so a long run cannot drift.

### Andar Bahar — the honest version of an asymmetric game

A joker is turned face up, then cards are dealt alternately to two piles. The first
pile to receive a card of the joker's **rank** wins. Suits never matter except on the
joker itself: a black joker deals first to Andar, a red one to Bahar.

Going first is a genuine edge. After the joker, 51 cards hold 3 matches, and the side
taking positions 1, 3, 5… wins whenever the earliest match lands on an odd position:

```
P(first side)  = 10725 / 20825  ≈ 51.50%
P(second side) = 10100 / 20825  ≈ 48.50%
```

Both counts are **derived**, not hard-coded — the earliest of 3 marked cards among 51
falls at position `k` with probability `C(51-k, 2) / C(51, 3)`, and the module sums
that series at load. The test suite then checks the result against **20,000 actually
dealt hands**, so the dealer and the theory have to agree.

Each side is paid the exact inverse of its own probability — about **1.94x** for the
side dealt first and **2.06x** for the other — so both carry the identical 98% return.
Taking the longer side buys variance, not value. That is the honest version of a game
usually sold with an extra edge quietly baked into the short side.

The flow is two steps: the stake is taken when the joker is turned, then the side is
chosen with the odds visible. The whole deck comes from one nonce, so the joker shown
at start and the deal revealed at pick provably come from the same committed shuffle.

### Dragon Tiger

One card to Dragon, one to Tiger, from the same 52-card deck. Higher rank wins, Ace
low; equal ranks are a Tie. Suits never break a tie, which is what makes Tie a real
payable outcome.

Two distinct cards from 52 give 2652 ordered outcomes; 13 ranks x 4 x 3 = 156 of them
tie, and the rest split evenly:

```
P(dragon) = P(tiger) = 1248 / 2652 = 8/17  ≈ 47.06%
P(tie)                =  156 / 2652 = 1/17  ≈  5.88%
```

Paid at the exact inverse — **17/8 (2.125x)** on a side, **17x** on the tie — so all
three bets return 98%. The test suite verifies this over the **complete** outcome
space, all 2652 pairs, rather than a sample.

This deliberately drops the usual "a tie returns half your stake" rule. That rule
exists to hide a house edge inside an even-money payout; here a tie simply loses and
the sides pay 2.12x instead of 2x to compensate. Same game, edge stated once rather
than buried in a side rule.

### House edge

A 2% fee comes off the stake before odds apply (`HOUSE_FEE_BPS`). RTP figures are
asserted in the test suite so a change to odds or fee cannot move them silently.

## Layout

```
apps/api          Express + Prisma + socket.io
  prisma/         schema
  scripts/smoke   end-to-end verification
  src/modules/
    auth/         register, login, JWT + rotating refresh tokens
    ledger/       THE money layer — all balance writes go through here
    wallet/       balance, transactions, dev credit
    game/wingo/   periods, provably-fair draw, bets, settlement
  src/realtime/   socket server + the game clock
apps/web          Vue 3 client
packages/shared   game rules, odds, payout maths, period numbering
```

## Roadmap

Built so far — **7 games across all three engine shapes**:

| Engine                 | Games                     |
| ---------------------- | ------------------------- |
| Fixed periods          | Win Go (5 rooms), K3 (4)   |
| Continuous rounds      | Crash                      |
| Instant, per-player    | Dice, Limbo, Mines, Plinko, Keno, Hi-Lo, Andar Bahar, Dragon Tiger |

**In-house games still to build** — these are real development work:

- Lottery: 5D, TRX Win Go (result from a TRON block hash), 4D, XoSo, Bingo, MotoRace
- Originals: Wheel — reuses the instant engine and its seed pair, so it is a small
  build compared with the first few

**Third-party content** — slots, live casino, fishing, sports and rummy are *not*
developed. They are licensed, and reach the lobby through a single seamless-wallet
aggregator integration (catalogue sync, launch URL, and bet/win/rollback callbacks
posting through this ledger). One integration brings the whole category; without a
commercial contract, none of it is available at any amount of engineering effort.

**Platform work:**

- Payment integration (deposit + withdrawal, approval queue, reconciliation)
- Agent / commission engine (the referral tree is already recorded on every user)
- Activity system (wheel, attendance, VIP, gift codes)
- Admin back-office (users, risk, payouts, reporting)
- i18n, KYC, push notifications
