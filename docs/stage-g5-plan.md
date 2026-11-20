# Stage G5 plan: economy between rounds

Status: plan only. Nothing here is implemented. Written 2026-11-20 against baseline HEAD 08d2dfb.
Roadmap entry: `docs/roadmap.md` section "G5 Economy" (depends on G3, G4; unblocks O5 economy band).

## 1. Goal and non-goals

### Goal

Turn the single-round buy stub into a match economy. Between two rounds of a G4 match, one pure
function decides, for every agent on both teams:

1. Round-end credits: win, loss (base, plus a loss-streak bonus only once it is sourced), enemy
   kills, spike plant.
2. A credit cap.
3. Carry-over: unspent credits, unspent bought ability charges, ultimate points, and (for
   survivors) weapon and armor from G3.
4. Signature replenish: the free charges an agent's kit grants each round, per the sheet's
   `signatureRecharge` and `recharge` text, without carrying recharged charges forward.
5. What the next round starts with, shown on the pre-round screen (credits per agent, team total,
   last-round breakdown).

G5 ships this as the implementation of G4's `EconomyStep` hook, in `src/sim/economy/`.

### Non-goals

- No weapon or armor prices, ids or damage. G3 owns `data/weapons.json`, `WeaponDefinition`,
  `ArmorDefinition`, `AgentBody.weaponId`, `AgentBody.armor` and the `loadout` buy lines. G5 only
  decides whether a loadout carries.
- No match flow: halves, side switch, overtime, scoreboard and the match replay format are G4.
  G5 exports the functions G4 calls at those points.
- No spike mechanics. G2 owns `SpikeState`, plant/defuse and the plant/defuse ult points. G5
  only reads "was the spike planted, and by whom".
- No orb ult points (still TODO in `src/sim/combat/ult-points.ts`).
- No buy-phase UI redesign. The existing pre-round HUD buy rows stay; G5 adds a read-only
  economy strip.
- No Valorant numbers from memory. Every credit amount is a named ASSUMED constant whose value
  the owner sets (see section 5). Nothing is tagged verified or secondary by this stage.
- No opponent buy logic (O2 decides what its side buys; G5 only gives it the credits).

## 2. Current state (read for this plan)

| File | What it does today |
| --- | --- |
| `src/sim/economy/buy.ts` | `buyCharge(agent: AgentBody, abilityId, catalog): BuyResult`. Spends `ability.costCredits` for one charge if `charges[id] < maxCharges` and credits suffice. Rejects `charges-full`, `insufficient-credits`, `ability-not-owned`, `invalid-order` (not a bought ability: `maxCharges === null` or `costCredits` null or <= 0). Returns a `structuredClone`; never mutates. This is the only economy code. |
| `src/sim/preround.ts` | `PreRoundPlan { version: 1; side: "attack"; buys: BuyLine[]; agents; loadoutFuture? }`. `validatePlan` replays buys through `buyCharge` on a cloned scenario and soft-reserves charges. `startLiveFromPreRound` applies buys to a clone, then `openLiveRound`. `applyBuysToScenario(scenario, buys, catalog)` returns the post-buy scenario clone. Only `scenario.attack.members` are bought for (G6 adds defense). `memberAsBody` converts `AgentInstance` to `AgentBody`. |
| `src/rules/ruleset.ts` | `Ruleset.startingCredits = 800` with `STARTING_CREDITS_PROVENANCE` kind `assumed`, note "Drill agents start with 800 credits for buyCharge stubs. Not a live buy phase." No other economy fields. `buyPhaseMs` 30000 assumed. |
| `src/sim/agents/state.ts` | `AgentInstance` has `credits`, `charges`, `cooldownReadyAtMs`, `ultimatePoints`, `statuses`, `hp`. `createInstance` fills every charge pool to `maxCharges` (`FULL_CHARGES_PROVENANCE`, assumed, "not a buy phase") and defaults credits to `STANDARD_RULESET.startingCredits`. |
| `src/sim/agents/definition.ts` | `AbilityDefinition` has `slot: "basic" \| "signature" \| "ultimate"`, `maxCharges`, `costCredits`, `signatureCooldownMs?`, `ultPointCost?`, `referenceStats?`, `figures: Provenance`. No field says how many charges are free per round. |
| `src/sim/agents/abilities/sky-smoke.ts` | Signature, `SKY_SMOKE_CHARGES = 3`, `SKY_SMOKE_COST_CREDITS = 100` (secondary, wiki). No cooldown. |
| `src/sim/agents/abilities/breach.ts` | Fault Line: signature, `maxCharges: 1`, `costCredits: 0`, `signatureCooldownMs: 50000`. Aftershock (200, max 1) and Flashpoint (250, max 2) are bought basics. |
| `src/sim/agents/abilities/breach-resolve.ts` | On cast, if `signatureCooldownMs != null` and cooldown elapsed, refills the pool to `maxCharges`, spends one, sets `cooldownReadyAtMs[id] = timeMs + signatureCooldownMs`. This mid-round recharge is the "recharged charge" the sheet says must not carry. |
| `src/sim/agents/abilities/brimstone.ts` | Incendiary (200, max 1) and Stim Beacon (250, max 1) are bought basics; Sky Smoke is the signature; Orbital Strike ultimate. |
| `src/sim/combat/ult-points.ts` | `grantKillUltPoints(killer, victim)` +1 each; `spendUltPoints`. Called from `src/sim/run.ts` (shots) and `breach-resolve.ts` (Aftershock). TODO for orb/plant/defuse. |
| `src/sim/run.ts` | `AgentBody` (has `credits`, `charges`, `cooldownReadyAtMs`, `ultimatePoints`, `alive`). `RoundResult = attack-eliminated \| defense-eliminated \| timeout(winner defense)`. `SimEvent` has no explicit kill event; kills are visible as `shot` / `ability-damage` / `zone-damage` entries whose `targetHpAfter` is 0, with `agentId` = shooter or caster. `cast-accepted` carries `abilityId` and `chargesRemaining`. |
| `src/sim/live-round.ts` | `LiveRound` keeps `scenario` (post-buy start state), `world` (final truth after the round), `events` (append-only), `result`. |
| `src/ui/orders/AttackerHud.tsx` | In `mode="pre-round"` the card header shows `${agent.credits}c` instead of ult points; buy rows call `buyCharge` as a probe for enable/title and `onBuyAbility` / `onRefundAbility`. Line "Weapons / armor (roadmap)". No team total, no breakdown. |
| `src/ui/App.tsx` | Pre-round topbar: phase badge, buy timer "(assumed)", Hold timer, Go. `onPreRoundBuy` uses `buyCharge` on `postBuyScenario`. |
| `src/ui/preround/planState.ts` | `instanceToBody(member)` (duplicate of `memberAsBody`), `buildPreRoundPlan`. |
| `src/ui/live/replayFile.ts` | `ReplayFile` v2: `scenario` (post-buy), `seed`, `orderLog`, `simTimeMs`, optional audit `preRoundPlan`. Single round only. |
| `agent-reference.json` | `globals.signatureChargeCarry`: "recharged charges never carry into the next round; unused bought charges do" (sheet). Per agent `signatureRecharge`, per ability `recharge`. Brimstone Sky Smoke: signatureRecharge "1 free, +100 each, max 3", ability recharge "1 free plus bought extras". Breach Fault Line: costCredits 0, maxCharges 1, recharge "50s". Bought basics: recharge "bought". No credit amounts for wins, losses, kills, plants or a cap anywhere in the repo. |

