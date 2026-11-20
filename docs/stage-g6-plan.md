# Stage G6 plan -- defense pre-round

Tag: **design**. Planning document only. No `src/`, `tests/` or other docs change in this commit.

Roadmap entry: `docs/roadmap.md` section "G6 Defense pre-round" (depends on the live engine; unblocks G4 and O2). Builds directly on `docs/stage-d-plan.md` (stage d, decisions D1-D5).

---

## 1. Goal and non-goals

### Goal

Let the defense submit a `PreRoundPlan` exactly like the attack does today, and let one human plan both sides in a hot-seat flow:

1. `PreRoundPlan.side` widens from `"attack"` to `Side`.
2. `validatePlan` validates a plan for either side against that side's team.
3. `startLiveFromPreRound` accepts `{ attack?: PreRoundPlan; defense?: PreRoundPlan }` (and still accepts a bare attack plan, so stage (d) callers and tests keep working).
4. Plan steps carry their side; `fireDuePlanSteps` issues each step for its own side (today it hard-codes `"attack"`).
5. D4 cancel rules apply per side.
6. The defense decide hook and a defense plan coexist: the plan owns its agents at t=0, the hook keeps running for everyone else and resumes for a planned agent once its plan is used up.
7. Replay file **version 3** stores both plans; versions 1 and 2 still load.
8. Hot-seat UI toggle: the human plans attack, hands over, then plans defense. While planning, the board only shows the planning side's own agents and own drafts, so the defense planner never sees attack routes.
9. Buy timer works per planning turn.

### Non-goals

- No opponent logic that fills a defense plan (that is O2, which consumes this stage).
- No live (post-Go) human control of defenders. After Go the human still plays attack live; defense runs its plan plus the decide hook.
- No spike, weapons, armor, economy or match flow (G2, G3, G5, G4).
- No new Valorant numbers. No change to `buyPhaseMs`, `decisionIntervalMs` or any ruleset value.
- No change to replay semantics D1: load replays the order log only and never re-runs plan steps.
- No change to `PreRoundPlan.version` (stays `1`; see open question 1).

---

## 2. Current state (read for this plan)

| File | What it does today |
| --- | --- |
| `src/sim/preround.ts` | Types `PlanTrigger`, `PlanAbility`, `AgentPlan`, `BuyLine`, `PreRoundPlan` (`version: 1; side: "attack"; buys; agents; loadoutFuture?`). `validatePlan(scenario, plan, catalog, ruleset)` rejects any `side !== "attack"` with `wrong-side`, then looks up every buy and agent in `working.attack.members` only. `startLiveFromPreRound(scenario, plan, catalog, ruleset, options)` re-validates, applies buys to `postBuy.attack.members`, calls `openLiveRound`, issues one t=0 `move-route` batch via `issueOrders(round, plan.side as Side, ...)`, calls `flushPendingBatches`, then installs `round.planSteps` (no side on each step). `applyBuysToScenario(scenario, buys, catalog)` also searches `attack.members` only. |
| `src/sim/live-round.ts` | `PlanStepState` has `id, instanceId, abilityId, trigger, target, aimYawDeg?, chargeValue?, mapTarget?, status, due, fireReason?` and **no side**. `stepOnce` calls `fireDuePlanSteps(round, prevTime)` first. `fireDuePlanSteps` builds a `cast` and calls `issueOrders(round, "attack", [command], { origin: "plan", ... })` -- **verified: side is hard-coded to `"attack"`**; a defense step would be rejected `wrong-side` by `validateCommand`. `applyPendingBatch` calls `cancelWaypointPlans` on `hold` and `move-route` and `cancelAbilityPlans` on `cast`, only for `batch.origin === "live"`; both helpers match by `instanceId` only. `markWaypointReached` is called from `advanceStanding`. `markUnfiredPlanSteps` runs at round end. `runDecisions` hard-codes `side = "defense"`, hands `decide` a fogged copy, drops `hold` commands for agents already holding, and issues the rest with the default origin `"live"`. `replayOrderLog` opens a plain round, sets `enableDecide = false` and replays every log entry with its logged `side` and `origin`. |
| `src/tactics/defense-stub.ts` | `defenseHoldDecide(side, fogged)` returns `hold` for every living defender. Combined with the `runDecisions` filter, it only emits a batch for defenders that are **moving**. |
| `src/ui/preround/planState.ts` | Pure draft helpers. `buildPreRoundPlan(buys, drafts, attackMembers)` always writes `side: "attack"`. Everything else (`setAgentRoute`, `addPlanAbility`, `flaggedStepIds`, ...) is side-agnostic. |
| `src/ui/preround/buyTimer.ts` | `tickBuyTimer(state, elapsedMs)` and `formatBuyTimer(remainingMs)`. Host-only, one timer. |
| `src/ui/App.tsx` | Single `buys` and `drafts` state for attack. `scenarioForPreRound` zeroes bought charges for attack members only. `preRoundWorld` contains only attackers (defenders are not rendered in pre-round). `goLive` builds one attack plan, validates it, and calls `startLiveFromPreRound(..., { decide: defenseHoldDecide })`. The buy-timer effect auto-calls `goLive` at 0. Many pre-round handlers hard-code `scenario.attack.members` or `side !== "attack"` (keyboard 1-5 select, hotkey arming, `clearRoutesForSelection`, `issueGroupMove`, `onPreRoundBuy`, board `onAgentClick`). `downloadReplay` writes `preRoundPlan: savedPreRoundPlan`. `loadReplay` replays the log and then re-enables `defenseHoldDecide`. |
| `src/ui/orders/AttackerHud.tsx` | Renders cards for the `attackers` prop with `aria-label="Attacker HUD"`; buy strip, plan-step list and trigger editor are side-agnostic. |
| `src/ui/live/replayFile.ts` | `REPLAY_FILE_VERSION = 2`; `ReplayFile.version: 1 \| 2`; optional `preRoundPlan`. `parseReplay` rejects any other version. |
| `tests/sim/preround.test.ts` | Stage (d) engine tests (validate, start, timed/waypoint fire, D2, D4, determinism, replay v2 round trip, v1 read). Two tests assert the literal `"version": 2`. |
| `tests/ui/preround-ui.test.tsx` | Boots into pre-round without defenders, hold timer and auto-Go, buy +/-, 4-interaction plan, edit/delete, Go failure, Go success, replay download asserting `"version": 2` and `file.preRoundPlan`. |
| `tests/ui/replayFile.test.ts` | Round trip; asserts `"version": 2`. |

