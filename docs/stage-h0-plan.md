# Stage H0 plan - split the hot spots (behaviour-neutral refactor)

Tag: **design**. Plan only; nothing here is implemented. Written 21 November 2026.

Source: section 4.3 of [`parallel-build-plan.md`](parallel-build-plan.md). H0 runs alone as wave 0, before any wave 1 stage (X1, G1, G6, K3) starts.

Baseline recorded for this plan: `npm run check` green at commit `b87229e` (lint, typecheck, 26 test files / 165 tests, build). Graph refreshed with `graphify update` at the same commit (487 nodes): the god nodes are `App()` (71 edges) and `applyJob()` (35 edges), and the graph reports two import cycles, `breach-resolve.ts <-> run.ts` and `brimstone-resolve.ts <-> run.ts`.

---

## 1. Goal and non-goals

**Goal.** Restructure the files that almost every planned stage edits, so that stages in the same wave can be built on separate branches without touching the same lines:

1. Split `src/sim/live-round.ts` into focused modules behind the same public API.
2. Make the `Job`, `SimEvent`, `RejectionCode` and `AgentCommand` unions extensible from per-stage files, with an explicit central handler table per union.
3. Turn fog rules, rejection messages and event text into registries.
4. Render `MapView` from an ordered list of layer components.
5. Split `App.tsx` into a controller hook plus presentational components, with slot arrays for stage UI.
6. Add reserved, labelled slots in every remaining append-only spot for the stages of waves 1 to 5.

**Behaviour-neutral means:** same events, same order, same sequence numbers, same RNG draws, same worlds, same fogged views, same DOM, same text, same CSS. Section 9 is the proof.

**Non-goals.**

- No new feature, rule, number, ability, event, command or rejection code.
- No change to any existing test file. Existing tests pass unmodified, with not even an import path changing, because `run.ts`, `live-round.ts` and `types.ts` stay as re-export barrels.
- No change to either fixture folder (`tests/fixtures/characterization/`, `tests/fixtures/window-parity/`).
- No change to any user-visible string, including the existing non-ASCII middle dots in `describe.ts` text. (The ASCII rule applies to new docs and new code; changing UI text would break behaviour neutrality.)
- No change to `previews.ts`, `abilityUi.ts` or `styles.css` beyond reserved slots (open question 2).
- No performance work. Hot paths stay the same: one handler lookup replaces one `if` chain.

## 2. Current state (read for this plan)

| File | Lines | What is in it today |
| --- | --- | --- |
| `src/sim/live-round.ts` | 968 | Types: `PlanFailure`, `RoundPhase`, `StandingOrder`, `AgentCommand` (hold, move-route, cast, shoot), `OrderOrigin`, `OrderLogEntry`, `LiveDecideFn`, `PendingBatch`, `IssueOrdersOptions`, `PlanStepStatus`, `PlanStepTrigger`, `PlanStepState`, `LiveRound`, `OpenLiveOptions`, `IssueResult`. Exported functions: `isLiveRound`, `openLiveRound`, `flushPendingBatches`, `issueOrders`, `stepLive`, `standingPositionAt`, `drainJobsUntil`, `replayOrderLog`, `viewLive`, `truthLiveWorld`. Private functions: `stepOnce`, `fireDuePlanSteps`, `markUnfiredPlanSteps`, `cancelWaypointPlans`, `cancelAbilityPlans`, `markWaypointReached`, `runDecisions`, `evaluateResult`, `applyPendingBatch`, `enqueue`, `moveSpeedFor`, `startSegment`, `advanceStanding`, `scheduleFires`, `validateCommand`, `cloneCommand`, `toInstance`. |
| `src/sim/run.ts` | 733 | Types `AgentBody`, `World`, `RoundResult`, `SimEvent` (an intersection `{ timeMs; sequence; agentId } & (22 members)`), `RunSuccess`, `RunFailure`, `RunResult`, `Job` (19 members), `ApplyResult`. Functions `runScenario`, `orderTime`, `orderToJob`, `applyJob` (a chain of 17 top-level `if (job.type === ...)` branches with `engage` as the fall-through at the end; the `cast` branch calls `tryResolveBreachCast` then `tryResolveBrimstoneCast`, then falls back to `cast-rejected`), `nearestVisibleEnemy`, `withheld`, `findAgent`, `toInstance`, `createWorld`, `autoFireIntervalFor`, `lerpPoint`. Imports every Breach and Brimstone `apply*` function. |
| `src/sim/types.ts` | 112 | `Point`, `Segment`, `Side`, `Role`, `TacticalAssignment`, `ImplementationStatus`, `CapabilityKind`, `TRACKED_CAPABILITIES`, `RejectionCode` (20 members), `StatusEffect`, `SmokeVolume`, `Device`, `DamageZone`. |
| `src/sim/fog.ts` | 37 | `viewWorld`: own agents, plus enemies seen by a living, non-blind ally with `hasLineOfSight`; own devices plus enemy devices with `enemiesSeeRadius`; own zones plus `blocksVision` zones. |
| `src/sim/describe.ts` | 58 | `describeEvent`: one `switch` over all 22 `SimEvent` types with a `never` exhaustiveness default. |
| `src/ui/orders/rejectionMessages.ts` | 28 | `MESSAGES: Record<RejectionCode, string>` (compile-time complete) and `rejectionMessage`. |
| `src/ui/board/MapView.tsx` | 483 | `labelLayout`, `renderPrimitive`, `MapView`. Pointer handling (`pointFromClient` -> `svgClientToMm`, drag-box, wheel, context menu), then inline SVG children in this order: background rect, `map.sites`, `map.walls`, smokes, `world.zones`, `world.devices`, `previewPrimitives`, drag box, `world.agents`. |
| `src/ui/App.tsx` | 1253 | `remainingWaypoints`, `abilityDisplayName`, `scenarioForPreRound`, and `App()`, which owns 25 `useState`, 11 `useRef`, 11 `useMemo` and 3 `useEffect` (buy timer interval, rAF host loop, keyboard), about 17 handlers (`resetToPreRound`, `newRound`, `enterLive`, `goLive`, `togglePause`, `onTeams`, `clearRoutesForSelection`, `applyCommands`, `issueHoldSelection`, `issueGroupMove`, `issueCastAt`, `onPointClick`, `onBuy`, `onPreRoundBuy`, `onPreRoundRefund`, `downloadReplay`, `loadReplay`), and the JSX: `div.app.app-live` > `header.masthead`, `section.game-stage[aria-label="Game stage"]` > `div.board-shell` (topbar "Transport", MapView, "Kill feed", "Order modes", "Plan status", HUD) and `aside#setup-drawer[aria-label="Setup"]`. |
| `src/sim/agents/catalog.ts` | 204 | `SHIPPED_CATALOG.agents: [BRIMSTONE, KAYO, JETT, CYPHER, BREACH]`. |
| `src/rules/ruleset.ts` | 221 | `Ruleset` type and `STANDARD_RULESET` object (append-only fields for new constants). |
| `tests/architecture.test.ts` | 48 | Pins `DECISION_CONTEXT_VERSION`, `LEARNING_RECORD_VERSION`, `IMPLEMENTED_EVALUATORS`, `PLANNED_EVALUATORS`; scans `src` for `Math.random` and React imports in the isolated folders. |

