# Stage O2 plan: rule-based opponent with difficulty presets

Status: plan only. Nothing here is implemented. Nothing here has been run.
Baseline it builds on: HEAD 08d2dfb (coordinator record, 2026-11-20).

## 1. Goal and non-goals

Goal: replace `defenseHoldDecide` with a real defense opponent that a player can lose to. It is
ordinary TypeScript rules over O1 beliefs, exposed as a `LiveDecideFn` factory:

- `createOpponent(preset, setup): LiveDecideFn` in `src/tactics/opponent/` (new).
- Defense first. The bot:
  1. holds the angles assigned in its own defense `PreRoundPlan` (G6),
  2. rotates toward a site when the spike is seen or planted there (G2 `SpikeState`, G1 regions),
     or when enough enemies are believed to be on that site,
  3. retakes a planted site and defuses (G2 `{ kind: "defuse" }`),
  4. casts utility from the catalog (smoke, flash, molly, orbital) when a simple score passes a
     named ASSUMED threshold,
  5. falls back to hold when no rule fires.
- Two difficulty presets, `beginner` and `intermediate`, as named ASSUMED parameter sets.
- All bot commands reach the engine through the existing `runDecisions -> issueOrders` path, so
  every choice is in the order log and replay needs no bot code.
- An attack-side bot as a later sub-stage (O2.6), because it needs a small `src/sim` change.

Non-goals:

- No machine learning, no tree search, no lookahead simulation. Scoring is a weighted count over
  beliefs, evaluated once per decision.
- No aim changes. Hit chance is engine-owned (`RIFLE_A.hitChanceNearBp` / `hitChanceFarBp` in
  `src/sim/combat/assumed-rifle.ts` today, G3 weapons later). A preset never reads or changes it,
  and the bot never gets a hit bonus. Difficulty comes only from decision timing, utility use and
  rotate choices.
- No planner (O3), no reactive plan fallbacks (O4), no learning records (O5).
- No map content. Rotate and anchor rules read whatever regions the owner authors (G1); tests use
  a G1 test fixture map.
- No belief model. O1 owns `BeliefState` and `updateBeliefs`; O2 only reads them.

## 2. Current state (read for this plan)

- `src/sim/live-round.ts`
  - `export type LiveDecideFn = (side: Side, foggedWorld: World) => AgentCommand[]` (line 101).
    It gets no seed, no map id, no catalog. Anything else the bot needs must be captured in the
    closure at construction.
  - `AgentCommand` today: `hold`, `move-route { waypoints }`, `cast { abilityId, target,
    aimYawDeg?, chargeValue?, mapTarget? }`, `shoot { targetInstanceId }`. G2 adds `plant` and
    `defuse`, X1 adds `recall`.
  - `openLiveRound(..., { decide })` sets `enableDecide = decide !== undefined` and
    `nextDecisionAtMs = ruleset.decisionIntervalMs`.
  - `stepOnce` step f: after the result check, if `enableDecide && decide && newTime >=
    nextDecisionAtMs`, calls `runDecisions` once, then advances `nextDecisionAtMs` by
    `decisionIntervalMs` until it is past `newTime`.
  - `runDecisions` (line 500): side is hard-coded `"defense"`; builds `viewWorld(mapId, world,
    side)`, deep-copies agents, calls `decide`, drops `hold` commands for agents already holding,
    then calls `issueOrders(round, side, commands)` ONCE for the whole list. `issueOrders` rejects
    the whole batch if any command fails `validateCommand`, and logs the rejection.
  - `validateCommand`: casts go through `evaluateCast` (`src/sim/agents/cast.ts`) with the cast
    place `mapTarget ?? target`; `shoot` needs truth line of sight from the shooter.
  - `replayOrderLog` opens with no decide (`enableDecide = false`) and re-issues logged batches;
    a logged result mismatch is reported as divergence.
  - `viewLive(round, side)` returns a fogged copy.
  - Facing: there is no face command. `startSegment` sets `facingDeg = yawToward(from, target)`
    when a move segment starts; casts with `aimYawDeg` set facing in the resolvers.
- `src/sim/fog.ts` `viewWorld`: own agents in full, enemies only with line of sight from a living,
  non-blinded ally (walls + smokes), own devices plus enemy devices with `enemiesSeeRadius`, all
  smokes, own zones plus vision-blocking zones.
- `src/sim/rng.ts`: `forkSeed(rootSeed, label)`, `createStream(rootSeed, label)` (mulberry32),
  `resumeStream(state)`. `Rng.nextInt(bound)` is uniform in `[0, bound)`. Adding a new label does
  not change other streams.
- `src/tactics/defense-stub.ts`: `defenseHoldDecide` holds every living defender.
- `src/tactics/decision.ts`: `DecisionContext`, `BeliefSnapshot { visibleEnemyInstanceIds }`,
  `ActionIntent`. O1 fills `DecisionContext`; O2 does not edit this file.
- `src/sim/agents/catalog.ts`: `SHIPPED_CATALOG` = Brimstone, KAY/O, Jett, Cypher, Breach.
  Only Brimstone and Breach abilities are `implementation: "complete"`. KAY/O, Jett and Cypher
  abilities are `listed(...)` placeholders and `evaluateCast` rejects them
  (`ability-not-executable`).