Consequence: there is no sourced number for any round-end reward. Every amount in this stage is
ASSUMED until the owner provides or sources it.

## 3. Design

### 3.1 Module layout

All new code lives in `src/sim/economy/` (sim layer; must not import `src/tactics`).

- `src/sim/economy/rules.ts` (new): `EconomyRules` type, the named constants, provenance,
  `ASSUMED_ECONOMY_RULES`. Kept out of `src/rules/ruleset.ts` so G5 does not collide with G4,
  which is also likely to add fields to `Ruleset`. `startingCredits` stays on `Ruleset`.
- `src/sim/economy/kills.ts` (new): pure kill attribution from `SimEvent[]`.
- `src/sim/economy/carry.ts` (new): charges, ult points and loadout carry; signature replenish.
- `src/sim/economy/round-end.ts` (new): `computeEconomy` (the pure core) and `economyStep`
  (the `EconomyStep` adapter for G4), `G5_ECONOMY`, plus `initialEconomy` and `resetEconomyForPhase` (the phase reset is called inside the adapter when `next.startsHalf` is true).
- `src/sim/economy/buy.ts` (modify, small): export a helper `isBoughtAbility(ability)` so the
  bought-vs-free rule is written once and shared with `carry.ts` and the HUD.

### 3.2 Rules and constants