Important finding for the hook question: today the hold stub would **destroy** a defense plan. At the first decision tick (`decisionIntervalMs`, 500 ms, assumed) `runDecisions` emits `hold` for every moving defender with origin `"live"`, which replaces the plan route and, through `cancelWaypointPlans`, cancels that defender's armed `at-waypoint` steps. G6 must fix this (section 3.5).

Drill content note: in `src/ui/scenario/playableDrill.ts` the defenders are Jett and KAY/O, whose abilities are not executable yet (only Breach and Brimstone have resolve files). In the shipped drill a defense plan is therefore routes plus buys; defense casts are tested with a test-only scenario that puts Breach or Brimstone on defense (composition is per-team unique, `src/sim/composition/team.ts`).

---

## 3. Design

### 3.1 Types (`src/sim/preround.ts`)

```ts
export type PreRoundPlan = {
  version: 1;               // unchanged (open question 1)
  side: Side;               // was "attack"
  buys: BuyLine[];          // members of `side` only
  agents: AgentPlan[];      // members of `side` only
  loadoutFuture?: Record<string, never>; // untouched; G3 replaces it
};

/** G6: both sides' plans for one round. Either may be missing (missing = no plan). */
export type PreRoundPlans = {
  attack?: PreRoundPlan;
  defense?: PreRoundPlan;
};

/** Accept the stage (d) single-plan call shape too. */
export type PreRoundInput = PreRoundPlan | PreRoundPlans;

export function normalizePlans(input: PreRoundInput): PreRoundPlans;
// "version" in input -> { [input.side]: input }; otherwise a shallow copy.

function teamFor(scenario: Scenario, side: Side): Team; // scenario.attack | scenario.defense
```

`BuyLine` and `AgentPlan` do not gain a side: the enclosing plan's `side` scopes them.

### 3.2 Validation

```ts
export function validatePlan(
  scenario: Scenario,
  plan: PreRoundPlan,
  catalog?: Catalog,
  ruleset?: Ruleset,
): ValidatePlanResult;        // same signature; now side-aware

export function validatePlans(
  scenario: Scenario,
  plans: PreRoundPlans,
  catalog?: Catalog,
  ruleset?: Ruleset,
): ValidatePlanResult & { side?: Side }; // new; first failure wins, attack checked first
```

Changes inside `validatePlan`:

- Drop the `plan.side !== "attack"` reject. Reject `wrong-side` only when `plan.side` is not `"attack"` or `"defense"`.
- Look up buys and agents in `teamFor(working, plan.side)`. A buy or agent entry whose instance exists on the **other** team returns `wrong-side` ("That agent is not on your side."); an id on neither team stays `unknown-agent`.
- Soft reserve, trigger range, waypoint index, cast range: unchanged logic, run against that side's members.