- `src/sim/agents/abilities/brimstone.ts`: `STIM_BEACON_ID`, `INCENDIARY_ID` (capability
  `area-denial`), `ORBITAL_STRIKE_ID` (ultimate, `ultPointCost: 8`). `sky-smoke.ts`:
  `SKY_SMOKE_ID` (capability `smoke`, secondary-tagged radius and range).
- `src/sim/agents/abilities/breach.ts`: `AFTERSHOCK_ID` (area-denial), `FLASHPOINT_ID` (flash),
  `FAULT_LINE_ID`, `ROLLING_THUNDER_ID` (ultimate).
- `src/ui/App.tsx`: `goLive()` calls `startLiveFromPreRound(scenario, plan, SHIPPED_CATALOG,
  STANDARD_RULESET, { decide: defenseHoldDecide })`; `loadReplay()` replays the log then sets
  `liveRef.current.decide = defenseHoldDecide` and `enableDecide = true`. The setup drawer
  (`aside#setup-drawer`) holds `DraftPanel`, the starting-ult drill option, `AgentPanel`, the
  event log and file buttons.
- `src/ui/scenario/playableDrill.ts`: defense is Jett + KAY/O. Neither has a castable ability,
  so the utility rules can only be tested on fixture scenarios with a Brimstone or Breach
  defender (per-team uniqueness allows the same agent on both teams).
- `tests/architecture.test.ts`: bans `Math.random` in all of `src`; bans `react` and `ui`
  imports from `sim`, `tactics`, `learning`, `persistence`, `rules`; bans `sim -> tactics`.
  It also pins `PLANNED_EVALUATORS` / `IMPLEMENTED_EVALUATORS`; O2 implements no evaluator, so
  that part does not change.
- `tests/sim/support/live-harness.ts`: `mustOpenLive`, `mustIssue`, `advance`, `playAttack`,
  `agentIn`, `SLICE_MS`.

## 3. Design

### 3.1 Module layout

```
src/tactics/opponent/
  index.ts          createOpponent, re-exports
  types.ts          OpponentSetup, OpponentMemory, RuleOutput, OpponentTrace
  presets.ts        DifficultyPreset, BEGINNER, INTERMEDIATE, provenance
  thresholds.ts     named ASSUMED scoring thresholds (with Provenance)
  defense-plan.ts   buildDefensePlan -> PreRoundPlan (side "defense", G6)
  anchors.ts        anchor + facing route per defender from G1 regions
  rules/hold.ts     hold-assigned-angle rule and fallback hold
  rules/rotate.ts   rotate trigger and routes (G1 findPath)
  rules/retake.ts   retake, regroup and defuse (G2)
  rules/utility.ts  smoke / flash / molly / orbital scoring
  safety.ts         pre-validation so one bad command cannot sink the batch
```

`src/tactics` may import `src/sim` and `src/rules` (only `sim -> tactics` is banned). The bot
imports pure helpers only: `evaluateCast`, `getAgent`, `hasLineOfSight`, `distanceMm`, G1
`regionsAt` / `findPath` / `pointInPolygon`, `createStream`. It never imports `truthLiveWorld`,
`viewWorld`, `LiveRound` values, or `src/sim/combat/*`.

### 3.2 Public API

```ts
// src/tactics/opponent/types.ts
import type { Catalog } from "../../sim/agents/catalog.ts";
import type { MapDefinition } from "../../sim/map/drill-hall.ts";
import type { PreRoundPlan } from "../../sim/preround.ts";
import type { Ruleset } from "../../rules/ruleset.ts";
import type { Side } from "../../sim/types.ts";

export type OpponentSetup = {
  side: Side;                 // "defense" until O2.6
  seed: number;               // round seed (scenario.seed); forked, never used raw
  map: MapDefinition;         // with G1 regions
  catalog: Catalog;
  ruleset: Ruleset;
  plan: PreRoundPlan;         // the bot's own defense plan (G6), from buildDefensePlan
  onTrace?: (entry: OpponentTrace) => void; // tests and debug overlay only
};

export type OpponentTrace = {
  timeMs: number;
  instanceId: string;
  rule: "hold" | "angle" | "rotate" | "regroup" | "retake" | "defuse" | "utility" | "fallback";
  detail: string;
};
```

```ts
// src/tactics/opponent/index.ts
export function createOpponent(preset: DifficultyPreset, setup: OpponentSetup): LiveDecideFn;
export function buildDefensePlan(
  scenario: Scenario,
  map: MapDefinition,
  preset: DifficultyPreset,
): PreRoundPlan;
```

The brief writes `createOpponent(preset)`. The second argument is needed because
`LiveDecideFn` carries no seed, map or catalog. It is a plain data object, so a caller that
already has the scenario can build it in one line (`opponentSetupFor(scenario, plan, preset)`
helper in `index.ts`).

One opponent instance per round. The closure owns:

