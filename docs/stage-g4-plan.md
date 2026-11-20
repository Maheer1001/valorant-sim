# Stage G4 plan -- multi-round match

Tag: **design**. Planning document only. No `src/` or `tests/` change is made by this document.

Roadmap entry: `docs/roadmap.md` section "G4 Multi-round match" (steps 1-6). PROJECT_STATUS.md list item 11 ("Halves, side switch, overtime").

## 1. Goal and non-goals

### Goal

Turn single live rounds into a match:

1. A pure, JSON-serializable `MatchState` in `src/sim/match.ts` (new) that holds the roster of two teams, the score, finished round records, and the scenario for the next round.
2. `openMatch` builds round 0. `startNextRound` opens the current round through the pre-round path (G6 `startLiveFromPreRound` with plans for both sides) and returns a normal `LiveRound`. `recordRoundEnd` takes the ended `LiveRound`, scores it, runs the economy hook, and builds the next round's scenario.
3. Halves, side switch at the half, and overtime, all driven by a `MatchRules` object whose values are named ASSUMED constants or owner decisions.
4. Per-round seeds derived from the match seed with the existing `forkSeed` (`src/sim/rng.ts`).
5. The hook `EconomyStep` that G5 implements. G4 ships `NO_ECONOMY`, a no-op.
6. A versioned match replay file: a match header plus one per-round replay per finished round, replayable end to end.
7. Scoreboard and round-to-round flow in `src/ui/App.tsx`, inside the one-screen rule.

### Non-goals

- No credit amounts, win/loss bonuses, kill rewards, or signature replenish (G5).
- No spike logic (G2). G4 only consumes the `RoundResult` kinds `spike-detonated` and `spike-defused`.
- No weapons or armor carry-over (G3, G5).
- No survivor carry-over of weapons or health. Every round starts every agent at full health at spawn (roadmap step 2: "survivor carry-over rules stay out until sourced").
- No attack-side bot. Until O2, the human plans both sides (G6 hot-seat), and the non-human side uses the existing `defenseHoldDecide` stub, which returns no commands for attack.
- No new composition evaluator. `PLANNED_EVALUATORS` / `IMPLEMENTED_EVALUATORS` in `tests/architecture.test.ts` do not change.
- No Valorant numbers stated as verified. Every match-format number below is ASSUMED or owner.

## 2. Current state (read for this plan)

| File | What it does today |
| --- | --- |
| `src/sim/live-round.ts` | `openLiveRound(scenario, catalog, ruleset, options)` validates ruleset id, catalog version, map (`getMap`), definitions and composition, then builds `World` via `createWorld`. `LiveRound` keeps `seed`, `scenario`, `world`, `orderLog`, `events`, `result`, `phase: "live" \| "ended"`. Combat RNG state is `forkSeed(scenario.seed, "combat")`. `evaluateResult` returns `defense-eliminated`, `attack-eliminated`, or `{ kind: "timeout"; winner: "defense" }` at `ruleset.roundDurationMs`. `replayOrderLog(scenario, log, untilMs, catalog, ruleset)` reopens the scenario with `enableDecide = false`, re-issues every logged batch at its `simTimeMs`, checks each accept/reject matches, and steps to `untilMs`. |
| `src/sim/run.ts` | Defines `RoundResult` (three kinds today), `AgentBody`, `World`, `SimEvent` (including `round-ended`), `createWorld` (copies hp, credits, charges, cooldowns, ult points, statuses from scenario members). |
| `src/sim/preround.ts` | `PreRoundPlan { version: 1; side: "attack"; buys; agents; loadoutFuture? }`. `validatePlan` and `startLiveFromPreRound(scenario, plan, catalog, ruleset, options)` apply buys to a cloned scenario, call `openLiveRound(postBuy, ...)`, issue t=0 routes with `flushPendingBatches`, and arm plan steps. The resulting `LiveRound.scenario` is the post-buy scenario. G6 changes the plan argument to `{ attack?: PreRoundPlan; defense?: PreRoundPlan }`. |
| `src/sim/rng.ts` | `forkSeed(rootSeed, label)` is an FNV-1a hash of `"<rootSeed>:<label>"`; adding a label never changes other labels. `createStream`, `resumeStream`. |
| `src/sim/scenario/types.ts` | `Scenario { version: 1; id; seed; rulesetId; catalogVersion; mapId; attack: Team; defense: Team; setup: Provenance; orders }`. |
| `src/sim/composition/team.ts` | `Team { side; members: AgentInstance[] }`, `compositionViolation`. |
| `src/sim/agents/state.ts` | `AgentInstance` (instanceId, definitionId, side, assignment, position, hp, facingDeg, credits, charges, cooldownReadyAtMs, ultimatePoints, statuses). `ASSUMED_STARTING_HP = 100` (assumed). `createInstance` fills charge pools to `maxCharges`. |
| `src/sim/combat/ult-points.ts` | Kill gives killer and victim one ult point each (in-round). |
| `src/sim/map/drill-hall.ts` | `MapDefinition` with `attackSpawns` and `defenseSpawns` (five points each on Drill Hall), `getMap`. |
| `src/persistence/scenario-file.ts` | `serializeScenario`, `parseScenario` with `ScenarioFileError("unknown-version" \| "invalid-shape")`. |
| `src/ui/live/replayFile.ts` | `ReplayFile { version: 1 \| 2; scenario; seed; orderLog; simTimeMs; preRoundPlan? }`, `REPLAY_FILE_VERSION = 2`, `serializeReplay`, `parseReplay`. G6 moves this to v3 with both plans. |
| `src/ui/live/RoundEndBanner.tsx` | `resultBanner(result)` text for the three kinds and a "New round" button. |
| `src/ui/App.tsx` | One `UiPhase = "pre-round" \| "live"`. `resetToPreRound(next)`, `newRound()` (rebuilds `createPlayableDrill(seed)`), `goLive()` (calls `startLiveFromPreRound` with `decide: defenseHoldDecide`), `downloadReplay` / `loadReplay`. Board topbar holds the phase badge, timers, transport, replay and Setup buttons. `RoundEndBanner` renders when `live.phase === "ended"`. |
| `src/ui/scenario/playableDrill.ts` | `createPlayableDrill(seed, { startingUltPoints })`: Breach + Brimstone vs Jett + KAY/O with side-bearing ids (`breach-attack`, `jett-defense`). |
| `src/rules/ruleset.ts` | `STANDARD_RULESET` with `roundDurationMs` 100000 (owner), `buyPhaseMs` 30000 (assumed), `simStepMs` 50 (assumed), `startingCredits` 800 (assumed). |
| `tests/architecture.test.ts` | `src/sim`, `src/rules`, `src/persistence` must not import `src/ui`; `src/sim` must not import `tactics`, `learning`, `persistence`. |

