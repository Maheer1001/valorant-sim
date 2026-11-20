# Stage G2 plan: spike plant and defuse

Status: plan only. Nothing in this document has been implemented or checked.
Baseline it was written against: HEAD 08d2dfb (coordinator record: `npm run check` green, 25 test files, 156 tests).

## 1. Goal and non-goals

### Goal

Give live rounds a real objective. One attacker carries the spike from t=0. The spike drops where its carrier dies, and attackers can pick it up. An attacker can plant it only inside a G1 `plant-zone` region. Planting stops the round timer and starts a post-plant spike timer. Defenders can defuse it. Two new round results, `spike-detonated` and `spike-defused`, join the existing three. Plant and defuse are X1 channels, so movement, death and the other X1 interrupts cancel them. Plant and defuse grant ult points (the `TODO(ult-sources)` on the ledger in `src/sim/combat/ult-points.ts`).

### Non-goals

- Spike blast damage or a blast radius. The sheet only says one shield "ignores Spike blast" (`agent-reference.json`, around line 1308). No radius or damage is in the repo, so the round simply ends on detonation.
- Half-defuse checkpoints. There is no source in the repo (see section 11, Q2). They stay OFF and are not modelled.
- Audio cues (plant sound, defuse sound, beeps). No sound model exists.
- Agent interactions with the spike that the sheet mentions but no kit stage has built: Gekko Wingman "plant or defuse the Spike", Astra Gravity Well `canPullDefuserOffSpike`, Deadlock Sonic Sensor triggered by "planting" / "defusing", the Telekinesis passive (spike pickup at range, range unpublished). These belong to their kit stages. G2 only makes sure their hooks exist (channel cancel, the `activeChannel` record).
- Economy credits for plant or defuse. G5 owns them.
- A defense opponent that defuses. The `defenseHoldDecide` stub keeps holding until O2 (see section 4.4).
- Map content. G1 owns the format, and the owner authors the plant zones on Drill Hall.
- Multiple spikes, or a spike on defense.

## 2. Current state (read for this plan)

- `src/sim/live-round.ts`
  - `AgentCommand` has four kinds: `hold`, `move-route`, `cast`, `shoot`.
  - `validateCommand(round, side, command)` checks the agent, the side, `alive`, and then each kind's rules. `shoot` falls through as the last branch.
  - `applyPendingBatch(round, walls)` applies accepted batches at the start of the next step. `shoot` is the fall-through branch here too, so any new kind MUST get an explicit branch.
  - `cloneCommand` returns `{ kind: "hold" }` for any kind it does not recognise. A new command kind without a branch would silently turn into a hold. This is a trap, and it is covered by a test in G2.1.
  - `stepOnce` runs in this order: fire plan steps, apply the batch, drain "now" jobs, `newTime = min(prevTime + simStepMs, roundDurationMs)`, advance standing routes, schedule fires, drain jobs up to `newTime`, sort the step's events, commit time, `evaluateResult`, and then the decide cadence.
  - `evaluateResult(round, newTime)` returns `defense-eliminated` if no defender is alive. Otherwise it returns `attack-eliminated` if no attacker is alive, then `timeout` (winner defense) once `newTime >= roundDurationMs`. If both teams are wiped in the same step, the result is `defense-eliminated`.
  - `drainJobsUntil(...)` is exported. It applies each job through `applyJob` and pushes one event per job plus follow-ups. Only `live-round.ts` calls it.
  - `scheduleFires` gives every alive agent auto-engage fire times. It has no notion of an agent who is busy.
  - `runDecisions` calls the decide hook for `"defense"` only, using `viewWorld`. It drops `hold` commands for agents that are already holding.
  - `replayOrderLog` re-opens the scenario and re-issues each logged batch. Decide is off during replay.
- `src/sim/run.ts`
  - `AgentBody` has these fields: id, definition, side, position, hp, alive, facing, credits, charges, cooldowns, `ultimatePoints`, statuses.
  - `World = { timeMs, agents, smokes, devices, zones }`.
  - `RoundResult` is `attack-eliminated | defense-eliminated | timeout(winner: "defense")`.
  - `SimEvent` is a tagged union with 23 event types, ending in `round-ended`. `Job` is a tagged union.
  - `applyJob` resolves kills only in the `engage` path (`target.alive = target.hp > 0`, then `grantKillUltPoints`). Ability and zone damage set hp in the resolve files.
  - `createWorld(scenario, ruleset)` builds the agents. There is nothing objective-related.