`validatePlans` additionally rejects `invalid-order` with message "Plan side does not match its slot." when `plans.attack.side !== "attack"` or `plans.defense.side !== "defense"`. Each side's buys only touch its own team, so the two plans cannot interfere; validation is independent per side.

`applyBuysToScenario(scenario, buys, catalog, side = "attack")` gains an optional `side` (default keeps the stage (d) callers unchanged).

### 3.3 Start

```ts
export function startLiveFromPreRound(
  scenario: Scenario,
  input: PreRoundInput,
  catalog?: Catalog,
  ruleset?: Ruleset,
  options?: OpenLiveOptions,
): LiveRound | PlanFailure;
```

Fixed order (independent of which side the human planned first):

1. `plans = normalizePlans(input)`; `validatePlans` -> whole-input reject on first failure (stage d whole-plan reject, now across both).
2. Clone scenario; apply attack buys, then defense buys (`applyBuysToScenario` per side).
3. `openLiveRound(postBuy, catalog, ruleset, options)`.
4. Issue the attack t=0 `move-route` batch, then the defense t=0 batch, each via `issueOrders(round, side, routes)` (origin default `"live"`, as today), then one `flushPendingBatches(round)`. The order log therefore holds at most two t=0 route entries, attack first.
5. Install `planSteps`: all attack steps (plan agent order, then ability order), then all defense steps. Each step records `side`.
6. Mark `round.planRouteActive[instanceId] = true` for every agent whose plan has a non-empty route (section 3.5).
7. Return with `world.timeMs === 0`, nothing fired (D5 unchanged).

### 3.4 Plan steps per side (`src/sim/live-round.ts`)

```ts
export type PlanStepState = {
  id: string;
  side: Side;                 // new; required
  instanceId: string;
  abilityId: string;
  trigger: PlanStepTrigger;
  target: Point;
  aimYawDeg?: number;
  chargeValue?: number;
  mapTarget?: Point;
  status: PlanStepStatus;
  due: boolean;
  fireReason?: "arrived" | "blocked-early";
};
```

- `fireDuePlanSteps`: replace `issueOrders(round, "attack", ...)` with `issueOrders(round, step.side, ...)`. Iteration order stays array order, so on a shared step boundary attack fires before defense (design tie-break; open question 3).
- `cancelWaypointPlans(round, side, instanceId)` and `cancelAbilityPlans(round, side, instanceId, abilityId)` gain a `side` argument and also require `step.side === side`; `applyPendingBatch` passes `batch.side`. Instance ids are already unique per round and `validateCommand` rejects cross-side commands, so this is belt-and-braces: a batch can only ever cancel its own side's steps.
- `markWaypointReached` and `markUnfiredPlanSteps`: unchanged (keyed by instance; sides fall out naturally).
- Step ids: stage (d) ids are unique within a plan. Across two plans they may collide (both UIs generate ids from a counter). `validatePlans` rejects `invalid-order` "Duplicate plan step id." if an id appears in both plans; the hot-seat UI prefixes ids with the side (`att-` / `def-`) so this never fires in practice.

D4 per side, stated as rules:

| Event | Effect |
| --- | --- |
| Live (`origin: "live"`) `move-route` or `hold` for agent A on side S | Cancel A's armed `at-waypoint` steps where `step.side === S`; clear `planRouteActive[A]`. |
| Live cast of ability X by agent A on side S | Cancel A's armed steps for X where `step.side === S`. |
| Plan-fired cast (`origin: "plan"`) | Cancels nothing (stage d rule kept). |
| Any order for side S | Never touches side `other(S)` steps. |
| Decide-hook batch | Plan-locked `hold` commands removed first (3.5); anything left is `"live"` and follows the rows above. |

### 3.5 Defense decide hook vs a defense plan

Decision (recommended by the brief and adopted): **a defense plan replaces the hold stub's commands at t=0, and the decide hook still runs later.**

Mechanism, all engine-side and deterministic:

```ts
// LiveRound additions
planRouteActive: Record<string, boolean>; // true while a plan-issued t=0 route is still the standing order

export function isPlanLocked(round: LiveRound, instanceId: string): boolean;
// true when planRouteActive[instanceId] OR the agent has any planSteps entry with status "armed"
```