```ts
type OpponentMemory = {
  beliefs: BeliefState;                    // O1
  rng: Rng;                                // createStream(seed, `opponent:${side}`)
  mode: "hold" | "rotate" | "retake";
  targetSiteId: string | null;
  triggerSeenAtMs: number | null;          // first decide that saw the current trigger
  castsThisRound: number;
  lastCommandKey: Record<string, string>;  // per agent, to avoid re-issuing the same route
  pathCache: Map<string, Point[] | null>;  // key `${fromRegion}->${toRegion}`
};
```

Per call, `decide(side, fogged)`:

1. `memory.beliefs = updateBeliefs(memory.beliefs, fogged, fogged.timeMs)` (O1, by name).
2. Update `mode` / `targetSiteId` from beliefs (3.4).
3. For each own living agent in `instanceId` order, run rules in priority order and keep the
   first one that returns a command: `defuse` > `utility` > `retake/regroup` > `rotate` >
   `angle` > `fallback hold`. Agents with an active X1 channel (defusing) are skipped so the bot
   never cancels its own defuse.
4. `safety.ts` filters the list (3.7).
5. Return at most one command per agent. `runDecisions` drops redundant holds and logs the rest.

### 3.3 Hold assigned angles (defense plan, G6)

`buildDefensePlan` assigns each defender an anchor from the map:

- Candidate anchors: centroids of G1 regions with `kind: "callout"` and `side: "defense"`,
  grouped by the site region they lie nearest to. If a site has none, the site polygon
  centroid. On a map without G1 regions (today's `DRILL_HALL`), the `sites` rectangle centre.
- Defenders sorted by `instanceId`, sites sorted by `id`, assigned round-robin. No randomness,
  so the plan is a pure function of scenario + map.
- Facing trick (design): the engine has no face command, and `startSegment` sets facing along
  the segment being walked. The route ends `[..., stepBack, anchor]` where `stepBack` is
  `ANGLE_STEP_BACK_MM` behind the anchor on the line from the expected enemy approach (the
  nearest attack-spawn region centroid via `findPath`). The last segment therefore leaves the
  agent facing the approach. This affects flash look checks (`flashLookHalfAngleDeg`), so it is a
  real gameplay effect and is covered by a test.
- The plan has `buys: []` and no plan casts in O2.1. Buying utility is left at the scenario's
  starting charges.

The live `angle` rule: if an agent is in `mode: "hold"`, is not at its anchor (distance over
`ANCHOR_TOLERANCE_MM`) and has no standing route, re-issue the anchor route (from `findPath`).
This recovers agents pushed by Rolling Thunder knockback or blocked by walls.

### 3.4 Rotate, retake, defuse

Plan lock (G6 section 3.5): the engine drops only decided `hold` commands for a plan-locked defender. O2's rotate and retake commands are `move-route` (and `cast`), so they pass, are logged as `"live"`, and cancel that defender's remaining `at-waypoint` plan steps by the D4 rules. O2 therefore never needs an override flag, and its hold rule must not rely on `hold` reaching a planned defender.

Triggers read only fogged data: O1's `BeliefState` for enemies and the fogged `world.spike` for the spike.

- Enemy last-seen entries: O1's `BeliefEntry` (`instanceId`, `lastSeenAt: Point`, `lastSeenMs`), read through `viewBeliefs` so decay is O1's.
- Spike belief: O1 does not model the spike (it is planned before G2 exists). O2 owns a small `SpikeBelief` in `src/tactics/opponent/spike-belief.ts` (new): `{ kind: "unknown" } | { kind: "seen-carried" | "seen-dropped"; at: Point; seenAtMs: number } | { kind: "planted"; at: Point; plantedAtMs: number }`, updated each decide from the fogged `world.spike` that G2 exposes. If O1 later adds a spike belief, O2 switches to it and deletes this file.

Rules:

- Planted at site S (from `regionsAt(map, spike.at)` with `kind: "site"` or `"plant-zone"`):
  `mode = "retake"`, `targetSiteId = S`. Always, both presets.
- Spike seen (carried or dropped) inside or within `ROTATE_SPIKE_NEAR_MM` of site S, or at least
  `preset.rotateEnemyCount` distinct enemies with `lastSeenMs` within `ROTATE_MEMORY_MS` inside S:
  `mode = "rotate"`, `targetSiteId = S`.
- Reaction delay: when a trigger first appears, store `triggerSeenAtMs = fogged.timeMs`. Commands
  for the new mode are issued only at the first decide with
  `fogged.timeMs >= triggerSeenAtMs + preset.reactionDelayTicks x ruleset.decisionIntervalMs`.
  Measured in sim time, not call count, so it does not depend on step size.
- Rotate: defenders whose anchor site is not S route to S via `findPath` (cached). Defenders
  already anchored at S keep holding. If `findPath` returns null, the agent holds and the trace
  records `rotate: no path`.
- Retake: `preset.retakeRegroup` true -> each living defender first routes to the regroup point
  (centroid of the nearest non-site callout region to S on the defense side of `findPath`) and
  waits until at least `RETAKE_REGROUP_MIN_ALLIES` (capped at living count) are within
  `RETAKE_REGROUP_RADIUS_MM`, or until G2's remaining spike time is below
  `RETAKE_GO_ANYWAY_MS`. Then all route to the spike. `false` -> straight to the spike.
- Defuse: an agent G2 says is eligible to defuse (in range, alive, not already channelling)
  issues `{ kind: "defuse", instanceId }` if no enemy is currently visible in the fogged world,
  or if `preset.defuseUnderFire` is true. Only the agent nearest the spike (ties by
  `instanceId`) defuses; others hold near the spike.
- Defused or round over: no special handling; the engine ends the round.

### 3.5 Utility scoring

Candidates are generated in a fixed order: own agents by `instanceId`, abilities in catalog
order, targets from a fixed candidate list. Each candidate must have charges (or ult points for
ultimates), be `implementation: "complete"`, and pass `evaluateCast` from the caster's own
position. Radius and range come from the catalog fields (`radiusMm`, `maxRangeMm`); O2 never
copies or retags those numbers.

| Rule | Ability (capability) | Candidate targets | Score | Cast when |
| --- | --- | --- | --- | --- |
| smoke | `sky-smoke` (`smoke`) | midpoint between each believed enemy (age <= `SMOKE_BELIEF_MAX_AGE_MS`) and the nearest point on an ally's current route | number of believed enemy -> route sight lines that a hypothetical smoke at the target would block (`hasLineOfSight` with the smoke added) | mode is rotate or retake, score >= `SMOKE_MIN_LINES_CUT` |
| flash | `flashpoint` (`flash`) | believed enemy positions (age <= `FLASH_BELIEF_MAX_AGE_MS`) | believed enemies within catalog radius of the target | an ally is moving (rotate or retake), score >= `FLASH_MIN_TARGETS` |
| molly | `incendiary`, `aftershock` (`area-denial`) | believed enemy positions on the approach to the caster's site | believed enemies within catalog radius of the target | mode is hold, score >= `MOLLY_MIN_TARGETS` |
| orbital | `orbital-strike` (ultimate) | believed enemy positions, and the spike if planted | believed enemies within catalog radius | score >= `ORBITAL_MIN_TARGETS` |

Common gates, applied in this order (so the number of RNG draws depends only on fogged inputs):

1. score passes its threshold,
2. no own living agent within the ability's catalog radius of the target (no self-molly),
3. `castsThisRound < preset.maxUtilityCastsPerRound`,
4. one draw: `rng.nextInt(10000) < preset.utilityUseChanceBp`.

At most one utility cast per decide (the highest score; ties by the fixed candidate order). Stim
Beacon, Fault Line and Rolling Thunder are not used by the defense bot in O2; they are listed as
an open question.

### 3.6 Difficulty presets

```ts
// src/tactics/opponent/presets.ts
import type { Provenance } from "../../rules/provenance.ts";

export type DifficultyPresetId = "beginner" | "intermediate";

export type DifficultyPreset = {
  id: DifficultyPresetId;
  label: string;
  /** Decision ticks between first seeing a trigger and acting on it. */
  reactionDelayTicks: number;
  /** Chance, in basis points, that a cast that passed scoring is actually issued. */
  utilityUseChanceBp: number;
  maxUtilityCastsPerRound: number;
  /** Distinct enemies believed on a site before rotating without spike info. */
  rotateEnemyCount: number;
  retakeRegroup: boolean;
  defuseUnderFire: boolean;
  provenance: Provenance; // kind "assumed", source "stage-o2-plan"
};

export const BEGINNER_PRESET: DifficultyPreset;      // values in section 5
export const INTERMEDIATE_PRESET: DifficultyPreset;
export const DIFFICULTY_PRESETS: readonly DifficultyPreset[];
```

There is deliberately no aim, hit-chance, reaction-to-shoot or damage field. Auto-engage is
engine-owned (`scheduleFires`, `autoFireIntervalMs`) and applies to both sides equally.

### 3.7 Batch safety

`runDecisions` sends the bot's whole list as one `issueOrders` batch, and one bad command rejects
all of them. `safety.ts` therefore drops, before returning:

- casts that fail `evaluateCast` from the caster's fogged position (own agents are exact in the
  fogged world),