## 3. Design

### 3.1 Match rules (`src/rules/match-rules.ts`, new)

Kept out of `Ruleset` so `STANDARD_RULESET` and every scenario `rulesetId` stay unchanged.

```ts
import type { Provenance } from "./provenance.ts";

export type MatchRules = {
  id: string;
  /** Regulation rounds before the side switch. */
  roundsPerHalf: number;
  /** Regulation: first team to this score wins. */
  roundsToWin: number;
  overtime: {
    /** Overtime ends when one team leads by this many rounds. */
    winMargin: number;
    /** Sides switch after this many overtime rounds. */
    roundsPerSide: number;
    /** null = no cap. A number ends the match as a draw when reached. */
    maxRounds: number | null;
  };
  /** Ult points carried into the first round of the second half. */
  resetUltPointsAtHalf: boolean;
  provenance: Record<
    "roundsPerHalf" | "roundsToWin" | "winMargin" | "roundsPerSide" | "maxRounds" | "resetUltPointsAtHalf",
    Provenance
  >;
};

// Values are supplied by the owner before G4.1 merges (consistency pass: no plan proposes
// game numbers from memory; G2 and G5 follow the same rule). Each keeps kind "assumed"
// unless the owner gives a source, then "owner" or the source's kind.
export const MATCH_ROUNDS_PER_HALF: number;       // assumed, owner value
export const MATCH_ROUNDS_TO_WIN: number;         // assumed, owner value (= per half + 1, design invariant)
export const OVERTIME_WIN_MARGIN: number;         // assumed, owner value
export const OVERTIME_ROUNDS_PER_SIDE: number;    // assumed, owner value
export const MATCH_MAX_OVERTIME_ROUNDS: number | null; // owner decision pending
export const RESET_ULT_POINTS_AT_HALF: boolean;   // assumed, owner value

export const STANDARD_MATCH_RULES: MatchRules; // built from the constants, every provenance kind "assumed"
                                                // except maxRounds kind "owner" once the owner decides
export function validateMatchRules(rules: MatchRules): { ok: true } | { ok: false; message: string };
```

`validateMatchRules` requires positive integers and the design invariant `roundsToWin === roundsPerHalf + 1`, so that overtime always starts at round index `2 * roundsPerHalf` and only from a tie with both teams on `roundsPerHalf` wins. Tests use small rule sets (for example `roundsPerHalf: 2, roundsToWin: 3`); those are test fixtures, not game values.

### 3.2 Match state (`src/sim/match.ts`, new)

```ts
import type { Catalog } from "./agents/catalog.ts";
import type { AgentInstance } from "./agents/state.ts";
import type { LiveRound, OrderLogEntry, OpenLiveOptions, PlanFailure, RoundResult } from "./live-round.ts";
import type { PreRoundPlan } from "./preround.ts";
import type { AgentBody, SimEvent } from "./run.ts";
import type { Scenario } from "./scenario/types.ts";
import type { Side } from "./types.ts";
import type { MatchRules } from "../rules/match-rules.ts";
import type { Ruleset } from "../rules/ruleset.ts";

export const MATCH_STATE_VERSION = 1;

/** Team identity is stable across side switches. Side is per round. */
export type TeamId = "A" | "B";

export type MatchPhase = "pre-round" | "live" | "ended";

export type RoundPlans = { attack?: PreRoundPlan; defense?: PreRoundPlan };

export type RoundRecord = {
  roundIndex: number;          // 0-based
  seed: number;                // forkSeed(matchSeed, `round:${roundIndex}`)
  attackTeam: TeamId;
  overtime: boolean;
  result: RoundResult;
  winnerSide: Side;
  winnerTeam: TeamId;
  endTimeMs: number;           // world.timeMs at round end
  scoreAfter: Record<TeamId, number>;
  /** Economy lines applied after this round (empty with NO_ECONOMY). */
  ledger: EconomyLedgerLine[];
};

/** Replay data per finished round. Structural subset of the UI ReplayFile. */
export type RoundReplayData = {
  scenario: Scenario;          // LiveRound.scenario (post-buy)
  orderLog: OrderLogEntry[];
  simTimeMs: number;
  plans?: RoundPlans;          // audit only, never drives replay
};

export type MatchState = {
  version: typeof MATCH_STATE_VERSION;
  matchId: string;
  matchSeed: number;
  rules: MatchRules;
  rulesetId: string;
  catalogVersion: string;
  mapId: string;
  economyId: string;
  firstAttackTeam: TeamId;
  /** Side-neutral templates. `side`, position, hp, facing are rewritten per round. */
  roster: Record<TeamId, AgentInstance[]>;
  score: Record<TeamId, number>;
  rounds: RoundRecord[];
  replays: RoundReplayData[];
  phase: MatchPhase;
  /** Round being planned or played. null once phase is "ended". */
  current: {
    roundIndex: number;
    attackTeam: TeamId;
    overtime: boolean;
    scenario: Scenario;        // pre-buy scenario for this round
    plans?: RoundPlans;        // set by startNextRound
  } | null;
  outcome: { kind: "winner"; team: TeamId } | { kind: "draw" } | null;
};

export type MatchFailureCode =
  | "invalid-rules"
  | "roster-invalid"
  | "spawn-shortage"
  | "wrong-phase"
  | "round-not-ended"
  | "economy-mismatch"
  | "economy-invalid"
  | "replay-diverged";

export type MatchFailure = { ok: false; code: MatchFailureCode; message: string; roundIndex?: number };
```

