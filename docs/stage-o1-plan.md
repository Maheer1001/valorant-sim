# Stage O1 plan: Beliefs

Status: plan only. Nothing here has been implemented or checked. Acceptance criteria describe what WILL be checked by `npm run check` and in the browser.

Baseline this plan builds on: HEAD 08d2dfb (coordinator record: 25 test files, 156 tests, check green).

## 1. Goal and non-goals

Goal: give each side a deterministic memory of the enemy that is built only from fogged views, so the O2 opponent can reason about enemies it saw earlier and cannot see now.

- New module `src/tactics/beliefs.ts` with `BeliefState` and `updateBeliefs(prev, fogged: World, timeMs)`.
- Last-seen enemy positions that age and are forgotten after a named ASSUMED time.
- An uncertainty radius that grows with time since last sight, at the ruleset walk speed.
- Sight limits come only from the existing fog filter `viewWorld` in `src/sim/fog.ts` (walls, smokes, blind status). O1 adds no line-of-sight code of its own.
- An optional reveal input type so K4 (Sova `info.reveal`) can feed beliefs later. Not required now and not wired now.
- `DecisionContext` / `BeliefSnapshot` in `src/tactics/decision.ts` filled from `BeliefState`; `DECISION_CONTEXT_VERSION` bumped from 1 to 2.
- A stateful decide closure (`createBeliefDecide`) that wraps any belief-aware policy as a plain `LiveDecideFn`, plus `rebuildBeliefs` so a resumed run has identical beliefs.
- A "no truth leak" property-style test across seeds.
- A debug overlay that shows attacker beliefs, reached through the existing truth toggle.

Non-goals:

- No opponent behaviour. The defense policy stays `defenseHoldDecide` (hold everything). O2 owns rules over beliefs (`createOpponent(preset)`).
- No `src/sim` dependency on `src/tactics`. No belief data stored on `LiveRound` or `World`.
- No negative information ("I looked at the last-seen spot and nobody is there"). See open question 2.
- No kill feed. A fogged `World` does not carry enemy deaths; see risk 4 and open question 3.
- No sound, footsteps, or utility-based inference.
- No change to the replay file format.

## 2. Current state

Files and functions read for this plan:

- `src/tactics/decision.ts`: types only. `DECISION_CONTEXT_VERSION = 1`, `BeliefSnapshot = { visibleEnemyInstanceIds: readonly string[] }`, `DecisionContext = { version; timeMs; selfInstanceId; rulesetId; catalogVersion; beliefs }`, `ActionIntent`. Nothing builds or reads a `DecisionContext` today. The header comment explains why `LiveDecideFn` lives in `src/sim/live-round.ts`.
- `src/tactics/defense-stub.ts`: `defenseHoldDecide(side, fogged)` returns a `hold` for every living defender in the fogged world. Stateless.
- `src/sim/fog.ts`: `viewWorld(mapId, world, side)` keeps all own agents, keeps an enemy only when it is alive and some own agent is alive, not `STATUS_BLIND`, and has `hasLineOfSight` (walls from `getMap(mapId)`, `world.smokes`, `world.timeMs`). Devices are filtered by `side` or `enemiesSeeRadius`; zones by `side` or `blocksVision`. Agent objects are shared with truth (not cloned).
- `src/sim/live-round.ts`:
  - `LiveDecideFn = (side: Side, foggedWorld: World) => AgentCommand[]` (line 101).
  - `LiveRound` carries `nextDecisionAtMs`, `decide?`, `enableDecide`.
  - `openLiveRound(scenario, catalog, ruleset, { decide })` sets `nextDecisionAtMs = ruleset.decisionIntervalMs` and `enableDecide = decide !== undefined`.
  - `stepOnce` step f: after time commit and result check, `if (round.enableDecide && round.decide && newTime >= round.nextDecisionAtMs)` it calls `runDecisions` and then advances `nextDecisionAtMs` by `decisionIntervalMs` until it is past `newTime`. The decide hook is not called on the step that ends the round.
  - `runDecisions(round, decide)`: side is hard-coded `"defense"`; builds `viewWorld(...)`, deep-copies `agents`, calls `decide`, drops `hold` commands for agents already holding, sends the rest through `issueOrders` (so they are logged).
  - `replayOrderLog(scenario, log, untilMs, catalog, ruleset)`: opens a round without `decide`, sets `enableDecide = false`, steps one step at a time up to each entry's `simTimeMs`, re-issues logged commands, then steps to `untilMs`.
  - `viewLive(round, side)`: `viewWorld` plus a deep copy of agents. `truthLiveWorld(round)`: deep copy of truth.