- casts with non-integer `target` / `mapTarget` / `aimYawDeg` (all bot points are rounded with
  `Math.round` before use),
- `move-route` with no waypoints or non-integer waypoints,
- any command for a dead agent,
- `shoot` entirely: O2 does not issue `shoot`; auto-engage already fires at the nearest visible
  enemy, and `shoot` validation needs shooter line of sight on truth.

A rejected defense batch is still deterministic and still replays (the log keeps the rejection
code), but tests assert there are none.

### 3.8 Performance

`decide` runs every `decisionIntervalMs` of sim time (500, assumed, `STANDARD_RULESET`), so a
full round is at most `roundDurationMs / decisionIntervalMs` calls (both values from the
ruleset, not restated here). Cost per call:

- one `updateBeliefs` (O1 budget),
- per agent: a constant number of `hasLineOfSight` checks for utility candidates, bounded by
  `UTILITY_MAX_CANDIDATES_PER_DECIDE`,
- `findPath` only on a mode change or anchor recovery, cached by region pair, bounded by
  `OPPONENT_MAX_PATHS_PER_DECIDE`.

CI asserts the deterministic counters (calls to `findPath` and `hasLineOfSight` through an
injected counter in tests), not wall time. Wall time is a browser check against
`OPPONENT_DECIDE_BUDGET_MS` (assumed) at 4x speed.