- `planRouteActive[A]` is set in `startLiveFromPreRound` step 6 and cleared when (a) `advanceStanding` turns A's standing into `hold` (route finished or blocked), (b) a live `move-route` / `hold` for A is applied, or (c) A dies (`advanceStanding` already resets dead agents to hold).
- `runDecisions` drops decided **`hold`** commands whose `instanceId` is plan-locked **before** calling `issueOrders`. Only `hold` is dropped (consistency pass with O2): a `hold` from a decide hook is never a deliberate change of plan, while a decided `move-route`, `cast` or `shoot` is, so those pass through, are logged as `"live"`, and cancel plan steps by the D4 rules above. Dropped commands are not logged (they never existed as a batch), so the order log only shows what was actually issued.
- Result: the hold stub can no longer stop a plan route or cancel its steps, the hook still acts on unplanned defenders immediately, and a smarter hook (O2) can deliberately override a planned defender, for example to rotate.
- The filter is generic over side, so when O2 (or a future attack bot) decides for a side with a plan, the same rule applies.
- `openLiveRound` initialises `planRouteActive: {}`; `replayOrderLog` leaves it empty (replay never runs decide).

Why not a new `OrderOrigin "decide"` that does not cancel? It would still let the stub's `hold` stop the plan route (the cancel rules are about steps, not routes). The lock fixes both route and steps with one rule. See open question 2.

### 3.6 Replay file v3 (`src/ui/live/replayFile.ts`)

```ts
export const REPLAY_FILE_VERSION = 3;

export type ReplayFile = {
  version: 1 | 2 | 3;
  scenario: Scenario;        // post-buy, both teams (D1 unchanged)
  seed: number;
  orderLog: OrderLogEntry[]; // includes both sides' t=0 routes and plan-origin casts
  simTimeMs: number;
  /** Audit and reload copy only; never drives replay (D1). */
  preRoundPlans?: PreRoundPlans;
  /** Reserved for G1 (consistency pass): map geometry revision; a mismatch on load is a clear error. */
  mapRevision?: number;
  /** Reserved for O2 (consistency pass): label of the opponent preset that produced defense commands. Audit only. */
  opponentPresetId?: string;
};
```

Reserved optional fields are written only by the stage that owns them (G1, O2) and are ignored by `parseReplay` until then, so adding them needs no further version bump. G2 spike commands and G3 loadout data travel inside `orderLog` and the post-buy `scenario`, so they need no replay fields.

- `serializeReplay` always writes `version: 3` and `preRoundPlans` when present. It no longer writes the single `preRoundPlan` key.
- `parseReplay` accepts 1, 2, 3:
  - v1: no plans.
  - v2: a `preRoundPlan` key, if present, is moved into `preRoundPlans[plan.side]` (always `"attack"` in real v2 files; if a hand-edited file lacks a valid side, put it under `attack`).
  - v3: `preRoundPlans` taken as is; reject with "Replay preRoundPlans must be an object." if present and not an object.
  - The returned `version` field keeps the file's original version so callers and tests can see what was read.
- Engine replay is unchanged: plan-fired casts are already in the log with `side` (now correct for defense too) and `origin: "plan"`, so `replayOrderLog` needs no plan input.

### 3.7 Hot-seat UI

State in `App.tsx` (pure helpers in `planState.ts` / new `hotSeat.ts`):

```ts
type PlanningTurn = "attack" | "handover" | "defense";

type SidePlanDrafts = {
  buys: Record<Side, BuyLine[]>;
  drafts: Record<Side, PlanDraftMap>;
};

// src/ui/preround/hotSeat.ts (new, pure)
export type HotSeatState = { enabled: boolean; turn: PlanningTurn };
export function nextTurn(state: HotSeatState): HotSeatState; // attack -> handover -> defense
export function planningSide(state: HotSeatState): Side | null; // null during handover
export function plansForGo(state: HotSeatState, attack: PreRoundPlan, defense: PreRoundPlan): PreRoundPlans;
// disabled -> { attack }; enabled -> { attack, defense }
```

- `buildPreRoundPlan(buys, drafts, members, side = "attack")` writes `side`. Callers pass `teamFor(scenario, side).members`.
- `scenarioForPreRound(scenario, { zeroDefense })`: when hot-seat is on, defense bought charges are zeroed like attack today; when off, defense keeps its current full charges (unchanged behaviour).
- Every pre-round handler that hard-codes attack (`clearRoutesForSelection`, `issueGroupMove` pre-round branch, `onPreRoundBuy`, `onPreRoundRefund`, 1-5 select, C/Q/E/X arming, board `onAgentClick`, preview building) reads the planning side instead. Live-phase handlers keep `"attack"`.
- Flow with hot-seat on:
  1. Attack turn: top bar shows "Planning: Attack", buy timer, and a button "Done - hand to defense" in place of Go. Pressing it validates the attack plan (`validatePlan`); on failure the status line shows the message and the turn stays.
  2. Handover: an opaque overlay covers the board and HUD: "Pass to the defense planner." with one button "Start defense planning". Nothing from the attack plan is rendered behind it (the overlay is not a translucent scrim). The attack draft stays in state.
  3. Defense turn: "Planning: Defense", fresh buy timer, the HUD shows defenders, Go button. Go calls `validatePlans` then `startLiveFromPreRound(scenario, plans, ..., { decide: defenseHoldDecide })`.
  4. After Go the live UI is the same as stage (d): attack view, attack HUD.
