# Stage G3 plan: weapons and armor

Status: plan only. Nothing here is implemented. No check has been run against this plan.
Baseline it builds on: HEAD 08d2dfb (coordinator record: 25 test files, 156 tests).

## 1. Goal and non-goals

Goal. Replace the single hard-coded Rifle A with a versioned weapon and armor table that the live engine reads per agent, and let the attacker buy a weapon and an armor tier in the pre-round screen. The table format carries provenance per field so sourced numbers can land later without code changes to the combat model. Rifle A stays the default issued weapon and stays `assumed`. With no loadout bought, every event stream, final world and result is identical to today, so the characterization fixtures do not change.

Concretely G3 delivers:

- `data/weapons.json` (new): versioned weapon and armor table with per-field provenance.
- `src/sim/combat/weapons.ts` (new): `WeaponDefinition`, `ArmorDefinition`, `WeaponTable`, `SHIPPED_WEAPONS`, `WEAPONS_VERSION`, the validator, and the pure combat maths (hit chance by distance, damage band, body part, armor absorption).
- `AgentBody.weaponId` and `AgentBody.armor` (optional; absent means Rifle A and no armor).
- A damage model that applies armor to bullet damage and supports an optional head/body split, all on one combat draw per shot.
- `PreRoundPlan.loadout` buy lines replacing `loadoutFuture`, validated together with the existing ability `buys` against one credit pool.
- A shop row per agent in the pre-round HUD, and the equipped weapon shown per agent.

Non-goals (explicitly out of G3):

- Any Valorant weapon or armor number that the repo does not already source. G3 ships the engine and format; extra table entries are owner-authored content (same split as G1 maps).
- Cross-round economy: round-end credits, carry-over of weapons and armor, loss bonus, signature replenish. That is G5, implemented as G4's `EconomyStep`.
- Magazines, reload, spray patterns, movement inaccuracy, wall penetration, leg hits, weapon drop and pickup on death, selling, buying during the live phase, sidearms and weapon switching mid-round.
- Armor against ability damage (see Open question 3). Ability damage paths in `breach-resolve.ts` and `brimstone-resolve.ts` are untouched.
- Defense buys. `PreRoundPlan.side` stays `"attack"` until G6 lands; the loadout format is side-neutral so G6 needs no G3 change.
- Replay file version bump. Replay v3 is owned by G6; G3 stays on v2 (Section 4).

## 2. Current state (read for this plan)

- `src/sim/combat/assumed-rifle.ts`: `RIFLE_A` const (`id: "rifle_a"`, `bodyDamage: 40`, `hitChanceNearBp: 7500`, `hitChanceFarBp: 2500`, `farRangeMm: 15000`, one weapon-level `provenance` with `kind: "assumed"`, source `milestone-1`). `getWeapon(weaponId)` returns `RIFLE_A` or null. `hitProbabilityBp(distanceMm)` is a linear fall from near to far chance, clamped, with `Math.round`.
- `src/sim/run.ts`:
  - `AgentBody` has no weapon or armor fields.
  - `Job` has `{ type: "engage"; instanceId; targetInstanceId; weaponId }` and `{ type: "auto-engage"; instanceId; weaponId }`.
  - `applyJob(job, timeMs, sequence, world, catalog, walls, combat, ruleset)` handles `auto-engage` by picking `nearestVisibleEnemy` and recursing into `engage`. The engage branch: `getWeapon(job.weaponId)` (unknown -> `order-rejected` `invalid-order`), withholds for shooter-down, target-down, blinded, no-line-of-sight (no draw consumed), then `probability = hitProbabilityBp(distance)`, minus `ruleset.concussHitChancePenaltyBp` while `STATUS_CONCUSS`, floored at 0; `draw = combat.nextInt(10000)`; `hit = draw < probability`; `damage = hit ? weapon.bodyDamage : 0`; hp floored at 0; `grantKillUltPoints` on a kill. Emits `shot` with `weaponId, hitProbabilityBp, draw, hit, damage, targetHpAfter`.
  - `createWorld` and `toInstance` copy fields member <-> body one by one.
  - `autoFireIntervalFor(agent, timeMs, ruleset)` returns `ruleset.autoFireIntervalMs`, divided by the Combat Stim `fireRate` modifier when present (`Math.max(1, Math.round(...))`).
  - `runScenario` creates `createStream(scenario.seed, "combat")`.