- `src/sim/run.ts`: `World = { timeMs; agents: AgentBody[]; smokes; devices; zones }`; `AgentBody` has `instanceId`, `definitionId`, `side`, `xMm`, `yMm`, `hp`, `alive`, `facingDeg`, `statuses`, and economy and ability fields.
- `src/rules/ruleset.ts`: `simStepMs` 50 (assumed), `decisionIntervalMs` 500 (assumed, `DECISION_INTERVAL_MS_PROVENANCE`), `walkSpeedMmPerSec` 3500 (assumed, `WALK_SPEED_PROVENANCE`).
- `src/rules/provenance.ts`: `Provenance = { kind; source; note }`, kinds verified | secondary | assumed | owner.
- `src/sim/rng.ts`: `createStream(rootSeed, label)`, `forkSeed`, `resumeStream` (mulberry32). Usable by tests for seeded scenario generation.
- `tests/sim/live-round.test.ts`: "live round determinism" (replay twice and `runInChunks` with chunk 1, 7, 40 all deep-equal on `truthLiveWorld` and `events`); "live opponent cadence" (bot sees only fogged data, Jett behind the wall at y=2000 never sees Brimstone; bot commands are logged). Helpers `mustReplay`, `buildHoldLog`, `runInChunks` are file-local.
- `tests/sim/support/live-harness.ts`: `mustOpenLive`, `mustIssue`, `advance`, `agentIn`, `SLICE_MS`.
- `tests/architecture.test.ts`: pins `DECISION_CONTEXT_VERSION` to 1; forbids `src/sim` importing `tactics`, `learning`, `persistence`; forbids `Math.random` everywhere in `src`.
- `src/ui/App.tsx`: `showTruth` state (line 127); `boardWorld` is `live.world` when truth is on, else `viewLive(live, "attack")` (line 418); the toggle button (line 985) reads "Showing truth" / "Showing attack view". Live rounds open with `decide: defenseHoldDecide` (line 223); replay load sets `liveRef.current.decide = defenseHoldDecide` and `enableDecide = true` (line 903-904). The rAF host loop calls `stepLive(round, out.steps)` once per frame (line 285).
- `src/ui/board/MapView.tsx`: `MapView({ map, world, selectedInstanceIds, previewPrimitives, agentDisplay, ... })` draws smokes, zones, devices, agents.

Existing gap found while reading (relevant to determinism, section 4): `replayOrderLog` sets `enableDecide = false`, and step f only advances `nextDecisionAtMs` inside the `enableDecide` branch. A replayed round therefore still has `nextDecisionAtMs = 500` at any `untilMs`. When App re-enables decide after loading a replay, the first decision fires on the very next step (`untilMs + 50`), not on the 500 ms grid the original run used. Any stateful or time-sensitive bot would diverge from the original run. O1 fixes this (sub-stage O1.3).

## 3. Design

### 3.1 Belief types (`src/tactics/beliefs.ts`, new)

```ts
import type { Provenance } from "../rules/provenance.ts";
import type { World } from "../sim/run.ts";
import type { Point, Side } from "../sim/types.ts";

export const BELIEF_STATE_VERSION = 1;

/** How a belief entry was last refreshed. "reveal" is reserved for K4. */
export type BeliefSource = "sight" | "reveal";

export type BeliefEntry = {
  instanceId: string;
  definitionId: string;
  lastSeenAt: Point;        // copied from the fogged agent at lastSeenMs
  lastSeenMs: number;
  firstSeenMs: number;
  lastSeenHp: number;       // as shown in the fogged view
  source: BeliefSource;
};

export type BeliefState = {
  version: typeof BELIEF_STATE_VERSION;
  side: Side;               // the side that holds these beliefs
  timeMs: number;           // time of the last update
  /** Enemies visible in the most recent update (sorted). */
  visibleEnemyIds: readonly string[];
  /** Sorted by instanceId so deep-equality and iteration order are stable. */
  entries: readonly BeliefEntry[];
};

/** Optional extra input. K4 adapts its reveal state into this shape later. */
export type BeliefRevealInput = {
  instanceId: string;
  definitionId: string;
  at: Point;
  timeMs: number;
};

export type BeliefUpdateExtras = {
  reveals?: readonly BeliefRevealInput[];
};

export type BeliefParams = {
  forgetAfterMs: number;            // BELIEF_FORGET_AFTER_MS
  spreadSpeedMmPerSec: number;      // ruleset.walkSpeedMmPerSec
};

export function emptyBeliefs(side: Side, timeMs?: number): BeliefState;

export function updateBeliefs(
  prev: BeliefState,
  fogged: World,
  timeMs: number,
  params?: BeliefParams,
  extras?: BeliefUpdateExtras,
): BeliefState;

/** Derived, not stored: age, radius and confidence at a query time. */
export type BeliefView = BeliefEntry & {
  ageMs: number;
  uncertaintyRadiusMm: number;
  confidenceBp: number;   // 0..10000 basis points
  visibleNow: boolean;
};

export function viewBeliefs(state: BeliefState, atMs: number, params?: BeliefParams): BeliefView[];
```