```ts
// src/sim/economy/rules.ts (new)
import type { Provenance } from "../../rules/provenance.ts";

export type LossStreakRule =
  | { kind: "none" }                                   // default until sourced
  | { kind: "ladder"; bonusByStreak: readonly number[] }; // index 0 = 1st consecutive loss

export type PlantCreditRecipient = "attacking-team" | "planter";

export type EconomyRules = {
  id: string;                    // e.g. "assumed-economy-v1"; stored in match files
  winRoundCredits: number;       // WIN_ROUND_CREDITS
  lossRoundCredits: number;      // LOSS_ROUND_CREDITS (base, before streak)
  lossStreak: LossStreakRule;    // LOSS_STREAK_RULE
  killCredits: number;           // KILL_CREDITS, per enemy kill
  plantCredits: number;          // PLANT_CREDITS
  plantCreditRecipient: PlantCreditRecipient; // PLANT_CREDIT_RECIPIENT
  creditCap: number;             // CREDIT_CAP
  survivorKeepsLoadout: boolean; // SURVIVOR_KEEPS_LOADOUT
  deadKeepsBoughtCharges: boolean; // DEAD_KEEPS_BOUGHT_CHARGES
  freeChargeSpendOrder: "free-first" | "bought-first"; // FREE_CHARGE_SPEND_ORDER
  provenance: Record<Exclude<keyof EconomyRules, "id" | "provenance">, Provenance>;
};

export const WIN_ROUND_CREDITS: number;       // value: owner to set, kind "assumed"
export const LOSS_ROUND_CREDITS: number;      // value: owner to set, kind "assumed"
export const LOSS_STREAK_RULE: LossStreakRule = { kind: "none" }; // assumed: off until sourced
export const KILL_CREDITS: number;            // value: owner to set, kind "assumed"
export const PLANT_CREDITS: number;           // value: owner to set, kind "assumed"
export const PLANT_CREDIT_RECIPIENT: PlantCreditRecipient = "attacking-team"; // assumed
export const CREDIT_CAP: number;              // value: owner to set, kind "assumed"
export const SURVIVOR_KEEPS_LOADOUT = true;   // assumed
export const DEAD_KEEPS_BOUGHT_CHARGES: boolean; // owner to set, kind "assumed" (open question 3)
export const FREE_CHARGE_SPEND_ORDER = "free-first"; // design

export const ASSUMED_ECONOMY_RULES: EconomyRules;
```

The numeric values are deliberately not written in this plan. Sub-stage G5.1 cannot merge
`ASSUMED_ECONOMY_RULES` until the owner fills them (tag `assumed`, or `owner` if the owner
specifies them as project values, as was done for `roundDurationMs`). Tests never depend on the
shipped values: they pass a test-local `EconomyRules` fixture whose numbers are labelled in the
test file as fixture values, not game values.

Provenance notes follow the existing ruleset style, for example:
`{ kind: "assumed", source: "stage-g5", note: "Lab placeholder for credits per round win. Not a Valorant figure." }`.

### 3.3 Interface with G4 (agreed: G4's signature wins)

G4 owns the hook and its types in `src/sim/match.ts` (see `docs/stage-g4-plan.md` section 3.3): `EconomyStep = (input: EconomyStepInput) => EconomyStepResult`, wrapped as `EconomyModel = { id; step }`, with `NO_ECONOMY` as the default. G5 implements it. G5 does not modify `src/sim/match.ts`; it exports a model and the match setup passes it in.

```ts
// src/sim/economy/round-end.ts (G5). Types imported from G4's src/sim/match.ts.
import type { EconomyModel, EconomyStep, EconomyStepInput, TeamId } from "../match.ts";

/** G5's own pure input, derived from G4's EconomyStepInput. Unit tests build it directly. */
export type EconomyInput = {
  result: RoundResult;                       // input.history.at(-1).result (incl. G2 spike results)
  winnerTeam: TeamId;                        // input.history.at(-1).winnerTeam
  teamOf: Readonly<Record<string, TeamId>>;  // input.teamOf
  endedEvents: readonly SimEvent[];          // input.endedEvents (kills, plant)
  endedAgents: readonly AgentBody[];         // input.endedAgents (unspent credits and charges)
  lossStreakBefore: Readonly<Record<TeamId, number>>; // derived from input.history winnerTeam
  startsHalf: boolean;                       // input.next.startsHalf -> reset instead of carry
};

/** Pure core. No MatchState needed, so G5.1 and G5.2 land and test before G4 merges. */
export function computeEconomy(input: EconomyInput, catalog: Catalog, rules: EconomyRules): EconomyDelta;

/** Adapter: EconomyStepInput -> EconomyInput -> EconomyDelta -> EconomyStepResult. */
export const economyStep: EconomyStep;

/** What the match setup passes to openMatch. The id is stored in the match replay header. */
export const G5_ECONOMY: EconomyModel = { id: "g5-v1", step: economyStep };
```

The adapter returns `{ members, ledger }`:

- `members`: `input.members` (G4 defaults already applied) with only `credits` and `charges` changed, which is exactly what G4's `economy-invalid` contract allows. When `startsHalf` is true it applies the phase reset (starting credits, free charges only) instead of carry-over; G4 never calls a separate reset.
- `ledger`: one `EconomyLedgerLine` per `CreditLine`, in the fixed order below, with `reason` set to the line kind (`"win"`, `"loss"`, `"kill"`, `"plant"`, `"cap"`). G4 stores the ledger in `RoundRecord.ledger`; G5 adds no match-file fields.
- Ult points are not G5's: G4 carries them in `members`, and G5 leaves them untouched.
- Weapon and armor carry (G5.3) needs G4's contract widened to also allow `weaponId` and `armor` to change. That is a one-line change to G4's validation, made in G5.3 after G3 lands, and listed in G5's files touched.

G5-owned types (internal audit and test shapes, in `src/sim/economy/round-end.ts`):