- Hot-seat off: exactly the stage (d) flow (one turn, Go, defense = hold stub).
- Toggle: a checkbox "Hot-seat (plan defense)" in the pre-round top bar, only enabled in the attack turn. Toggling resets the pre-round (`resetToPreRound`) because it changes which charges are zeroed; status line says "Hot-seat on: plans reset." No "back to attack" button in v1 (open question 5).

Per-side fog while planning:

- The pre-round board world becomes `preRoundWorldFor(side)` = only that side's members (today's `preRoundWorld` is the `attack` case). Enemy bodies are never rendered during planning, same as stage (d) hides defenders from the attack planner.
- Route polylines, waypoint discs, cast markers and armed shapes come from `drafts[side]` only.
- The hidden `data-testid="pre-round-plan"` node serialises only the current side's plan (tests read it; it is never visible).
- The `HUD` gets `side` and renders `aria-label` "Attacker HUD" or "Defender HUD".

### 3.8 Buy timer with two sides

- Each planning turn gets its own countdown starting at `ruleset.buyPhaseMs` (30_000 ms, assumed). No new constant: hot-seat is sequential, and giving the second planner whatever the first left over would make the defense turn depend on how slowly the attack planner worked.
- "Hold timer" stays per turn and defaults on (stage d UX).
- Attack turn timer at 0 (hold off): auto-advance to handover exactly as if "Done - hand to defense" was pressed; if the attack plan is invalid, advance with an empty attack plan and say so in the status line (mirrors stage (d) auto-Go with whatever is valid; recommend dropping only the invalid plan, not partial lines).
- Handover: no timer runs.
- Defense turn timer at 0 (hold off): auto-Go (stage d behaviour).
- `tickBuyTimer` / `formatBuyTimer` are unchanged; only the host state resets per turn. The engine never sees either countdown.

---

## 4. Determinism and fog implications

- Engine inputs at Go: post-buy scenario, `PreRoundPlans`, seed, ruleset, catalog. The planning order, wall-clock time spent per turn and the buy timers are host-only and never reach the engine.
- Fixed application order: attack buys, defense buys, attack t=0 routes, defense t=0 routes, attack plan steps, defense plan steps. Same input -> same `orderLog`, `events`, sequence numbers.
- Same-boundary plan fires: attack steps fire first (array order), so their cast jobs get lower sequence numbers and resolve first at equal `timeMs`. This is a **design** tie-break, documented and pinned by a test.
- Plan lock uses only engine state (`planRouteActive`, `planSteps`), never wall time. Commands it drops are never logged, so the log stays a faithful record of issued batches and `replayOrderLog` reproduces the round without the hook.
- No `Math.random`. Combat draws stay on the forked combat stream.
- Fog: the decide hook still receives `viewWorld(..., "defense")` only. The defense plan is data the defense side authored, so reading it in the engine is not a fog leak. The hook never receives `planSteps` or the attack plan.
- UI fog: the planning board shows own side only; the handover overlay is opaque. This is a hot-seat courtesy, not security (same human, same browser, `Show truth` exists after Go).
- Replay load: plan steps and `planRouteActive` are not restored (D1). Continuing play past the loaded point with the hook re-enabled would let the stub stop defense routes that the original run kept. Recommendation: when a loaded file has `preRoundPlans.defense`, leave `enableDecide` false and show "Defense bot off after loading a defense-plan replay." (open question 4).

---

## 5. Provenance and unknowns

| Value | Tag | Named constant (if assumed) | How to confirm |
| --- | --- | --- | --- |
| Buy phase per planning turn, 30_000 ms | assumed (existing, not upgraded) | `buyPhaseMs` in `src/rules/ruleset.ts` (already `BUY_PHASE_MS_PROVENANCE`) | Owner choice; the real Valorant buy phase is simultaneous, not per turn. |
| One full buy timer per hot-seat turn | design | none (reuses `buyPhaseMs`) | Owner playtest. |
| Decision cadence 500 ms | assumed (existing) | `decisionIntervalMs` | Unchanged by G6. |
| Round length 100_000 ms | owner (existing) | `roundDurationMs` | Unchanged. |
| Starting credits 800 | assumed (existing) | `startingCredits` | Defense buys use the same pool rules as attack. |
| Defense buy prices / max charges | existing catalog tags per ability | none | No new prices. |
| Attack-before-defense application and fire order | design | none | Pinned by test; owner may flip (open question 3). |
| Plan lock (decide hook waits for a planned agent) | design | none | Owner decision #6 style; open question 2. |
| Hot-seat handover overlay, no back button | design | none | Playtest. |
| Zeroing defense bought charges only in hot-seat | design | none | Mirrors stage (d) attack lab buy phase. |