`updateBeliefs` rules (pure, returns a new object, never mutates `prev` or `fogged`):

1. Guards: throw if `timeMs !== fogged.timeMs` (the extra argument exists for the brief's signature and to catch misuse) or if `timeMs < prev.timeMs`.
2. Enemies are `fogged.agents.filter(a => a.side !== prev.side)`. Own agents are ignored. Because `viewWorld` only keeps alive, sighted enemies, every enemy here is a real sighting at `timeMs`.
3. For each such enemy: replace or create the entry with `lastSeenAt = { xMm, yMm }`, `lastSeenMs = timeMs`, `lastSeenHp = hp`, `source = "sight"`, `definitionId`; keep the old `firstSeenMs` when an entry existed.
4. For each reveal in `extras.reveals` with `reveal.timeMs <= timeMs` and newer than the entry: same refresh with `source = "reveal"` and `lastSeenMs = reveal.timeMs`. A sighting at the same time wins over a reveal.
5. Entries not refreshed keep their old values (that is the "last seen" memory).
6. Drop entries with `timeMs - lastSeenMs >= params.forgetAfterMs` (decay to forgotten).
7. `visibleEnemyIds` = sorted ids from rule 2. `entries` sorted by `instanceId`.

Derived values in `viewBeliefs` (integer math only, so results are identical on every platform):

```ts
ageMs = atMs - entry.lastSeenMs;
uncertaintyRadiusMm = Math.floor((ageMs * params.spreadSpeedMmPerSec) / 1000);
confidenceBp = Math.max(0, 10000 - Math.floor((ageMs * 10000) / params.forgetAfterMs));
```

The radius is the farthest the enemy could have walked since last sight at the ruleset walk speed. It is not clamped to the map in O1 (the map is small and the entry is forgotten anyway); O2 may clip it with G1 regions. Smokes and walls are not re-checked here: `viewWorld` already decided what was seen.

Named constants (owned by this module, `kind: "assumed"`):

```ts
export const BELIEF_FORGET_AFTER_MS = 10_000;
export const BELIEF_FORGET_AFTER_MS_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "stage-o1-plan",
  note: "Placeholder memory span for the lab opponent. Not a Valorant value; owner to tune with O2.",
};
export const DEFAULT_BELIEF_PARAMS: BeliefParams; // { forgetAfterMs: BELIEF_FORGET_AFTER_MS, spreadSpeedMmPerSec: STANDARD_RULESET.walkSpeedMmPerSec }
```

The spread speed is not a new number: it reuses `walkSpeedMmPerSec` and keeps its existing `assumed` tag. `createBeliefDecide` takes the active `Ruleset` so a non-standard ruleset spreads at its own walk speed.

### 3.2 DecisionContext v2 (`src/tactics/decision.ts`, modify)

```ts
export const DECISION_CONTEXT_VERSION = 2;

export type BeliefSnapshot = {
  visibleEnemyInstanceIds: readonly string[];   // kept from v1
  enemies: readonly BeliefView[];               // new in v2, sorted by instanceId
};

export type DecisionContext = {
  version: typeof DECISION_CONTEXT_VERSION;
  timeMs: number;
  selfInstanceId: string;
  rulesetId: string;
  catalogVersion: string;
  beliefs: BeliefSnapshot;
};

export function toBeliefSnapshot(state: BeliefState, atMs: number, params?: BeliefParams): BeliefSnapshot;

export function buildDecisionContext(
  state: BeliefState,
  selfInstanceId: string,
  meta: { rulesetId: string; catalogVersion: string },
  params?: BeliefParams,
): DecisionContext;
```

`decision.ts` imports types and `viewBeliefs` from `beliefs.ts`; `beliefs.ts` does not import `decision.ts` (no cycle). The header comment is updated: `DecisionContext` is now built per agent from `BeliefState` inside the decide closure. `tests/architecture.test.ts` changes `expect(DECISION_CONTEXT_VERSION).toBe(1)` to `.toBe(2)`.

### 3.3 Decide hook: two options

Constraint: `src/sim` never imports `src/tactics`, and `LiveDecideFn` receives only `(side, foggedWorld)`. Beliefs need memory across calls, so either the closure holds it or the signature carries it.

Option A: stateful closure (no signature change).

```ts
// src/tactics/belief-decide.ts (new)
export type BeliefPolicy = (side: Side, fogged: World, beliefs: BeliefState) => AgentCommand[];

export type BeliefDecideHandle = {
  decide: LiveDecideFn;                  // pass to openLiveRound / startLiveFromPreRound
  beliefs(): BeliefState;                // read-only snapshot for UI and tests
  reset(state: BeliefState): void;       // used after rebuildBeliefs on resume
};

export function createBeliefDecide(
  side: Side,
  policy: BeliefPolicy,
  ruleset: Ruleset,
  params?: BeliefParams,
): BeliefDecideHandle;

/** Recompute beliefs for `side` at `untilMs` from scenario + order log, on the decision grid. */
export function rebuildBeliefs(
  scenario: Scenario,
  log: readonly OrderLogEntry[],
  untilMs: number,
  side: Side,
  catalog?: Catalog,
  ruleset?: Ruleset,
  params?: BeliefParams,
): BeliefState | PlanFailure;
```

`decide(side, fogged)` does `state = updateBeliefs(state, fogged, fogged.timeMs, params)` and then returns `policy(side, fogged, state)`. If called with a side other than its own it returns `[]` and leaves state alone.

- Pros: zero change to the decide contract, `LiveRound` and the replay file. Beliefs never touch `src/sim`, matching the ownership contract. The hold stub wraps trivially, so O1 changes no logged command.
- Cons: state lives outside the round, so cloning a `LiveRound` does not clone beliefs, and any resume must rebuild them (`rebuildBeliefs`). The host must create one handle per round.

Option B: change the signature to carry opaque memory.

```ts
// src/sim/live-round.ts (would change)
export type LiveDecideFn = (side: Side, foggedWorld: World, memory: unknown) => {
  commands: AgentCommand[];
  memory: unknown;
};
// LiveRound gains: decideMemory: unknown
```

- Pros: memory travels with the round; resume and clone are automatic if memory is structured-cloneable.
- Cons: tactics state is stored on a `src/sim` type (breaks "beliefs never in src/sim" in spirit, even if opaque); the replay file would have to carry it or still rebuild it, so it does not actually remove the rebuild problem for files written before O1; every existing decide caller and test (`tests/sim/live-round.test.ts` cadence test, `App.tsx` lines 223 and 904, `startLiveFromPreRound` options) changes; `unknown` memory gives no type safety and invites non-JSON values (functions, Maps).

Recommendation: Option A. It keeps the sim contract untouched and keeps O2 free to evolve `BeliefState` without sim churn. The only sim change O1 needs is the cadence fix in O1.3, which is independent of beliefs.

## 4. Determinism and fog implications

### 4.1 What beliefs are a function of

Let `I = ruleset.decisionIntervalMs` (500, assumed). With the O1.3 fix, the decide hook is called exactly at times `t_k = k * I` for `k >= 1` such that the round is still `"live"` after the step that commits `t_k`. (Steps are 50 ms and 500 is a multiple of 50, so every `t_k` is a step boundary; `nextDecisionAtMs` only advances by whole intervals.) Calls happen only inside `stepOnce`, after time commit and before the next step, independent of how many steps a `stepLive` call asks for.

Define `B_0 = emptyBeliefs(side, 0)` and `B_k = updateBeliefs(B_{k-1}, F_k, t_k)` where `F_k = viewWorld(mapId, W(t_k), side)` with agents deep-copied. Then:

- `updateBeliefs` is pure (no clock, no RNG, no `Math.random`, integer math, sorted output).
- `F_k` is a pure function of truth `W(t_k)`.
- `W(t_k)` is identical across chunk sizes and across `replayOrderLog` (the existing "live round determinism" test asserts this for truth and events).
- By induction on `k`, `B_k` is identical for any run that reaches `t_k` with the same scenario and order log.

The closure must therefore hold no state except `B_k` and must not read anything except its arguments. The policy may read `B_k` but must not mutate it (`BeliefState` fields are `readonly`; tests deep-freeze it in O1.1).

### 4.2 Replay

`replayOrderLog` runs with `enableDecide = false` and re-issues logged bot commands, so replay does not need beliefs at all: the bot's choices are already in the log. This stays true after O1.

### 4.3 Resumed run (load replay, then continue live)

App loads a replay at `untilMs`, then re-enables decide. For the continued run to match an uninterrupted run, two things must hold:

1. The next decision time must be the next grid time after `untilMs`. Today it is not (gap in section 2). O1.3 moves the `nextDecisionAtMs` advance out of the `enableDecide` branch so it advances in every step:

   ```ts
   if (newTime >= round.nextDecisionAtMs) {
     if (round.enableDecide && round.decide) runDecisions(round, round.decide);
     while (round.nextDecisionAtMs <= newTime) round.nextDecisionAtMs += ruleset.decisionIntervalMs;
   }
   ```

   This changes no world state and no event, so all existing truth/event equality tests keep their expected values.
2. The closure must start from `B_K` where `t_K` is the last grid time `<= untilMs`. `rebuildBeliefs` gets it by opening the round, setting `enableDecide = false`, applying log entries exactly as `replayOrderLog` does (step one step at a time until `world.timeMs >= entry.simTimeMs`, then `issueOrders`), and after every step at a grid time with phase still `"live"`, applying `updateBeliefs(state, viewLive(round, side), t)`. Each such `viewLive` equals the `F_k` the live closure saw: bot and player orders issued at `t_k` only enter `pendingBatch`, so truth at `t_k` is the same whether viewed before or after them. Then `handle.reset(B_K)`.

Proof obligation in tests (O1.2): for seeds in the leak suite, (a) live run with `createBeliefDecide` to `T`, record `handle.beliefs()`; (b) `rebuildBeliefs(scenario, orderLog, T, side)` deep-equals it; (c) chunked runs with chunk 1, 7 and 40 give equal beliefs; (d) resume at `T/2` (replay, rebuild, reset, enable decide) and continue to `T` gives the same `orderLog` and the same beliefs as the uninterrupted run.

`rebuildBeliefs` duplicates about 20 lines of `replayOrderLog`'s loop using only public functions (`openLiveRound`, `issueOrders`, `stepLive`, `viewLive`). A test asserts that the round it steps ends with `truthLiveWorld` equal to `replayOrderLog`'s result, so the two loops cannot drift silently.

### 4.4 Fog

- No truth enters beliefs: the closure only sees what `runDecisions` passes (fogged copy), and `rebuildBeliefs` only calls `viewLive`. Neither touches `round.world` directly.
- Smokes, walls and blind status already limit sight inside `viewWorld`. A smoke placed on an enemy freezes that enemy's entry at its last sighting; the radius then grows.
- Sampling is at the decision cadence, not every step. An enemy visible for less than 500 ms between two decision times is never remembered. This is a deliberate O1 limit (no sim hook) and is recorded as risk 3.
- Devices and zones in the fogged world are not used by O1.

## 5. Provenance and unknowns

| Value | Tag | Named constant | How to confirm |
| --- | --- | --- | --- |
| Belief forget time, 10000 ms | assumed | `BELIEF_FORGET_AFTER_MS` (`src/tactics/beliefs.ts`, `kind: "assumed"`) | Owner tunes during O2 playtests; not a Valorant value. |
| Uncertainty spread speed, 3500 mm/s | assumed (existing tag, not upgraded) | reuses `ruleset.walkSpeedMmPerSec` / `WALK_SPEED_PROVENANCE` | Same as the walk speed itself; no separate source. |
| Belief sampling interval, 500 ms | assumed (existing) | reuses `ruleset.decisionIntervalMs` / `DECISION_INTERVAL_MS_PROVENANCE` | Same as the decision cadence. |
| Confidence scale 0..10000 | design | none (basis points, like `hitProbabilityBp`) | n/a, representation choice. |
| Linear confidence decay | design | none | Revisit in O2 if a curve is needed. |
| Leak test seed count, 25 seeds | design | test-local `LEAK_SEEDS` | n/a, test breadth. |
| Leak test round length, 20000 ms | design | test-local `LEAK_RUN_MS` | n/a, keeps the suite fast. |

No game number is introduced as verified or secondary.

## 6. Staged delivery

### O1.1 Belief state and update (pure)

Work: `src/tactics/beliefs.ts` with types, `emptyBeliefs`, `updateBeliefs`, `viewBeliefs`, constants and provenance. Reveal input type present, exercised only by unit tests.

Acceptance (`npm run check`):

- `tests/tactics/beliefs.test.ts` (new) asserts:
  - a visible enemy creates one entry with the fogged position and `lastSeenMs = timeMs`; own agents never create entries;
  - an entry not refreshed keeps its position; `viewBeliefs` age, radius (`floor(age * 3500 / 1000)` with the standard ruleset) and confidence follow the formulas;
  - entry dropped at exactly `forgetAfterMs` of age, kept at one step less;
  - re-sighting keeps `firstSeenMs`;
  - `prev` and `fogged` are not mutated (deep-frozen inputs do not throw);
  - output `entries` sorted by `instanceId`;
  - throws on `timeMs !== fogged.timeMs` and on time going backwards;
  - a reveal input refreshes with `source: "reveal"`, and a same-time sighting wins;
  - `BELIEF_FORGET_AFTER_MS_PROVENANCE.kind === "assumed"`.
- Browser check at 1366x768: no visible change; live round still plays.

### O1.2 DecisionContext v2, belief decide closure, rebuild

Work: `decision.ts` v2 (`BeliefSnapshot.enemies`, `toBeliefSnapshot`, `buildDecisionContext`); `src/tactics/belief-decide.ts` with `createBeliefDecide`, `rebuildBeliefs`; adapter `holdPolicy` that calls `defenseHoldDecide` so commands are unchanged.

Acceptance:

- `tests/architecture.test.ts` (modify): `DECISION_CONTEXT_VERSION` pinned to 2. Boundary test unchanged and still covers `src/sim` not importing `src/tactics`.
- `tests/tactics/belief-decide.test.ts` (new) asserts:
  - `buildDecisionContext` returns version 2, `visibleEnemyInstanceIds` equal to `state.visibleEnemyIds`, `enemies` sorted;
  - wrapping `defenseHoldDecide` produces the same `orderLog` as plain `defenseHoldDecide` on the default drill over 20000 ms;
  - a handle created for `"defense"` ignores calls for `"attack"`;
  - `rebuildBeliefs` deep-equals the live handle's beliefs at the end of a run, and its stepped round's `truthLiveWorld` equals `replayOrderLog`'s;
  - chunk sizes 1, 7, 40 give deep-equal beliefs.
- Browser check: live round still plays against the hold defender; no UI change yet.

### O1.3 Decision cadence survives replay

Work: in `src/sim/live-round.ts` step f, advance `nextDecisionAtMs` regardless of `enableDecide` (snippet in 4.3). No import added.

Acceptance:

- `tests/sim/live-round.test.ts` (modify, "live opponent cadence" block) adds: after `replayOrderLog(scenario, log, 2000)`, `nextDecisionAtMs === 2500`; after enabling a recording decide and stepping, its first call sees `fogged.timeMs === 2500`.
- `tests/tactics/belief-decide.test.ts` adds the resume test from 4.3 (d): same `orderLog` and beliefs as the uninterrupted run.
- Existing "live round determinism" tests unchanged and still asserting equal truth and events.
- Browser check: load a downloaded replay mid-round, press play; the round continues without error.

### O1.4 No truth leak, property style

Work: test only.

Acceptance: `tests/tactics/beliefs-leak.test.ts` (new):

- Generator: for each seed in `LEAK_SEEDS` (1..25), use `createStream(seed, "o1-leak")` to place the default drill agents at random points on `DRILL_HALL` spawn-side halves and issue random `move-route` orders to both sides at random times; open with `createBeliefDecide("defense", recordingHoldPolicy, STANDARD_RULESET)`; run `LEAK_RUN_MS`.
- The recording policy stores every fogged world it receives. Assertions per seed and per decision call:
  - every `entries[i].instanceId` appeared as an enemy in some earlier or current recorded fogged world;
  - each entry's `lastSeenAt` equals that enemy's position in the recorded fogged world at `lastSeenMs`;
  - no entry exists for an enemy that was never in any recorded fogged world, even though it is in `truthLiveWorld`.
- Fixed case: the cadence test's layout (Jett behind the wall at y=2000) gives empty `entries` for the whole run.
- Control case (proves the test can fail): feeding `truthLiveWorld` instead of the fogged view into `updateBeliefs` in the same fixed case does create an entry, and the leak assertion catches it.
- Smoke case: an enemy seen before a Sky Smoke lands between the two agents keeps its pre-smoke `lastSeenAt` while the smoke is active.

Browser check: none beyond O1.3.

### O1.5 Debug overlay for attacker beliefs

Work: an attacker-side belief ref in App (no decide handle, since attack is human), pure marker builder, MapView layer, three-state view toggle.

- `src/ui/board/beliefOverlay.ts` (new): `beliefMarkers(state, atMs, params): BeliefMarker[]` with `{ instanceId; definitionId; center; radiusMm; confidenceBp; ageMs }`.
- `App.tsx`: keep `attackBeliefsRef` (a `BeliefState` for `"attack"`). The host loop changes from one `stepLive(round, out.steps)` call to a loop of `stepLive(round, 1)`; after each step, if `round.world.timeMs` is a multiple of `decisionIntervalMs` and the phase is live, update the ref with `viewLive(round, "attack")`. Same grid as the bot, so the overlay is deterministic. On replay load, set the ref from `rebuildBeliefs(..., "attack")`; on new round, `emptyBeliefs("attack", 0)`. The defense bot handle is created per round with `createBeliefDecide("defense", holdPolicy, STANDARD_RULESET)`, and on replay load from `rebuildBeliefs(..., "defense")` plus `reset`.
- Toggle: the existing truth button cycles three states with one click each: "Attack view" -> "Attack beliefs" -> "Truth" -> "Attack view". "Attack beliefs" draws the attack fogged view plus belief markers. Truth stays as today.
- `MapView.tsx`: new optional prop `beliefMarkers?: readonly BeliefMarker[]`, drawn under agents: dashed circle of `radiusMm`, a hollow ghost dot at `center`, opacity from `confidenceBp`, short age label (for example "3.5s") on hover title only. Entries currently visible are not drawn (the real agent is on screen).

Acceptance:

- `tests/ui/beliefOverlay.test.ts` (new): marker radius and opacity follow `viewBeliefs`; visible-now entries are omitted.
- `tests/ui/belief-overlay.test.tsx` (new): render App, start the live round, click the toggle once; the button reads "Attack beliefs"; after stepping past a sighting and hiding the defender (scripted scenario), a `data-testid="belief-marker"` element exists; clicking twice more returns to "Attack view" with no markers.
- Browser check at 1366x768: in "Attack beliefs", walk Brimstone into view of Jett and back behind the wall; a dashed ring stays at Jett's last seen spot and grows; no document scrollbar appears; the HUD and board layout do not shift between the three states.

## 7. UI impact

- Clicks: switching to the belief overlay is one click on the existing toggle (two to truth, three back). No new button, so no layout change.
- Previews: the ring is itself a preview of where the enemy could be; it uses the same SVG layer approach as existing smoke and zone drawing.
- One-screen rule: no new panel, no new row; the label change keeps roughly the same button width (longest label "Attack beliefs" vs today's "Showing attack view"). Nothing adds document scroll at 1366x768.
- Hot-seat and defense view are G6's concern; this overlay is attack-only for now.

## 8. Files touched

> Build protocol (consistency pass): this stage is built under [`parallel-build-plan.md`](parallel-build-plan.md). Edits listed here to `src/ui/App.tsx`, `src/ui/styles.css`, `rejectionMessages.ts`, `describe.ts` and the shared docs are integration-file edits: the stage's UI lives in its own component files (with their own CSS), and the App mount lines, message entries and doc text are applied at merge. After H0, engine edits go into the split modules and this stage's reserved slots.

| File | New / modify | Sub-stage | What |
| --- | --- | --- | --- |
| `src/tactics/beliefs.ts` | new | O1.1 | Types, `emptyBeliefs`, `updateBeliefs`, `viewBeliefs`, `BELIEF_FORGET_AFTER_MS` + provenance, `DEFAULT_BELIEF_PARAMS`. |
| `src/tactics/decision.ts` | modify | O1.2 | Version 2, `BeliefSnapshot.enemies`, `toBeliefSnapshot`, `buildDecisionContext`, header comment. |
| `src/tactics/belief-decide.ts` | new | O1.2 | `createBeliefDecide`, `BeliefPolicy`, `rebuildBeliefs`, `holdPolicy`. |
| `src/sim/live-round.ts` | modify | O1.3 | Step f: advance `nextDecisionAtMs` even when decide is disabled. No new import. |
| `src/ui/board/beliefOverlay.ts` | new | O1.5 | Pure `beliefMarkers`. |
| `src/ui/board/MapView.tsx` | modify | O1.5 | Optional `beliefMarkers` prop and SVG layer. |
| `src/ui/App.tsx` | modify | O1.5 | Belief decide handle per round, attack belief ref, single-step host loop, three-state toggle, rebuild on replay load. |
| `src/ui/styles.css` | modify | O1.5 | Belief ring and ghost dot styles. |
| `tests/architecture.test.ts` | modify | O1.2 | Pin `DECISION_CONTEXT_VERSION` to 2. |
| `tests/sim/live-round.test.ts` | modify | O1.3 | Cadence-after-replay test. |
| `tests/tactics/beliefs.test.ts` | new | O1.1 | Unit tests for update and decay. |
| `tests/tactics/belief-decide.test.ts` | new | O1.2, O1.3 | Context v2, closure, rebuild, chunk and resume equality. |
| `tests/tactics/beliefs-leak.test.ts` | new | O1.4 | Property-style no-truth-leak suite across seeds. |
| `tests/ui/beliefOverlay.test.ts` | new | O1.5 | Marker builder. |
| `tests/ui/belief-overlay.test.tsx` | new | O1.5 | Toggle and marker render. |
| `docs/status/o1.md` | new | O1 close | Stage result, playtest steps and the exact text for PROJECT_STATUS.md / README.md / docs/playtest.md / docs/roadmap.md. The integrator applies that text at merge (docs/parallel-build-plan.md); this stage's branch never edits those shared docs. |

`src/tactics/defense-stub.ts` is not modified. `tests/tactics/` is a new folder; vitest already includes `tests/**/*.test.ts`.

## 9. Dependencies

- Must land first: the live engine (done at baseline). Nothing else.
- Consumes (not redefined): `LiveDecideFn`, `viewLive`, `replayOrderLog`, `openLiveRound`, `issueOrders`, `stepLive`, `OrderLogEntry` from `src/sim/live-round.ts`; `viewWorld` from `src/sim/fog.ts`; `World`, `AgentBody` from `src/sim/run.ts`; `walkSpeedMmPerSec` and `decisionIntervalMs` from `src/rules/ruleset.ts`.
- Optional later input from K4: K4 owns `info.reveal` and its reveal state in `src/sim/fog.ts`; when K4 lands, an adapter in `src/tactics/belief-decide.ts` maps it to `BeliefRevealInput`. O1 does not wait for K4.
- Unblocks O2 (`createOpponent(preset)` builds on `createBeliefDecide` and `DecisionContext` v2).
- Touch overlap with parallel stages: `src/ui/App.tsx` and `src/ui/board/MapView.tsx` (G6 hot-seat, G2 spike UI likely touch them too); `src/sim/live-round.ts` (X1, G2, K5). O1's sim edit is a few lines in step f only; schedule O1.5 after or rebased on other App edits.

## 10. Risks

1. Closure state is invisible to `structuredClone(round)`. Any future code path that clones or resumes a round without calling `rebuildBeliefs` will silently diverge. Mitigation: the resume test in O1.3 and a doc comment on `LiveRound.decide`.
2. `rebuildBeliefs` duplicates the replay loop. Mitigation: the equality test against `replayOrderLog` in O1.2.
3. Sampling only at the 500 ms cadence misses short sightings. Accepted for O1; fixing it needs a per-step observe hook in `src/sim`, which is a contract change for O2 to request if playtests need it.
4. Dead enemies vanish from the fogged view exactly like hidden ones, so the bot keeps "ghosts" of enemies it killed until they are forgotten. O2 could misplay against ghosts. See open question 3.
5. The single-step host loop in App does more calls per frame at 4x speed (still bounded by `hostLoopStep` steps per frame). If profiling shows cost, call `stepLive` in chunks that end on grid times instead.
6. The cadence fix in O1.3 changes when the first decision fires after a replay load. Any existing UI test that relied on the old immediate call would change; none was found in `tests/ui/`, but the implementer must rerun the full suite.

## 11. Open questions

1. Should `updateBeliefs` keep the exact brief signature `(prev, fogged, timeMs)` with optional params and extras, or take a single options object? Recommended: keep the brief signature plus two optional trailing arguments, as sketched; O2 code reads naturally and K4 only adds `extras`.
2. Should O1 add negative information (drop or shrink a belief when an own agent has sight of the last-seen point and nobody is there)? Recommended: no in O1. It needs map walls in tactics and a clearing rule that is a design choice for O2; leave a TODO naming `BELIEF_CLEAR_ON_SIGHT` for O2.
3. How should the bot learn about kills? Recommended: not in O1. Propose to the live-engine owner a fogged kill feed (own side's confirmed kills) as a later `World` or `viewLive` addition; until then O2 treats low `lastSeenHp` plus age as a weak signal.
4. Should beliefs also be kept for the attack side by the engine host for future attack bots? Recommended: the same `createBeliefDecide` works for either side; the hard-coded `"defense"` in `runDecisions` stays until G6 lets either side be decided.
5. Should the overlay show defense bot beliefs instead of, or as well as, attacker beliefs? Recommended: attacker beliefs now (as briefed), and add "Defense beliefs" as a fourth toggle state in O2 when the bot actually uses them for decisions.
6. Is 10000 ms the right placeholder for `BELIEF_FORGET_AFTER_MS`? Recommended: keep it as an ASSUMED placeholder; the owner sets it during O2 tuning, and the leak tests do not depend on its value beyond the boundary test.