```ts
export type CreditLine =
  | { kind: "win"; amount: number }
  | { kind: "loss"; amount: number; streak: number }
  | { kind: "kill"; amount: number; victimId: string }
  | { kind: "plant"; amount: number }
  | { kind: "cap"; amount: number };   // negative: credits removed by the cap

export type AgentEconomyChange = {
  instanceId: string;
  creditsBefore: number;   // credits left in endedAgents (unspent)
  creditsAfter: number;    // clamp(creditsBefore + sum(lines), 0, creditCap)
  lines: CreditLine[];     // in the fixed order: win|loss, kill..., plant, cap
  chargesAfter: Record<string, number>;
  keepsLoadout: boolean;   // G5.3: G3 weapon + armor carry; false -> G3 default loadout
};

export type EconomyDelta = {
  version: 1;
  rulesId: string;
  agents: AgentEconomyChange[];   // team A members then team B members, roster order
};
```

### 3.4 Winner and credit rules

```ts
function winnerOf(result: RoundResult): Side   // in round-end.ts unless G4 exports one
// attack-eliminated -> defense; defense-eliminated -> attack; timeout -> defense (result.winner);
// G2: spike-detonated -> attack; spike-defused -> defense.
```

If G4 exports a winner helper, G5 uses it and drops its own (the switch must stay exhaustive so
G2's new variants fail to compile until handled).

Per agent, in this fixed order:

1. Win/loss: every member of the winning team gets `winRoundCredits`; every member of the
   losing team gets `lossRoundCredits + streakBonus(streakAfterThisLoss)`. With
   `lossStreak.kind === "none"` the bonus is 0. With a ladder, the index is clamped to the last
   entry. A win resets that team's streak to 0. Dead and alive agents are paid the same (design,
   open question 5 covers timeout survivors).
2. Kills: `killCredits` per enemy kill attributed by `creditedKills` (3.5). Ally kills and
   self-kills pay nothing (design).
3. Plant: if `finalWorld.spike` (G2 `SpikeState`) records a plant this round, pay
   `plantCredits` to the attacking team or to the planter per `plantCreditRecipient`. Before G2
   lands this line is never produced (no `world.spike`).
4. Cap: `creditsAfter = min(creditCap, creditsBefore + sum)`; if that removes credits, add a
   `cap` line with the negative difference so the UI breakdown always sums exactly.

All arithmetic is integer credits. No rounding is needed because every input is an integer.

### 3.5 Kill attribution

```ts
// src/sim/economy/kills.ts (new)
export type CreditedKill = { killerId: string; victimId: string; timeMs: number; sequence: number };

/** First event that takes a victim from alive to 0 hp. Pure, ordered by (timeMs, sequence). */
export function creditedKills(
  events: readonly SimEvent[],
  sideOf: (instanceId: string) => Side | null,
): CreditedKill[];
```

Sources: `shot` with `hit && targetHpAfter === 0`; `ability-damage.hits[]` and
`zone-damage.hits[]` entries with `targetHpAfter === 0`; killer is the event `agentId`. Each
victim counts once (the first such event); later 0-hp entries for the same victim are ignored.
A kill only pays when `sideOf(killer) !== sideOf(victim)`.

This mirrors where `grantKillUltPoints` is called today (shots, Aftershock). If X1/G2/G3 add a
dedicated kill event later, `creditedKills` switches to it; open question 6 proposes asking G3
for an explicit `agent-killed` event instead.

### 3.6 Charge carry and signature replenish

New optional fields on `AbilityDefinition` (modify `src/sim/agents/definition.ts`):

```ts
/** Charges granted free at the start of every round. Omitted means 0. */
freeChargesPerRound?: number;
freeChargesProvenance?: Provenance;
```

Kit values, all read from the sheet text, never from memory:

| Ability | Sheet text | freeChargesPerRound | Tag |
| --- | --- | --- | --- |
| Sky Smoke (`sky-smoke`) | signatureRecharge "1 free, +100 each, max 3"; recharge "1 free plus bought extras" | 1 | sheet |
| Fault Line (`fault-line`) | costCredits 0, maxCharges 1, recharge "50s" | 1 (= maxCharges, because nothing can be bought) | sheet + design |
| Aftershock, Flashpoint, Incendiary, Stim Beacon | recharge "bought" | omitted (0) | sheet |

`agent-reference.json` is not edited. A drift test asserts the shipped values above against the
sheet strings (see G5.2).

Carry rule per agent per ability with `maxCharges !== null` (from the sheet's
`signatureChargeCarry`: recharged charges never carry, unused bought charges do):

```ts
// src/sim/economy/carry.ts (new)
export function carryCharges(input: {
  definition: AgentDefinition;
  start: Readonly<Record<string, number>>;   // startScenario member charges (post-buy)
  end: Readonly<Record<string, number>>;     // finalWorld agent charges
  castsAccepted: Readonly<Record<string, number>>; // count of cast-accepted per abilityId
  alive: boolean;
  rules: EconomyRules;
}): Record<string, number>;
```

For each ability with `F = freeChargesPerRound ?? 0`, `max = maxCharges`:

- If the ability has `signatureCooldownMs != null` and is not bought (`isBoughtAbility` false):
  everything it holds is recharged, so next = `F`. (Fault Line.)