## 4. Determinism and fog implications

- Inputs: the fogged `World` passed to `decide`, plus the construction-time `OpponentSetup`
  (seed, map, catalog, ruleset, own plan). Nothing else. Beliefs live in the closure in
  `src/tactics`, never on `LiveRound` or `World`.
- Randomness: only `memory.rng = createStream(setup.seed, "opponent:defense")` (attack bot:
  `"opponent:attack"`). Forking a new label leaves `"combat"` and every other stream unchanged,
  so adding the bot does not change combat rolls for the same commands. `Math.random` stays
  banned by the architecture test.
- Draw order is fixed (3.5), and draws happen only after the score gate, so the draw count is a
  function of fogged inputs only.
- Iteration order: every loop sorts by `instanceId` / region `id` / catalog order. No `Map`
  iteration over insertion order of truth data; `pathCache` is only read by key.
- Replay: `replayOrderLog` runs with `enableDecide = false` and re-issues the logged defense
  batches, so a replay matches without constructing an opponent. The preset does not need to be
  in the replay for correctness.
- Continuing after `loadReplay`: `App.tsx` re-attaches a decide hook. A fresh opponent has empty
  beliefs and a fresh RNG, so play after the load point can differ from the original session.
  The log up to the load point is still exact. This is accepted and noted in the UI message.
- Fog: the bot never sees truth. A hidden enemy can only enter beliefs through O1 from the
  fogged view. The spike enters beliefs only as G2's fog rule exposes it (whether a plant is
  known without line of sight is a G2 decision; O2 reads whatever O1 records).
- Facing trick: the angle route changes `facingDeg` through ordinary moves, which are logged,
  so it replays.

## 5. Provenance and unknowns

All bot parameters are design choices for a lab opponent, not Valorant values. Every one is
`kind: "assumed"`, `source: "stage-o2-plan"`, in `src/tactics/opponent/presets.ts` or
`thresholds.ts` (the owning module; they are not game rules, so they do not go in
`src/rules/ruleset.ts`). Proposed starting values are given so the presets differ; playtests
tune them.

| Value | Tag | Named constant | How to confirm |
| --- | --- | --- | --- |
| Decision cadence 500 ms | assumed (existing, `DECISION_INTERVAL_MS_PROVENANCE`) | `decisionIntervalMs` | unchanged; owned by ruleset |
| Hit chance near / far | assumed (existing, `RIFLE_A`) | not touched by O2 | engine-owned, G3 later |
| Ability radius / range / charges | secondary (existing catalog tags) | read from catalog | unchanged; O2 does not retag |
| Orbital ult cost 8 | as tagged in `brimstone.ts` | read via `ultPointCost` | unchanged |
| Beginner reaction delay, proposed 3 ticks | assumed (design) | `BEGINNER_REACTION_DELAY_TICKS` | playtest: rotate feels late but not absent |
| Intermediate reaction delay, proposed 1 tick | assumed (design) | `INTERMEDIATE_REACTION_DELAY_TICKS` | playtest |
| Beginner utility use chance, proposed 3000 bp | assumed (design) | `BEGINNER_UTILITY_USE_CHANCE_BP` | playtest |
| Intermediate utility use chance, proposed 8000 bp | assumed (design) | `INTERMEDIATE_UTILITY_USE_CHANCE_BP` | playtest |
| Max casts per round, proposed 1 / 3 | assumed (design) | `BEGINNER_MAX_UTILITY_CASTS`, `INTERMEDIATE_MAX_UTILITY_CASTS` | playtest |
| Rotate enemy count, proposed 3 / 2 | assumed (design) | `BEGINNER_ROTATE_ENEMY_COUNT`, `INTERMEDIATE_ROTATE_ENEMY_COUNT` | playtest on a two-site fixture |
| Retake regroup false / true | assumed (design) | preset field | playtest |
| Defuse under fire true / false | assumed (design) | preset field | playtest |
| Rotate memory window | assumed, value TBD in O2.2 | `ROTATE_MEMORY_MS` | must not exceed O1's last-seen decay; check against O1 constant |
| Spike near distance | assumed, TBD | `ROTATE_SPIKE_NEAR_MM` | fixture map test |
| Anchor tolerance | assumed, TBD | `ANCHOR_TOLERANCE_MM` | must exceed knockback-free walk jitter; unit test |
| Angle step-back length | assumed, TBD | `ANGLE_STEP_BACK_MM` | test that facing points at approach |
| Regroup radius / min allies | assumed, TBD | `RETAKE_REGROUP_RADIUS_MM`, `RETAKE_REGROUP_MIN_ALLIES` | playtest |
| Go-anyway time | assumed, TBD | `RETAKE_GO_ANYWAY_MS` | depends on G2 defuse duration constant |
| Smoke / flash belief max age | assumed, TBD | `SMOKE_BELIEF_MAX_AGE_MS`, `FLASH_BELIEF_MAX_AGE_MS` | playtest |
| Utility score thresholds | assumed, proposed 1 line cut / 1 / 2 / 2 targets | `SMOKE_MIN_LINES_CUT`, `FLASH_MIN_TARGETS`, `MOLLY_MIN_TARGETS`, `ORBITAL_MIN_TARGETS` | playtest |
| Candidate / path caps | assumed (perf design), TBD | `UTILITY_MAX_CANDIDATES_PER_DECIDE`, `OPPONENT_MAX_PATHS_PER_DECIDE` | counter test |
| Decide wall-time budget | assumed (perf design), TBD | `OPPONENT_DECIDE_BUDGET_MS` | browser performance panel |