No new ruleset constant is needed.

---

## 6. Staged delivery

Every sub-stage ends with `npm run check` green (to be checked by the implementer; this plan claims nothing passes) plus a browser check at 1366x768.

### G6.1 Engine: plans for both sides

Scope: `src/sim/preround.ts` (types 3.1, validation 3.2, start 3.3), `src/sim/live-round.ts` (3.4 side on steps, side-scoped cancel, 3.5 plan lock).

Acceptance (`npm run check`):

- `tests/sim/preround.test.ts`: every existing test passes **unchanged** (single-plan call shape, `side: "attack"`).
- `tests/sim/preround-defense.test.ts` (new) asserts:
  - `validatePlan` accepts a `side: "defense"` plan with defense buys and routes; rejects a defense plan that lists `breach-attack` with `wrong-side`; rejects an unknown id with `unknown-agent`.
  - `validatePlans` rejects a plan in the wrong slot and duplicate step ids across plans (`invalid-order`).
  - `startLiveFromPreRound(scenario, { attack, defense })`: post-buy credits/charges on both teams; order log has the attack t=0 route entry before the defense entry, both `accepted`, sides correct; `planSteps` attack then defense with `side` set.
  - With a test scenario that puts Brimstone (or Breach) on defense: a defense `at-time` step fires for side `"defense"` (log entry `side: "defense"`, `origin: "plan"`, `accepted`), charge spent at fire.
  - A defense `at-waypoint` step fires on arrival.
  - D4 per side: a live attack cast of ability X does not cancel a defense step for X on a defender; a live defense move cancels that defender's armed waypoint steps.
  - Plan lock: with `decide: defenseHoldDecide`, a defender on a plan route is still moving after the first decision tick and reaches its last waypoint; an unplanned defender that is moved by a test-issued route still receives the stub's `hold` at the next tick; once the planned defender arrives and has no armed steps, the stub may act on it again (no batch since it already holds); a test decide fn that returns a `move-route` for a plan-locked defender is NOT dropped, is logged as `"live"` and cancels that defender's `at-waypoint` steps.
  - Determinism: same plans and seed -> deep-equal `events` and `orderLog` after N steps; same-boundary attack and defense `at-time 0` steps log attack first.
  - Replay of a two-plan round via `replayOrderLog` (no plans passed) deep-equals truth world at the same `simTimeMs`.
- `tests/sim/live-round.test.ts`: unchanged.
- `tests/architecture.test.ts`: unchanged (no evaluators; `src/sim` still never imports `src/tactics`; the new test may import the stub from `src/tactics`).

Browser check: no visible change; the stage (d) flow still works at 1366x768.

### G6.2 Replay v3

Scope: `src/ui/live/replayFile.ts`; App `downloadReplay` / `loadReplay` switch to `preRoundPlans`.

Acceptance:

- `tests/ui/replayFile.test.ts`: asserts `"version": 3`; v3 with both plans round-trips; a v2 text with `preRoundPlan` parses to `preRoundPlans.attack` and `version: 2`; a v1 text parses with no plans; version 4 is rejected.
- `tests/sim/preround.test.ts`: the two literal `"version": 2` assertions and the `parsed.preRoundPlan` assertion become `"version": 3` and `parsed.preRoundPlans?.attack`; the v1 test's string replace targets `"version": 3`.
- `tests/ui/preround-ui.test.tsx`: the replay-download test asserts v3 and `file.preRoundPlans?.attack?.buys`.

Browser check: Download replay after Go shows `"version": 3`; Load replay of that text resumes paused.

### G6.3 Hot-seat planning UI

Scope: `src/ui/preround/planState.ts` (`buildPreRoundPlan` side param, side-prefixed step ids), `src/ui/preround/hotSeat.ts` (new), `src/ui/App.tsx` (state per side, turns, overlay, per-side board world, per-turn timer, `plansForGo`), `src/ui/orders/AttackerHud.tsx` (`side` prop and label), `src/ui/styles.css` (overlay and badge classes).

Acceptance:

- `tests/ui/hotSeat.test.ts` (new): `nextTurn` order; `planningSide` null at handover; `plansForGo` returns `{ attack }` when disabled and both when enabled.
- `tests/ui/preround-hotseat-ui.test.tsx` (new):
  - Toggle on -> "Planning: Attack"; plan a Breach route; press "Done - hand to defense" -> overlay visible, no `Select Breach` button and no attack route markers in the document.
  - "Start defense planning" -> "Defender HUD" shows Jett and KAY/O cards; board has `Select Jett`; no `Select Breach`; hidden plan node has `side: "defense"`.
  - Defense route by right-click; Go -> round timer 1:40; after Space and some frames the Jett position differs from spawn past 500 ms sim time (plan lock holds).
  - Attack turn timer at 0 with hold off -> overlay (not live); defense timer at 0 -> live.
  - Toggle off: the existing stage (d) single-turn flow (asserted by the untouched tests below).