- Otherwise: `bought0 = max(0, start - F)` (carried plus bought this round),
  `used = castsAccepted[id]`. With `free-first`: `usedBought = max(0, used - F)`.
  With `bought-first`: `usedBought = min(used, bought0)`.
  `boughtLeft = max(0, bought0 - usedBought)`, clamped to `end` so it can never exceed what the
  agent actually holds.
- If `!alive && !rules.deadKeepsBoughtCharges`, `boughtLeft = 0`.
- next = `min(max, boughtLeft + F)`.

Other carry:

- `cooldownReadyAtMs` resets to `{}` every round (timestamps are round-local) - design.
- `statuses` reset to `[]` and `hp` to `ASSUMED_STARTING_HP` (G4's next-round builder already
  owns positions and hp; G5 only asserts it in the match test).
- `ultimatePoints` carry unchanged (design; the sheet lists sources but no reset rule). G2 adds
  plant/defuse points during the round; G5 does not grant ult points.
- Weapon and armor (G3): `keepsLoadout = alive && rules.survivorKeepsLoadout`. G3's applier
  restores its default for `false`. Before G3 lands the flag is computed but has no effect.

`initialEconomy` (round 1 of a match) differs from today's drill `createInstance`: credits =
`ruleset.startingCredits`, charges = free charges only (`F` per ability), not full pools. The
drill path (`createInstance`, `FULL_CHARGES_PROVENANCE`) is unchanged so existing tests and the
single-round UI keep their behaviour.

### 3.7 Pre-round economy view

A pure view model, so the HUD stays dumb:

```ts
// src/ui/preround/economyView.ts (new)
export type AgentEconomyView = {
  instanceId: string;
  credits: number;            // after buys so far
  lastRound: CreditLine[] | null;  // null in round 1 or single-round drill
};
export type TeamEconomyView = { side: Side; totalCredits: number; agents: AgentEconomyView[] };
export function teamEconomyView(members: readonly AgentInstance[], delta: EconomyDelta | null): TeamEconomyView;
export function formatCreditLine(line: CreditLine): string;  // "Win +N", "Kill (Sova) +N", ...
```

## 4. Determinism and fog implications

- `computeEconomy`, `carryCharges`, `creditedKills`, `initialEconomy`, `resetEconomyForPhase`
  and `applyEconomyDelta` are pure: no RNG (`src/sim/rng.ts` is not imported), no `Date`, no
  `Math.random`, no wall-clock, inputs never mutated (output built from `structuredClone`).
- Iteration order is fixed: agents in `startScenario.attack.members` then `defense.members`
  order; kills in `(timeMs, sequence)` order; credit lines in the order in 3.4. Object key order
  in `chargesAfter` follows the definition's `abilities` order, so serialized output is stable.
- Same inputs give byte-identical `serializeEconomyDelta` output (test asserts twice-run
  equality and input deep-equality after the call).
- The economy reads the full truth `finalWorld` and all events. That is fine: it runs in
  `src/sim` between rounds, not inside a decide function.
- Fog: the UI and any `LiveDecideFn` must only see their own side's credits and breakdown.
  Enemy credits and the enemy breakdown are not shown in the pre-round screen (design; open
  question 4). O2 receives own-side credits through G4/G6's plan entry point, never the delta of
  the other team. The single-round fog view (`src/sim/fog.ts`) is not changed: `AgentBody.credits`
  of enemies is already visible in the fogged world today; G5 recommends that `fog.ts` zero or
  strip enemy `credits` and `charges` in a follow-up owned by whoever next edits `fog.ts`
  (listed as risk 4, not done here).
- Replay: a single-round `ReplayFile` (v2) is unaffected, because it stores the post-buy
  scenario, which already contains the economy result. G4's match file already stores each round's
  `ledger` and the `economyId` header (G4 section 3.3). G4's `replayMatch` re-runs the step and
  fails on a ledger difference, and rejects a mismatched `economyId` (`economy-mismatch`), so a
  match is never silently re-priced. G5 adds no match-file fields; `G5_ECONOMY.id` changes
  whenever the shipped rules object changes.

## 5. Provenance and unknowns