- `src/sim/combat/ult-points.ts`: `grantKillUltPoints` (+1 killer, +1 victim) and `spendUltPoints`. The TODO says that orbs, plant and defuse come from `globals.ultPointSources` and that they must not be invented.
- `agent-reference.json` `globals`: `ultPointSources: ["kill","death","orb","plant","defuse"]`, `ultPointValue: 1`. Under the doc tag convention this is a sheet value.
- `src/sim/fog.ts` `viewWorld`: own agents, plus enemies that some alive, non-blind ally can see (line of sight through walls and smokes). It also filters devices and zones. There is no objective state.
- `src/rules/ruleset.ts`: `roundDurationMs: 100_000`, tagged `owner` ("Defense wins on timeout until spike plant exists"). `simStepMs` 50 and `decisionIntervalMs` 500 are both assumed. There are no spike fields.
- `src/sim/map/drill-hall.ts`: `MapDefinition.sites` is a single rectangle `site-a`. There are no plant zones yet (G1 adds `regions`).
- `src/sim/scenario/types.ts` `Scenario`: version 1, with no objective field. `src/persistence/scenario-file.ts` `assertScenario` validates its shape.
- `src/sim/describe.ts` `describeEvent`: an exhaustive switch over `SimEvent.type`.
- `src/sim/types.ts` `RejectionCode`: a closed union. `src/ui/orders/rejectionMessages.ts` maps it through `Record<RejectionCode, string>`, so every new code needs a message or the build fails.
- `src/tactics/defense-stub.ts` `defenseHoldDecide`: holds every living defender in the fogged world.
- `src/ui/App.tsx`
  - `remainingMs = roundDurationMs - world.timeMs`, which renders through `formatRoundTimer` (`src/ui/live/hostLoop.ts`) in the topbar `div.timer[aria-label="Round timer"]`.
  - The keydown handler uses Space, Escape, `[`, `]`, H, 1-5, C/Q/E/X and Delete/Backspace. F and G are free.
  - The view is `viewLive(live, "attack")` unless "Showing truth" is on.
  - `RoundEndBanner` is shown when `live.phase === "ended"`.
- `src/ui/live/RoundEndBanner.tsx` `resultBanner(result)`: three strings, and the last one is the fallback for timeout.
- `src/ui/live/replayFile.ts`: `REPLAY_FILE_VERSION = 2`. It stores the scenario, seed, orderLog, simTimeMs and an optional preRoundPlan.
- `tests/sim/characterization.test.ts` deep-compares `events`, `finalWorld` and `result` against the JSON fixtures in `tests/fixtures/characterization/`. Any new key on `World` in those scenarios would break them.
- `tests/ui/round-play.test.tsx` asserts the timeout banner through `resultBanner`.

## 3. Design

### 3.1 Opt-in spike rounds (keeps legacy determinism)

A round has a spike only when its scenario says so. Scenarios without the field behave exactly as they do today, and `world.spike` stays absent. This keeps the characterization fixtures, old replays and existing tests byte-identical.

```ts
// src/sim/scenario/types.ts (modify)
export type ScenarioSpike = {
  /** Attacker who holds the spike at t=0. */
  carrierId: string;
};
export type Scenario = {
  // ...existing fields
  /** Absent = legacy round with no objective (timeout and elimination only). */
  spike?: ScenarioSpike;
};
```

Carrier assignment (design): the pre-round UI picks the carrier, with one click on an attacker row. The default is the first attack member in scenario order. `createPlayableDrill` sets `spike: { carrierId: <first attacker> }` only once the owner has authored a Drill Hall plant zone (G1 content). Before that, the drill keeps running without a spike.

`openLiveRound` adds these checks when `scenario.spike` is present:

- `carrierId` is an attack member. If not, it rejects with `unknown-agent` or `wrong-side`.
- That member has hp > 0. If not, it rejects with `agent-down`.
- The map has at least one `plant-zone` region (G1 `MapRegion.kind`). If not, it rejects with the new code `no-plant-zone`.

### 3.2 Spike state on the world

```ts
// src/sim/run.ts (modify) - type lives here next to World to avoid an import cycle
export type SpikeChannel = {
  instanceId: string;
  kind: "plant" | "defuse";
  /** Position when the channel started; any change cancels (covers knockback). */
  at: Point;
  startedAtMs: number;
  completesAtMs: number;
};

export type SpikeState =
  | { phase: "carried"; carrierId: string; activeChannel: SpikeChannel | null }
  | { phase: "dropped"; at: Point; droppedAtMs: number }
  | {
      phase: "planted";
      at: Point;
      regionId: string;
      planterId: string;
      plantedAtMs: number;
      detonatesAtMs: number;
      activeChannel: SpikeChannel | null;
    }
  | { phase: "defused"; at: Point; regionId: string; plantedAtMs: number; defusedAtMs: number; defuserId: string }
  | { phase: "detonated"; at: Point; regionId: string; plantedAtMs: number; detonatedAtMs: number }
  /** Fog views only; never in truth. */
  | { phase: "unknown" };

export type World = {
  // ...existing fields
  /** Present only when the scenario has `spike`. */
  spike?: SpikeState;
};
```

`activeChannel` copies data that X1's `ChannelState` also holds. G2 keeps it for three reasons. The one-defuser rule becomes a single field check. Fog and UI can show "planting" or "defusing" without reading every body. The "moved" check (any position change, including Rolling Thunder knockback) compares against `at` without changing X1's type. The X1 `ChannelState` on the body is still the source of truth for timing, and G2 keeps the two in sync in one function (`syncSpikeChannel` in `src/sim/spike.ts`).

### 3.3 Commands

```ts
// src/sim/live-round.ts AgentCommand (modify)
  | { kind: "plant"; instanceId: string }          // contract name (G2)
  | { kind: "defuse"; instanceId: string }         // contract name (G2)
  | { kind: "pickup-spike"; instanceId: string }   // new, not in the contract table
  | { kind: "drop-spike"; instanceId: string }     // new, not in the contract table
```

`validateCommand` checks, after the shared checks (agent exists, side, alive):