Fixtures: `tests/fixtures/characterization/` (7 files) and `tests/fixtures/window-parity/` (3 files).

Importers that must keep working without edits (counted with grep): about 20 source files and 15 test files import from `src/sim/run.ts` or `src/sim/live-round.ts`, including both resolve files, `fog.ts`, `describe.ts`, `preround.ts`, `session.ts`, `tactics/defense-stub.ts`, every UI module that touches the round, `tests/sim/support/live-harness.ts` and the characterization scenarios.

Import cycle detail (graphify plus code): `breach-resolve.ts` and `brimstone-resolve.ts` import `ApplyResult`, `Job` and `World` (types) and `findAgent` (a value) from `run.ts`, while `run.ts` imports their `apply*` and `tryResolve*Cast` functions.

## 3. Target module layout

New files are marked (new). `run.ts`, `live-round.ts` and `types.ts` keep exporting every name they export today.

```text
src/sim/
  world.ts               (new) AgentBody, World, RoundResult, findAgent, lerpPoint, autoFireIntervalFor, createWorld
                               -- leaf for kits: imports only types.ts, rules/, scenario/types, agents/state
  rejections.ts          (new) CoreRejectionCode (the 20 existing codes) and RejectionCode = composed union with slots
  types.ts               re-exports RejectionCode from rejections.ts; everything else unchanged
  jobs/
    types.ts             (new) Job and SimEvent composed unions with slots; ApplyResult; JobHandler<T>; ApplyContext
    core.ts              (new) CoreJob, CoreEvent; handlers for move, move-resolve, cast (resolver walk + fallback),
                               engage, auto-engage, smoke-active, smoke-expire, status-expire; nearestVisibleEnemy,
                               withheld. status-expire is generic (statuses from any kit), so applyStatusExpire moves
                               here verbatim from breach-resolve.ts, which re-exports it for its existing importers
    cast-resolvers.ts    (new) CAST_RESOLVERS: ordered, explicit list [breach, brimstone] with slots
    handlers.ts          (new) JOB_HANDLERS: mapped table over Job["type"], composed from per-module tables with slots
    apply.ts             (new) applyJob = lookup in JOB_HANDLERS (signature unchanged)
  agents/abilities/
    breach-jobs.ts       (new) BreachJob type members (aftershock-burst, flashpoint-impact, fault-line-wave,
                               rolling-thunder-blast); types only
    brimstone-jobs.ts    (new) BrimstoneJob members (stim-beacon-pulse, device-expire, incendiary-detonate,
                               orbital-activate, orbital-shrink, zone-tick, zone-expire); types only
    breach-resolve.ts    adds BREACH_JOB_HANDLERS and BREACH_CAST_RESOLVER; imports from world.ts and jobs/types.ts
    brimstone-resolve.ts adds BRIMSTONE_JOB_HANDLERS and BRIMSTONE_CAST_RESOLVER; same imports
  run.ts                 runScenario, orderTime, orderToJob; re-exports world.ts, jobs/types.ts, jobs/apply.ts
  fog.ts                 viewWorld = ordered rule lists from fog/
  fog/
    rules.ts             (new) ENEMY_SIGHT_RULES, DEVICE_RULES, ZONE_RULES (each ordered, with slots)
    core.ts              (new) losFromNonBlindAlly, ownOrRadiusVisibleDevice, ownOrVisionZone
  describe.ts            describeEvent = prefix + EVENT_TEXT[type]
  describe/
    core.ts              (new) CORE_EVENT_TEXT (the 22 existing strings, verbatim)
    registry.ts          (new) EVENT_TEXT: mapped over SimEvent["type"], composed with slots
  live-round.ts          barrel: re-exports everything from live/
  live/
    types.ts             (new) all live types listed in section 2, LiveRound with field slots
    commands.ts          (new) CoreCommand; AgentCommand composed with slots; COMMAND_SPECS mapped over kind
                               ({ validate, apply, clone } per kind: hold, move-route, cast, shoot)
    open.ts              (new) isLiveRound, openLiveRound (with an init slot list)
    orders.ts            (new) issueOrders, flushPendingBatches, applyPendingBatch (dispatch via COMMAND_SPECS.apply)
    validate.ts          (new) validateCommand (common checks, then COMMAND_SPECS[kind].validate), toInstance
    step.ts              (new) stepLive; stepOnce as STEP_PHASES, an ordered list, same order as today
    drain.ts             (new) drainJobsUntil, enqueue
    standing.ts          (new) moveSpeedFor, startSegment, advanceStanding, standingPositionAt
    fire.ts              (new) scheduleFires
    result.ts            (new) evaluateResult over RESULT_RULES (ordered; slot for G2 before elimination rules)
    decide.ts            (new) runDecisions
    plan-steps.ts        (new) fireDuePlanSteps, markUnfiredPlanSteps, cancelWaypointPlans, cancelAbilityPlans,
                               markWaypointReached
    replay.ts            (new) replayOrderLog
    view.ts              (new) viewLive, truthLiveWorld
src/ui/
  App.tsx                App(): calls useLabController() and renders the same element tree from components
  app/
    useLabController.ts  (new) every hook, ref, memo, effect and handler from App(), moved verbatim, same order
    Masthead.tsx         (new) header.masthead
    TransportBar.tsx     (new) div.board-topbar[aria-label="Transport"]
    BoardStage.tsx       (new) MapView element plus the kill feed
    OrdersBar.tsx        (new) "Order modes", Fault Line length, "Plan status", HUD
    SetupDrawer.tsx      (new) aside#setup-drawer contents
    slots.tsx            (new) TOPBAR_SLOTS, ORDERS_SLOTS, SETUP_SLOTS, BOARD_OVERLAY_SLOTS (arrays, empty in H0)
  board/
    MapView.tsx          pointer handling unchanged; renders MAP_LAYERS in order
    layers/              (new) BackgroundLayer, SitesLayer, WallsLayer, SmokesLayer, ZonesLayer, DevicesLayer,
                               PreviewLayer, DragBoxLayer, AgentsLayer, index.ts (MAP_LAYERS with slots)
  orders/
    rejectionMessages.ts MESSAGES composed from CORE_REJECTION_MESSAGES plus slots; still Record<RejectionCode, string>
```