| Value | Tag | Named constant | How to confirm |
| --- | --- | --- | --- |
| Starting credits 800 | assumed (existing, unchanged) | `ruleset.startingCredits` / `STARTING_CREDITS_PROVENANCE` | Owner or a Riot/wiki page opened in the project; update the existing tag, do not upgrade it here. |
| Credits per round win | assumed, value owner to set | `WIN_ROUND_CREDITS` | Wiki economy page opened in the project (secondary), or owner value (owner). |
| Credits per round loss (base) | assumed, value owner to set | `LOSS_ROUND_CREDITS` | Same. |
| Loss-streak bonus | assumed: disabled (`{ kind: "none" }`) | `LOSS_STREAK_RULE` | Open question 1. Enable only with a source. |
| Credits per enemy kill | assumed, value owner to set | `KILL_CREDITS` | Same as win. |
| Credits for spike plant | assumed, value owner to set | `PLANT_CREDITS` | Same. |
| Plant credit recipient | assumed | `PLANT_CREDIT_RECIPIENT` ("attacking-team") | Open question 2. |
| Credit cap | assumed, value owner to set | `CREDIT_CAP` | Same as win. |
| Survivors keep weapon and armor | assumed | `SURVIVOR_KEEPS_LOADOUT` (true) | Owner or source; G3 confirms the loadout fields. |
| Dead agents keep unspent bought charges | assumed, owner to set | `DEAD_KEEPS_BOUGHT_CHARGES` | Open question 3. |
| Unused bought charges carry, recharged charges do not | sheet | (rule in `carryCharges`) | `agent-reference.json` `globals.signatureChargeCarry`. |
| Sky Smoke 1 free charge per round | sheet | `freeChargesPerRound: 1` on `SKY_SMOKE_ABILITY` | Sheet `signatureRecharge` "1 free, +100 each, max 3". |
| Fault Line refills to 1 each round | sheet + design | `freeChargesPerRound: 1` on `FAULT_LINE_ABILITY` | Sheet costCredits 0, maxCharges 1, recharge "50s"; design reading that a 0-cost pool starts full. |
| Free charges are spent before bought ones | design | `FREE_CHARGE_SPEND_ORDER` ("free-first") | Not observable without client testing; owner choice. |
| Ult points carry between rounds | design | none (no number) | Owner; sheet lists sources only. |
| Cooldowns and statuses reset each round | design | none | Round-local timestamps. |
| Kills by allies or self pay nothing | design | none | Owner. |
| Half / overtime credit reset amounts | assumed, owner to set | `HALF_RESET_CREDITS` (defaults to `ruleset.startingCredits`), `OVERTIME_CREDITS` | Open question 5. |

No value in this table is tagged verified or secondary by G5.

## 6. Staged delivery

Every sub-stage ends with `npm run check` green (lint, typecheck, tests, build) and the test
counts in the baseline (25 files, 156 tests) only increasing. Browser checks are at 1366x768.

### G5.1 Rules, winner, kills, credit lines (no G3/G4 needed)

- New `src/sim/economy/rules.ts`, `src/sim/economy/kills.ts`, `src/sim/economy/round-end.ts`
  with `computeEconomy` (credits only; `chargesAfter` = end charges, `keepsLoadout` computed),
  `winnerOf`, `CreditLine`, `AgentEconomyChange`, `EconomyDelta`, `serializeEconomyDelta`.
  `EconomyInput` is G5's own type, so G5.1 does not wait for G4; only the adapter imports G4's
  types (G5.4).
- Owner fills the numeric constants before merge.
- `tests/sim/economy.test.ts` (new) asserts, with a fixture `EconomyRules`:
  win pays every winner once; loss pays every loser; streak bonus 0 under `kind: "none"` and
  ladder index clamps under a fixture ladder; a win resets the streak; kills pay per enemy kill
  for shot, `ability-damage` and `zone-damage` victims; a victim hit to 0 twice counts once; an
  ally kill pays nothing; cap clamps and the `cap` line makes lines sum to
  `creditsAfter - creditsBefore`; `timeout` pays defense as winner; inputs deep-equal before
  and after; two runs serialize identically.
- `tests/sim/economy-kills.test.ts` (new) drives a real round through
  `tests/sim/support/live-harness.ts` (`mustOpenLive`, `advance`) on the default drill and
  asserts `creditedKills` matches the agents whose `alive` flipped, and that each killer's
  credited kills equal its ult point gain from `grantKillUltPoints`.
- Browser: no UI change; the app loads and plays one round as before.

### G5.2 Charge carry and signature replenish

- Modify `src/sim/agents/definition.ts` (two optional fields), `sky-smoke.ts` and `breach.ts`
  (set `freeChargesPerRound` and `freeChargesProvenance` tagged sheet / sheet+design).
- New `src/sim/economy/carry.ts` (`carryCharges`, `countCastsAccepted(events)`); wire into
  `computeEconomy`; add `initialEconomy`, `applyEconomyDelta`, `resetEconomyForPhase`.
- Modify `src/sim/economy/buy.ts`: export `isBoughtAbility`; `buyCharge` uses it (behaviour
  unchanged; existing buy tests still pass).
- `tests/sim/economy-carry.test.ts` (new) asserts: Sky Smoke start 3 (1 free + 2 bought), 1
  cast -> next 3 under free-first, 2 under bought-first; 0 casts -> 3; 3 casts -> 1; dead agent
  with `deadKeepsBoughtCharges` false -> 1; Fault Line cast and recharged mid-round -> next 1;
  Aftershock unused and bought -> carries 1, used -> 0; result never exceeds `maxCharges`;
  `cooldownReadyAtMs` empty after `applyEconomyDelta`; `initialEconomy` gives
  `ruleset.startingCredits` and only free charges.
- `tests/data/agent-reference.test.ts` (modify): every shipped ability with
  `freeChargesPerRound > 0` has sheet text containing "free" or has `costCredits === 0`; every
  ability whose sheet `recharge` is "bought" has no `freeChargesPerRound`.