"TBD" values are picked in the sub-stage that introduces them and land with an assumed tag in
the same commit; none is presented as measured.

## 6. Staged delivery

Every sub-stage ends with `npm run check` (lint, typecheck, test, build) and a browser check at
1366x768. Test files are new unless marked.

### O2.1 Skeleton, presets, defense plan, hold angles

Depends on O1 (types), G6, G1 (regions; falls back to `sites` if absent).

- `presets.ts`, `thresholds.ts`, `types.ts`, `index.ts`, `defense-plan.ts`, `anchors.ts`,
  `rules/hold.ts`, `safety.ts`.
- Acceptance (`tests/tactics/opponent-hold.test.ts`):
  - `buildDefensePlan` returns `side: "defense"`, one route per defender, and is equal across
    two calls (pure).
  - after `startLiveFromPreRound(scenario, { defense: plan })` (G6) and stepping, each defender
    stands within `ANCHOR_TOLERANCE_MM` of its anchor and its `facingDeg` points at the
    approach within one degree of `yawToward(anchor, approach)`.
  - a defender knocked off its anchor is re-routed back on the next eligible decide.
  - with no triggers, the bot emits only holds after arrival (log shows no defense entries after
    arrival, because `runDecisions` drops redundant holds).
- Acceptance (`tests/tactics/opponent-presets.test.ts`): every preset field has a provenance
  with `kind: "assumed"`; the preset type has no field whose name contains `aim`, `hit` or
  `damage`.
- Acceptance (`tests/architecture.test.ts`, modify): files under `src/tactics/opponent/` do not
  import `truthLiveWorld`, `viewWorld`, or anything under `src/sim/combat/`.
- Browser: not wired to UI yet; existing hold stub unchanged.

### O2.2 Rotate, retake, defuse

Depends on G2 (spike, defuse, fogged spike), X1 (channel on body), G1 (`findPath`,
`regionsAt`, two-site test fixture).

- `rules/rotate.ts`, `rules/retake.ts`.
- Acceptance (`tests/tactics/opponent-rotate.test.ts`, on the G1 two-site fixture map):
  - scripted attackers walk visibly onto site B: off-site defenders issue `move-route` toward B
    at exactly `triggerSeenAtMs + reactionDelayTicks x decisionIntervalMs` (checked against the
    order log `simTimeMs`).
  - spike planted on B: all defenders route to the spike; the nearest one issues `defuse` once
    in range with no enemy visible; the round ends `spike-defused` (G2) in a fixture where
    attackers are already dead.
  - `retakeRegroup: true` waits at the regroup point until the ally count is met;
    `false` goes straight.
  - a channelling defuser receives no command until its channel ends.
  - `findPath` null -> hold plus trace `rotate: no path`.

### O2.3 Utility rules

- `rules/utility.ts`, RNG stream wiring.
- Acceptance (`tests/tactics/opponent-utility.test.ts`, fixture defense with Brimstone and
  Breach):
  - each of smoke, flash, molly, orbital fires in a hand-built belief situation that passes its
    threshold, and does not fire one step below it.
  - no cast lands with an own agent inside the ability radius.
  - `castsThisRound` never exceeds the preset cap.
  - Jett / KAY/O defenders (placeholder abilities) never emit a cast.
  - with `utilityUseChanceBp` forced to 0 and 10000 in a test preset, casts are 0 and every
    eligible opportunity respectively.
  - no defense batch in the log has a result other than `accepted`.

### O2.4 Determinism, fog-only inputs, preset differences

- `tests/tactics/opponent-determinism.test.ts`:
  - for a fixed list of seeds, bot vs a scripted attack (fixed `playAttack` batches) run twice
    gives identical `orderLog` and identical final `truthLiveWorld`.
  - `replayOrderLog(scenario, log, endMs)` with no decide reproduces the same final world and
    result for every seed.
  - adding the bot does not change the `"combat"` stream: a fixture where attack commands are
    identical and defense commands are identical by construction yields identical combat
    events whether the commands came from the bot or were issued by hand.
- `tests/tactics/opponent-fog.test.ts`:
  - two scenarios that differ only in a hidden enemy's position (never in line of sight before
    time T) give identical defense log entries before T.
  - the decide input is deep-frozen in the test wrapper; the bot does not throw (it never
    mutates its input).
  - beliefs are fed only from the argument: a spy `updateBeliefs` (O1) receives the same object
    the hook received.