Approximate sizes after the split: no file in `src/sim/live/` over 250 lines; `run.ts` about 120; `jobs/core.ts` about 330; `App.tsx` about 60; `useLabController.ts` about 900 (H0 only moves it; later stages put their state in their own hooks, section 6.3).

## 4. Extensible unions

### 4.1 Options compared

| Option | How a stage adds a member | Conflicts between two stages in one wave | Exhaustiveness | Verdict |
| --- | --- | --- | --- | --- |
| A. Today: one union in `run.ts` / `types.ts` / `live-round.ts` | Edit the union block | Yes: both stages append at the same end line | `never` default and `Record` keys | Rejected: this is the conflict H0 removes. |
| B. Per-stage type file plus one line per stage in a central composed union, inside that stage's reserved slot | New file `<stage>-jobs.ts` exporting `X1Job`; one line `| X1Job` in X1's slot in `jobs/types.ts` | No: each stage writes only between its own slot markers, separated from other slots by unchanged lines | Mapped handler tables over `Job["type"]` fail to compile if a member has no handler | **Chosen.** |
| C. Module augmentation (`interface JobMap { ... }` extended with `declare module "../jobs/types.ts"`) | New file only; no central edit for the type | No for the type, but the runtime handler table still needs a central entry, so a central edit is needed anyway | Same as B once the table is mapped | Rejected: saves nothing (the runtime table is central either way), hides the member list across the program, breaks silently when files move (the module path is a string), and any file anywhere in `include` can change the union. |
| D. Widen to `string` with runtime checks | Nothing central | No | Lost | Rejected: gives up the compile-time guarantees `describe.ts` and `rejectionMessages.ts` have today. |

B is the simplest option that removes the conflicts: plain TypeScript unions, plain imports, plus reserved slots (section 7). `verbatimModuleSyntax` is on, so every type-only import and re-export uses `import type` / `export type`.

### 4.2 Job and SimEvent

```ts
// src/sim/jobs/types.ts
import type { CoreJob, CoreEvent } from "./core.ts";
import type { BreachJob } from "../agents/abilities/breach-jobs.ts";
import type { BrimstoneJob } from "../agents/abilities/brimstone-jobs.ts";

export type Job =
  | CoreJob
  | BreachJob
  | BrimstoneJob
  // >>> slot X1 >>>
  // <<< slot X1 <<<

  // >>> slot K3 >>>
  // <<< slot K3 <<<
  ;   // (slots for G2, K4, K5 as listed in section 7)

export type SimEvent = { timeMs: number; sequence: number; agentId: string } & (
  | CoreEvent      // all 22 existing members stay here in H0 (several are shared by both kits)
  // >>> slot X1 >>>
  // <<< slot X1 <<<
  ...
);

export type ApplyContext = {
  timeMs: number; sequence: number; world: World; catalog: Catalog;
  walls: readonly Segment[]; combat: Rng; ruleset: Ruleset;
};
export type JobHandler<T extends Job> = (job: T, ctx: ApplyContext) => ApplyResult;
export type JobHandlerTable = { [K in Job["type"]]: JobHandler<Extract<Job, { type: K }>> };
```

`SimEvent` keeps today's intersection shape. TypeScript normalises `A & (B | C)` to `(A & B) | (A & C)`, so `Extract<SimEvent, { type: K }>` and `SimEvent["type"]` work as they do in `describe.ts` now.