- Browser: unchanged single-round drill (drill still uses full pools).

### G5.3 Loadout carry (after G3)

- Fill `keepsLoadout` handling in `applyEconomyDelta` by calling G3's default-loadout helper.
- `tests/sim/economy-carry.test.ts` adds: survivor keeps `weaponId` and `armor`; dead agent
  gets G3's default; G3's `loadout` buy lines spend the carried credits (one test through
  `validatePlan`).
- Browser: buy a G3 item in round 1, survive, see it still equipped in round 2 pre-round.

### G5.4 Plant credits and G4 wiring (after G2 and G4)

- Read `world.spike` (G2) for the plant line; export `economyStep` typed as G4's
  `EconomyStep` and `G5_ECONOMY`; the match setup in `src/ui/scenario/playableMatch.ts` (G4-new)
  passes `G5_ECONOMY` to `openMatch` instead of `NO_ECONOMY`. `src/sim/match.ts` is not edited,
  except in G5.3 to widen G4's `economy-invalid` contract to allow `weaponId` and `armor`.
- `tests/sim/economy.test.ts` adds: plant pays per `PLANT_CREDIT_RECIPIENT`; a planted then
  defused round pays both the plant line (attack) and the win line (defense);
  `spike-detonated` is an attack win.
- `tests/sim/economy-match.test.ts` (new): a 3-round scripted match via G4 `openMatch` /
  `startNextRound` with fixture rules and scripted orders through the live harness. Round 1
  attack wins with a scripted kill; round 2 defense wins on timeout; round 3 attack plants and
  loses. Asserts exact credits per agent at the start of rounds 2 and 3 and after round 3,
  team streak values, Sky Smoke and Fault Line charges each round, and that replaying the match
  file reproduces identical `EconomyDelta`s; a tampered delta fails with the divergence message.
- Browser: play two rounds of a match; round 2 pre-round shows changed credits.

### G5.5 Pre-round economy display

- New `src/ui/preround/economyView.ts`; modify `AttackerHud.tsx` (credits line plus a
  last-round breakdown title/tooltip on the existing `${credits}c` badge) and `App.tsx`
  (team total badge in the pre-round topbar, next to the buy timer).
- `tests/ui/preround-ui.test.tsx` (modify): team total equals the sum of member credits and
  drops by the cost after a buy and rises after a refund; the badge title lists the breakdown
  lines in order; round 1 shows no breakdown; enemy credits are not rendered.
- `tests/ui/economyView.test.ts` (new): `formatCreditLine` for every `CreditLine` kind,
  `teamEconomyView` totals.
- Browser at 1366x768: pre-round shows "Team Nc" in the topbar and per-card credits; hovering
  a card badge shows the breakdown; no document scroll.

## 7. UI impact

- Clicks: zero new clicks to see economy. Team total is always visible in the pre-round
  topbar; per-agent credits are already in each HUD card header. The breakdown is a hover
  title on that badge (0 clicks) and is also reachable by keyboard focus on the card.
- Buying is unchanged: 1 click per charge (`+cost`), 1 click to refund (`-`). The team total
  updates on each click.
- Previews: the buy button's title already shows `buyCharge` rejection text; G5 adds nothing
  there. If a buy would leave an agent at 0, no warning is shown (no invented "eco" thresholds).
- One-screen rule: the team total is a single badge in the existing topbar row; the breakdown
  lives in a title, not in new rows, so the HUD card height does not grow. No document scroll at
  1366x768 (checked in the browser step of G5.5).
- Hot-seat (G6): the strip shows the side currently planning; switching side swaps the view,
  and the other side's credits are hidden.

## 8. Files touched

> Build protocol (consistency pass): this stage is built under [`parallel-build-plan.md`](parallel-build-plan.md). Edits listed here to `src/ui/App.tsx`, `src/ui/styles.css`, `rejectionMessages.ts`, `describe.ts` and the shared docs are integration-file edits: the stage's UI lives in its own component files (with their own CSS), and the App mount lines, message entries and doc text are applied at merge. After H0, engine edits go into the split modules and this stage's reserved slots.