`MatchState` holds no `LiveRound`, no `Catalog` object and no functions, so it round-trips through `JSON.stringify` and can be kept in React state. The host holds the mutable `LiveRound` separately, exactly as today.

### 3.3 Economy hook (G4 defines, G5 implements)

```ts
export type EconomyLedgerLine = {
  instanceId: string;
  deltaCredits: number;        // integer, may be negative
  reason: string;              // free text chosen by G5, for the scoreboard tooltip
};

export type EconomyStepInput = {
  readonly matchSeed: number;
  readonly rules: MatchRules;
  readonly ruleset: Ruleset;
  readonly catalog: Catalog;
  /** Every finished round, oldest first. The last element is the round that just ended. */
  readonly history: readonly RoundRecord[];
  /** Append-only events of the round that just ended (kills; plant/defuse once G2 lands). */
  readonly endedEvents: readonly SimEvent[];
  /** Truth bodies at the end of the round that just ended (credits after buys, ult points). */
  readonly endedAgents: readonly AgentBody[];
  /** The round being built. */
  readonly next: {
    roundIndex: number;
    attackTeam: TeamId;
    overtime: boolean;
    /** True for round 0 of the second half and for every overtime side switch. */
    startsHalf: boolean;
  };
  /** Proposed next-round members with G4 defaults applied: team A then team B, roster order. */
  readonly members: readonly AgentInstance[];
  readonly teamOf: Readonly<Record<string, TeamId>>;
};

export type EconomyStepResult = {
  members: AgentInstance[];
  ledger: EconomyLedgerLine[];
};

/** Pure and deterministic. Must not read Date, Math.random, or any global state. */
export type EconomyStep = (input: EconomyStepInput) => EconomyStepResult;

export type EconomyModel = { readonly id: string; readonly step: EconomyStep };

export const NO_ECONOMY: EconomyModel = {
  id: "none",
  step: (input) => ({ members: structuredClone([...input.members]), ledger: [] }),
};
```

Contract that G4 enforces after calling `step` (failure `economy-invalid` otherwise):