- `tests/tactics/opponent-presets.test.ts` (extend): over the seed list on the same scripted
  attack, intermediate's first rotate command is earlier than beginner's by exactly
  `(BEGINNER_REACTION_DELAY_TICKS - INTERMEDIATE_REACTION_DELAY_TICKS) x decisionIntervalMs`,
  and intermediate's total utility casts are greater than or equal to beginner's on every seed,
  and strictly greater on at least one.
- Perf counters (`tests/tactics/opponent-perf.test.ts`): a full-length round makes at most
  `roundDurationMs / decisionIntervalMs` decide calls, at most `OPPONENT_MAX_PATHS_PER_DECIDE`
  path searches per call and at most `UTILITY_MAX_CANDIDATES_PER_DECIDE` utility candidates per
  call.

### O2.5 UI: difficulty picker

- `src/ui/setup/DifficultyPicker.tsx` (new) in the setup drawer; `App.tsx` builds the defense
  plan and opponent in `goLive()` and `loadReplay()`.
- Acceptance (`tests/ui/difficulty-picker.test.tsx`): the picker renders three options
  (Hold, Beginner, Intermediate); choosing one during pre-round and pressing Go opens a round
  whose `decide` is not `defenseHoldDecide`; the control is disabled while live; the HUD
  status shows the chosen label. `tests/ui/round-play.test.tsx` (modify only if its default
  changes): default stays Hold so existing tests keep their logs.
- Browser at 1366x768: open Setup, pick Intermediate, close, Go, play to a rotate; no document
  scroll; drawer content fits.

### O2.6 (later) Attack-side bot

- Needs `runDecisions` to call decide for a side other than defense. Proposed minimal sim change:
  `OpenLiveOptions` gains `decideSides?: readonly Side[]` (default `["defense"]`), and
  `runDecisions` loops sides in fixed order `attack, defense`, one `issueOrders` per side.
  This name is not in the ownership contract; it needs coordinator sign-off.
- Rules: default plant site from the attack plan, walk, plant (G2 `plant`), post-plant hold.
  Own plan via G6 `startLiveFromPreRound({ attack, defense })`.
- Acceptance: bot vs bot over the seed list is deterministic and replays; existing
  `tests/sim/live-round.test.ts` "live opponent cadence" still passes unchanged (defense-only
  default).

## 7. UI impact

- Picker: a labelled select "Opponent" with Hold (current stub), Beginner, Intermediate, in the
  setup drawer directly under the starting-ult drill option. Clicks: Setup (1) + choose (1) = 2.
  Keyboard: tab + arrows, no new hotkey.
- Applies at Go. During live it is disabled with a one-line note "Changes apply next round."
  This avoids swapping a stateful opponent mid-round.
- Preview: none needed. The HUD status line shows "Opponent: Intermediate" (one short span in
  the existing status area, no new row).
- Load replay: the opponent is rebuilt from the picker's current choice; the file message says
  play after the load point is new.
- One-screen rule: the drawer is the existing overlay; one extra row. No document scroll at
  1366x768 is checked in the O2.5 browser pass. The board is unchanged.
- Debug: `onTrace` can feed the existing event log in a later pass; not in O2.5.

## 8. Files touched

> Build protocol (consistency pass): this stage is built under [`parallel-build-plan.md`](parallel-build-plan.md). Edits listed here to `src/ui/App.tsx`, `src/ui/styles.css`, `rejectionMessages.ts`, `describe.ts` and the shared docs are integration-file edits: the stage's UI lives in its own component files (with their own CSS), and the App mount lines, message entries and doc text are applied at merge. After H0, engine edits go into the split modules and this stage's reserved slots.

| File | new / modify | Sub-stage |
| --- | --- | --- |
| `src/tactics/opponent/index.ts` | new | O2.1 |
| `src/tactics/opponent/types.ts` | new | O2.1 |
| `src/tactics/opponent/presets.ts` | new | O2.1 |
| `src/tactics/opponent/thresholds.ts` | new | O2.1 (grows O2.2-O2.3) |
| `src/tactics/opponent/defense-plan.ts` | new | O2.1 |
| `src/tactics/opponent/anchors.ts` | new | O2.1 |
| `src/tactics/opponent/safety.ts` | new | O2.1 |
| `src/tactics/opponent/spike-belief.ts` | new | O2.2 |
| `src/tactics/opponent/rules/hold.ts` | new | O2.1 |
| `src/tactics/opponent/rules/rotate.ts` | new | O2.2 |
| `src/tactics/opponent/rules/retake.ts` | new | O2.2 |
| `src/tactics/opponent/rules/utility.ts` | new | O2.3 |
| `tests/tactics/support/opponent-fixtures.ts` | new | O2.1 |
| `tests/tactics/opponent-hold.test.ts` | new | O2.1 |
| `tests/tactics/opponent-presets.test.ts` | new | O2.1, O2.4 |
| `tests/tactics/opponent-rotate.test.ts` | new | O2.2 |
| `tests/tactics/opponent-utility.test.ts` | new | O2.3 |
| `tests/tactics/opponent-determinism.test.ts` | new | O2.4 |
| `tests/tactics/opponent-fog.test.ts` | new | O2.4 |
| `tests/tactics/opponent-perf.test.ts` | new | O2.4 |
| `tests/architecture.test.ts` | modify (opponent import ban only; evaluator lists unchanged) | O2.1 |
| `src/ui/setup/DifficultyPicker.tsx` | new | O2.5 |
| `src/ui/App.tsx` | modify (`goLive`, `loadReplay`, drawer, status span) | O2.5 |
| `src/ui/styles.css` | modify (picker row) | O2.5 |
| `tests/ui/difficulty-picker.test.tsx` | new | O2.5 |
| `src/sim/live-round.ts` | modify (`decideSides`, `runDecisions` loop) | O2.6 only |
| `src/tactics/opponent/attack/*.ts` | new | O2.6 only |
| `tests/tactics/opponent-attack.test.ts` | new | O2.6 only |
| `docs/status/o2.md` | new | Stage result, playtest steps and the exact text for PROJECT_STATUS.md / README.md / docs/playtest.md / docs/roadmap.md. The integrator applies that text at merge (docs/parallel-build-plan.md); this stage's branch never edits those shared docs. |