The existing Breach and Brimstone job members move into `breach-jobs.ts` / `brimstone-jobs.ts` (types only, no imports from `run.ts`), which establishes the pattern K3 copies. The existing events stay in `CoreEvent` because several are shared (open question 4).

### 4.3 RejectionCode

```ts
// src/sim/rejections.ts
export type CoreRejectionCode = "ability-not-owned" | /* ...the 20 existing codes, unchanged order... */ "charges-full";
export type RejectionCode =
  | CoreRejectionCode
  // >>> slot X1 >>>
  // <<< slot X1 <<<
  ;
// src/sim/types.ts keeps: export type { RejectionCode } from "./rejections.ts";
```

```ts
// src/ui/orders/rejectionMessages.ts
const MESSAGES: Record<RejectionCode, string> = {
  ...CORE_REJECTION_MESSAGES,   // the 20 existing strings, verbatim
  // >>> slot X1 >>>
  // <<< slot X1 <<<
};
```

`Record<RejectionCode, string>` keeps today's guarantee: a stage that adds a code without a message fails `tsc`.

### 4.4 AgentCommand

```ts
// src/sim/live/commands.ts
export type CoreCommand =
  | { kind: "hold"; instanceId: string }
  | { kind: "move-route"; instanceId: string; waypoints: Point[] }
  | { kind: "cast"; /* unchanged fields */ }
  | { kind: "shoot"; instanceId: string; targetInstanceId: string };

export type AgentCommand =
  | CoreCommand
  // >>> slot X1 >>>   (recall)
  // <<< slot X1 <<<
  // >>> slot G2 >>>   (plant, defuse)
  // <<< slot G2 <<<
  ;

export type CommandSpec<C extends AgentCommand> = {
  /** Kind-specific checks after the common unknown-agent / wrong-side / agent-down checks. */
  validate(round: LiveRound, side: Side, command: C): { ok: true } | { ok: false; code: RejectionCode; message: string };
  /** What applyPendingBatch does for this kind (today's branch bodies, verbatim). */
  apply(round: LiveRound, command: C, origin: OrderOrigin, walls: readonly Segment[]): void;
  /** Today's cloneCommand branch for this kind, verbatim (omits undefined optional fields). */
  clone(command: C): C;
};
export const COMMAND_SPECS: { [K in AgentCommand["kind"]]: CommandSpec<Extract<AgentCommand, { kind: K }>> } = {
  ...CORE_COMMAND_SPECS,
  // slots
};
```

`validateCommand` keeps its current common prefix (unknown agent, wrong side, agent down, in that order), then calls `COMMAND_SPECS[command.kind].validate`. `cloneCommand` keeps its exact field handling per kind, because replay and the order log compare cloned objects.

## 5. Handler registration

### 5.1 Explicit central lists, no side-effect imports

Every table is a plain object literal or array in one central file that imports each contributing module by name. Nothing registers itself at import time. A forgotten import is then a compile error (a missing key in a mapped table) or a test failure (section 5.3), never a silently dropped kit.

```ts
// src/sim/jobs/handlers.ts
export const JOB_HANDLERS: JobHandlerTable = {
  ...CORE_JOB_HANDLERS,
  ...BREACH_JOB_HANDLERS,
  ...BRIMSTONE_JOB_HANDLERS,
  // >>> slot X1 >>>
  // <<< slot X1 <<<
};

// src/sim/jobs/apply.ts (same signature as today's applyJob)
export function applyJob(job: Job, timeMs: number, sequence: number, world: World, catalog: Catalog,
  walls: readonly Segment[], combat: Rng, ruleset: Ruleset = STANDARD_RULESET): ApplyResult {
  world.timeMs = timeMs;   // today's first statement, kept
  const handler = JOB_HANDLERS[job.type] as JobHandler<typeof job>;
  return handler(job, { timeMs, sequence, world, catalog, walls, combat, ruleset });
}
```

Each kit's table must be typed as a partial of the full table (`satisfies Partial<JobHandlerTable>`), so a key typo fails `tsc`. The spread order cannot matter because keys never overlap (section 5.3 asserts that).

### 5.2 Cast resolvers

```ts
// src/sim/jobs/cast-resolvers.ts
export type CastResolver = {
  agentId: string;                         // catalog definition id
  abilityIds: readonly string[];           // abilities this resolver claims
  resolve(job: CastJob, ctx: ApplyContext): ApplyResult | null;   // today's tryResolve*Cast, unchanged
};
export const CAST_RESOLVERS: readonly CastResolver[] = [
  BREACH_CAST_RESOLVER,      // same order as today's cast branch
  BRIMSTONE_CAST_RESOLVER,   // claims the Brimstone kit including sky-smoke
  // >>> slot K3 >>>
  // <<< slot K3 <<<
];
```

The core `cast` handler walks `CAST_RESOLVERS` in order and falls back to today's `cast-rejected` path. Order is kept, but section 5.3 makes it irrelevant by proving every complete ability is claimed by exactly one resolver.

### 5.3 Completeness tests (new file `tests/sim/registry.test.ts`)

1. **Every Job type has exactly one handler.** Compile time: `JobHandlerTable` is a mapped type, so a missing key fails `tsc`. Runtime: `Object.keys(JOB_HANDLERS).sort()` equals an explicit sorted list of all 19 job types written in the test. Each per-module table's keys are disjoint from the others (checked by counting).
2. **Every shipped agent's complete abilities have exactly one cast resolver.** For each agent in `SHIPPED_CATALOG`, for each ability with `implementation === "complete"`: exactly one `CAST_RESOLVERS` entry lists it in `abilityIds`. That entry's `agentId` equals the agent. Calling its `resolve` with a synthetic cast job (the agent in a fresh `createWorld` of the playable drill, with charges and ult points topped up) returns non-null. Every other resolver returns null for that job. A placeholder ability is claimed by nobody.
3. **Every resolver claim is real.** Every id in any `abilityIds` exists in the catalog and is `complete`.
4. **Every SimEvent type has text, every RejectionCode has a message, every AgentCommand kind has a spec.** These are compile-time through mapped types. Runtime key lists are checked against explicit expected lists, as in item 1.
5. **No self-registration.** A new architecture assertion, in a new file `tests/architecture-registry.test.ts` so `tests/architecture.test.ts` stays unmodified, scans `src/sim` for module-level calls to functions named `register*` and expects none.