- Same length, same `instanceId` order, same `definitionId`, `side`, `xMm`, `yMm`, `hp`, `facingDeg`, `statuses`, `cooldownReadyAtMs`, `ultimatePoints`, `assignment`.
- Only `credits` (integer, >= 0) and `charges` (integers, 0 through the ability's `maxCharges`) may change.
- `ledger` entries name known instance ids and use integer deltas.

`economyId` is stored in `MatchState` and the match replay header. `recordRoundEnd` and `replayMatch` reject a model whose `id` differs (`economy-mismatch`), so a match recorded with G5 economy is never replayed with `NO_ECONOMY`.

The economy step is not called before round 0. Round 0 credits come from the roster (today `createInstance` uses `STANDARD_RULESET.startingCredits`, assumed). With `NO_ECONOMY`, credits after buys simply carry forward, including across the half; resetting them at the half is G5's job using `next.startsHalf`.

### 3.4 Functions

```ts
export type OpenMatchInput = {
  matchId: string;
  matchSeed: number;
  mapId: string;
  rules: MatchRules;
  roster: Record<TeamId, readonly AgentInstance[]>;
  firstAttackTeam: TeamId;
  economy: EconomyModel;
  catalog?: Catalog;   // default SHIPPED_CATALOG
  ruleset?: Ruleset;   // default STANDARD_RULESET
};

export function openMatch(input: OpenMatchInput): MatchState | MatchFailure;
export function isMatchState(value: MatchState | MatchFailure): value is MatchState;

/** Pure side schedule. */
export function attackTeamForRound(rules: MatchRules, firstAttackTeam: TeamId, roundIndex: number): TeamId;
export function isOvertimeRound(rules: MatchRules, roundIndex: number): boolean;
export function startsHalf(rules: MatchRules, roundIndex: number): boolean;
export function roundSeed(matchSeed: number, roundIndex: number): number;
export function roundWinner(result: RoundResult): Side;

/** Builds the pre-buy scenario for a round from carried members. */
export function buildRoundScenario(match: MatchState, roundIndex: number, members: readonly AgentInstance[]): Scenario | MatchFailure;

/** Opens the current round through G6 pre-round for both sides. */
export function startNextRound(
  match: MatchState,
  plans: RoundPlans,
  catalog?: Catalog,
  ruleset?: Ruleset,
  options?: OpenLiveOptions,
): { ok: true; match: MatchState; round: LiveRound } | PlanFailure | MatchFailure;

/** Scores an ended round, runs economy, builds the next round or ends the match. */
export function recordRoundEnd(
  match: MatchState,
  round: LiveRound,
  economy: EconomyModel,
  catalog?: Catalog,
  ruleset?: Ruleset,
): MatchState | MatchFailure;

/** Pure bookkeeping core of recordRoundEnd (tests drive overtime through this). */
export function applyRoundOutcome(
  match: MatchState,
  ended: { result: RoundResult; endTimeMs: number; events: readonly SimEvent[]; agents: readonly AgentBody[]; replay: RoundReplayData },
  economy: EconomyModel,
  catalog?: Catalog,
  ruleset?: Ruleset,
): MatchState | MatchFailure;

export function replayMatch(
  header: MatchReplayHeader,
  rounds: readonly RoundReplayData[],
  economy: EconomyModel,
  catalog?: Catalog,
  ruleset?: Ruleset,
): { ok: true; match: MatchState; lastRound: LiveRound | null } | MatchFailure | PlanFailure;
```

All functions return new objects; none mutate the `match` argument (the state is small; rounds are not cloned beyond their replay data).

**Side schedule.** Let `R = rules.roundsPerHalf`, `other(t)` the other team.

- `roundIndex < R`: `firstAttackTeam` attacks.
- `R <= roundIndex < 2R`: `other(firstAttackTeam)` attacks (side switch at the half).
- Overtime, `k = roundIndex - 2R >= 0`: `firstAttackTeam` attacks when `floor(k / rules.overtime.roundsPerSide)` is even, else the other team. Which team attacks first in overtime is ASSUMED (`OVERTIME_FIRST_ATTACK = "first-half-attacker"`, design constant in `match.ts`).
- `startsHalf(rules, i)` is true exactly when `i > 0` and `attackTeamForRound(i) !== attackTeamForRound(i - 1)`: at `i === R` and at every overtime side switch. It is false for round 0.

**Winner and end.** `roundWinner` is an exhaustive switch:

| `RoundResult.kind` | Winning side | Owner of the kind |
| --- | --- | --- |
| `defense-eliminated` | attack | existing |
| `attack-eliminated` | defense | existing |
| `timeout` | `result.winner` (always defense today) | existing |
| `spike-detonated` | attack | G2 |
| `spike-defused` | defense | G2 |

The `never` default makes a later new kind a compile error. After each round, with `played = rounds.length`, scores `a`, `b`:

1. If `played <= 2R` and `max(a, b) >= rules.roundsToWin`: winner.
2. Else if `played >= 2R` and `|a - b| >= rules.overtime.winMargin`: winner.
3. Else if `maxRounds !== null` and `played - 2R >= maxRounds`: draw.
4. Else build the next round, phase `"pre-round"`.

With the invariant `roundsToWin === R + 1`, overtime is reached only from an `R - R` tie after `2R` rounds.

**Next-round members (`buildRoundScenario` defaults).** For each roster member, in roster order:

| Field | Value next round | Tag |
| --- | --- | --- |
| `side` | from `attackTeamForRound` | design |
| `xMm`, `yMm` | `map.attackSpawns[k]` or `map.defenseSpawns[k]`, `k` = roster index | design |
| `facingDeg` | `ATTACK_SPAWN_FACING_DEG = 0`, `DEFENSE_SPAWN_FACING_DEG = 180` | design (matches `createPlayableDrill`) |
| `hp` | `ASSUMED_STARTING_HP` | assumed (existing) |
| `statuses`, `cooldownReadyAtMs` | empty (round clock restarts at 0) | design |
| `charges` | roster template charges | assumed (`ROUND_START_CHARGES = "roster-template"`); G5 may change via `EconomyStep` |
| `credits` | ended-round truth body credits | design (carry); amounts G5 |
| `ultimatePoints` | ended-round truth body ult points; zeroed at the half when `resetUltPointsAtHalf` | assumed (`RESET_ULT_POINTS_AT_HALF`) |
| `assignment` | roster template | design |

Then `economy.step(...)` runs, its result is checked, and the scenario is assembled:

```ts
{
  version: 1,
  id: `${match.matchId}:r${roundIndex}`,
  seed: roundSeed(match.matchSeed, roundIndex),
  rulesetId: match.rulesetId,
  catalogVersion: match.catalogVersion,
  mapId: match.mapId,
  attack: { side: "attack", members: /* attacking team */ },
  defense: { side: "defense", members: /* defending team */ },
  setup: MATCH_ROUND_SETUP_PROVENANCE, // kind "assumed", note: "Match round built by src/sim/match.ts"
  orders: [],
}
```

`openMatch` fails with `spawn-shortage` when a team has more members than the map has spawns of either side (a team plays both sides). It fails with `roster-invalid` on duplicate instance ids across teams, on an empty team, or when `compositionViolation` rejects the round-0 teams. Instance ids in a match roster must be side-neutral (for example `a-breach`); `openMatch` does not inspect the text, but the playable match roster (section 7) uses neutral ids.

**startNextRound.** Requires `match.phase === "pre-round"` (else `wrong-phase`). Calls G6 `startLiveFromPreRound(match.current.scenario, plans, catalog, ruleset, options)`. On success returns `match` with `phase: "live"` and `current.plans = plans`, plus the `LiveRound`. The pre-round UI, buys, routes and plan casts are unchanged; every match round goes through them.

**recordRoundEnd.** Requires `match.phase === "live"`, `round.phase === "ended"`, `round.result !== null`, and `round.seed === match.current.scenario.seed` (else `round-not-ended` / `wrong-phase`). It extracts `{ result, endTimeMs: round.world.timeMs, events: round.events, agents: round.world.agents, replay: { scenario: round.scenario, orderLog: structuredClone(round.orderLog), simTimeMs: round.world.timeMs, plans: current.plans } }` and calls `applyRoundOutcome`.

### 3.5 Match replay file (`src/ui/live/matchReplayFile.ts`, new)

Lives next to `replayFile.ts` because `ReplayFile` is a UI type and `src/persistence` may not import `src/ui` (architecture test).

```ts
import type { ReplayFile } from "./replayFile.ts";
import type { MatchReplayHeader } from "../../sim/match.ts";

export const MATCH_REPLAY_FILE_VERSION = 1;

/** In src/sim/match.ts: */
export type MatchReplayHeader = {
  matchId: string;
  matchSeed: number;
  rules: MatchRules;
  rulesetId: string;
  catalogVersion: string;
  mapId: string;
  economyId: string;
  firstAttackTeam: TeamId;
  roster: Record<TeamId, AgentInstance[]>;
};

export type MatchReplayFile = {
  kind: "match-replay";
  version: typeof MATCH_REPLAY_FILE_VERSION;
  header: MatchReplayHeader;
  /** One per finished round, in order. Each uses the current ReplayFile write version (v3 after G6). */
  rounds: ReplayFile[];
  /** Audit only; replayMatch recomputes and compares. */
  finalScore: Record<TeamId, number>;
};

export function matchReplayFromState(match: MatchState): MatchReplayFile;
export function serializeMatchReplay(file: MatchReplayFile): string;
export function parseMatchReplay(text: string): MatchReplayFile; // throws on bad kind/version/shape
export function isMatchReplayText(text: string): boolean;        // JSON with kind === "match-replay"
```

`parseMatchReplay` validates each round through the existing `parseReplay` (by re-serializing the round object) so per-round version rules stay in one place.

**replayMatch algorithm.** Open a match from the header (with `economy`). For each stored round `i`:

1. Compare the rebuilt pre-buy `current.scenario` with stored `rounds[i].scenario` on every field except member `credits` and `charges` (buys change only those). Mismatch -> `replay-diverged` with `roundIndex: i`.
2. `replayOrderLog(rounds[i].scenario, rounds[i].orderLog, rounds[i].simTimeMs, catalog, ruleset)`. A `PlanFailure` is returned as is.
3. If the replayed round ended, call `recordRoundEnd` and continue. If it did not end (only allowed for the last stored round, a match saved mid-round), stop and return it as `lastRound` with `match.phase === "live"`.
4. At the end, compare the recomputed score with `finalScore`; mismatch -> `replay-diverged`.

Plans in the per-round file are audit copies; replay never re-runs them (same rule D1 as `ReplayFile.preRoundPlan`), because plan routes and plan casts are already in `orderLog`.

## 4. Determinism and fog implications

- **Seeds.** `roundSeed(matchSeed, i)` returns `forkSeed(matchSeed, "round:" + i)`, with `i` written as a base-10 integer. Each round's combat stream remains `forkSeed(roundSeed, "combat")` inside `openLiveRound`, unchanged. The label prefix `economy:` is reserved under `matchSeed` in case G5 ever needs a stream; G4 itself draws no random numbers.
- **Purity.** `match.ts` uses no `Date`, no `Math.random`, no iteration over unordered keys that affects output (members are processed in roster array order; team order is always `A` then `B`).
- **Replay identity.** A whole match is identified by the header plus per-round order logs. Given the same header, logs and economy id, `replayMatch` reproduces every `RoundRecord` and every round's final truth world byte-for-byte as JSON.
- **Decide fns.** Unchanged: `LiveDecideFn` still receives only `viewLive` fogged worlds. `MatchState` is truth (both teams' credits and ult points) and must never be passed to a `LiveDecideFn` or a `src/tactics` module. A fog-safe public match view (score, round results, sides) is left to O5; G4 adds none.
- **Scoreboard fog.** The scoreboard shows score, round history and sides, which are public. It shows credits only for the human-controlled team; enemy credits are hidden in match mode even though the truth toggle still exists for debugging.
- **Architecture.** `src/sim/match.ts` imports only `src/sim/*` and `src/rules/*`. It calls `startLiveFromPreRound` and `replayOrderLog`; it never imports `src/tactics`. `tests/architecture.test.ts` needs no change.

## 5. Provenance and unknowns

| Value | Tag | Named constant | How to confirm |
| --- | --- | --- | --- |
| Rounds per half | assumed (owner supplies value) | `MATCH_ROUNDS_PER_HALF` | Owner confirms target format; primary source if one is added to the repo |
| Rounds to win | assumed (owner supplies value) | `MATCH_ROUNDS_TO_WIN` | As above; must equal rounds per half + 1 (design invariant) |
| Overtime win margin | assumed (owner supplies value) | `OVERTIME_WIN_MARGIN` | Owner decision or source |
| Overtime rounds before a side switch | assumed (owner supplies value) | `OVERTIME_ROUNDS_PER_SIDE` | Owner decision or source |
| Overtime cap: none | owner (pending) | `MATCH_MAX_OVERTIME_ROUNDS` | Owner picks null or a number (open question 1) |
| Overtime first attacker = first-half attacker | assumed | `OVERTIME_FIRST_ATTACK` | Owner decision or source |
| Side switch after round index `roundsPerHalf - 1` | design | none | follows from the rules shape |
| Ult points carry across rounds | assumed | none (behavior) | Owner or source |
| Ult points reset at the half: no | assumed | `RESET_ULT_POINTS_AT_HALF` | Owner or source |
| Charges at round start = roster template | assumed | `ROUND_START_CHARGES` | Replaced by G5 rules |
| Credits carry raw, then `EconomyStep` | design | none | G5 supplies amounts |
| Health at round start: 100 | assumed (existing) | `ASSUMED_STARTING_HP` | unchanged |
| Spawn point = map spawn by roster index | design | none | G1 spawn regions may refine |
| Spawn facing 0 / 180 deg | design | `ATTACK_SPAWN_FACING_DEG`, `DEFENSE_SPAWN_FACING_DEG` | matches `createPlayableDrill` |
| Round seed label `round:<i>` | design | none | determinism tests |
| Buy phase per round: 30000 ms | assumed (existing) | `ruleset.buyPhaseMs` | unchanged |
| Round timer: 100000 ms | owner (existing) | `ruleset.roundDurationMs` | unchanged |
| Test-only rules (2 per half, 3 to win) | design (test fixture) | `TEST_MATCH_RULES` in the harness | not game values |

## 6. Staged delivery

Every sub-stage ends with `npm run check` green and a browser check at 1366x768 with no document scroll.

### G4.1 Rules, state, schedule, scenario builder

- New `src/rules/match-rules.ts` (section 3.1). New `src/sim/match.ts` with types, `NO_ECONOMY`, `attackTeamForRound`, `isOvertimeRound`, `startsHalf`, `roundSeed`, `roundWinner`, `openMatch`, `buildRoundScenario`.
- `tests/sim/match.test.ts` (new) asserts:
  - `validateMatchRules(STANDARD_MATCH_RULES).ok` is true; rules breaking `roundsToWin === roundsPerHalf + 1` or with a non-positive integer fail; `openMatch` with them returns `invalid-rules`.
  - Every provenance entry in `STANDARD_MATCH_RULES` has kind `assumed` or `owner` (none `verified`).
  - `attackTeamForRound` for `{ roundsPerHalf: 2, overtime.roundsPerSide: 1 }`, first attacker A: indices 0..7 give `A, A, B, B, A, B, A, B`.
  - `startsHalf` is true at index 2 and at each overtime index where the attacker changes, false at 0 and 1.
  - `roundSeed(s, i) === forkSeed(s, "round:" + i)`; seeds for 0..30 are distinct for a fixed match seed.
  - `roundWinner` for each existing kind; G2 kinds are covered in G4.4.
  - `openMatch` round 0 scenario: id `<matchId>:r0`, seed `roundSeed(seed, 0)`, team A members on `attack` at `DRILL_HALL.attackSpawns[k]`, team B on `defense`, hp 100, `orders: []`, and `openLiveRound` accepts it.
  - `spawn-shortage` with six members on Drill Hall (five spawns); `roster-invalid` on a duplicate instance id across teams.
- Browser check: none beyond the unchanged app loading (no UI yet).

### G4.2 Round flow, scoring, halves, overtime, economy hook

- Add `startNextRound`, `applyRoundOutcome`, `recordRoundEnd`.
- New `tests/sim/support/match-harness.ts`: `TEST_MATCH_RULES`, `testRoster()` (side-neutral ids, two per team from the shipped catalog), `playTimeoutRound(match)` (startNextRound with empty plans for both sides, `decide: undefined`, then `stepLive` until `phase === "ended"`, capped at `ceil(roundDurationMs / simStepMs) + 2` steps), and `syntheticOutcome(match, winnerSide)` for `applyRoundOutcome`.
- `tests/sim/match.test.ts` adds:
  - **Scripted 3-round match.** `TEST_MATCH_RULES`, first attacker A, three timeout rounds (defense wins each): records 0 and 1 have `attackTeam: "A"`, `winnerTeam: "B"`; record 2 has `attackTeam: "B"`, `winnerTeam: "A"`; score `{ A: 1, B: 2 }`; phase `"pre-round"`; `current.roundIndex === 3`; each record `seed` equals `roundSeed`.
  - **Side switch.** After round 1, round 2's scenario has team A members in `defense.members` with `side: "defense"` at `defenseSpawns[k]`, facing 180, hp 100, empty statuses and cooldowns, and the same instance ids.
  - **Carry.** Ult points and credits of each member in round `i + 1` equal the ended truth bodies of round `i` (with `NO_ECONOMY`); charges equal the roster template.
  - **Regulation win.** Synthetic outcomes A, A, A with `TEST_MATCH_RULES`: phase `"ended"`, `outcome { kind: "winner", team: "A" }`, `current === null`; `startNextRound` then returns `wrong-phase`.
  - **Overtime.** Synthetic A, B, A, B (2-2): `current.overtime` true at index 4, attackers at 4, 5, 6 follow the schedule; A then B keeps it going (3-3); A, A ends 5-3 with winner A. With `overtime.maxRounds: 2`, A, B after 2-2 ends `{ kind: "draw" }`.
  - **Economy hook.** A spy `EconomyModel` records its input: not called before round 0; called once per non-final round; `history.at(-1)` is the just-ended record; `next.startsHalf` true only at index 2 and at overtime switches; `endedEvents` contains the round's `round-ended` event. A step that changes `xMm` or returns negative credits yields `economy-invalid`. A model with another `id` yields `economy-mismatch`.
  - `recordRoundEnd` on a round still `"live"` returns `round-not-ended`.
- Browser check: none (no UI yet); app still loads.

### G4.3 Match replay file and whole-match replay

- Add `MatchReplayHeader` and `replayMatch` to `src/sim/match.ts`. New `src/ui/live/matchReplayFile.ts`.
- `tests/sim/match-replay.test.ts` (new): play three harness rounds where round 1 includes a live `move-route` batch so its order log is non-empty; `replayMatch(header, replays, NO_ECONOMY)` returns `rounds` deep-equal to the original and, per round, the replayed final `truthLiveWorld` JSON equals the original's. Tampering with `header.matchSeed` gives `replay-diverged` at round 0; tampering with a stored round's `scenario.seed` gives `replay-diverged` with that index; replay with an `EconomyModel` of another id gives `economy-mismatch`. A match saved mid-round returns `lastRound` with `phase === "live"` at the stored `simTimeMs`.
- `tests/ui/matchReplayFile.test.ts` (new): serialize -> parse round-trip equality; unknown `version` and wrong `kind` throw; a bad inner round throws the same message `parseReplay` gives; `isMatchReplayText` is false for a single-round replay text.
- Browser check: none (no UI yet).

### G4.4 Spike results (after G2 lands)

- `roundWinner` gains `spike-detonated -> attack` and `spike-defused -> defense` (G2 owns the kinds and their payloads; G4 switches only on `kind`).
- `tests/sim/match.test.ts`: synthetic outcomes with both kinds score the right team; a `RoundResult` exhaustiveness check compiles under `npm run check` (typecheck).
- If G2 did not already update `resultBanner`, add text for both kinds in `src/ui/live/RoundEndBanner.tsx` (ASCII, no team names invented).

### G4.5 Scoreboard and round-to-round UI

- New `src/ui/scenario/playableMatch.ts`: `createPlayableMatchInput(seed)` returning an `OpenMatchInput` with side-neutral ids (team A: Breach, Brimstone; team B: Jett, KAY/O, the same agents as the drill), purchasable charges zeroed as `scenarioForPreRound` does today, `STANDARD_MATCH_RULES`, `NO_ECONOMY`, map `DRILL_HALL`.
- New `src/ui/live/Scoreboard.tsx`: one-line strip `A 2 - 1 B | Round 4 | Half 2 | You: Defense`, plus one pip per finished round (filled by winner team, `title` = result banner text). Overtime shows `OT` instead of the half.
- `src/ui/live/RoundEndBanner.tsx`: optional props `matchLine?: string`, `actionLabel?: string` (default "New round", so drill tests are unchanged).
- `src/ui/App.tsx`:
  - `mode: "drill" | "match"` (default `"drill"`), `match: MatchState | null`.
  - Setup drawer gains a "Start match" button (match mode) and "Back to drill".
  - Match mode `goLive` calls `startNextRound(match, plans, ..., { decide: defenseHoldDecide })` with G6 plans for both sides.
  - When the host loop sees `live.phase === "ended"` for the current round index (guarded by a ref so it runs once), call `recordRoundEnd(match, live, NO_ECONOMY)` and store the result; the scoreboard updates immediately.
  - Banner in match mode: result text, `matchLine` like `A 2 - 1 B`, action "Next round" -> `resetToPreRound(match.current.scenario)`; when the match ended: `Team A wins 3 - 1` (or `Draw`), action "New match".
  - The human controls team A. The controlled side each round is `attackTeamForRound(...) === "A" ? "attack" : "defense"`, handed to G6's controlled-side / hot-seat state (G6 owns that toggle).
  - Download replay in match mode writes `serializeMatchReplay(matchReplayFromState(match))`, including a mid-round round when live. Load replay dispatches on `isMatchReplayText`.
- `src/ui/styles.css`: `.scoreboard` and `.round-pips` inside `.board-topbar`, no new rows.
- `tests/ui/match-flow.test.tsx` (new), same `requestAnimationFrame` stub and fake timers as `tests/ui/round-play.test.tsx`:
  - Setup -> Start match shows `Round 1` and `A 0 - 0 B` in the scoreboard.
  - Loading a one-round match replay that ended by timeout shows the banner with `A 0 - 1 B` and a "Next round" button; clicking it shows pre-round with `Round 2`, the buy timer reset, and score unchanged.
  - Loading a match replay whose last round ends the match shows "New match" and no "Next round".
  - `tests/ui/round-play.test.tsx` stays unchanged and still finds "New round" in drill mode.
- Browser check at 1366x768: drill mode looks as today; match mode topbar fits on one line with the scoreboard, banner shows match line and Next round, no document scroll in pre-round, live, round-end and match-end states.

## 7. UI impact

| Action | Clicks | Notes |
| --- | --- | --- |
| Start a match | 2 (Setup, Start match) | Drawer already exists; drill stays the default |
| Plan and start a round | unchanged (Go, or buy timer reaching 0) | pre-round per round, both sides via G6 |
| Advance to next round | 1 (Next round) | scoreboard already updated at round end |
| New match after match end | 1 (New match) | |
| Download / load match replay | unchanged buttons | dispatch by file kind |

Previews: the scoreboard pips carry the result text in `title`; the banner states which team won and the new score before the click. One-screen rule: the scoreboard is a single inline element in the existing `.board-topbar`; the round-end banner reuses `.round-banner` (overlay, existing). No new panel, no new row, no document scroll at 1366x768. If the topbar overflows at 1366 px, the speed buttons collapse first (open question 5).

## 8. Files touched

> Build protocol (consistency pass): this stage is built under [`parallel-build-plan.md`](parallel-build-plan.md). Edits listed here to `src/ui/App.tsx`, `src/ui/styles.css`, `rejectionMessages.ts`, `describe.ts` and the shared docs are integration-file edits: the stage's UI lives in its own component files (with their own CSS), and the App mount lines, message entries and doc text are applied at merge. After H0, engine edits go into the split modules and this stage's reserved slots.

| File | new / modify | Sub-stage |
| --- | --- | --- |
| `src/rules/match-rules.ts` | new | G4.1 |
| `src/sim/match.ts` | new | G4.1, G4.2, G4.3, G4.4 |
| `tests/sim/match.test.ts` | new | G4.1, G4.2, G4.4 |
| `tests/sim/support/match-harness.ts` | new | G4.2 |
| `tests/sim/match-replay.test.ts` | new | G4.3 |
| `src/ui/live/matchReplayFile.ts` | new | G4.3 |
| `tests/ui/matchReplayFile.test.ts` | new | G4.3 |
| `src/ui/live/RoundEndBanner.tsx` | modify | G4.4 (only if G2 did not), G4.5 |
| `src/ui/scenario/playableMatch.ts` | new | G4.5 |
| `src/ui/live/Scoreboard.tsx` | new | G4.5 |
| `src/ui/App.tsx` | modify | G4.5 |
| `src/ui/styles.css` | modify | G4.5 |
| `tests/ui/match-flow.test.tsx` | new | G4.5 |
| `docs/status/g4.md` | new | Stage result, playtest steps and the exact text for PROJECT_STATUS.md / README.md / docs/playtest.md / docs/roadmap.md. The integrator applies that text at merge (docs/parallel-build-plan.md); this stage's branch never edits those shared docs. |

Not touched: `src/sim/live-round.ts`, `src/sim/run.ts`, `src/sim/preround.ts`, `src/sim/rng.ts`, `src/rules/ruleset.ts`, `src/ui/live/replayFile.ts`, `tests/architecture.test.ts`, `src/sim/economy/*` (G5).

Parallel note: G5 can start against the `EconomyStep` types as soon as G4.1 lands `src/sim/match.ts` with the section 3.3 types; G5 files live under `src/sim/economy/` and do not overlap with this table.

## 9. Dependencies

- **Must land first:** G6 (`startLiveFromPreRound` with `{ attack?: PreRoundPlan; defense?: PreRoundPlan }`, replay v3, hot-seat controlled side) before G4.2 and G4.5. G2 (`spike-detonated`, `spike-defused`) before G4.4. G4.1 and G4.3 file format work can start in parallel with both.
- **Consumes from the ownership contract:** G6 `PreRoundPlan.side: Side`, `startLiveFromPreRound`, replay v3; G2 `RoundResult` additions; G1 `MapDefinition` (G4 reads only the existing `attackSpawns` / `defenseSpawns` and `getMap`, so G1 v2 maps work if they keep those fields).
- **Existing names used:** `openLiveRound`, `replayOrderLog`, `truthLiveWorld`, `LiveRound`, `OrderLogEntry`, `RoundResult`, `forkSeed`, `compositionViolation`, `ASSUMED_STARTING_HP`, `getMap`, `parseReplay`, `serializeReplay`, `defenseHoldDecide`.
- **Unblocks:** G5 (implements `EconomyStep` / exports an `EconomyModel`), O5.

## 10. Risks

1. **G6 signature drift.** If G6's `startLiveFromPreRound` shape differs from the contract, only `startNextRound` changes; G4.2 waits on G6 merge.
2. **Side-bearing instance ids.** The drill uses `breach-attack`; a match keeps ids across a side switch. Playable match ids are side-neutral; any code that parses side from an id breaks. Mitigation: grep for `-attack` / `-defense` id parsing during G4.5.
3. **Test runtime.** Timeout rounds step 2000+ times each; three rounds in two test files is acceptable, but no test should play a full-length match. Long-match logic is covered by `applyRoundOutcome` synthetic tests.
4. **Post-buy vs pre-buy scenario.** Replay compares the rebuilt pre-buy scenario to the stored post-buy one on all fields except credits and charges. If G3 lets buys change other fields (armor, weapon), the comparison excludes those too; G3/G5 must extend the excluded-field list in one function (`sameRoundIdentity`).
5. **Economy contract too tight.** If G5 needs to change a field G4 freezes (for example ult points), the contract widens in `match.ts` with a test; G5 must not bypass the check.
6. **One-screen overflow.** The topbar is already busy; adding the scoreboard may wrap at 1366 px.

## 11. Open questions

1. **Overtime cap?** Recommend `MATCH_MAX_OVERTIME_ROUNDS = null` (no cap) for the UI, since rounds advance only on a click; headless tools pass a small cap. Owner decides.
2. **Ult points at the half?** Recommend keep carrying (`RESET_ULT_POINTS_AT_HALF = false`, assumed) until sourced; one flag flips it.
3. **Who attacks first?** Recommend team A (human) attacks first by default, as `firstAttackTeam` in `createPlayableMatchInput`; no coin flip, which keeps replays trivially deterministic. A later flip would use `forkSeed(matchSeed, "first-attack")`.
4. **Default rules in the lab UI?** Recommend `STANDARD_MATCH_RULES` with a Setup select offering a short test format (2 per half) for playtests, labeled "short (test)".
5. **Topbar overflow at 1366x768?** Recommend collapsing the four speed buttons into one cycling button in match mode rather than adding a row.
6. **Charges at round start?** Recommend roster template now (purchasable ones zeroed, signatures full as `createInstance` fills them) and let G5 own all replenish and carry rules through `EconomyStep`.