Not touched: `src/tactics/decision.ts` and `src/tactics/beliefs.ts` (O1), `src/tactics/
defense-stub.ts` (kept as the Hold option), `src/sim/fog.ts`, `src/sim/preround.ts` (G6),
`src/ui/live/replayFile.ts` (G6 owns replay v3; see open question 3), `src/rules/ruleset.ts`.
`tests/tactics/` is new; `vite.config.ts` already includes `tests/**/*.test.ts(x)`.

## 9. Dependencies

Must land first:

- O1 Beliefs (names as in `docs/stage-o1-plan.md`): `BeliefState`, `BeliefEntry`
  (`lastSeenAt`, `lastSeenMs`), `emptyBeliefs(side)`, `updateBeliefs(prev, fogged, timeMs)`,
  `viewBeliefs`, and the `createBeliefDecide` closure pattern. O2 does not redefine them. The
  spike belief is O2's own (`SpikeBelief`, section 3.4).
- G1: `MapRegion` (`kind`, `side`, `polygon`), `regionsAt`, `pointInPolygon`, `findPath`, and a
  two-site test fixture map.
- G2: `SpikeState` / `world.spike` as seen in the fogged world, `{ kind: "defuse" }`, defuse
  eligibility (range) and remaining-time info, `RoundResult` `spike-defused`.
- X1: `ChannelState` on the agent body (to skip a channelling defuser).
- G6: `PreRoundPlan.side: Side`, `startLiveFromPreRound` with `{ attack?, defense? }`.

Consumed from today's code: `LiveDecideFn`, `AgentCommand`, `issueOrders` (via `runDecisions`),
`replayOrderLog`, `evaluateCast`, `getAgent`, `hasLineOfSight`, `distanceMm`, `createStream`,
`STANDARD_RULESET.decisionIntervalMs`.

O2.1 can start against O1 and G6 types alone; O2.2 needs G1, G2, X1 merged.

## 10. Risks

1. Whole-batch rejection: one invalid bot command throws away the bot's whole tick. Mitigated
   by `safety.ts` and the "all defense batches accepted" assertion.
2. Fog leaks through helpers: a convenience import of truth (`truthLiveWorld`, `round.world`)
   would make the bot cheat silently. Mitigated by the architecture import ban and the
   hidden-enemy fog test.
3. Upstream drift: O1, G2 and G1 are planned in parallel; field names may change. O2 isolates
   them behind small readers in `rules/*` so a rename touches one file.
4. Single-site drill: on `DRILL_HALL` (one site) rotate does nothing interesting; the shipped
   playable drill also has no castable defense utility. Players may see little change until the
   owner authors a two-site map and the drill gets a Brimstone or Breach defender.
5. Facing trick depends on `startSegment` setting facing from the last segment. If the engine
   later adds a face command or changes facing rules, anchors.ts must follow.
6. Preset tuning is unmeasured; "beginner" may be too strong or too weak. Values are assumed
   and the playtest doc should record findings before any are changed.

## 11. Open questions

1. Should `createOpponent` keep the brief's one-argument shape? Recommended: no; take
   `(preset, setup)` because `LiveDecideFn` carries no seed or map, and add
   `opponentSetupFor(...)` for one-line use.
2. Should bot batches get their own `OrderOrigin` (for example `"opponent"`) or a rule message
   in the log? Recommended: not in O2. Keep `"live"` so `src/sim` is untouched; use `onTrace`
   for debugging. Revisit with O3.
3. Should the replay file record the preset id? Recommended: yes, as an optional
   `opponentPresetId` label inside G6's replay v3 (G6 owns the version bump); replay
   correctness does not depend on it.
4. Should Stim Beacon, Fault Line and Rolling Thunder be used by the defense bot? Recommended:
   not in O2; add them in O3 once plans can express "use stim before a retake".
5. Should the bot use `shoot` to focus targets? Recommended: no; auto-engage is symmetric for
   both sides, and `shoot` validation uses truth line of sight that the bot cannot pre-check
   from fog alone.
6. Should the default opponent in the UI change from Hold to Beginner? Recommended: yes, but
   only after O2.4 lands and a playtest note confirms Beginner is beatable; keep Hold as the
   default in O2.5 so existing UI test logs stay stable.