## 6. App.tsx split

### 6.1 Components and state ownership

- **`useLabController()`** (`src/ui/app/useLabController.ts`) contains, moved verbatim and in the same order, every `useState`, `useRef`, `useMemo`, `useEffect` and handler now in `App()`. It returns one `LabController` object (state values, setters the components need, handlers, refs). Keeping every hook in one function, in the same order, keeps React's hook order and effect order identical. Moving effects into child components would change effect timing, because children's effects run before parents', so H0 does not do that.
- **Presentational components** receive the controller (or the slice they need) and hold no state of their own. They render exactly the markup that is inline today: same elements, classes, `aria-label`s, `id`s and order, and no wrapper elements. `App()` keeps the structural wrappers (`div.app.app-live`, `section.game-stage`, `div.board-shell` with `ref={boardFocusRef}`), so tests such as "board-shell is the first child of Game stage and setup-drawer the last" hold without change.
  - `Masthead`: `header.masthead`.
  - `TransportBar`: `div.board-topbar[aria-label="Transport"]` (phase badge, buy timer, Hold timer, Go, round timer, pause, speed, fog, replay buttons).
  - `BoardStage`: the `MapView` element with its props, plus the "Kill feed" list.
  - `OrdersBar`: "Order modes", Fault Line length, "Plan status", `AttackerHud`.
  - `SetupDrawer`: `aside#setup-drawer[aria-label="Setup"]` and its contents.
- **Module helpers** `remainingWaypoints`, `abilityDisplayName` and `scenarioForPreRound` move to `src/ui/app/helpers.ts` unchanged.

### 6.2 Slots for stage UI

`src/ui/app/slots.tsx` exports four arrays of components, each `(props: { lab: LabController }) => JSX.Element | null`: `TOPBAR_SLOTS`, `ORDERS_SLOTS`, `SETUP_SLOTS` and `BOARD_OVERLAY_SLOTS`. They are rendered at fixed points in the components. They are empty in H0, and an empty array renders nothing, so the DOM is unchanged. Each array has reserved slot markers per stage (section 7).

### 6.3 Rule for later stages

A stage's UI state lives in its own hook file (`src/ui/<area>/use<Stage>State.ts`), called from `useLabController` inside that stage's slot. Hooks are called in slot order, which is fixed, so hook order is stable. Its markup is a component in its own file mounted through a slot array, and its CSS is in `<Component>.css` imported by the component. `App.tsx` itself does not change after H0.

## 7. Reserved slots

### 7.1 Marker format

```ts
  // >>> slot G2 (docs/stage-g2-plan.md) >>>
  // <<< slot G2 <<<

  // >>> slot K5 (docs/stage-k5-plan.md) >>>
  // <<< slot K5 <<<
```

- One begin and one end line per stage, with exactly one blank line between consecutive slots. Two branches editing different slots then never change adjacent lines, so git merges them cleanly.
- Slots are ordered by wave, then by merge order within the wave (section 6 of `parallel-build-plan.md`). An insertion-order dependency (for example `RESULT_RULES`, `STEP_PHASES`, `MAP_LAYERS`, `CAST_RESOLVERS`) puts the slot where that stage's plan needs it, and the comment names the position (for example "G2: before elimination rules").
- In JSX arrays and object literals, the markers are comments inside the literal, so an empty slot compiles to nothing.

### 7.2 Where slots go (from the wave 1-5 plans' files-touched tables)

| File (after H0) | Slots for |
| --- | --- |
| `src/sim/jobs/types.ts` (Job, SimEvent) | X1, K3, K4, G2, K5 |
| `src/sim/jobs/handlers.ts`, `src/sim/describe/registry.ts` | X1, K3, K4, G2, K5 |
| `src/sim/jobs/cast-resolvers.ts` | K3, K4, K5 |
| `src/sim/rejections.ts`, `src/ui/orders/rejectionMessages.ts` | X1, K3, G3, K4, G2, K5 |
| `src/sim/live/commands.ts` (`AgentCommand`, `COMMAND_SPECS`) | X1 (recall), G2 (plant, defuse) |
| `src/sim/live/types.ts` (`LiveRound` fields) | X1, G6, G3, O1, G2 |
| `src/sim/live/open.ts` (init list) | X1, G6, G3, G2 |
| `src/sim/live/step.ts` (`STEP_PHASES`) | X1, G2, K4 |
| `src/sim/live/result.ts` (`RESULT_RULES`) | G2 (before elimination rules) |
| `src/sim/world.ts` (`AgentBody` and `World` fields) | X1, K3, G3, K4, G2, K5 |
| `src/sim/fog/rules.ts` | K3, K4, G2, K5 |
| `src/rules/ruleset.ts` (`Ruleset` type and `STANDARD_RULESET`) | X1, G1, K3, G3, K4, G2, K5, G4 |
| `src/sim/agents/catalog.ts` (`agents` list) | K3, K4, K5 |
| `src/sim/agents/definition.ts` (`AbilityDefinition` fields) | X1, D1, G5 |
| `src/ui/board/layers/index.ts` (`MAP_LAYERS`) | G1 (replaces SitesLayer through its slot), X1, K3, O1, K4, G2, K5 |
| `src/ui/board/previews.ts` (ability `case`s) | K3, K4, G2, K5 |
| `src/ui/orders/abilityUi.ts` (`castKind`) | K3, K4, K5 |
| `src/ui/app/slots.tsx` and the hook list in `useLabController.ts` | every wave 1-5 stage with UI: X1, G1, G6, K3, D1, G3, O1, K4, G2, K5, G4, O2, G5 |