- `tests/ui/preround-ui.test.tsx`, `tests/ui/round-play.test.tsx`, `tests/ui/DraftPanel.test.tsx`: pass unchanged (hot-seat defaults off).
- `tests/ui/buyTimer.test.ts`: unchanged.

Browser check at 1366x768: toggle on, plan both turns, overlay fully hides the board, Go, watch defenders walk their routes; document never scrolls in any turn.

### G6.4 Replay load guard and docs

Scope: `loadReplay` leaves the decide hook off when `preRoundPlans.defense` exists (if open question 4 is accepted); `docs/status/g6.md` carries the `docs/playtest.md` hot-seat section and the `PROJECT_STATUS.md` G6 line.

Acceptance:

- `tests/ui/preround-hotseat-ui.test.tsx`: download after a hot-seat Go, load it -> status line contains "Defense bot off"; resuming does not add any new `side: "defense"` order-log entries from the hook.

Browser check: load a hot-seat replay, Resume, defenders keep the logged behaviour.

---

## 7. UI impact

Click budget:

| Action | Clicks |
| --- | --- |
| Turn hot-seat on | 1 (checkbox) |
| Plan one defender route | 0-1 select (key 1 or card) + 1 right-click |
| Route plus one cast (either side) | <= 4 interactions, unchanged from stage (d) |
| Hand over | 1 ("Done - hand to defense") + 1 ("Start defense planning") |
| Go | 1 |
| Hot-seat off | unchanged stage (d) counts |

Previews: unchanged mechanics (`src/ui/board/previews.ts` polylines, ETA, armed shapes), fed by the planning side's drafts only. Waypoint markers and cast icons for the other side are never drawn.

One-screen rule at 1366x768: the top bar gains one short badge ("Planning: Attack/Defense") and the hot-seat checkbox, and the Go button changes label in the attack turn; no new row. The handover overlay is absolutely positioned inside `board-shell` over board and HUD, so it adds no height. The HUD keeps its height (defense has the same max team size). No document scroll in any turn.

---

## 8. Files touched

> Build protocol (consistency pass): this stage is built under [`parallel-build-plan.md`](parallel-build-plan.md). Edits listed here to `src/ui/App.tsx`, `src/ui/styles.css`, `rejectionMessages.ts`, `describe.ts` and the shared docs are integration-file edits: the stage's UI lives in its own component files (with their own CSS), and the App mount lines, message entries and doc text are applied at merge. After H0, engine edits go into the split modules and this stage's reserved slots.

| File | New / modify | Sub-stage | What |
| --- | --- | --- | --- |
| `src/sim/preround.ts` | modify | G6.1 | `side: Side`, `PreRoundPlans`, `PreRoundInput`, `normalizePlans`, `validatePlans`, side-aware `validatePlan`, `applyBuysToScenario` side param, two-plan `startLiveFromPreRound`, `teamFor` helper. |
| `src/sim/live-round.ts` | modify | G6.1 | `PlanStepState.side`, `LiveRound.planRouteActive`, `isPlanLocked`, `fireDuePlanSteps` uses `step.side`, side-scoped cancel helpers, plan-lock filter in `runDecisions`, clear lock in `advanceStanding` / `applyPendingBatch`, init in `openLiveRound`. |
| `tests/sim/preround-defense.test.ts` | new | G6.1 | Section 6 G6.1 cases. |
| `src/ui/live/replayFile.ts` | modify | G6.2 | v3, `preRoundPlans`, v1/v2 reading. |
| `tests/ui/replayFile.test.ts` | modify | G6.2 | v3 and backwards reads. |
| `tests/sim/preround.test.ts` | modify | G6.2 | Version literals and `preRoundPlans` only (G6.1 leaves it untouched). |
| `tests/ui/preround-ui.test.tsx` | modify | G6.2 | Replay-download assertions to v3. |
| `src/ui/preround/planState.ts` | modify | G6.3 | `buildPreRoundPlan` side param; side-prefixed step id helper. |
| `src/ui/preround/hotSeat.ts` | new | G6.3 | Pure turn state helpers. |
| `src/ui/App.tsx` | modify | G6.2, G6.3, G6.4 | Replay fields; per-side drafts/buys; turns; overlay; per-side pre-round world; per-turn timer; `plansForGo`; load guard. |
| `src/ui/orders/AttackerHud.tsx` | modify | G6.3 | `side` prop and aria label. File name kept to avoid churn. |
| `src/ui/styles.css` | modify | G6.3 | Overlay and planning badge classes (imported by `src/main.tsx`). |
| `tests/ui/hotSeat.test.ts` | new | G6.3 | Pure helper tests. |
| `tests/ui/preround-hotseat-ui.test.tsx` | new | G6.3, G6.4 | Hot-seat flow tests. |
| `docs/status/g6.md` | new | G6 close | Stage result, playtest steps and the exact text for PROJECT_STATUS.md / README.md / docs/playtest.md / docs/roadmap.md. The integrator applies that text at merge (docs/parallel-build-plan.md); this stage's branch never edits those shared docs. |