| File | new/modify | Sub-stage |
| --- | --- | --- |
| `src/sim/economy/rules.ts` | new | G5.1 |
| `src/sim/economy/kills.ts` | new | G5.1 |
| `src/sim/economy/round-end.ts` | new | G5.1, G5.2, G5.3, G5.4 |
| `src/sim/economy/carry.ts` | new | G5.2 |
| `src/sim/economy/buy.ts` | modify (export `isBoughtAbility`) | G5.2 |
| `src/sim/agents/definition.ts` | modify (`freeChargesPerRound`, `freeChargesProvenance`) | G5.2 |
| `src/sim/agents/abilities/sky-smoke.ts` | modify | G5.2 |
| `src/sim/agents/abilities/breach.ts` | modify | G5.2 |
| `src/ui/scenario/playableMatch.ts` | modify (G4-new; pass `G5_ECONOMY` to `openMatch`) | G5.4 |
| `src/sim/match.ts` | modify (G4-owned; widen the `economy-invalid` contract to allow `weaponId` and `armor`; one line) | G5.3 |
| `src/ui/preround/economyView.ts` | new | G5.5 |
| `src/ui/orders/AttackerHud.tsx` | modify | G5.5 |
| `src/ui/App.tsx` | modify (topbar team total, pass delta to HUD) | G5.5 |
| `src/ui/styles.css` | modify (team total badge) | G5.5 |
| `tests/sim/economy.test.ts` | new | G5.1, G5.4 |
| `tests/sim/economy-kills.test.ts` | new | G5.1 |
| `tests/sim/economy-carry.test.ts` | new | G5.2, G5.3 |
| `tests/sim/economy-match.test.ts` | new | G5.4 |
| `tests/data/agent-reference.test.ts` | modify | G5.2 |
| `tests/ui/economyView.test.ts` | new | G5.5 |
| `tests/ui/preround-ui.test.tsx` | modify | G5.5 |
| `docs/status/g5.md` | new | Stage result, playtest steps and the exact text for PROJECT_STATUS.md / README.md / docs/playtest.md / docs/roadmap.md. The integrator applies that text at merge (docs/parallel-build-plan.md); this stage's branch never edits those shared docs. |

Not touched: `src/rules/ruleset.ts`, `src/sim/run.ts`, `src/sim/live-round.ts`,
`src/sim/preround.ts`, `src/sim/agents/state.ts`, `src/sim/fog.ts`, `agent-reference.json`,
`tests/architecture.test.ts` (no evaluator is added; the isolation check already covers the new
files).

## 9. Dependencies

- Must land first: G3 (for G5.3), G2 and G4 (for G5.4), G6 (for defense-side buys and the
  hot-seat view in G5.5). G5.1 and G5.2 depend only on the current baseline.
- Names consumed from the ownership contract:
  - G4: `src/sim/match.ts`, `MatchState`, `EconomyStep`, `openMatch`, `startNextRound`, match
    replay format.
  - G2: `SpikeState` / `world.spike`, `RoundResult` variants `spike-detonated` and
    `spike-defused`.
  - G3: `AgentBody.weaponId`, `AgentBody.armor`, `PreRoundPlan.loadout` buy lines.
  - G6: `PreRoundPlan.side: Side`, `startLiveFromPreRound` with `{ attack?, defense? }`.
- Names consumed from G4's plan (agreed in the consistency pass): `EconomyStep`,
  `EconomyStepInput`, `EconomyStepResult`, `EconomyLedgerLine`, `EconomyModel`, `NO_ECONOMY`,
  `RoundRecord.winnerTeam`, `TeamId` ("A" | "B"), side-neutral `instanceId`s across the switch.
- Still to agree: the planter/planted fields inside `SpikeState` (G2), a default-loadout helper
  (G3).

## 10. Risks

1. G4's `EconomyStep` signature changes again before G5.4. Mitigation: `computeEconomy` takes
   G5's own `EconomyInput`; only the thin adapter changes.
2. Owner does not supply credit values, blocking G5.1 merge. Mitigation: everything is tested
   with fixture rules; the shipped object is a one-file edit.
3. Kill attribution from hp-0 events misses a future damage source (G3 weapons, K-stage
   abilities). Mitigation: `economy-kills.test.ts` cross-checks against ult point gains, which
   every damage source must already grant; open question 6.
4. Enemy credits leak through the fogged world (`AgentBody.credits` is not stripped by
   `fog.ts`). Mitigation: UI hides them now; follow-up recorded for the next `fog.ts` owner.
5. Free-vs-bought split is inferred from `cast-accepted` counts; a cast path that spends a
   charge without that event would break it. Mitigation: carry test asserts `boughtLeft <= end`.
6. Changing round-1 charges from full pools to free-only could surprise existing drill tests.
   Mitigation: only `initialEconomy` (match path) does this; `createInstance` is unchanged.

## 11. Open questions

1. Loss-streak bonus: is there one, and what ladder? Recommended: ship `{ kind: "none" }` until
   the owner opens a source page in the project; then a ladder tagged secondary.
2. Plant credits to the whole attacking team or only the planter? Recommended: attacking team
   (assumed), switchable by `PLANT_CREDIT_RECIPIENT`.
3. Do dead agents keep unspent bought charges? Recommended: owner decides; default `false`
   (assumed) so death has an economic cost, and the sheet's carry rule is read as "for
   survivors".
4. Should either side see the opponent's credits in pre-round? Recommended: no (design), and
   fog strips enemy credits in a follow-up.
5. Half and overtime resets, and do timeout survivors on the losing side get loss credits?
   Recommended: half resets to `ruleset.startingCredits`; overtime uses a separate
   `OVERTIME_CREDITS` assumed constant set by the owner; timeout losers are paid like any loss
   until a source says otherwise.
6. Should G3 (or G2) add an explicit `agent-killed` `SimEvent` with `killerId`? Recommended:
   yes, owned by G3 with the damage model; `creditedKills` then reads it and the hp-0 inference
   is deleted.