- `src/sim/live-round.ts`: imports `RIFLE_A`; the `shoot` command path and `scheduleFires` both hard-code `weaponId: RIFLE_A.id`. `openLiveRound` seeds `lastAutoFireAtMs[id] = -ruleset.autoFireIntervalMs` so the first fire lands at t=0. `combatState = forkSeed(seed, "combat")`, resumed per step via `resumeStream`. `drainJobsUntil(queue, world, untilMs, catalog, walls, combat, ruleset, sequence, events)`. `replayOrderLog(scenario, log, untilMs, catalog, ruleset)` reopens with `openLiveRound`.
- `src/rules/ruleset.ts`: `autoFireIntervalMs: 1000` (assumed, `AUTO_FIRE_INTERVAL_PROVENANCE`), `concussHitChancePenaltyBp` (assumed, 2000), `startingCredits: 800` (assumed).
- `src/sim/economy/buy.ts`: `buyCharge(agent, abilityId, catalog)` returns `BuyResult` (clone with credits and charges updated) or a `RejectionCode`.
- `src/sim/preround.ts`: `PreRoundPlan = { version: 1; side: "attack"; buys: BuyLine[]; agents: AgentPlan[]; loadoutFuture?: Record<string, never> }`. The buy loop (`memberAsBody` + `buyCharge`) is written three times: in `validatePlan`, `startLiveFromPreRound` and `applyBuysToScenario(scenario, buys, catalog)`. `startLiveFromPreRound` opens the round on the post-buy scenario, so `round.scenario` is post-buy. `rejectionText` maps codes to text.
- `src/sim/agents/state.ts`: `AgentInstance` (no weapon or armor). `STARTING_HP_PROVENANCE` note says armor is not modelled.
- `src/sim/scenario/types.ts`: `SCENARIO_VERSION = 1`; `EngageOrder` carries `weaponId`; `Scenario` has `catalogVersion` but no weapons version. `src/sim/scenario/default-drill.ts` uses `RIFLE_A.id` in engage orders.
- `src/persistence/scenario-file.ts`: `parseScenario` checks `version === SCENARIO_VERSION`, then shape-asserts teams and orders. It ignores unknown keys.
- `src/ui/live/replayFile.ts`: `REPLAY_FILE_VERSION = 2`, accepts 1 and 2; stores `scenario` (post-buy), `seed`, `orderLog`, `simTimeMs`, optional audit-only `preRoundPlan`. `parseReplay` does not validate `preRoundPlan`.
- `src/sim/fog.ts`: `viewWorld` returns own agents plus visible enemies as whole bodies (hp is visible today).
- `src/sim/describe.ts`: text for `shot` events.
- `src/ui/orders/AttackerHud.tsx`: per-agent pre-round buy rows using `buyCharge` as a probe, and a placeholder `<p className="hud-roadmap">Weapons / armor (roadmap)</p>`. `src/ui/orders/rejectionMessages.ts` has an exhaustive `Record<RejectionCode, string>`.
- `src/ui/preround/planState.ts`: `instanceToBody`, `buildPreRoundPlan(buys, drafts, attackMembers)`.
- `src/ui/App.tsx`: `buys` state, `postBuyScenario` via `applyBuysToScenario`, `goLive` via `validatePlan` + `startLiveFromPreRound`, `downloadReplay` writes `round.scenario`.
- Tests: `tests/sim/breach.test.ts` reads `agent-reference.json` with `readFileSync` and asserts every catalog number equals the sheet (the drift-test pattern). `tests/data/agent-reference.test.ts` and `tests/data/primitive-stages.test.ts` read data files the same way. `tests/sim/characterization.test.ts` compares `events`, `finalWorld` and `result` from `tests/sim/characterization/scenarios.ts` with `tests/fixtures/characterization/*.json` using `toEqual`. `tests/sim/combat.test.ts` asserts `RIFLE_A.provenance.kind === "assumed"`. `tests/sim/brimstone.test.ts` asserts `autoFireIntervalFor(...) === Math.round(autoFireIntervalMs / 1.1)`. `tests/sim/preround.test.ts:741` builds a plan with `loadoutFuture: {}`.
- `agent-reference.json` globals: `baseHp: 100`, `armorCap: 50` (sheet). No weapon stats or armor prices are recorded anywhere in the repo.

## 3. Design

### 3.1 Data file `data/weapons.json`

The JSON file is the authored source. A TypeScript mirror in `src/sim/combat/weapons.ts` is what the sim imports (no JSON import, no tsconfig or Vite change, `src/sim` stays free of IO). A drift test parses the JSON through the same validator and asserts deep equality with the mirror. This is the same pattern as the catalog vs `agent-reference.json`.