### 7.3 Keeping slots tidy

1. H0.6 creates only the slots in 7.2. A stage that needs a slot it does not have adds it in its first commit, between existing slots, keeping the one-blank-line rule.
2. A stage writes only between its own markers. A reviewer rejects a branch that edits outside them in a slotted file (part of the per-branch gate).
3. Markers stay in place while their wave is in flight. At **wave close** (every branch of the wave merged, main green), one "slot tidy" commit removes the merged stages' markers (keeping their content, as is), and adds empty slots for the next wave's stages from those stages' plans. Tidy happens only when no branch is open, so it cannot conflict.
4. An empty slot left over after its stage shipped, or one for a stage that is dropped, is removed in the next tidy commit.
5. A test in `tests/architecture-registry.test.ts` checks marker hygiene: every `>>> slot X` has a matching `<<< slot X` in the same file, no slot name appears twice in one file, and slot names come from a fixed list of stage ids.

## 8. Sub-stages (each one commit, each green)

Every sub-stage ends with `npm run check` green, both fixture folders unchanged (`git diff --exit-code -- tests/fixtures/characterization tests/fixtures/window-parity`), no existing test file changed (`git diff --stat <H0 base> -- tests/` lists only files added by H0), and the H0 golden tests (H0.0) passing. Sub-stages land in this order because each one leans on the previous one.

**H0.0 Golden capture (before any refactor).** New `tests/sim/h0-golden.test.ts` and `tests/ui/h0-dom.test.tsx`, recording into a new folder `tests/fixtures/h0-golden/` with the same `VALSIM_UPDATE_FIXTURES=1` switch the characterization test uses. Recorded at the base commit:

- **Engine fingerprint.** Seeds 1 to 5 of the playable drill, each with a pre-round plan: Breach routed through the doorway, Flashpoint at waypoint 0, an at-time Brimstone cast and a bought charge. Each starts with `startLiveFromPreRound`, uses `decide: defenseHoldDecide`, and steps until the round ends or 100 s. Recorded each second: `truthLiveWorld`, `viewLive(attack)`, `viewLive(defense)`, `planSteps`. Recorded at the end: `events`, `orderLog`, `result`, `combatState`, and `describeEvent(e)` for every event.
- **Rejections.** A scripted batch that hits every rejection code reachable from today's commands, recording the code, message and `rejectionMessage(code)` for all 20 codes.
- **Replay.** `replayOrderLog` of seed 1 deep-equals the original world and events.
- **Chunking.** Stepping in chunks of 1, 7 and 40 steps gives identical results.
- **DOM.** `container.innerHTML` of `<App />` (jsdom, 200x120 board mock) at: boot; after a right-click route and a Q aim; after Go; with the setup drawer open; and the round-end banner state built from a pre-finished round.

**H0.1 live-round split.** Move code from `live-round.ts` into `src/sim/live/*` as in section 3, verbatim except for imports. `live-round.ts` becomes a barrel with the same exports. `stepOnce` becomes `STEP_PHASES`, a list of functions over a step context (`round, prevTime, newTime, eventStart, walls, combat, ended`), in exactly today's order: plan steps fire; pending batch applies and drains at `prevTime`; standing routes advance; fires are scheduled; jobs drain to `newTime`; the step's events are re-sorted; time commits; the result is evaluated (ending the step early as today); decisions run. `evaluateResult` becomes `RESULT_RULES` in today's order (defense eliminated, attack eliminated, timeout). `validateCommand`, `applyPendingBatch` and `cloneCommand` dispatch through `COMMAND_SPECS` (core kinds only). Acceptance: the gate above, plus no file in `src/sim/live/` over 250 lines.

**H0.2 run.ts unions and handler table.** Create `world.ts`, `jobs/*`, `breach-jobs.ts`, `brimstone-jobs.ts`, `rejections.ts`. Move each `applyJob` branch body verbatim into a handler. The resolve modules export their handler tables and cast resolvers, and import from `world.ts` and `jobs/types.ts` instead of `run.ts`. `run.ts` and `types.ts` become barrels for the moved names. Add `tests/sim/registry.test.ts` (section 5.3). Acceptance: the gate, plus `graphify update` reports no import cycles, and the `applyJob()` node's degree falls (it now calls only the table).