| Command | Extra checks (tag) | Rejection code |
| --- | --- | --- |
| plant | round has spike; side attack; `spike.phase === "carried"` and `carrierId === instanceId`; `regionsAt(map, agentPos)` contains a `plant-zone`; no active X1 channel on the agent (design) | `no-spike`, `wrong-side`, `not-spike-carrier`, `outside-plant-zone`, X1's busy code |
| defuse | side defense; `spike.phase === "planted"`; `distanceMm(agent, spike.at) <= SPIKE_DEFUSE_RADIUS_MM` (assumed); `spike.activeChannel === null` (one defuser at a time, design) | `spike-not-planted`, `spike-out-of-reach`, `spike-busy` |
| pickup-spike | side attack; `spike.phase === "dropped"`; distance <= `SPIKE_PICKUP_RADIUS_MM` (assumed) | `spike-not-dropped`, `spike-out-of-reach` |
| drop-spike | side attack; carrier; no active plant channel | `not-spike-carrier`, `spike-busy` |

New `RejectionCode` members (`src/sim/types.ts`): `no-spike`, `no-plant-zone`, `not-spike-carrier`, `outside-plant-zone`, `spike-not-planted`, `spike-not-dropped`, `spike-out-of-reach`, `spike-busy`. Each one gets a message in `rejectionMessages.ts`.

`applyPendingBatch` adds explicit branches:

- `plant` / `defuse`: set the standing order to `{ kind: "hold" }`, so the command also stops the agent (design, one input). Re-validate the zone or distance at apply time, and if it fails, emit `order-rejected` and stop. Then start the X1 channel (`channel-start` job) with duration `ruleset.spikePlantDurationMs` or `ruleset.spikeDefuseDurationMs`, and set `spike.activeChannel`.
- `pickup-spike`: `spike -> { phase: "carried", carrierId, activeChannel: null }`, and emit `spike-picked-up`.
- `drop-spike`: `spike -> { phase: "dropped", at: agentPos, droppedAtMs: now }`, and emit `spike-dropped` with reason `"dropped"`.

`cloneCommand` gets a branch for each of the four kinds (see the trap in section 2).

### 3.4 Channel rules for plant and defuse (on X1)