Shape (illustrative; the only shipped weapon is Rifle A with today's numbers, and `armor` ships empty unless Open question 1 is answered otherwise):

```json
{
  "version": "g3-weapons-<yyyy-mm-dd>",
  "defaultWeaponId": "rifle_a",
  "weapons": [
    {
      "id": "rifle_a",
      "name": "Rifle A",
      "costCredits": null,
      "fireIntervalMs": null,
      "accuracy": { "nearBp": 7500, "farBp": 2500, "farRangeMm": 15000 },
      "damageBands": [{ "fromMm": 0, "bodyDamage": 40, "headDamage": null }],
      "provenance": {
        "kind": "assumed",
        "source": "milestone-1",
        "note": "Original profile, not a Valorant rifle. Copied unchanged from RIFLE_A."
      },
      "fieldProvenance": {}
    }
  ],
  "armor": []
}
```

Rules enforced by `validateWeaponTable`:

- `version` is a non-empty string; `defaultWeaponId` names a weapon whose `costCredits` is null (issued, not sold).
- Ids are unique, lowercase snake case.
- All numbers are integers. Basis points in 0..10000. `nearBp >= farBp`. `farRangeMm > 0`. `damageBands` non-empty, first `fromMm` is 0, strictly increasing, every damage >= 0.
- `costCredits` is null (not buyable) or an integer > 0. `fireIntervalMs` is null (use `ruleset.autoFireIntervalMs`) or an integer > 0.
- Provenance: every numeric field resolves to a provenance, either `fieldProvenance[<path>]` or the entry-level `provenance`. Paths are fixed strings such as `costCredits`, `fireIntervalMs`, `accuracy.nearBp`, `damageBands.0.bodyDamage`. A field may only be `verified` or `secondary` through a field-level entry with a non-empty `source`; the entry-level default may not be `verified` (stops one tag silently covering every field).
- Armor: unique ids, `capacity` integer > 0 and <= `ARMOR_CAP` from the sheet, `absorbBp` in 1..10000, `costCredits` integer > 0.

### 3.2 Types in `src/sim/combat/weapons.ts` (new)

```ts
import type { Provenance } from "../../rules/provenance.ts";

export type WeaponFieldPath = string; // e.g. "accuracy.nearBp", "damageBands.0.headDamage"

export type DamageBand = {
  /** Band starts at this distance (inclusive). First band is 0. */
  fromMm: number;
  bodyDamage: number;
  /** null = no head/body split for this weapon (Rifle A). */
  headDamage: number | null;
};

export type WeaponDefinition = {
  id: string;
  name: string;
  /** null = issued at round start, not sold. */
  costCredits: number | null;
  /** null = use ruleset.autoFireIntervalMs (keeps that assumed number in one place). */
  fireIntervalMs: number | null;
  accuracy: { nearBp: number; farBp: number; farRangeMm: number };
  damageBands: DamageBand[];
  provenance: Provenance;
  fieldProvenance: Partial<Record<WeaponFieldPath, Provenance>>;
};

export type ArmorDefinition = {
  id: string;
  name: string;
  /** Armor points granted on purchase. Must be <= ARMOR_CAP (sheet). */
  capacity: number;
  /** Share of each bullet hit taken by armor, basis points. */
  absorbBp: number;
  costCredits: number;
  provenance: Provenance;
  fieldProvenance: Partial<Record<string, Provenance>>;
};

export type WeaponTable = {
  version: string;
  defaultWeaponId: string;
  weapons: WeaponDefinition[];
  armor: ArmorDefinition[];
};

/** Worn armor on a body. Absent = no armor. */
export type ArmorState = { armorId: string; remaining: number };

export type BodyPart = "head" | "body";

export const WEAPONS_VERSION: string;          // equals SHIPPED_WEAPONS.version
export const SHIPPED_WEAPONS: WeaponTable;     // mirror of data/weapons.json
export const ARMOR_CAP: number;                // 50, sheet globals.armorCap
export const ARMOR_CAP_PROVENANCE: Provenance; // sheet row, agent-reference.json

export function validateWeaponTable(raw: unknown): { ok: true; table: WeaponTable } | { ok: false; errors: string[] };
export function getWeaponDef(table: WeaponTable, id: string): WeaponDefinition | null;
export function getArmorDef(table: WeaponTable, id: string): ArmorDefinition | null;
/** Body without weaponId -> table.defaultWeaponId. */
export function equippedWeaponId(agent: { weaponId?: string }, table: WeaponTable): string;
/** Generalised form of today's hitProbabilityBp; identical maths. */
export function weaponHitProbabilityBp(weapon: WeaponDefinition, distanceMm: number): number;
export function damageBandAt(weapon: WeaponDefinition, distanceMm: number): DamageBand;
/** Pure; see 3.4. */
export function resolveShot(input: ShotInput): ShotOutcome;
```

`assumed-rifle.ts` keeps `RIFLE_A`, `getWeapon` and `hitProbabilityBp(distanceMm)` as thin wrappers (`hitProbabilityBp(d) === weaponHitProbabilityBp(getWeaponDef(SHIPPED_WEAPONS, "rifle_a"), d)`), so `tests/sim/combat.test.ts` and `default-drill.ts` keep working. `RIFLE_A` stays the single place the Rifle A numbers are written in TS; the `SHIPPED_WEAPONS` entry is built from it, and the drift test proves the JSON matches.

### 3.3 Agent state

```ts
// src/sim/run.ts
export type AgentBody = {
  // ...existing fields unchanged...
  /** Absent = table default (Rifle A). Set only by a loadout buy. */
  weaponId?: string;
  /** Absent = no armor. */
  armor?: ArmorState;
};

// src/sim/agents/state.ts
export type AgentInstance = {
  // ...existing fields unchanged...
  weaponId?: string;
  armor?: ArmorState;
};

// src/sim/scenario/types.ts
export type Scenario = {
  // ...existing fields unchanged; SCENARIO_VERSION stays 1...
  /** Required when any member has weaponId or armor; must equal the loaded table version. */
  weaponsVersion?: string;
};
```

All copy sites (`createWorld`, `toInstance` in `run.ts`, `memberAsBody` in `preround.ts`, `instanceToBody` in `planState.ts`) copy the two fields with conditional spread (`...(m.weaponId !== undefined ? { weaponId: m.weaponId } : {})`) so a default agent has no new keys at all. This is the mechanism that keeps the characterization `finalWorld` fixtures byte-identical.

Optional rather than required fields is a deliberate choice: required `weaponId: "rifle_a"` on every body would add a key to every stored `finalWorld` and force a fixture rewrite with no behaviour change.

### 3.4 Combat model in the 2D integer engine

Every step stays integer and stays on the existing single `combat` stream.

```ts
export type ShotInput = {
  weapon: WeaponDefinition;
  armorDef: ArmorDefinition | null;
  targetArmor: ArmorState | undefined;
  targetHp: number;
  distanceMm: number;
  concussed: boolean;
  ruleset: Ruleset;
  draw: number; // combat.nextInt(10000), drawn by the caller exactly once
};

export type ShotOutcome = {
  hitProbabilityBp: number; // after concuss, same meaning as today
  hit: boolean;
  bodyPart?: BodyPart;      // present only when the band has headDamage !== null and hit
  damage: number;           // raw weapon damage before armor
  armorAbsorbed?: number;   // present only when the target wears armor
  targetHpAfter: number;
  targetArmorAfter?: number;
};
```

1. Hit chance (range falloff of accuracy). `p = weaponHitProbabilityBp(weapon, distance)` (same linear interpolation and rounding as today), then `p = max(0, p - ruleset.concussHitChancePenaltyBp)` while concussed. Unchanged for Rifle A.
2. One draw. `draw = combat.nextInt(10000)` exactly once per non-withheld shot, as today. Withheld shots still draw nothing.
3. Body part by partition of the same draw (no second draw). If the band's `headDamage` is null: `hit = draw < p`, no `bodyPart`. Otherwise `headCut = floor(p * ruleset.headHitShareBp / 10000)`; `draw < headCut` -> head hit, `headCut <= draw < p` -> body hit, else miss. The head share is a shooter-skill stand-in, so it is a ruleset constant (`HEAD_HIT_SHARE_BP`, assumed), not a weapon stat. It is never consulted for Rifle A.
4. Damage falloff by range bands. `band = damageBandAt(weapon, distance)` = last band with `fromMm <= distance`. `damage = head ? band.headDamage : band.bodyDamage`. Rifle A has one band at 0 with 40, so damage is 40 at every range, as today.
5. Armor absorption. If the target wears armor with `remaining > 0`: `absorbed = min(remaining, floor(damage * armorDef.absorbBp / 10000))`; `hpLoss = damage - absorbed`; `remaining -= absorbed`. Otherwise `hpLoss = damage`. Then `hp = max(0, hp - hpLoss)`; kill and ult points as today. An armor id missing from the table at shot time cannot happen (open rejects it, Section 4).
6. Fire rate. New `baseFireIntervalMs(agent, ruleset, weapons) = weapon.fireIntervalMs ?? ruleset.autoFireIntervalMs`. `autoFireIntervalFor(agent, timeMs, ruleset, weapons = SHIPPED_WEAPONS)` divides that base by the Combat Stim `fireRate` modifier exactly as today. `openLiveRound` seeds `lastAutoFireAtMs[id] = -baseFireIntervalMs(agent, ruleset, weapons)` (no stim, matching today's seed). For Rifle A every value is identical, and the existing brimstone assertion still holds with the default argument.

The `shot` event keeps its shape: `hitProbabilityBp` and `draw` stay separate fields, `damage` keeps meaning raw weapon damage on a hit (0 on a miss). New optional fields are added only when they apply:

```ts
| {
    type: "shot";
    targetInstanceId: string;
    weaponId: string;
    hitProbabilityBp: number;
    draw: number;
    hit: boolean;
    damage: number;
    targetHpAfter: number;
    bodyPart?: BodyPart;        // only for weapons with a head band
    armorAbsorbed?: number;     // only when the target wears armor
    targetArmorAfter?: number;  // only when the target wears armor
  }
```

Job wiring. `scheduleFires` and the `shoot` command path in `live-round.ts` replace `RIFLE_A.id` with `equippedWeaponId(agent, round.weapons)`. The `engage` job keeps `weaponId`; `applyJob` looks it up in the table it is given (unknown id still rejects with `invalid-order`, as today). `applyJob` and `drainJobsUntil` gain a trailing optional `weapons: WeaponTable = SHIPPED_WEAPONS` parameter, so ability resolvers and existing call sites compile unchanged. `LiveRound` gains `weapons: WeaponTable`, set from `OpenLiveOptions.weapons ?? SHIPPED_WEAPONS`; `replayOrderLog` gains the same optional argument. `runScenario` gains a trailing optional `weapons` argument; scripted `EngageOrder.weaponId` stays authoritative for that legacy path.

### 3.5 Buying: `loadout` lines

```ts
// src/sim/preround.ts
export type LoadoutLine =
  | { instanceId: string; kind: "weapon"; weaponId: string }
  | { instanceId: string; kind: "armor"; armorId: string };

export type PreRoundPlan = {
  version: 1;
  side: "attack";          // G6 widens this to Side; G3 does not touch it
  buys: BuyLine[];
  agents: AgentPlan[];
  /** G3: weapon and armor purchases, applied before ability buys. */
  loadout?: LoadoutLine[];
};
```

`loadoutFuture` is removed from the type. Old replay files that carry `preRoundPlan.loadoutFuture: {}` still parse, because `parseReplay` treats `preRoundPlan` as an opaque audit copy and never drives replay from it.

New in `src/sim/economy/buy.ts`:

```ts
export function buyLoadoutItem(
  agent: AgentBody,
  line: LoadoutLine,
  weapons: WeaponTable,
): BuyResult;
```

Rules (in this order, first failure wins):

- weapon: unknown id -> `unknown-weapon`; `costCredits === null` -> `not-for-sale`; already equipped (`equippedWeaponId(agent) === id`) -> `already-equipped`; `credits < cost` -> `insufficient-credits`. Success sets `weaponId` and subtracts cost. No refund for the replaced weapon (the issued default has no price; selling is a non-goal).
- armor: unknown id -> `unknown-armor`; worn armor with `remaining >= capacity` of the requested tier -> `armor-full`; `credits < cost` -> `insufficient-credits`. Success sets `armor = { armorId, remaining: capacity }` and subtracts cost.

One credit pool. A single new helper in `preround.ts` replaces the three copied loops:

```ts
function applyPurchases(
  scenario: Scenario,       // cloned by the caller
  loadout: readonly LoadoutLine[],
  buys: readonly BuyLine[],
  catalog: Catalog,
  weapons: WeaponTable,
): { ok: true } | PlanFailure;
```

It applies every `loadout` line in array order, then every `buys` line in array order, each against the post-previous-line member. Extra plan-level checks: at most one weapon line and one armor line per `instanceId` (else `loadout-duplicate`); member must exist and be attack (`unknown-agent` / `wrong-side`, as for buys). When `loadout` is non-empty the post-buy scenario gets `weaponsVersion = weapons.version`. `validatePlan`, `startLiveFromPreRound` and `applyBuysToScenario` all call it, so validation and the started round can never disagree.

Signature changes (all additive, defaults keep current callers compiling):

```ts
validatePlan(scenario, plan, catalog?, ruleset?, weapons = SHIPPED_WEAPONS)
startLiveFromPreRound(scenario, plan, catalog?, ruleset?, options?) // options.weapons
applyBuysToScenario(scenario, buys, catalog?, loadout: readonly LoadoutLine[] = [], weapons = SHIPPED_WEAPONS)
```

Credits remain whatever the scenario member carries (today `ruleset.startingCredits`, assumed 800). Where those credits come from between rounds is G5. G3 adds no income, no carry-over and no refund rules.

New `RejectionCode` members in `src/sim/types.ts`: `unknown-weapon`, `unknown-armor`, `not-for-sale`, `already-equipped`, `armor-full`, `loadout-duplicate`, `weapons-mismatch`. Each gets text in `rejectionMessages.ts` (exhaustive record, compile-checked) and in `rejectionText` in `preround.ts`.

## 4. Determinism and fog implications

- One draw per non-withheld shot, on the existing `combat` stream (`createStream(seed, "combat")` in `runScenario`, `forkSeed(seed, "combat")` + `resumeStream` in the live round). The head/body split partitions that draw, so adding a weapon with a head band never changes how many numbers are consumed. No new stream label is introduced.
- All maths are integer: `Math.round` only in the existing accuracy interpolation, `Math.floor` for head cut and absorption, `Math.max/min` clamps. No floating accumulation across steps.
- Fire scheduling keeps the existing tie order (time, then agent id). A weapon's interval only changes when that agent's next fire lands, not the sort.
- Defaults unchanged. With no loadout: no `weaponId`/`armor` keys on bodies, `fireIntervalMs` null -> `ruleset.autoFireIntervalMs`, single band of 40, no head band, no armor -> the shot event has exactly today's keys. So `tests/fixtures/characterization/*.json` are expected not to change, and the plan forbids running `VALSIM_UPDATE_FIXTURES=1` in G3.
- Replay identity. The replay stores `round.scenario`, which is already the post-buy scenario. After G3 that scenario carries each member's `weaponId`/`armor` plus `weaponsVersion`, so `replayOrderLog` reproduces the round from the file alone. `openLiveRound` and `runScenario` reject with `weapons-mismatch` when `weaponsVersion` is set and differs from the loaded table, or when any member has `weaponId`/`armor` and `weaponsVersion` is absent, or when a member references an id missing from the table. Scenario files and replays without these keys load exactly as today. `SCENARIO_VERSION` stays 1 and `REPLAY_FILE_VERSION` stays 2 (v3 is G6's); the additions are optional keys that the parsers validate when present.
- Fog. `viewWorld` already exposes visible enemy bodies including hp. G3 leaves `weaponId` and `armor` on visible enemies for parity with hp (Open question 4). Hidden enemies are still removed entirely, so nothing about an unseen enemy's loadout leaks. `src/sim` still never imports `src/tactics`.

## 5. Provenance and unknowns

| Value | Tag | Named constant (if assumed) | How to confirm |
| --- | --- | --- | --- |
| Rifle A body damage 40 | assumed (existing) | `RIFLE_A.bodyDamage` | Not a Valorant weapon; stays assumed by design. |
| Rifle A hit chance 7500 near, 2500 far, over 15000 mm | assumed (existing) | `RIFLE_A.hitChanceNearBp`, `hitChanceFarBp`, `farRangeMm` | Same. |
| Rifle A cost | design: null (issued, not sold) | none | No number exists; not a price. |
| Rifle A fire interval | assumed (existing) | `ruleset.autoFireIntervalMs` via `fireIntervalMs: null` | Same as today's `AUTO_FIRE_INTERVAL_PROVENANCE`. |
| Rifle A head damage | design: null (no split) | none | Rifle A never had a headshot model. |
| Armor cap 50 | sheet (`agent-reference.json` globals `armorCap`) | `ARMOR_CAP` in `weapons.ts`, provenance kind `secondary`, source "agent-reference.json sheet row" (same tag the repo uses for sheet rows, e.g. `INCENDIARY_FIGURES` in brimstone.ts) | Drift test reads `globals.armorCap`. |
| Base hp 100 | sheet (`globals.baseHp`); code uses assumed `ASSUMED_STARTING_HP` | existing | Unchanged by G3; tag not upgraded. |
| Combat Stim fire-rate modifier 1.1 | sheet (existing, `globals.combatStim.fireRateModifier`) | existing status modifier | Unchanged; now divides the weapon base interval. |
| Concuss hit penalty 2000 bp | assumed (existing) | `ruleset.concussHitChancePenaltyBp` | Unchanged; applies to every weapon. |
| Head hit share of hits | assumed (new) | `HEAD_HIT_SHARE_BP` in `src/rules/ruleset.ts` (`headHitShareBp` + `HEAD_HIT_SHARE_PROVENANCE`, `kind: "assumed"`) | Value chosen by owner at sub-stage 2; unused until a weapon has a head band. Shooter-skill stand-in, never a Valorant figure. |
| Armor applies to ability damage | design: no (G3) | none | Open question 3. |
| Any real weapon stat (damage, head damage, range bands, fire rate, price) | unknown | per-field `fieldProvenance` in `data/weapons.json` | Owner supplies with a source; tag `verified` only with a primary source URL, else `secondary` or `assumed`. |
| Armor tier capacity, absorption, price | unknown | per-field `fieldProvenance`; capacity must be <= `ARMOR_CAP` | Owner supplies; Open question 1. |
| Test-only weapon and armor values | not game values | `TEST_WEAPONS` in `tests/sim/support/weapon-fixtures.ts`, provenance `assumed` with note "test fixture, not a game value" | Never imported by `src/`. |

No number in this plan is new except via a named constant whose value the owner picks, and no existing tag is upgraded.

## 6. Staged delivery

Each sub-stage ends with `npm run check` green (lint, typecheck, tests, build) and the characterization fixtures unchanged.

### G3.1 Types, table, data file, drift guard

- Add `src/sim/combat/weapons.ts` (types, `validateWeaponTable`, `SHIPPED_WEAPONS` built from `RIFLE_A`, `WEAPONS_VERSION`, `ARMOR_CAP`, lookups, `weaponHitProbabilityBp`, `damageBandAt`).
- Add `data/weapons.json` with Rifle A only and `armor: []`.
- `assumed-rifle.ts`: `hitProbabilityBp` delegates to `weaponHitProbabilityBp`.
- Acceptance:
  - `tests/data/weapons.test.ts` (new): JSON parses and passes `validateWeaponTable`; result deep-equals `SHIPPED_WEAPONS`; `version === WEAPONS_VERSION`; `defaultWeaponId === "rifle_a"`; every weapon numeric field resolves to a provenance; Rifle A fields equal `RIFLE_A` and are `assumed`; every armor capacity <= `globals.armorCap` read from `agent-reference.json`; validator rejects (one case each) duplicate id, non-integer, `nearBp < farBp`, first band not 0, entry-level `verified`, capacity above cap.
  - `tests/sim/combat.test.ts`: existing assertion kept; new assertion that `hitProbabilityBp(d) === weaponHitProbabilityBp(rifle, d)` for d in {0, 1, 7500, 14999, 15000, 30000}.
  - Browser 1366x768: no visible change (sanity load of the drill).

### G3.2 Damage model in the engine

- Add `resolveShot`; `applyJob` engage branch calls it with the single draw. Add optional `weaponId`/`armor` to `AgentBody` and `AgentInstance` with conditional-spread copies. Add `Scenario.weaponsVersion` and the `weapons-mismatch` open checks. Thread `weapons` through `LiveRound`, `OpenLiveOptions`, `drainJobsUntil`, `applyJob`, `replayOrderLog`, `runScenario`. Replace `RIFLE_A.id` in `live-round.ts` with `equippedWeaponId`. Add `baseFireIntervalMs` and the `weapons` argument on `autoFireIntervalFor`. Add `headHitShareBp` to `Ruleset`. Extend `describe.ts` shot text with body part and armor absorbed when present.
- Acceptance:
  - `tests/sim/weapons.test.ts` (new), using `TEST_WEAPONS` from `tests/sim/support/weapon-fixtures.ts` and `tests/sim/support/live-harness.ts`: `resolveShot` partitions a draw into head, body, miss at the exact boundaries `headCut - 1`, `headCut`, `p - 1`, `p`; damage band selection at band edges; absorption floors and is capped by `remaining`; armor reaches 0 and further hits go fully to hp; hp floors at 0; concuss lowers `p` before the head cut. A live round where one agent wears test armor shows `armorAbsorbed` and `targetArmorAfter` on its shot events and none on others. A test weapon with `fireIntervalMs` fires on that cadence and the first fire is at t=0; with Combat Stim the interval is `round(base / 1.1)`. Same seed + same loadout gives identical events twice; the count of combat draws equals the number of `shot` events.
  - Open rejects `weapons-mismatch` for: version differs; member has `weaponId` with no `weaponsVersion`; unknown armor id.
  - `tests/sim/characterization.test.ts`: unchanged and still compared against the stored fixtures (no fixture file edited).
  - `tests/sim/brimstone.test.ts`, `tests/sim/combat.test.ts`, `tests/sim/live-round.test.ts`: unchanged assertions remain.
  - Browser 1366x768: play the default drill; shot log text unchanged for Rifle A.

### G3.3 Loadout buy lines and validation

- `LoadoutLine`, `PreRoundPlan.loadout`, removal of `loadoutFuture`, `buyLoadoutItem`, `applyPurchases`, new rejection codes and texts, `weaponsVersion` stamping, extended `validatePlan`/`startLiveFromPreRound`/`applyBuysToScenario` signatures. Scenario file parser validates optional `weaponId`, `armor`, `weaponsVersion`.
- Acceptance:
  - `tests/sim/preround.test.ts`: the `loadoutFuture: {}` fixture at line 741 becomes a `loadout` line; each new rejection code is produced by one plan; a plan whose loadout plus ability buys exceed credits fails at the first line that overdraws, and the same plan without the ability buy passes; `validatePlan` ok implies `startLiveFromPreRound` returns a live round whose members carry the bought weapon and armor and reduced credits; with an empty `loadout` the started round's scenario has no `weaponsVersion` key; a plan with a loadout round-trips through `serializeReplay`/`parseReplay` (still `"version": 2`) and `replayOrderLog` reproduces the events.
  - `tests/sim/scenario-file.test.ts`: round-trips a scenario with `weaponId`, `armor`, `weaponsVersion`; rejects `armor.remaining` negative or non-integer and a non-string `weaponId`.
  - `tests/ui/replayFile.test.ts`: an old v2 file whose `preRoundPlan` has `loadoutFuture: {}` still parses.
  - Browser 1366x768: none yet (no UI).

### G3.4 Shop UI and weapon display

- `AttackerHud.tsx`: replace the `hud-roadmap` note with a loadout row per agent (Section 7). `planState.ts`: `buildPreRoundPlan` takes `loadout`; `instanceToBody` copies the new fields. `App.tsx`: `loadout` state cleared in `resetToPreRound`, passed into `applyBuysToScenario`, `buildPreRoundPlan`, `validatePlan`; buy and undo handlers. Weapon short name shown per agent in pre-round and live; armor shown as a thin bar under hp when worn.
- Acceptance:
  - `tests/ui/preround-ui.test.tsx`: the HUD shows "Rifle A" for every attacker; with an injected test table (HUD `weapons` prop) clicking a weapon reduces that agent's credits by its cost and the ability buy probes see the lower credits; an unaffordable item is disabled with the `insufficient-credits` text as title; undo restores credits; a full round started from the shop has the weapon in `round.scenario`.
  - `tests/ui/round-play.test.tsx`: existing replay download test unchanged.
  - Browser 1366x768: pre-round screen shows the loadout row on all five cards with no document scroll; the drill with shipped data shows Rifle A as issued and the armor control disabled with "No armor tiers loaded"; live view shows the weapon label per card.

### G3.5 Docs and status

- Via `docs/status/g3.md` (applied by the integrator at merge): `PROJECT_STATUS.md` lines that say there is no armor and Rifle A only are updated to describe the table and what is still unsourced. `docs/roadmap.md` G3 entry marked done with a pointer to this plan.
- Acceptance: `npm run check` green; architecture test unchanged (no evaluator added, `src/sim` imports no `tactics`/`persistence`).

## 7. UI impact

- Shop location: inside each attacker's pre-round HUD card, on the line where `hud-roadmap` sits today, so card height does not grow. One compact row: a weapon control (a small button that cycles through buyable weapons, or a `<select>` if more than three entries) and one armor button per tier, each labelled with name and cost, e.g. "Rifle A (issued)".
- Clicks: buy a weapon = 1 click (2 with a select: open + choose). Buy armor = 1 click. Undo = 1 click on the same control's "-" (mirrors the ability buy +/-). Credits shown in the card head (`${agent.credits}c`) update immediately, and ability buy buttons re-probe against post-loadout credits.
- Previews: disabled controls carry the rejection text as `title` (same pattern as ability buys). Hovering a weapon shows a one-line tooltip with damage and near/far hit chance and the provenance kind ("assumed") so the player sees that the numbers are not Valorant data.
- Weapon shown per agent: short name next to the role in the card head in both pre-round and live modes; worn armor as a thin second bar under `hud-hp`. MapView markers are unchanged (keeps the board readable).
- One-screen rule: at 1366x768 the pre-round screen must not scroll. The loadout row replaces an existing line, labels are truncated with ellipsis, and no new panel is added. The browser check in G3.4 verifies `document.documentElement.scrollHeight <= innerHeight`.

## 8. Files touched

> Build protocol (consistency pass): this stage is built under [`parallel-build-plan.md`](parallel-build-plan.md). Edits listed here to `src/ui/App.tsx`, `src/ui/styles.css`, `rejectionMessages.ts`, `describe.ts` and the shared docs are integration-file edits: the stage's UI lives in its own component files (with their own CSS), and the App mount lines, message entries and doc text are applied at merge. After H0, engine edits go into the split modules and this stage's reserved slots.

| File | New / modify | Sub-stage | What |
| --- | --- | --- | --- |
| `data/weapons.json` | new | G3.1 | Versioned table, Rifle A only, empty armor. |
| `src/sim/combat/weapons.ts` | new | G3.1, G3.2 | Types, validator, table mirror, lookups, `resolveShot`, `baseFireIntervalMs`. |
| `src/sim/combat/assumed-rifle.ts` | modify | G3.1 | `hitProbabilityBp` delegates; `RIFLE_A` kept. |
| `tests/data/weapons.test.ts` | new | G3.1 | Drift and validator tests. |
| `tests/sim/combat.test.ts` | modify | G3.1 | Wrapper equality. |
| `src/sim/run.ts` | modify | G3.2 | `AgentBody` fields, engage branch, copies, `autoFireIntervalFor`, shot event fields, `runScenario` and `applyJob` weapons arg, mismatch check. |
| `src/sim/live-round.ts` | modify | G3.2 | `LiveRound.weapons`, options, fire scheduling, shoot path, seed interval, `drainJobsUntil`, `replayOrderLog`, mismatch check. |
| `src/sim/agents/state.ts` | modify | G3.2 | Optional `weaponId`, `armor` on `AgentInstance`. |
| `src/sim/scenario/types.ts` | modify | G3.2 | Optional `weaponsVersion`. |
| `src/sim/types.ts` | modify | G3.2, G3.3 | New `RejectionCode` members. |
| `src/rules/ruleset.ts` | modify | G3.2 | `headHitShareBp`, `HEAD_HIT_SHARE_PROVENANCE`. |
| `src/sim/describe.ts` | modify | G3.2 | Shot text for body part and armor. |
| `tests/sim/weapons.test.ts` | new | G3.2 | Damage, armor, fire interval, determinism. |
| `tests/sim/support/weapon-fixtures.ts` | new | G3.2 | `TEST_WEAPONS` test table. |
| `src/sim/economy/buy.ts` | modify | G3.3 | `buyLoadoutItem`. |
| `src/sim/preround.ts` | modify | G3.3 | `LoadoutLine`, `loadout`, `applyPurchases`, signatures, texts. |
| `src/persistence/scenario-file.ts` | modify | G3.3 | Validate optional new keys. |
| `src/ui/orders/rejectionMessages.ts` | modify | G3.3 | Texts for new codes. |
| `tests/sim/preround.test.ts` | modify | G3.3 | Loadout tests; replace `loadoutFuture`. |
| `tests/sim/scenario-file.test.ts` | modify | G3.3 | New keys round-trip and rejects. |
| `tests/ui/replayFile.test.ts` | modify | G3.3 | Old `loadoutFuture` file parses. |
| `src/ui/orders/AttackerHud.tsx` | modify | G3.4 | Loadout row, weapon label, armor bar. |
| `src/ui/preround/planState.ts` | modify | G3.4 | `buildPreRoundPlan` loadout, `instanceToBody` copies. |
| `src/ui/App.tsx` | modify | G3.4 | Loadout state and handlers. |
| `src/ui/styles.css` | modify | G3.4 | Loadout row and armor bar styles. |
| `tests/ui/preround-ui.test.tsx` | modify | G3.4 | Shop interactions. |
| `docs/status/g3.md` | new | G3 close | Stage result, playtest steps and the exact text for PROJECT_STATUS.md / README.md / docs/playtest.md / docs/roadmap.md. The integrator applies that text at merge (docs/parallel-build-plan.md); this stage's branch never edits those shared docs. |

Not touched: `src/ui/live/replayFile.ts` (no version bump, no code change; tests only), `src/sim/fog.ts`, `tests/sim/characterization.test.ts`, `tests/fixtures/characterization/*`, ability resolvers, `src/tactics/`.

Parallel-work note: `src/sim/run.ts`, `src/sim/live-round.ts`, `src/sim/preround.ts`, `src/sim/types.ts` and `src/ui/App.tsx` are also touched by G2, G6, X1 and K-stages. G3's edits there are additive (new optional params, new fields, new union members), but they should not be merged in parallel with G6's `PreRoundPlan` change without a rebase.

## 9. Dependencies

- Must land first: the live engine (done). No other roadmap stage is required. G3 can run before or after G1, G2 and X1.
- Coordination: G6 owns `PreRoundPlan.side: Side`, `startLiveFromPreRound` accepting both plans, and replay v3. G3 adds `loadout` to the same type and keeps `side: "attack"`; whichever lands second carries the other's field. Replay v3 (G6) should simply keep the scenario keys G3 adds.
- Consumed names from the ownership contract: none required. G3 only produces names.
- Produced names consumed later: G5 consumes `WeaponTable`, `ArmorDefinition`, `ArmorState`, `AgentBody.weaponId`, `AgentBody.armor`, `LoadoutLine`, `buyLoadoutItem` for carry-over and credits; O2 may read `weaponId` on fogged enemies.

## 10. Risks

1. Fixture drift by accident: a required field or an always-present shot key would rewrite every characterization fixture. Mitigation: optional fields with conditional spread, and G3 forbids `VALSIM_UPDATE_FIXTURES=1`.
2. JSON and TS mirror diverge when the owner edits only the JSON. Mitigation: the drift test fails loudly with the differing path; Open question 2 offers a JSON import instead.
3. The shipped shop is nearly empty (Rifle A issued, no armor) until owner content lands, so the browser check proves layout, not gameplay. Mitigation: UI tests drive the shop with `TEST_WEAPONS`.
4. Parameter threading (`weapons` through `applyJob`, `drainJobsUntil`, `replayOrderLog`) is easy to miss on one path, causing replay to use the default table. Mitigation: test that replay of a round with a test table passes the same table and reproduces events; mismatch check on open.
5. Merge conflicts with G6 on `PreRoundPlan` and `App.tsx` pre-round state.
6. Armor not applying to ability damage may surprise players once real tiers exist. Mitigation: documented as design in the provenance table and the HUD tooltip; Open question 3.

## 11. Open questions

1. Should G3 ship any armor tier or a second weapon? Recommended: no. Ship Rifle A only; the owner authors further entries in `data/weapons.json` with sources, like G1 map content. If the owner wants a playable stand-in now, it must be named as a lab item (not a Valorant name), tagged `assumed` per field, with values the owner picks.
2. Mirror plus drift test, or import the JSON directly? Recommended: mirror plus drift test (matches the catalog pattern, no tsconfig `resolveJsonModule` change, keeps `src/sim` free of data IO). Revisit if G1 introduces JSON imports for maps, and then switch both together.
3. Does armor absorb ability damage? Recommended: not in G3 (keeps Breach and Brimstone numbers and fixtures untouched); add a single shared `applyDamageToBody` later when a source says which abilities armor blocks.
4. Should fog hide an enemy's armor or weapon? Recommended: keep both visible for parity with hp, which is already visible; O1 can redact later in the decide closure without engine changes.
5. Can an agent buy armor when wearing partial armor of the same tier? Recommended: yes (refill to capacity at full price) in G3; partial-armor carry-over and any discount is G5's call.
6. Should `EngageOrder.weaponId` in scripted scenarios be checked against the shooter's equipped weapon? Recommended: no for G3; the legacy `runScenario` path keeps the order as authoritative, and the live path always uses the equipped weapon.