Not touched: `src/tactics/defense-stub.ts` (the lock lives in the engine), `src/ui/preround/buyTimer.ts`, `src/rules/ruleset.ts`, `src/sim/fog.ts`, `tests/architecture.test.ts`, `tests/sim/support/live-harness.ts`.

---

## 9. Dependencies

- Must land first: the live engine and stage (d) (both shipped per `docs/stage-d-plan.md` D1-D5). No other G/O/K/X/D stage is required.
- Ownership contract names this stage **owns** and defines here: `PreRoundPlan.side: Side`; `startLiveFromPreRound` accepting `{ attack?: PreRoundPlan; defense?: PreRoundPlan }`; replay v3 carrying both plans; hot-seat UI toggle.
- Additional names this plan introduces (needed but not in the brief): `PreRoundPlans`, `PreRoundInput`, `normalizePlans`, `validatePlans`, `PlanStepState.side`, `LiveRound.planRouteActive`, `isPlanLocked`, `ReplayFile.preRoundPlans`, `HotSeatState` / `PlanningTurn` (UI only).
- Consumes: nothing from other stages' contracts.
- Downstream consumers: G4 (`openMatch` / `startNextRound` will call `startLiveFromPreRound` with `PreRoundPlans` each round); O2 (`createOpponent(preset)` may produce a defense `PreRoundPlan` and relies on the plan lock); G3 replaces `loadoutFuture` on the same widened type, so G3 and G6.1 both edit `src/sim/preround.ts` and should not run in parallel on that file.

---

## 10. Risks

1. **Merge conflict on `src/sim/preround.ts` / `src/sim/live-round.ts`** with G3 (loadout) and X1/G2 (live-round jobs). Mitigation: G6.1 is small and engine-only; land it before G3 touches `PreRoundPlan`.
2. **Plan lock hides a bug in the hook** (the stub silently does nothing for planned agents). Mitigation: the G6.1 test asserts the hook resumes once the plan is used up; `isPlanLocked` is exported for UI/debug display.
3. **Replay divergence after load** because plan steps and locks are not restored (D1). Mitigation: G6.4 guard keeps the hook off for defense-plan replays.
4. **Drill defenders cannot cast** (Jett / KAY/O placeholders), so hot-seat defense feels thin. Mitigation: routes and buys work; defense cast coverage comes from a test scenario; real kits arrive with later K stages.
5. **App.tsx growth**: per-side state doubles several handlers. Mitigation: move side-generic logic into `hotSeat.ts` and `planState.ts`; keep live handlers untouched.
6. **Hot-seat fog is cosmetic**: `Show truth`, the hidden test node or devtools reveal the other plan. Mitigation: documented as a courtesy in `docs/playtest.md`; no security claim.

---

## 11. Open questions (with recommended answers)

1. **Bump `PreRoundPlan.version` to 2 for `side: Side`?** Recommend **no**: a v1 attack plan is still a valid plan, and replay v3 already marks files that may carry a defense plan. Stage (d) open question 4 anticipated this.
2. **Plan lock vs a new `OrderOrigin "decide"`?** Recommend the **plan lock** (3.5), limited to dropping `hold` commands: it protects the route and the steps from the stub, keeps the log format unchanged, and still lets O2 deliberately override a plan with a move or cast (agreed with O2 in the consistency pass).
3. **Which side wins a same-boundary tie between plan casts?** Recommend **attack first** (fixed array order) for now, tagged design; G4 could alternate by round if fairness matters.
4. **After loading a replay that has a defense plan, keep the decide hook off?** Recommend **yes** until replay restores plan steps; show the plain-language note.
5. **Allow "Back to attack" from the defense turn?** Recommend **no** in v1: it would re-show attack routes to the defense planner. New round resets both.
6. **Should the hot-seat human also control defenders live after Go?** Recommend **no** for G6 (non-goal); the defense runs its plan plus the hook. A live side switch is a separate UI stage if playtest asks for it.