G2 adds two members to X1's `ChannelWhat` union (`docs/stage-x1-plan.md` section 3, which reserves exactly these): `{ kind: "plant" }` and `{ kind: "defuse" }`. The channel's `cancelOn` lists `"moved"`, `"died"` and `"replaced"` (plus X1's mandatory `"replaced"` and `"round-ended"`), and never `"suppressed"` (see the table). When X1 fires `channel-complete` for these kinds, it calls `completeSpikeChannel(world, instanceId, timeMs, ruleset)` in `src/sim/spike.ts`.

What cancels a spike channel (each emits X1's `channel-cancel` with an X1 `ChannelCancelReason`, and clears `spike.activeChannel`):

| Trigger | Cancels? | Tag |
| --- | --- | --- |
| Channeler dies | yes | design (X1 rule) |
| Accepted `move-route` for the channeler | yes | design |
| Accepted `cast` or `shoot` for the channeler | yes | design |
| Accepted `hold` for the channeler | no (hold already applies; this protects the defense stub cadence) | design |
| Position changes while channeling (knockback) | yes, checked against `activeChannel.at` after each job | design; the sheet `canPullDefuserOffSpike` on Astra Gravity Well points the same way for that ability only |
| Damage taken | no | design, unsourced (section 11, Q3) |
| Blind, concuss | no | design |
| Suppress | no: no source says suppress stops planting or defusing, so spike channels leave `"suppressed"` out of `cancelOn` (agreed with K5 section 3, which cancels ability channels only) | design |
| Round ends | the channel is dropped with the round | design |

While a spike channel is active, `scheduleFires` skips the channeler (no auto-engage, design). This is the only change G2 makes to fire scheduling.

### 3.5 Drop on death and pickup by walking over it

- **Drop sweep.** After each job applied in `drainJobsUntil`, a call to `sweepSpikeAfterJob(world, item.timeMs, events, nextSequence)` checks two things. If `spike.phase === "carried"` and the carrier is dead, the spike drops at the carrier's last position (`spike-dropped`, reason `"carrier-died"`, timeMs = that job's time). If `activeChannel` is set and the channeler is dead or has moved, the channel is cancelled. This one hook catches kills from bullets, ability damage and zones without editing the resolve files. If X1 adds its own post-job hook for death cancel, G2 registers this sweep there instead of adding a second hook.
- **Auto-pickup** (design). This runs in `stepOnce` after the step's movement and drain, and only when `spike.phase === "dropped"` and `droppedAtMs <= prevTime`. A spike dropped this step cannot be picked up this step. For each alive attacker whose standing order moved them this step, it tests the swept segment from their position at the start of the step to their position at the end: `pointSegmentDistanceSq(spike.at, from, to) <= SPIKE_PICKUP_RADIUS_MM^2` (`src/sim/map/geometry.ts`). If several attackers qualify, the winner is the one with the smaller squared distance, then the lower `instanceId`. Pickup is stamped at `newTime`.
- **Stationary attackers** do not auto-pick-up (design). They use `pickup-spike`. This is why the explicit command exists.
- **Defenders** never pick up the spike.

### 3.6 Plant, defuse, detonation

`completeSpikeChannel`:

- **plant.** Re-check `plant-zone` at the agent's position and take the first region id in sorted order. Set `spike -> planted` with `detonatesAtMs = timeMs + ruleset.spikeDetonationMs`. Emit `spike-planted { at, regionId, detonatesAtMs }`. Call `grantPlantUltPoints(planter)`. Return a follow-up job `{ type: "spike-detonate" }` at `detonatesAtMs`.
- **defuse.** If `spike.phase === "planted"`, set `spike -> defused`, emit `spike-defused`, and call `grantDefuseUltPoints(defuser)`. If the spike is already detonated, this is a no-op.
- **`spike-detonate` job** (new `Job` member in `run.ts`). If `spike.phase === "planted"`, set `spike -> detonated` and emit `spike-detonated`.

Tie at the same millisecond (design). Queue order is `(timeMs, sequence)`. The detonate job is enqueued when the plant completes, which is always before any defuse channel can start, so detonation applies first and the defuse completion becomes a no-op. **Detonation wins exact ties.**

### 3.7 Round results and the timer handoff

```ts
// src/sim/run.ts (modify)
export type RoundResult =
  | { kind: "attack-eliminated" }
  | { kind: "defense-eliminated" }
  | { kind: "timeout"; winner: "defense" }
  | { kind: "spike-detonated"; winner: "attack" }
  | { kind: "spike-defused"; winner: "defense" };

/** New helper for G4/G5 so they never switch on kinds themselves. */
export function roundWinner(result: RoundResult): Side;
```

Step cap (`stepOnce` line "b"): `newTime = Math.min(prevTime + simStepMs, roundEndCapMs(round))`, where `roundEndCapMs` returns `spike.detonatesAtMs` once the spike is planted and `ruleset.roundDurationMs` otherwise. After a plant, the round timer stops mattering. The spike timer is the only clock.

New `evaluateResult` (each rule is tagged; all are design unless noted):

```ts
function evaluateResult(round: LiveRound, newTime: number): RoundResult | null {
  const spike = round.world.spike;
  // R1 design: a finished spike decides the round, ahead of eliminations in the same step.
  if (spike?.phase === "defused") return { kind: "spike-defused", winner: "defense" };
  if (spike?.phase === "detonated") return { kind: "spike-detonated", winner: "attack" };
  const { attackAlive, defenseAlive } = aliveBySide(round.world);
  // R2 design: no defenders left -> attack wins, before or after plant (unchanged pre-plant).
  if (!defenseAlive) return { kind: "defense-eliminated" };
  const planted = spike?.phase === "planted";
  // R3 design/assumed: after plant, losing every attacker does NOT end the round;
  // defense must still defuse before detonation.
  if (!attackAlive && !planted) return { kind: "attack-eliminated" };
  // R4 owner (existing): timeout at roundDurationMs, but only before plant.
  // R5 design: a plant channel still running at roundDurationMs loses to timeout.
  // R6 design: a plant completing exactly at roundDurationMs counts (jobs <= newTime drain first).
  if (!planted && newTime >= round.ruleset.roundDurationMs) return { kind: "timeout", winner: "defense" };
  return null;
}
```

Known coarseness (design, kept from today's engine): results are evaluated once per 50 ms step. Inside one step, R1 beats an earlier wipe. For example, if the last defender dies at t1 and the spike detonates at t2 in the same step, the result reads `spike-detonated`. Both outcomes give the same winner, so only the label differs.

Legacy rounds (no `world.spike`) go through exactly today's three checks. This is required for the fixtures.

### 3.8 Events

New `SimEvent` members in `run.ts`, each with a `describeEvent` line:

```ts
  | { type: "spike-dropped"; at: Point; reason: "carrier-died" | "dropped" }
  | { type: "spike-picked-up"; at: Point }
  | { type: "spike-planted"; at: Point; regionId: string; detonatesAtMs: number }
  | { type: "spike-defused"; at: Point }
  | { type: "spike-detonated"; at: Point }
```

`agentId` is the acting agent, or `""` for detonation. Channel start and cancel events are X1's.

### 3.9 Ult points

```ts
// src/sim/combat/ult-points.ts (modify)
/** Sheet: globals.ultPointSources includes plant/defuse; globals.ultPointValue 1. */
export const SPIKE_ULT_POINT_VALUE = 1;
export function grantPlantUltPoints(planter: AgentBody): void;   // +SPIKE_ULT_POINT_VALUE
export function grantDefuseUltPoints(defuser: AgentBody): void;  // +SPIKE_ULT_POINT_VALUE
```

Recipient: only the agent who planted or defused (design; the sheet lists sources, not recipients; see Q4). The TODO comment is narrowed to orbs only. There is no cap, matching today's kill ledger.

### 3.10 Ruleset fields

New `Ruleset` fields with provenance, all `kind: "assumed"` and all in `src/rules/ruleset.ts`, following the existing `<field>` + `<field>Provenance` pattern:

- `spikePlantDurationMs`
- `spikeDefuseDurationMs`
- `spikeDetonationMs`
- `spikePickupRadiusMm`
- `spikeDefuseRadiusMm`

Each one has an exported named constant and a provenance constant (table in section 5). Values are not set in this plan. The owner provides them (Q1). Until then, the implementer may use placeholder values whose provenance note says "placeholder, not a Valorant value". Tests always read the ruleset field, never a literal.

## 4. Determinism and fog implications

### 4.1 Determinism

- No RNG is used anywhere in G2. All times are integer ms and all positions are integer mm.
- The carrier comes from `scenario.spike.carrierId`, which is stored in the scenario and therefore in every replay.
- New jobs and events take sequence numbers from the existing counter, only in spike rounds. Legacy scenarios produce the same sequences as before. The characterization fixtures must stay unchanged, and the existing test enforces that.
- Auto-pickup ties break by squared distance, then `instanceId`. The drop sweep runs in job order. Detonation versus defuse ties break by queue sequence (section 3.6).
- `truthLiveWorld` and `viewLive` already use `structuredClone`, and `SpikeState` is plain data.

### 4.2 Fog (`src/sim/fog.ts` `viewWorld`)

All rules below are design and are listed again in Q5.

| Spike truth | Attack view | Defense view |
| --- | --- | --- |
| carried | full | `carried` with `carrierId` only if the carrier is in the visible enemy list; `activeChannel` only if the channeler is visible; otherwise `{ phase: "unknown" }` |
| dropped | full | full if any alive, non-blind defender has line of sight (walls and smokes, the same `hasLineOfSight` call) to `spike.at`; otherwise `unknown` |
| planted | full | `phase`, `at`, `regionId`, `plantedAtMs`, `detonatesAtMs` always (plant is announced); `activeChannel` always for own defusers |
| defused / detonated | full | full |

Planted `activeChannel` (the defuser) is shown to the attack only when the defuser is visible.

### 4.3 Replay and order log

- New command kinds go through `issueOrders` and are logged like any other. `replayOrderLog` needs no change beyond `cloneCommand`.
- The replay file stays at `REPLAY_FILE_VERSION = 2` (additive: new optional scenario field, new command kinds). Builds from before G2 reject such files at the first unknown command, which only affects new files. G6 owns v3 and inherits these kinds. See Q6.
- `parseScenario` and `assertScenario` accept the optional `spike` and validate that `carrierId` is a string.

### 4.4 Decide hook

- `runDecisions` passes the fogged world, which now carries `spike` filtered as in section 4.2. O1/O2 read it from there. `src/sim` still never imports `src/tactics`.
- `defenseHoldDecide` is unchanged. It never issues `defuse`, so a planted spike always detonates unless the attackers are all killed before the plant or the defense hot-seat (G6) defuses. This is expected until O2. Its `hold` commands do not cancel channels (section 3.4).

## 5. Provenance and unknowns

| Value | Tag | Named constant | How to confirm |
| --- | --- | --- | --- |
| Plant channel duration | assumed | `SPIKE_PLANT_DURATION_MS` -> `ruleset.spikePlantDurationMs` | Owner value, or a primary source (patch notes or a client measurement) recorded in provenance |
| Defuse channel duration | assumed | `SPIKE_DEFUSE_DURATION_MS` -> `ruleset.spikeDefuseDurationMs` | Same |
| Post-plant spike timer | assumed | `SPIKE_DETONATION_MS` -> `ruleset.spikeDetonationMs` | Same |
| Pickup radius | assumed | `SPIKE_PICKUP_RADIUS_MM` -> `ruleset.spikePickupRadiusMm` | Owner choice (lab scale) |
| Defuse reach | assumed | `SPIKE_DEFUSE_RADIUS_MM` -> `ruleset.spikeDefuseRadiusMm` | Owner choice (lab scale) |
| Round timer 100000 ms | owner (existing, unchanged) | `roundDurationMs` | Already tagged; do not upgrade |
| Plant ult point +1 | sheet | `SPIKE_ULT_POINT_VALUE` | `agent-reference.json` `globals.ultPointSources`, `ultPointValue` |
| Defuse ult point +1 | sheet | `SPIKE_ULT_POINT_VALUE` | Same |
| Ult recipient = actor only | design | none | Q4 |
| Half-defuse checkpoint | not modelled (OFF) | none (no constant added) | Q2 |
| Damage cancels channel | design: no | none | Q3 |
| Auto-fire suppressed while channeling | design | none | Playtest |
| Plant command stops movement | design | none | Playtest |
| One defuser at a time | design | none | Owner |
| Carrier default = first attacker | design | none | Owner |
| Auto-pickup only when walking over | design | none | Owner |
| Elimination after plant does not end the round for attackers | design/assumed | none | Owner (R3) |
| Timeout beats an unfinished plant; plant at exactly the timer edge counts | design | none | Owner (R5, R6) |
| Detonation wins an exact tie with defuse | design | none | Owner |
| Plant announced to defense (fog) | design | none | Q5 |
| Spike blast damage | not modelled | none | Needs a primary source |

## 6. Staged delivery

All sub-stages keep `npm run check` as the gate. "Asserts" lists what each test WILL check. Browser checks are at 1366x768.

Test support (G2.1):

- `tests/sim/support/spike-fixture.ts` (new): `spikeScenario(options)` builds a scenario on the G1 test fixture map, which has one `plant-zone`, with a chosen carrier.
- `tests/sim/support/live-harness.ts` gains `spikeOf(round)` and `mustPlant(round, id)`.

### G2.1 Spike state, carrier, drop, pickup

Scope: `SpikeState`, `Scenario.spike`, `openLiveRound` checks, `pickup-spike` / `drop-spike`, the drop sweep, auto-pickup, the `spike-dropped` / `spike-picked-up` events, the fog rules for carried and dropped, the pickup and defuse radius ruleset fields, the rejection codes and messages, and `cloneCommand` branches.

Acceptance:

- `tests/sim/spike.test.ts` (new) asserts:
  - The carrier is set from the scenario. A missing, defense-side or dead carrier is rejected with its code.
  - A map without a `plant-zone` is rejected with `no-plant-zone`.
  - When the carrier is shot dead, `spike.phase === "dropped"` and `at` equals the death position, with a `spike-dropped` event (reason `carrier-died`) at the shot's time.
  - An attacker routed across the drop point picks the spike up. An attacker standing inside the radius does not.
  - `pickup-spike` inside the radius succeeds, and outside it is rejected with `spike-out-of-reach`.
  - `drop-spike` by a non-carrier is rejected with `not-spike-carrier`.
  - Defenders cannot pick up (`wrong-side`).
  - `cloneCommand` keeps the kind of every new command (logged entry kinds equal the issued ones).
- `tests/sim/spike-fog.test.ts` (new) asserts that the defense view shows `unknown` for a carried spike when the carrier is hidden, and `carried` when the carrier is visible. A dropped spike behind a wall or smoke is `unknown`, and in line of sight it is shown in full.
- `tests/sim/characterization.test.ts` is unchanged and still deep-equals all fixtures (no `spike` key in legacy worlds).
- `tests/sim/scenario-file.test.ts` asserts that a scenario with `spike` round-trips and that a non-string `carrierId` fails with `invalid-shape`.

Browser: no UI change yet. The existing drill loads and plays exactly as before.

### G2.2 Plant and defuse channels, ult points

Scope:

- `plant` / `defuse` commands on X1 channels, with `activeChannel` sync.
- The cancel rules in section 3.4, including the moved-check in the sweep, and auto-fire skip while channeling.
- `completeSpikeChannel`, the `spike-planted` / `spike-defused` events.
- `grantPlantUltPoints` / `grantDefuseUltPoints`.
- The plant and defuse duration ruleset fields.

Acceptance:

- `tests/sim/spike.test.ts` asserts:
  - A plant outside the zone is rejected with `outside-plant-zone`, and a plant by a non-carrier with `not-spike-carrier`.
  - A plant inside the zone completes exactly `spikePlantDurationMs` after the apply time (event time check).
  - The planter's `ultimatePoints` rises by `SPIKE_ULT_POINT_VALUE`.
  - A `move-route` mid-plant cancels it (X1 cancel event, spike still carried, no `spike-planted`), while a `hold` mid-plant does not cancel it.
  - Killing the planter mid-plant cancels the plant and drops the spike.
  - A Rolling Thunder knockback mid-defuse cancels the defuse.
  - A second defender's `defuse` is rejected with `spike-busy`.
  - A defuse outside the reach is rejected with `spike-out-of-reach`.
  - A channeling agent schedules no auto-engage during the channel.
- `tests/sim/combat.test.ts` is unchanged (the kill ledger is still +1/+1).

Browser: none (no UI yet). Note: in this sub-stage alone, a planted round still times out at `roundDurationMs`. G2.3 fixes that, and the two sub-stages should merge close together.

### G2.3 Results, spike timer, detonation

Scope:

- `RoundResult` additions and `roundWinner`.
- The `spike-detonate` job.
- `roundEndCapMs`, the new `evaluateResult`, and the `spikeDetonationMs` field.
- The fog rule for planted (both sides).

Acceptance:

- `tests/sim/spike.test.ts` asserts:
  - After a plant, there is no `timeout` at `roundDurationMs`.
  - With no defuse, the result is `spike-detonated` at exactly `detonatesAtMs` (last event `round-ended`, `world.timeMs === detonatesAtMs`).
  - A defuse completing before detonation gives `spike-defused`. An exact tie gives `spike-detonated`.
  - All attackers dead after the plant: the round continues until detonation or defuse.
  - All defenders dead after the plant: `defense-eliminated`.
  - All attackers dead before the plant: `attack-eliminated`.
  - A plant still channeling at `roundDurationMs`: `timeout`.
  - `roundWinner` maps all five kinds.
- `tests/sim/live-round.test.ts` asserts that `replayOrderLog` of a spike round (pickup, plant, defuse commands in the log) reproduces the same events and result. The existing timeout test is unchanged.
- `tests/sim/spike-fog.test.ts` asserts that the defense sees a planted spike's `at` and `detonatesAtMs` with no line of sight.

Browser: none yet.

### G2.4 UI

Scope (section 7): carrier marker, dropped and planted glyphs, channel progress ring, interact hotkey F and drop hotkey G, AgentPanel/AttackerHud buttons, the pre-round carrier toggle, the spike timer in place of the round timer, plant-zone highlight and plant preview, the two banner strings, and the playable drill carrier (only if a Drill Hall plant zone exists).

Acceptance:

- `tests/ui/spikeUi.test.ts` (new) asserts:
  - `clockFor(world, ruleset)` returns `{ label: "round", remainingMs }` before the plant and `{ label: "spike", remainingMs: detonatesAtMs - timeMs }` after.
  - `interactActionFor` returns `plant` for a carrier in a zone, `pickup-spike` near a drop, `null` (with a reason string) otherwise, and `defuse` for a defender near a planted spike.
- `tests/ui/round-play.test.tsx` asserts:
  - The banner text for `spike-detonated` and `spike-defused` comes from `resultBanner`.
  - Loading a replay that ends in a plant shows `aria-label="Spike timer"`.
  - Pressing F with the carrier selected inside the zone issues an accepted `plant`.
- `tests/ui/replayFile.test.ts` asserts that a v2 file whose orderLog holds `plant` round-trips.

Browser at 1366x768:

- Carry the spike to the zone, press F and watch the ring fill.
- The timer label switches to Spike.
- Let it detonate, and the banner reads attack win.
- Kill the carrier, then route another attacker over the drop and see the marker move.
- No document scroll at any point.

### G2.5 Integration and status

Scope: write `docs/status/g2.md` with the `PROJECT_STATUS.md` text for the integrator (spike in, half-defuse and blast not modelled, the defense stub never defuses), and confirm `src/tactics/defense-stub.ts` needs no edit.

Acceptance: `npm run check` green with all of the tests above. `tests/architecture.test.ts` is unchanged (no evaluator change; `src/sim` does not import `src/tactics`).

## 7. UI impact

Clicks or keys per action (attack player):

| Action | Inputs | Notes |
| --- | --- | --- |
| Choose carrier (pre-round) | 1 click on the spike toggle in the attacker row | Default set, so usually 0 |
| Plant | select carrier (1 click or 1-5) + F = 2 | Rejected outside a zone with a message from `rejectionMessages.ts` |
| Fetch dropped spike | select attacker + click the dropped spike glyph = 2 | Issues a `move-route` to `spike.at`; auto-pickup on arrival |
| Pick up while standing near | select + F = 2 | `pickup-spike` |
| Drop / hand off | select carrier + G = 2 | `drop-spike` |
| Defuse (defense hot-seat after G6) | select defender + F = 2 | Shown only when the controlled side is defense |

- **Map display.** `MapView` (`src/ui/board/MapView.tsx`) draws:
  - a small spike badge on the carrier token (attack view; defense view only when the carrier is visible);
  - a spike glyph at a dropped spike's `at`;
  - a planted glyph with a ring that shows `activeChannel` progress `(timeMs - startedAtMs) / (completesAtMs - startedAtMs)`. The same ring shows on a planting carrier.

  `MapView` already receives `world`, so no new prop is needed for the spike itself. A new optional `onSpikeClick` prop covers "fetch".
- **Previews** (`src/ui/board/previews.ts`). When the selected agent is the carrier, the board highlights `plant-zone` polygons (the existing `polygon` primitive with a fill). When hovering inside one, it shows a `label` "Plant: <s> s (assumed)" built from `ruleset.spikePlantDurationMs`. No new primitive kind.
- **Timer.** The topbar `div.timer` shows `formatRoundTimer(clock.remainingMs)`. `aria-label` switches between "Round timer" and "Spike timer", with a distinct CSS class and an "(assumed)" note on the spike timer, matching the buy-timer note.
- **Status line.** The topbar gets one badge: "Spike: carried by X / dropped / planted A / defusing". It uses the fogged view unless truth is on.
- **HUD.** `AttackerHud` shows a "Plant (F)" button on the carrier's row, disabled with a title reason when out of zone, and the pre-round spike toggle.
- **Banner.** `resultBanner` gets two strings: attackers win when the spike detonated, defenders win when it was defused. They follow the separator style of the existing three strings.
- **One-screen rule.** No new panel or row. The badge sits in the existing topbar, the buttons in existing HUD rows, and the glyphs on the board. The browser check confirms that there is no document scroll at 1366x768.

## 8. Files touched

> Build protocol (consistency pass): this stage is built under [`parallel-build-plan.md`](parallel-build-plan.md). Edits listed here to `src/ui/App.tsx`, `src/ui/styles.css`, `rejectionMessages.ts`, `describe.ts` and the shared docs are integration-file edits: the stage's UI lives in its own component files (with their own CSS), and the App mount lines, message entries and doc text are applied at merge. After H0, engine edits go into the split modules and this stage's reserved slots.

| File | New / modify | What |
| --- | --- | --- |
| `src/sim/spike.ts` | new | `sweepSpikeAfterJob`, `autoPickupSpike`, `completeSpikeChannel`, `syncSpikeChannel`, `roundEndCapMs`, `viewSpike` (fog helper), plant-zone lookup via G1 `regionsAt` |
| `src/sim/run.ts` | modify | `SpikeState`, `SpikeChannel`, `World.spike?`, `RoundResult` additions, `roundWinner`, five `SimEvent` members, `spike-detonate` `Job` + `applyJob` branch, `createWorld` spike init |
| `src/sim/live-round.ts` | modify | `AgentCommand` four kinds, `validateCommand`, `applyPendingBatch`, `cloneCommand`, `openLiveRound` checks, `stepOnce` cap + pickup call, `drainJobsUntil` sweep call, `scheduleFires` channel skip, `evaluateResult` |
| `src/sim/fog.ts` | modify | Spike filtering in `viewWorld` |
| `src/sim/types.ts` | modify | Eight `RejectionCode` members |
| `src/sim/scenario/types.ts` | modify | `ScenarioSpike`, `Scenario.spike?` |
| `src/persistence/scenario-file.ts` | modify | Accept and validate optional `spike` |
| `src/sim/describe.ts` | modify | Five event descriptions |
| `src/sim/combat/ult-points.ts` | modify | `SPIKE_ULT_POINT_VALUE`, `grantPlantUltPoints`, `grantDefuseUltPoints`, TODO narrowed to orbs |
| `src/rules/ruleset.ts` | modify | Five spike fields + provenance constants |
| `src/sim/effects/channel.ts` | modify (X1-owned) | Add the two spike channel kinds and the completion dispatch to `completeSpikeChannel` only |
| `src/ui/live/spikeUi.ts` | new | `clockFor`, `interactActionFor`, `spikeStatusText` |
| `src/ui/live/RoundEndBanner.tsx` | modify | Two banner strings |
| `src/ui/App.tsx` | modify | F/G keys, timer via `clockFor`, spike badge, `onSpikeClick`, pre-round carrier into the scenario before Go |
| `src/ui/board/MapView.tsx` | modify | Spike glyphs, carrier badge, channel ring, `onSpikeClick` |
| `src/ui/board/previews.ts` | modify | Plant-zone highlight and plant label builder |
| `src/ui/orders/AttackerHud.tsx` | modify | Plant button, pre-round spike toggle |
| `src/ui/orders/rejectionMessages.ts` | modify | Eight messages |
| `src/ui/orders/hotkeys.ts` | modify | `SPIKE_INTERACT_KEY = "F"`, `SPIKE_DROP_KEY = "G"` |
| `src/ui/scenario/playableDrill.ts` | modify | `spike.carrierId` once a Drill Hall plant zone exists |
| `src/ui/styles.css` | modify | Spike glyph, ring, spike-timer class |
| `tests/sim/spike.test.ts` | new | Sections G2.1-G2.3 |
| `tests/sim/spike-fog.test.ts` | new | Fog rules |
| `tests/sim/support/spike-fixture.ts` | new | `spikeScenario` on the G1 fixture map |
| `tests/sim/support/live-harness.ts` | modify | `spikeOf`, `mustPlant` |
| `tests/sim/live-round.test.ts` | modify | Spike replay determinism |
| `tests/sim/scenario-file.test.ts` | modify | `spike` round-trip and shape error |
| `tests/ui/spikeUi.test.ts` | new | Clock and interact helpers |
| `tests/ui/round-play.test.tsx` | modify | Banners, spike timer, F key |
| `tests/ui/replayFile.test.ts` | modify | v2 file with spike commands |
| `docs/status/g2.md` | new | Stage result, playtest steps and the exact text for PROJECT_STATUS.md / README.md / docs/playtest.md / docs/roadmap.md. The integrator applies that text at merge (docs/parallel-build-plan.md); this stage's branch never edits those shared docs. |

Not touched: `tests/architecture.test.ts`, `src/tactics/*`, `tests/fixtures/characterization/*`, `src/ui/live/replayFile.ts` (no version change), `src/sim/preround.ts`.

## 9. Dependencies

- **G1** must land first. G2 consumes `MapDefinition.regions`, `MapRegion` with `kind: "plant-zone"`, `regionsAt(map, point)`, `pointInPolygon`, and the G1 test fixture map. Drill Hall plant-zone content is owner-authored. Without it, only tests exercise the spike, and the playable drill stays spike-less.
- **X1** must land first. G2 consumes `ChannelState` on the agent body, the `channel-start` / `channel-complete` / `channel-cancel` jobs, `ChannelCancelReason`, the "busy channel" rejection, and X1's interrupt rules (death, move, replace). G2 adds `{ kind: "plant" }` and `{ kind: "defuse" }` to X1's `ChannelWhat`.
- **Consumed by later stages:**
  - G4 uses `RoundResult` and `roundWinner`.
  - G5 adds plant credits, reading `spike-planted` events.
  - G6 defense hot-seat makes the defuse UI reachable.
  - O1/O2 read `world.spike` from the fogged view.
  - K5 suppress does not cancel spike channels (no source); it cancels ability channels only.
- G2 changes no names owned by G3, G6, O1 or D1.

## 10. Risks

1. **X1 shape mismatch.** If X1's `ChannelState` has no kind discriminator or no completion dispatch, G2 needs X1 changes. Mitigation: agree on the two kind names and the `completeSpikeChannel` call before G2.2 starts.
2. **Fixture drift.** Any unconditional `world.spike` key or extra sequence number in legacy rounds breaks every characterization fixture. Mitigation: opt-in via `scenario.spike`, plus the G2.1 acceptance check.
3. **Parallel edits to `live-round.ts` and `run.ts`.** X1, G3 and K5 also touch `AgentCommand`, `applyPendingBatch`, `Job` and `applyJob`. Mitigation: G2 keeps its logic in `src/sim/spike.ts` and adds only thin branches.
4. **No Drill Hall plant zone yet.** The browser check needs owner map content. Mitigation: G2.4 browser check may use a replay on the G1 fixture map if the owner content is late.
5. **Step-granular results.** Inside one 50 ms step, R1 can relabel a same-winner outcome (section 3.7). This is documented. Changing it would mean tracking per-event terminal times, which is out of scope.
6. **The stub defense loses every planted round.** Playtests may read this as a bug. Mitigation: a note in `docs/status/g2.md` (applied to `PROJECT_STATUS.md` at merge); O2 fixes it.

## 11. Open questions

1. **Plant, defuse and spike timer values?** Recommended: the owner supplies them before G2.2 and they are tagged `owner`. Until then, use clearly labelled assumed placeholders, never quoted as Valorant values.
2. **Half-defuse checkpoint?** There is no source in the repo. Recommended: keep it OFF and add no constant now. If a primary source appears, add `SPIKE_DEFUSE_CHECKPOINT_MS` (assumed or sourced) and a `defuseProgressMs` field on the planted state in a follow-up.
3. **Should taking damage cancel plant or defuse?** Unsourced. Recommended: no for now (design). Revisit with a source or after O2 playtests.
4. **Ult point recipient for plant/defuse: actor only, or the whole team?** The sheet lists sources only. Recommended: actor only (design), tagged so it is easy to flip.
5. **Fog: should the defense see a dropped spike without line of sight, and is the plant announced?** Recommended: dropped needs line of sight, and planted is always known (design). Both are flagged for owner review.
6. **Replay version: bump to 3 for spike commands, or leave it to G6?** Recommended: stay at v2 (additive), and let G6's v3 carry the spike kinds unchanged.