**H0.3 Fog, rejection and describe registries.** `fog.ts` evaluates `ENEMY_SIGHT_RULES` (visible if any rule says visible; today's single rule is `losFromNonBlindAlly`), `DEVICE_RULES` and `ZONE_RULES`. Output arrays keep today's order and cloning (`own` then visible enemies; `structuredClone` of smokes, devices and zones). `describeEvent` builds the same prefix and looks up `EVENT_TEXT`. `rejectionMessages.ts` composes `CORE_REJECTION_MESSAGES`. Every string is copied byte for byte (the H0.0 describe and rejection fixtures prove it).

**H0.4 MapView layers.** Each inline SVG child group becomes a component in `src/ui/board/layers/`, rendered from `MAP_LAYERS` in today's order: background, sites, walls, smokes, zones, devices, previews, drag box, agents. Each layer gets a typed props object (`map`, `world`, `smokes`, `previewPrimitives`, `box`, `agentDisplay`, `labels`, `selectedInstanceIds`, `onAgentClick`). Pointer handling, `pointFromClient` and `svgClientToMm` stay in `MapView` unchanged. Acceptance: the DOM fixtures match exactly.

**H0.5 App split.** As in section 6. Acceptance: DOM fixtures match exactly, the full UI test suite passes unmodified, and the browser smoke test (section 9.4) passes.

**H0.6 Reserved slots.** Add the markers from section 7.2, and the marker hygiene test. Acceptance: the gate. A `git diff` of this commit shows only comment lines, plus one new test file and, where an empty literal needs it, a spread of an empty constant.

## 9. Acceptance proof that nothing changed

1. **Existing tests unmodified.** `git diff --stat <H0 base>..<H0 head> -- tests/` lists only files H0 adds: `tests/sim/h0-golden.test.ts`, `tests/ui/h0-dom.test.tsx`, `tests/sim/registry.test.ts`, `tests/architecture-registry.test.ts` and `tests/fixtures/h0-golden/**`. All 165 baseline tests pass at every sub-stage. The test count only grows.
2. **Fixture folders unchanged.** `git diff --exit-code <H0 base> -- tests/fixtures/characterization tests/fixtures/window-parity` exits 0 at every sub-stage.
3. **Same-seed deep-equal across the split.** The H0.0 golden fixtures, recorded before any move, deep-equal at every later sub-stage: per-second truth and both fogged views, events with sequence numbers, the order log, `combatState`, plan-step states, results, all `describeEvent` text, all rejection messages, replay equality and chunk-size independence. Never regenerate them during H0. Regenerating them is a failure of the stage.
4. **Browser smoke at 1366x768.** A new committed script, `tools/smoke-browser.mjs`. It drives a local Chrome or Edge (path from `BROWSER_PATH`, or the usual install locations) through the DevTools protocol with Node's built-in `WebSocket`, against `npm run dev` on a fixed port. It uses no new dependency. Its checks:
   - No document scroll (`scrollHeight == clientHeight`, `scrollWidth == clientWidth`).
   - No console errors or uncaught exceptions during the run.
   - **Stage d4 regression:** right-click the drawn centre of Site A (taken from the site rect's `getBoundingClientRect`). The `route-waypoint-breach-attack-0` disc centre is within 1 px of the cursor, and its `cx`/`cy` are within 30 mm of (16750, 6000).
   - A drag-box around Brimstone selects only Brimstone.
   - Go, Space, then 5 s of play advance the round timer, and the event log is non-empty.
   - Screenshots of the boot and post-route states are pixel-identical to screenshots taken at the H0 base commit with the same script. The UI is paused or static in those states, so this is deterministic.
   The script writes a JSON report and screenshots to a git-ignored folder. It is a manual gate run at H0.4, H0.5 and H0.6, not part of `npm run check`.
5. **Structure checks.** `graphify update` after H0.2 shows no import cycles. After H0.5, `App()` is no longer the top god node.

## 10. Wave 1 plans after H0 (check, not amended here)

H0 keeps every public name, so no plan's design changes. What changes is the file each edit lands in. The mapping from old to new home:

| Old file in a plan | New home after H0 |
| --- | --- |
| `src/sim/live-round.ts` | the matching `src/sim/live/*.ts` module, plus that stage's slots |
| `src/sim/run.ts`: Job / SimEvent members | the stage's own `*-jobs.ts` or events file, plus slot lines in `jobs/types.ts`, `jobs/handlers.ts`, `describe/registry.ts` |
| `src/sim/run.ts`: `AgentBody` / `World` fields | `src/sim/world.ts` slots |
| `src/sim/run.ts`: `applyJob` branches | the stage's handler table, plus a slot in `jobs/handlers.ts` |
| `src/sim/types.ts`: `RejectionCode` | `src/sim/rejections.ts` slot, plus a `rejectionMessages.ts` slot |
| `src/sim/fog.ts` | a rule in the stage's module, plus a `fog/rules.ts` slot |
| `src/sim/describe.ts` | the stage's text table, plus a `describe/registry.ts` slot |
| `src/ui/board/MapView.tsx` | a layer component, plus a `layers/index.ts` slot |
| `src/ui/App.tsx` | the stage's hook and components, plus `slots.tsx` and controller hook slots |

| Plan | Still makes sense? | Must be amended before its branch starts |
| --- | --- | --- |
| **X1** (`stage-x1-plan.md`) | Yes. | Yes. Its `live-round.ts` row ("drain stale skip, tie deferral and sweep, round-end cancel, batch interrupts, recall command, validation, clone") maps to `live/drain.ts`, `live/step.ts`, `live/orders.ts`, `live/commands.ts` (recall spec, with validate, apply and clone together) and `live/validate.ts`. Its `run.ts` row maps to `world.ts` (`channel?`), `jobs/types.ts` (`ApplyResult.cancelQueued?`, a core type change rather than a slot), `jobs/core.ts` (the `channeling` withheld reason in `nearestVisibleEnemy`) and `run.ts` (`runScenario`). Its `describe.ts`, `rejectionMessages.ts`, `MapView.tsx` and `App.tsx` rows map to registries, a `ChannelRingLayer` and slots. The drain changes are core edits in a shared module; X1 is the only wave 1 stage editing `live/drain.ts`, so that is safe. |
| **G1** (`stage-g1-plan.md`) | Yes. | Yes. The "getMap import" rows for `fog.ts`, `run.ts` and `live-round.ts` become: `fog/core.ts`, `run.ts` (`runScenario`), `jobs/core.ts` (auto-engage line of sight), `live/step.ts` and `live/open.ts` (wherever `getMap` is called after the split). "MapView regions, wall path" maps to `layers/SitesLayer.tsx` (replaced by a regions layer) and `layers/WallsLayer.tsx`. The `App.tsx` row maps to the controller hook (map from registry, pathed live moves, hover throttle) through G1's controller slot. |
| **G6** (`stage-g6-plan.md`) | Yes. | Yes. Its `live-round.ts` row maps to `live/types.ts` (`PlanStepState.side`, `LiveRound.planRouteActive` in G6's slot), `live/plan-steps.ts` (`fireDuePlanSteps` uses `step.side`, side-scoped cancels), `live/decide.ts` (the plan-lock `hold` filter in `runDecisions`), `live/standing.ts` and `live/orders.ts` (clearing the lock), `live/open.ts` (init) and a new `isPlanLocked` export through the barrel. The `App.tsx` row becomes a `useHotSeatState` hook, a hot-seat overlay component and the replay field changes in the controller, through G6's slots. `AttackerHud.tsx`, `planState.ts`, `preround.ts` and `replayFile.ts` are untouched by H0, so those rows stand. |
| **K3** (`stage-3-plan.md`) | Yes, with the note already in that plan (window references read as live). | Yes. The `src/sim/types.ts` / `run.ts` row becomes `raze-jobs.ts`, Raze handler and cast-resolver entries, `world.ts` (device and projectile fields), and `rejections.ts` if new codes are needed. `src/sim/live-round.ts` (validation) becomes `live/validate.ts`, which needs no change if Raze casts use the generic cast path. `view(side)` becomes a rule in `fog/rules.ts`. The kill path in `run.ts` becomes `jobs/core.ts` (the engage handler). The catalog, previews and `castKind` rows go into their slots. |

Later waves map the same way. G4, O2 and G5 touch mostly new files plus `App.tsx`, so only their App rows change. D1 is untouched except for its `definition.ts` slot. G3, O1, K4, G2 and K5 need the same row remapping as above, done before each wave starts. The coordinator amends each plan's files-touched table in a docs-only commit before that stage's branch opens.

## 11. Risks and mitigations

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | A verbatim move silently changes behaviour: event order, sequence numbers, an `if` order inside a branch, or a lost early return in `stepOnce`. | The H0.0 golden fixtures cover events with sequence numbers, per-second worlds and views, combat RNG state and replay. Step phases keep an explicit `ended` flag in the step context that every later phase checks, mirroring today's `return`. |
| 2 | A runtime import cycle after the split (for example `jobs/apply.ts` -> handlers -> resolve -> `run.ts`) produces `undefined` at module load. | Kits import only `world.ts`, `jobs/types.ts` and leaf helpers, never `run.ts` or `jobs/apply.ts`. A new architecture assertion forbids `src/sim/agents/**` from importing `run.ts`, `live-round.ts` or `src/sim/live/**`. `graphify update` must show no cycles. |
| 3 | React hook or effect order changes in the App split (stale closures, a different interval or rAF order, keyboard handler attached at a different time). | Every hook moves into one controller in the same order. Components hold no hooks. The DOM fixtures and the unmodified UI suite (round play, pre-round, letterbox) catch differences. The browser smoke compares screenshots. |
| 4 | DOM drift (an extra wrapper, a changed class or `aria-label`, a different element order) breaks CSS or tests. | Components return the exact existing elements with no wrappers. The DOM fixtures assert exact `innerHTML` at five states. |
| 5 | `verbatimModuleSyntax` / `isolatedModules` errors from re-exporting types as values, or barrels pulling in UI modules. | Use `export type { ... }` for every type re-export. Barrels live only in `src/sim` and `src/ui/orders`. The architecture test still forbids React in `src/sim`. |
| 6 | Wave 1 starts against stale plans, or slots for a stage are in the wrong place (for example a G2 rule ordered after elimination). | Section 10 amendments land before any wave 1 branch opens. Each slot comment states its required position. The coordinator checks slot positions against each plan during the H0.6 review. |

## 12. Open questions (with recommended answers)

1. **Keep `run.ts`, `live-round.ts` and `types.ts` as barrels permanently, or migrate imports to the new modules?** Recommend: keep the barrels through wave 5. That is what keeps every existing test file unmodified. Revisit when no plan in flight cites the old paths.
2. **Should `previews.ts` and `abilityUi.ts` become registries in H0?** They are not in section 4.3 of the parallel plan. Recommend: no, slots only (H0.6). Their only same-wave conflict is G2 with K5 in wave 3, which slots solve. Make them registries in K4 if kit previews keep growing.
3. **Keep the H0 golden fixtures after H0 merges?** Recommend: yes, as a permanent live "behaviour fingerprint" in `tests/fixtures/h0-golden/`. They are regenerated only on purpose with `VALSIM_UPDATE_FIXTURES=1` and listed in the stage's status file, like the characterization fixtures.
4. **Move the existing Breach and Brimstone event members into per-kit files too?** Recommend: no in H0. Several events (`ability-damage`, `status-wave`, `status-expired`) are shared across kits, so they stay in `CoreEvent`. New stages add their own event files through slots.
5. **Commit `tools/smoke-browser.mjs` and run it in CI?** Recommend: commit it and run it manually at each H0 sub-stage that touches the UI, and at every later stage's browser check. No CI browser for now: it needs a local Chrome or Edge, and the jsdom DOM fixtures cover the deterministic part.
6. **Slot granularity: only stages whose plan lists the file, or every wave 1-5 stage in every slotted file?** Recommend: only the listed pairs (section 7.2), plus a "slot tidy" commit at each wave close that adds the next wave's slots. That keeps the files readable, and stages add a missing slot themselves in their first commit.
