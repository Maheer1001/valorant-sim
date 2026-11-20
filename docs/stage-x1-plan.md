# Stage X1 plan: channels, interrupts, recall

Status: plan only. Nothing here is implemented. Baseline: HEAD 08d2dfb, `npm run check` green (25 files, 156 tests) as recorded by the coordinator. Acceptance criteria below describe what WILL be checked.

## 1. Goal and non-goals

Goal. Add one general "channel" primitive to the live engine: a timed action held by one agent that either completes or is cancelled with a typed reason. Use it for:

- a player `recall` command for devices whose source says they are reclaimable;
- G2 plant and defuse (G2 builds on this; X1 ships no spike code);
- K5 suppress (K5 adds the status; X1 provides the cancel hook);
- an opt-in path so a future ability windup can become interruptible when a source says it is.

X1 owns: `ChannelState` on `AgentBody`, job types `channel-start` / `channel-complete` / `channel-cancel`, `ChannelCancelReason`, the `AgentCommand` `{ kind: "recall"; instanceId; deviceId }`, the interrupt rules, and the new module `src/sim/effects/channel.ts`.

Non-goals:

- No change to any shipped ability's behaviour. The windups that exist today (Aftershock, Flashpoint, Fault Line, Rolling Thunder, Incendiary equip, Orbital Strike, Sky Smoke deploy) stay committed delays, exactly as now. The characterization and window-parity fixtures do not change.
- No shipped reclaimable device. Today's only device is Stim Beacon, and its reference row has no recall field. The recall command exists and is tested with a test-only device, but in the shipped game every recall is rejected with `not-reclaimable`.
- No refund rules unless a source states them. No numbers for any future kit (Gekko, Chamber, Cypher, Killjoy) are added here.
- No plant/defuse, spike, suppress, or detain statuses (G2, K5 and a later detain stage own those).
- No replay format bump (G6 owns replay v3).
- No new generic "cancel channel" command (see open question 1).

## 2. Current state (read for this plan)

- `src/sim/run.ts`
  - `AgentBody` has `statuses: StatusEffect[]` and no channel or action state.
  - `Job` is a closed union. Windups are not modelled as state. A cast job resolves at once and returns delayed `followups` (`aftershock-burst`, `flashpoint-impact`, `fault-line-wave`, `rolling-thunder-blast`, `incendiary-detonate`, `orbital-activate`, `smoke-active`).
  - `applyJob(job, timeMs, sequence, world, catalog, walls, combat, ruleset)` returns `ApplyResult = { world; event; followups }`. Exactly one event per job. Followups can only be added, never removed.
  - `withheld(...)` reasons: `no-line-of-sight | shooter-down | target-down | blinded`.
  - `runScenario` drives its own `EventQueue` with the same `applyJob`. Its `Order` kinds are move, cast and engage only.
- `src/sim/agents/cast.ts`: `evaluateCast(definition, instance, abilityId, origin, target)` checks ownership, `implementation === "complete"`, charges and range. It has no concept of busy or interrupted.
- `src/sim/agents/abilities/breach-resolve.ts`: `tryResolveBreachCast` spends charges, ult points and cooldown at cast time, emits `cast-accepted`, and schedules effects at hard-coded offsets: Aftershock `windup = 2200` plus 2 bursts 600 apart; Flashpoint `windup = 500` plus `ruleset.flashpointFlightMs`; Fault Line `chargeMs = 1000` plus `windup = 1100`; Rolling Thunder `channel = 600` plus 8 blasts 255 apart. `applyAftershockBurst` carries the explicit comment "Already-accepted casts resolve from the body even if the caster dies mid-windup." So today's windups are not interruptible, and this is pinned behaviour.
- `src/sim/agents/abilities/brimstone-resolve.ts`: `tryResolveBrimstoneCast` handles Sky Smoke (`deployDelayMs`), Stim Beacon (device pushed to `world.devices` at once, pulses every `ruleset.stimBeaconPulseMs`, then `device-expire`), Incendiary (`deployDelayMs ?? 1100`) and Orbital Strike (`orbital-activate` at `timeMs + 2000`). `applyStimBeaconPulse` emits an `order-rejected` event if the device is missing, so removing a device early would leave junk events unless its queued jobs are removed too.
- `src/sim/agents/abilities/brimstone.ts`: `STIM_BEACON_ABILITY.referenceStats` has radius, duration, unequip, multipliers, `indestructible: true`, `enemiesSeeRadius: false`. No recall or reclaim field.
- `agent-reference.json` (repo root), Brimstone C "Stim Beacon": `"recharge": "bought"`, `"cast": "instant throw"`, `"source": "verified"`, and no recall field. Other rows do have recall data (for later kits, not X1): Gekko Globules `reclaimChannelSec`, Chamber Trademark `recallSec` and `recallCooldownSec`, Cypher Spycam `recallCooldownSec`, and Killjoy-style "reclaimable in the buy phase" rows.
- `src/sim/types.ts`: `Device = { id; kind: "stim-beacon"; ownerInstanceId; abilityId; side; xMm; yMm; radiusMm; activeFromMs; expiresAtMs; enemiesSeeRadius; indestructible }`. `RejectionCode` is a closed union.
- `src/sim/effects/status.ts`: `hasStatus`, `applyStatus`, `activeStatuses`, and constants `STATUS_CONCUSS | STATUS_BLIND | STATUS_HASTE | STATUS_COMBAT_STIM`. No suppress or detain.
- `src/sim/clock.ts`: `EventQueue<T>` with `push` (re-sorts by `compareQueueKeys`: time, then sequence, then agent id), `peek`, `pop`, `length`. No removal.
- `src/sim/live-round.ts`
  - `AgentCommand = hold | move-route | cast | shoot`.
  - `issueOrders` validates every command with `validateCommand`, logs one `OrderLogEntry`, and queues a `PendingBatch`.
  - `stepOnce`: fire plan steps, then `applyPendingBatch` plus a drain at `prevTime`, then `advanceStanding` for each agent, then `scheduleFires`, then `drainJobsUntil(newTime)`, then sort the step's events by time, commit time, `evaluateResult`, and the decide cadence.
  - `applyPendingBatch`: `hold` sets the standing order and (live origin) calls `cancelWaypointPlans`. `move-route` calls `startSegment`. `cast` enqueues a `cast` job (live origin calls `cancelAbilityPlans`). `shoot` sets `shootOverride` and enqueues `engage`.
  - `drainJobsUntil` pops jobs with `timeMs <= untilMs`, calls `applyJob`, and pushes followups with fresh sequence numbers.
  - `viewLive` / `viewWorld` (`src/sim/fog.ts`) pass visible enemy `AgentBody` objects whole (statuses included), and filter devices by `side` or `enemiesSeeRadius`.
- `docs/effect-primitives.md` section 5 (approved design notes): item 2 says represent windup as `channel-start` / `channel-complete` jobs and fail if suppressed or detained before completion. Item 4 says device destruction, caster death, Suppress and hard CC cancel channels, with typed cancel events, and refunds only from source notes. Item 5 says player `recall` only where the reference says reclaim. Item 7 says queue ordering is `(timeMs, sequence, agentId)`.
- Fixtures: `tests/sim/characterization.test.ts` compares `events`, `finalWorld` and `result` with `toEqual` against `tests/fixtures/characterization/*.json` (7 files). `tests/sim/live-round.test.ts` compares ability events against `tests/fixtures/window-parity/{aftershock,incendiary,orbital}.json`.
- UI: `src/ui/board/MapView.tsx` draws agents (circle, facing line, HP bar, label) and devices (dashed circle). `src/ui/orders/AgentPanel.tsx` lists stats, charges, cooldowns and statuses, plus buy buttons. `src/ui/App.tsx` `applyCommands(side, commands, okMessage)` wraps `issueOrders`. `src/sim/describe.ts` has an exhaustive `switch` on `SimEvent` (`never` default). `src/ui/orders/rejectionMessages.ts` is a `Record<RejectionCode, string>`.

## 3. Design

### 3.1 Types (new module `src/sim/effects/channel.ts`)

```ts
import type { Provenance } from "../../rules/provenance.ts";
import type { AgentBody, Job } from "../run.ts"; // type-only, same pattern as status.ts
import type { Point } from "../types.ts";

export type ChannelCancelReason =
  | "moved"       // a move-route command, or the body left its anchor (later displacement)
  | "died"        // agent.alive became false
  | "suppressed"  // an interrupt status mapped to "suppressed" became active (K5)
  | "detained"    // an interrupt status mapped to "detained" became active (later stage)
  | "recalled"    // the device this channel is bound to was recalled
  | "replaced"    // cast, shoot, recall or another channel start by the same agent
  | "round-ended";

/** What the channel is doing. G2 adds { kind: "plant" } and { kind: "defuse" } members here. */
export type ChannelWhat =
  | { kind: "recall"; deviceId: string }
  | {
      kind: "ability-windup";
      abilityId: string;
      /** Effect jobs released on completion, offsets relative to completesAtMs. */
      deferred: { offsetMs: number; agentId: string; job: Job }[];
    };

export type ChannelSource =
  | { kind: "command" }                         // recall today; plant/defuse in G2
  | { kind: "ability"; abilityId: string }      // opt-in windup
  | { kind: "device"; deviceId: string };       // channel bound to a device

/** Static rules for one kind of channel. Every number carries provenance. */
export type ChannelSpec = {
  durationMs: number;
  durationProvenance: Provenance;
  /** Reasons this channel honours on top of the mandatory ones. */
  cancelOn: readonly ChannelCancelReason[];
  /** On start: standing order becomes hold (the body stops). */
  requiresStationary: boolean;
  /** While active: auto-engage and engage jobs are withheld ("channeling"). */
  blocksFire: boolean;
};

/** Lives on AgentBody as an OPTIONAL field; absent when idle. Plain JSON only. */
export type ChannelState = {
  id: string;                 // `ch-${sequence}` of the channel-start job
  what: ChannelWhat;
  source: ChannelSource;
  startedAtMs: number;
  completesAtMs: number;
  /** Position at start; used for the "moved" check. */
  anchor: Point;
  cancelOn: readonly ChannelCancelReason[];
  blocksFire: boolean;
};

/** Always honoured, whatever cancelOn says. */
export const MANDATORY_CANCEL_REASONS: readonly ChannelCancelReason[] = ["replaced", "round-ended"];

/**
 * Status id -> cancel reason. Empty in X1. K5 adds STATUS_SUPPRESS -> "suppressed";
 * the detain stage adds its status -> "detained". Not mutated at runtime.
 */
export const CHANNEL_INTERRUPT_STATUSES: Readonly<Record<string, ChannelCancelReason>> = {};
```

`AgentBody` in `src/sim/run.ts` gains `channel?: ChannelState`. It is optional and is removed with `delete agent.channel` when the channel ends. It is never set to `null` or `undefined`, so a world with no channels serialises byte-identically to today.

"died" is not mandatory. A spec can leave it out, so that a windup whose source says it resolves after the caster dies can still be modelled. Recall, plant and defuse specs include it.

Functions in `channel.ts` (all pure over the passed world, no queue access):

- `startChannel(agent, what, source, spec, timeMs, sequence): { state: ChannelState; event; complete: QueuedJob }`.
- `cancelChannel(agent, reason, timeMs, sequence): SimEvent` clears `agent.channel` and returns the `channel-cancelled` event.
- `completeChannel(agent, world, timeMs, sequence, catalog): ApplyResult` dispatches on `what.kind`. `recall` calls `resolveRecall`. `ability-windup` releases `deferred` as followups. G2 adds the plant/defuse branches.
- `channelInterruptReason(agent, timeMs, statusMap = CHANNEL_INTERRUPT_STATUSES): ChannelCancelReason | null` checks, in order: died, then status map (in key order), then moved (anchor differs and `cancelOn` has "moved"). It only returns reasons that are in `cancelOn` or mandatory.
- `channelStartBlocked(agent, timeMs, statusMap): ChannelCancelReason | null`: an interrupt status already active means a channel cannot start.
- `isChannelJob(job, channelId)` and `isDeviceJob(job, deviceId)`: predicates for queue removal.
- `scheduleWindup(ability, agent, timeMs, sequence, followups): followups'`: the identity function when `ability.windupChannel` is absent (see 3.6).

### 3.2 Jobs and events (`src/sim/run.ts`)

```ts
// Job additions
| { type: "channel-start"; instanceId: string; what: ChannelWhat; source: ChannelSource; spec: ChannelSpec }
| { type: "channel-complete"; instanceId: string; channelId: string }
| { type: "channel-cancel"; instanceId: string; channelId: string; reason: ChannelCancelReason }

// SimEvent additions
| { type: "channel-started"; channelId: string; what: ChannelWhatSummary; completesAtMs: number }
| { type: "channel-completed"; channelId: string; what: ChannelWhatSummary }
| { type: "channel-cancelled"; channelId: string; what: ChannelWhatSummary; reason: ChannelCancelReason }
| { type: "device-recalled"; deviceId: string; chargeReturned: boolean }
| { type: "channel-start-rejected"; code: RejectionCode } // start-time recheck failed (see 3.4)

// ChannelWhatSummary = { kind: "recall"; deviceId } | { kind: "ability-windup"; abilityId }
// (events never carry the deferred Job list)

// withheld reason addition
"channeling"

// ApplyResult addition (optional, so existing returns are unchanged)
cancelQueued?: { channelId?: string; deviceId?: string };
```

`EventQueue` (`src/sim/clock.ts`) gains `removeWhere(predicate): number`. It keeps the sort order of the remaining items. Both `drainJobsUntil` (live) and `runScenario` honour `ApplyResult.cancelQueued` by calling `queue.removeWhere(...)` with `isChannelJob` / `isDeviceJob`.

Job behaviour in `applyJob`:

- `channel-start`: recheck that the agent is alive and that `channelStartBlocked` is null. If the agent already has a channel, cancel it with "replaced" first. In that case the job returns the `channel-started` event and the replaced channel's `channel-cancelled` event is pushed by the caller (see 3.4: the caller enqueues an explicit `channel-cancel` before the start, so `applyJob` still returns exactly one event). It sets `agent.channel` and returns the followup `channel-complete` at `completesAtMs`. If `spec.requiresStationary`, `run.ts` cannot reach standing orders, so live-round handles that at batch apply (3.4).
- `channel-complete`: if `agent.channel?.id !== channelId`, return an `order-rejected` event with `invalid-order`. This is a defensive invariant only; the cancel path removes the complete job, so tests assert it never fires. Otherwise call `completeChannel`.
- `channel-cancel`: if the channel id no longer matches, it is stale (the channel already ended) and is skipped by the drain (3.5). Otherwise call `cancelChannel`, return `cancelQueued: { channelId }` so the pending `channel-complete` is removed.
- `auto-engage` / `engage`: if the shooter has `channel?.blocksFire`, return `withheld(..., "channeling")` before any RNG draw. The fire cadence in `scheduleFires` is unchanged.

### 3.3 Interrupt table (what interrupts what)

| Reason | Trigger | Detected where | Honoured by |
| --- | --- | --- | --- |
| replaced | `cast`, `shoot`, `recall` command for an agent with a channel; any `channel-start` for that agent | `applyPendingBatch` enqueues `channel-cancel` before the new job | all (mandatory) |
| moved | `move-route` command; later, displacement moving the body off `anchor` | `applyPendingBatch` (command); post-job sweep (displacement) | specs with "moved" (recall, plant, defuse) |
| died | `alive` becomes false (shot, ability damage, zone tick) | post-job sweep in `drainJobsUntil` | specs with "died" |
| suppressed | an interrupt status mapped to "suppressed" active | post-job sweep; also `channelStartBlocked` at validation and start | specs with "suppressed" (K5 fills the map) |
| detained | same, for "detained" | same | specs with "detained" |
| recalled | the bound device (`source.kind === "device"`) is recalled | recall completion sweeps agents with that `source.deviceId` | device-bound channels (none today) |
| round-ended | `evaluateResult` returns a result | `stepOnce` before pushing `round-ended` | all (mandatory) |

Not an interrupt: `hold` (standing still is compatible with a channel), opponent decisions that only re-issue `hold` (they are already filtered in `runDecisions`), time passing while paused, and ally or enemy casts that do not apply a mapped status.

Plan-origin casts (pre-round plan steps firing through `fireDuePlanSteps`) also cancel with "replaced". They are real orders the player made, and the event log shows why the channel stopped.

### 3.4 Live wiring (`src/sim/live-round.ts`)

Command type:

```ts
| { kind: "recall"; instanceId: string; deviceId: string }
```

`validateCommand` for `recall`, after the existing agent, side and alive checks, applies these checks in order:

1. `deviceId` is in `world.devices`, else the new code `unknown-device`.
2. `device.ownerInstanceId === instanceId`, else the new code `not-device-owner`.
3. `device.reclaim` is present, else the new code `not-reclaimable`. Stim Beacon always lands here.
4. `reclaim.rangeMm != null` and the agent is farther than that, else the existing code `out-of-range`.
5. The agent is already recalling this device, else `invalid-order` ("Already recalling").
6. `channelStartBlocked(agent, ...)` is not null, else the new code `channel-blocked`.

`cloneCommand` gains the `recall` branch.

`Device` (`src/sim/types.ts`) gains an optional reclaim block, filled only by a kit resolve file from its source row:

```ts
export type DeviceReclaimSpec = {
  /** null = instant recall (no channel). */
  channel: ChannelSpec | null;
  returnsCharge: boolean;
  cooldownAfterRecallMs: number | null;
  rangeMm: number | null;
  provenance: Provenance;
};
// Device: reclaim?: DeviceReclaimSpec;
```

`applyPendingBatch` additions. Each happens at `now`, with sequences taken from `round.nextSequence` in command order:

- `move-route` on a channeling agent: enqueue `channel-cancel` with "moved" if the spec honours it. If the spec does not honour "moved" (a moving channel), the move proceeds and the channel continues. Then the existing `startSegment`.
- `cast` / `shoot` on a channeling agent: enqueue `channel-cancel` with "replaced", then the existing cast or engage job. The cancel gets the lower sequence, so it pops first.
- `recall`: if channeling, enqueue `channel-cancel` with "replaced". If `reclaim.channel === null`, enqueue a `channel-complete`-equivalent instant path. To keep one code path, this is a `channel-start` with `durationMs: 0` whose complete lands at `now`. Otherwise enqueue `channel-start` with `what: { kind: "recall", deviceId }`. If `spec.requiresStationary`, set `standing` to hold and (live origin) call `cancelWaypointPlans`, mirroring `hold`.

`resolveRecall` (in `channel.ts`, called from `completeChannel`):

- Remove the device from `world.devices`.
- Return `cancelQueued: { deviceId }` so its queued `stim-beacon-pulse` / `device-expire` style jobs are dropped (no junk `order-rejected` events).
- Restore one charge only if `returnsCharge`, capped at `maxCharges`. Set `cooldownReadyAtMs[abilityId] = timeMs + cooldownAfterRecallMs` only if non-null.
- Cancel any channel bound to that device with "recalled".
- Return the `device-recalled` event.

Because `applyJob` returns one event, the result carries one event plus at most one cancel. A bound-channel cancel is enqueued as a `channel-cancel` followup at the same `timeMs`.

`drainJobsUntil` additions, in this order per popped item:

1. Stale skip. A `channel-cancel` whose channel id no longer matches is dropped with no event and no sequence use.
2. Tie deferral. A `channel-complete` whose next queued item has the same `timeMs` is re-pushed at the same time with a fresh sequence and not applied yet (see 4).
3. Apply, push the event, then honour `cancelQueued` via `queue.removeWhere`, then push followups.
4. Post-job sweep. For each agent in `world.agents` order with `agent.channel` and no cancel already enqueued for it this ms, if `channelInterruptReason` is non-null, enqueue `channel-cancel` at `item.timeMs`. A transient `cancelPendingIds: Set<string>` local to the drain call dedupes. The sweep is read-only and consumes no sequence when no agent has a channel.

`stepOnce` round end: when `evaluateResult` returns a result, every agent with a channel gets `cancelChannel(..., "round-ended")`, called directly (the queue is finished), in `world.agents` order before the `round-ended` event is pushed. Each takes `round.nextSequence`.

### 3.5 Standing move orders and the order log

- Design decision: issuing a move cancels a channel whose spec honours "moved". This is the only cancel gesture in the UI ("cancel by issuing move"). The alternative, rejecting moves while channeling, was refused: it would trap the player in a channel with no way out.
- Starting a stationary channel replaces the standing route with hold, the same way an explicit `hold` does, including cancelling at-waypoint plan steps for live-origin orders.
- The order log records only commands (`recall` like any other). Cancels, completions and sweeps are derived state, never log entries. `replayOrderLog` therefore reproduces channels exactly. Replay file version stays 2: the change is additive, and old logs contain no `recall`.

### 3.6 Windups (serve today's, change nothing)

Today's windups are committed delays: the cast is paid and accepted at `T`, effects land at `T + offset`, and the caster's death does not stop them (the comment in `applyAftershockBurst`). In channel terms that is a channel whose `cancelOn` is empty and which needs no state. X1 keeps them exactly as they are and does not attach `ChannelState` to them. Attaching state would add events, consume sequence numbers and change `finalWorld` in fixtures that end mid-windup.

Opt-in path for later kits:

- `AbilityDefinition` (`src/sim/agents/definition.ts`) gains optional `windupChannel?: ChannelSpec`, set only when a source states the windup is interruptible and by what.
- `breach-resolve.ts` and `brimstone-resolve.ts` wrap their returned followups in `scheduleWindup(ability, agent, timeMs, sequence, followups)`. With no `windupChannel` it returns the same array object, so there is zero behaviour change. With a spec, it returns a single `channel-start` job with `what.kind = "ability-windup"`, `durationMs` = spec duration, and the original followups moved to `deferred` with offsets relative to completion.
- No refund on cancel (no source states one). Charges and ult points were spent at cast time, as today.

No shipped ability sets `windupChannel` in X1. A test proves the adapter with a test-only catalog copy (see 6).

## 4. Determinism and fog implications

Determinism:

- Channel ids are `ch-${sequence}` of the start job. No `Math.random`, no wall clock. All state is plain JSON, so `structuredClone` in `viewLive`, `truthLiveWorld` and replay is safe.
- Queue order stays `(timeMs, sequence, agentId)`. `removeWhere` only deletes and keeps relative order.
- Same-ms rule (recommended, design): an interrupt beats a completion at the same ms. Enforced by tie deferral: a `channel-complete` yields while any other job is queued at its `timeMs`, and the post-job sweep can then enqueue a cancel at that ms that pops first. The loop ends because a deferral happens only when another item exists at that time, and that item is consumed first. Effect: a defuser shot dead at exactly `completesAtMs` does not complete. This is independent of when the shot was scheduled.
- Order issued while paused at `T` when a channel completes at exactly `T`: the previous step already drained jobs `<= T`, so the channel has completed. The order sees committed state at `T`, as all orders do today.
- Sweep order is `world.agents` order (fixed at `createWorld`), so simultaneous cancels for several agents get stable sequences.
- Withheld `channeling` shots draw no RNG, the same as other withheld reasons. Combat stream state only changes when channels exist.

Proof that current behaviour does not change. All of these are checked in X1.1 and re-checked at every sub-stage:

1. `tests/sim/characterization.test.ts` and the window-parity block in `tests/sim/live-round.test.ts` pass with `VALSIM_UPDATE_FIXTURES` unset. `tests/fixtures/` shows no diff (`git diff --stat tests/fixtures` is empty; the implementer runs it, not this plan).
2. `channel` is optional and deleted on clear, so `finalWorld` JSON is identical.
3. A new test in `tests/sim/channel.test.ts`, "no-channel parity": for each characterization scenario, the sequence number after the run equals the one produced with the sweep stubbed out. Simpler form: assert no event type starts with `channel-` and `round.nextSequence` equals the fixture's last sequence + 1.
4. A new test pins committed windups: Breach's body is set `alive = false` at 1000 ms after an Aftershock cast, and both `ability-damage` events still occur at 2200 and 2800 ms.
5. A catalog guard test: no ability in `SHIPPED_CATALOG` has `windupChannel`, and no shipped device path sets `reclaim`.

Fog (recommendation):

- A channel is visible to the enemy exactly when the channeling agent is visible. `viewWorld` already passes visible enemy bodies whole, so `channel` comes along with no fog code change. Hidden enemies are absent from the view, and so are their channels.
- Own-side channels are always visible.
- The decide hook (`LiveDecideFn`) receives the same fogged data, so a later bot can react to a visible defuse.
- Any sound cue for plant or defuse (audible through walls in the real game) belongs to G2 under the approved audio-cue design (effect-primitives section 6, decision 3), not X1.
- Recall of an enemy device: the device disappears from the fogged `devices` list only if it was visible there (`side` or `enemiesSeeRadius`).

## 5. Provenance and unknowns

| Value | Tag | Named constant (if assumed) | How to confirm |
| --- | --- | --- | --- |
| Stim Beacon is not reclaimable (no recall field; `"recharge": "bought"`, `"cast": "instant throw"`) | verified (row `source` in agent-reference.json; not upgraded) | none | `agent-reference.json` Brimstone C row; a test asserts the shipped Stim Beacon device has no `reclaim` |
| Aftershock windup 2200, burst gap 600 | as already tagged in `breach.ts` figures (unchanged) | none | existing `tests/sim/breach.test.ts` and the window-parity fixture |
| Flashpoint 500 + `flashpointFlightMs`, Fault Line 1000 + 1100, Rolling Thunder 600 + 8 x 255 | as already tagged in `breach.ts` / `ruleset.ts` (unchanged) | none | existing tests |
| Orbital Strike windup 2000 (`windupSec: 2`) | secondary (`ORBITAL_STRIKE_FIGURES`, unchanged) | none | window-parity `orbital.json` |
| Same-ms rule: interrupt beats completion | design | none | test in `channel.test.ts` |
| Move cancels channel; hold does not | design | none | tests in `channel.test.ts` |
| Plan-origin casts cancel with "replaced" | design | none | test in `channel.test.ts` |
| Channel visible iff channeler visible | design | none | test in `channel.test.ts` (fog) |
| Recall cooldown, charge return, range, channel time for any future device | must come from that kit's source row; X1 sets none | none in X1 (the kit stage tags its own) | the kit stage (for example K7 Chamber, sheet `recallSec`, `recallCooldownSec`) |
| Test-only channel durations and the test reclaim spec | design (test fixture values, not game numbers) | `TEST_CHANNEL_MS`, `TEST_RECLAIM_CHANNEL_MS` (declared in `tests/sim/channel.test.ts`, never in src) | reviewed in test code; never imported by src |

X1 adds no ASSUMED game constant to `src/rules/ruleset.ts`. G2 will add `PLANT_DURATION_MS` / `DEFUSE_DURATION_MS` (G2's names) as `ChannelSpec.durationMs` values.

## 6. Staged delivery

Every sub-stage ends with `npm run check` green, with the characterization and window-parity fixtures unchanged, plus a browser check at 1366x768.

### X1.1 Channel core (no command uses it yet)

- New `src/sim/effects/channel.ts` with the types and functions in 3.1.
- `src/sim/clock.ts`: `removeWhere`.
- `src/sim/run.ts`: `AgentBody.channel?`, the three jobs, the new events, `ApplyResult.cancelQueued?`, the `channeling` withheld reason, and `runScenario` honouring `cancelQueued`.
- `src/sim/live-round.ts`: stale skip, tie deferral, `cancelQueued` handling and post-job sweep in `drainJobsUntil`; `round-ended` cancel in `stepOnce`.
- `src/sim/describe.ts`: text for the new events.
- Acceptance:
  - `tests/sim/channel.test.ts` (new). It enqueues `channel-start` directly on `round.queue` with a test spec and asserts:
    - started, then completed at exactly `startedAtMs + TEST_CHANNEL_MS`;
    - `agent.channel` is absent afterwards;
    - a test sets `alive = false` mid-channel, which gives `channel-cancelled` with "died" at that ms and no completion;
    - when a kill and the complete share the same ms, the result is cancel, not complete (regardless of which was queued first);
    - a stale `channel-cancel` emits nothing;
    - with `blocksFire`, auto-fire is `shot-withheld` with "channeling" and the combat stream state is unchanged across the channel;
    - when the round ends mid-channel, "round-ended" comes before `round-ended`;
    - `channelInterruptReason` with an injected status map returns "suppressed" / "detained" only when listed in `cancelOn`.
  - `tests/sim/clock.test.ts` (modify): `removeWhere` keeps order and returns the count.
  - The no-channel parity test, the committed-windup pin and the catalog guard (4, points 3 to 5) are in `channel.test.ts`.
  - The `tests/sim/characterization.test.ts` and window-parity tests pass unchanged.
- Browser: play a normal round. Nothing looks different and the event log shows no `channel-` lines.

### X1.2 Command interrupts

- `applyPendingBatch`: move ("moved", only if honoured), cast and shoot ("replaced"), and stationary start sets hold and cancels waypoint plans.
- Acceptance: `tests/sim/channel.test.ts` (extend). Using the X1.1 direct-start helper, assert:
  - a `move-route` issued mid-channel gives a cancel with "moved" at the batch time, and the move starts;
  - a `hold` does not cancel;
  - a `cast` gives cancel then `cast-accepted`, in that order with ascending sequences;
  - a plan-origin cast also gives "replaced";
  - `replayOrderLog` of the same log deep-equals the live round (events and world);
  - stepping with chunk size 1 versus 40 gives identical events (the existing determinism pattern from `live-round.test.ts`).
- Browser: unchanged gameplay; no channel can be started from the UI yet.

### X1.3 Recall command

- `src/sim/types.ts`: `DeviceReclaimSpec`, `Device.reclaim?`, and the RejectionCodes `unknown-device`, `not-device-owner`, `not-reclaimable`, `channel-blocked`.
- `src/sim/live-round.ts`: `AgentCommand` recall, `validateCommand`, `cloneCommand`, batch apply.
- `channel.ts`: `resolveRecall`.
- `src/ui/orders/rejectionMessages.ts`: four messages (the `Record` would not compile without them).
- Acceptance: `tests/sim/recall.test.ts` (new) asserts:
  - recall of a real Stim Beacon is rejected with `not-reclaimable` and the order log entry carries that code;
  - recall of an unknown id gives `unknown-device`; recall of another agent's device gives `not-device-owner`;
  - for a test device pushed into `round.world.devices` with a test `reclaim` spec (channel `TEST_RECLAIM_CHANNEL_MS`, `returnsCharge: true`, `cooldownAfterRecallMs: null`): the channel starts, the device is gone at completion, its queued jobs are removed (no `order-rejected` after recall), and the charge is restored and capped;
  - with `returnsCharge: false`, no charge comes back;
  - moving mid-recall cancels it with "moved" and the device stays;
  - with `channel: null`, the recall is instant at batch time;
  - the replay of a log containing recall reproduces the same world.
- Browser: select Brimstone after placing Stim Beacon. The device panel shows Stim Beacon as not reclaimable (no button). No layout shift.

### X1.4 Windup opt-in adapter

- `src/sim/agents/definition.ts`: `windupChannel?: ChannelSpec`.
- `channel.ts`: `scheduleWindup`.
- `breach-resolve.ts` and `brimstone-resolve.ts` wrap their followups.
- Acceptance: `tests/sim/channel.test.ts` (extend):
  - the identity case: with the shipped catalog, `scheduleWindup` returns the same array (reference equality), and all fixtures pass unchanged;
  - with a test catalog (a structured clone of `SHIPPED_CATALOG` with Aftershock given a `windupChannel` that has `cancelOn: ["died"]` and `durationMs` equal to the shipped 2200 windup), passed to `openLiveRound` with the matching `catalog.version`: an uninterrupted cast gives bursts at the same times as today; a caster death mid-windup cancels it and no burst fires; charges are not refunded.
  - `tests/sim/breach.test.ts` and `tests/sim/brimstone.test.ts` pass unchanged.
- Browser: Breach and Brimstone casts behave exactly as before.

### X1.5 UI

- `src/ui/board/MapView.tsx`: a progress ring around the agent circle while `agent.channel` exists. The arc fraction is `(timeMs - startedAtMs) / (completesAtMs - startedAtMs)`, clamped to 0..1. It uses the same `world.timeMs` the board already uses. It is drawn for visible enemies too (fog gives it to us).
- `src/ui/orders/AgentPanel.tsx`: shows a "Channel: recall <device> - N ms left" line, plus an "Owned devices" list where each device with `reclaim` gets a "Recall" button and others show "no recall".
- `src/ui/App.tsx`: `onRecall(deviceId)` calls `applyCommands("attack", [{ kind: "recall", instanceId, deviceId }], ...)`.
- `src/ui/styles.css`: ring and list styles.
- Acceptance: `tests/ui/channel-ui.test.tsx` (new) asserts:
  - MapView renders the ring element with an accessible label when an agent has a channel, and none otherwise;
  - AgentPanel shows a Recall button only for a reclaimable owned device;
  - clicking it calls the handler with the device id;
  - the existing `tests/ui/round-play.test.tsx` passes unchanged.
- Browser at 1366x768:
  - no document scroll;
  - Stim Beacon shows "no recall";
  - a move order still works;
  - with a dev-only test device the ring would show. This is not shipped, so the ring is verified by the UI test, and visually once G2 lands plant.

## 7. UI impact

- Recall: 1 click (the Recall button in AgentPanel on the selected agent's owned device). No map click. Preview: while hovering the button, the device circle on the map is highlighted (reuse the existing dashed device circle with a brighter stroke). A rejection shows the `rejectionMessages` text in the existing panel message line.
- Cancel a channel: 1 right-click move, the existing move gesture. No new button. The panel channel line says "Move to cancel" so the gesture is discoverable.
- Progress ring: no click. It is drawn inside the agent's existing 600 mm footprint (just outside the r=280 body), so labels and HP bars do not move.
- One-screen rule: the AgentPanel additions are at most 2 short lines plus one button per reclaimable device (none today). The panel already scrolls internally if needed, and the document does not scroll at 1366x768. No new panel or modal.

## 8. Files touched

> Build protocol (consistency pass): this stage is built under [`parallel-build-plan.md`](parallel-build-plan.md). Edits listed here to `src/ui/App.tsx`, `src/ui/styles.css`, `rejectionMessages.ts`, `describe.ts` and the shared docs are integration-file edits: the stage's UI lives in its own component files (with their own CSS), and the App mount lines, message entries and doc text are applied at merge. After H0, engine edits go into the split modules and this stage's reserved slots.

| File | New/modify | Sub-stage | What |
| --- | --- | --- | --- |
| `src/sim/effects/channel.ts` | new | X1.1, X1.3, X1.4 | types, start/cancel/complete, interrupt checks, `resolveRecall`, `scheduleWindup`, job predicates |
| `src/sim/clock.ts` | modify | X1.1 | `EventQueue.removeWhere` |
| `src/sim/run.ts` | modify | X1.1 | `AgentBody.channel?`, Job and SimEvent additions, `ApplyResult.cancelQueued?`, `channeling` withheld, `runScenario` removal |
| `src/sim/live-round.ts` | modify | X1.1, X1.2, X1.3 | drain stale skip, tie deferral and sweep, round-end cancel, batch interrupts, recall command, validation, clone |
| `src/sim/types.ts` | modify | X1.3 | `DeviceReclaimSpec`, `Device.reclaim?`, 4 RejectionCodes |
| `src/sim/describe.ts` | modify | X1.1, X1.3 | text for channel and recall events |
| `src/sim/agents/definition.ts` | modify | X1.4 | `AbilityDefinition.windupChannel?` |
| `src/sim/agents/abilities/breach-resolve.ts` | modify | X1.4 | wrap followups in `scheduleWindup` (identity) |
| `src/sim/agents/abilities/brimstone-resolve.ts` | modify | X1.4 | wrap followups in `scheduleWindup` (identity) |
| `src/ui/orders/rejectionMessages.ts` | modify | X1.3 | 4 messages |
| `src/ui/board/MapView.tsx` | modify | X1.5 | channel ring |
| `src/ui/orders/AgentPanel.tsx` | modify | X1.5 | channel line, owned devices, Recall button |
| `src/ui/App.tsx` | modify | X1.5 | `onRecall` wiring |
| `src/ui/styles.css` | modify | X1.5 | ring and device list styles |
| `tests/sim/channel.test.ts` | new | X1.1, X1.2, X1.4 | core, interrupts, parity, windup pin, adapter |
| `tests/sim/recall.test.ts` | new | X1.3 | recall validation and resolution |
| `tests/sim/clock.test.ts` | modify | X1.1 | `removeWhere` |
| `tests/ui/channel-ui.test.tsx` | new | X1.5 | ring and Recall button |
| `docs/status/x1.md` | new | X1 close | Stage result, playtest steps and the exact text for PROJECT_STATUS.md / README.md / docs/playtest.md / docs/roadmap.md. The integrator applies that text at merge (docs/parallel-build-plan.md); this stage's branch never edits those shared docs. |

Not touched: `tests/fixtures/**`, `tests/architecture.test.ts` (no evaluator change; `channel.ts` imports nothing from `src/tactics`), `src/sim/fog.ts` (channel rides on visible bodies), `src/sim/agents/cast.ts` (K5 adds its suppress gate there), `src/rules/ruleset.ts`, `src/ui/live/replayFile.ts`, `tests/sim/support/live-harness.ts` (helpers stay local to the new tests).

## 9. Dependencies

- Must land first: the live engine (done: `openLiveRound`, `issueOrders`, `stepLive`, `replayOrderLog`). Nothing else.
- Consumes from the ownership contract: nothing. X1 is a provider.
- Provides to:
  - G2: `ChannelSpec` and `ChannelState`. G2 adds `ChannelWhat` members `plant` / `defuse` and their `completeChannel` branches in `channel.ts`, with cancelOn `["moved", "died", ...]`.
  - K5: adds `STATUS_SUPPRESS` to `CHANNEL_INTERRUPT_STATUSES` as "suppressed", and its own cast block in `evaluateCast`.
  - K7, K12, K17 (roadmap consumers): device `reclaim` specs from their source rows.
- Parallel-safety: X1.5 touches `src/ui/App.tsx`, `MapView.tsx` and `AgentPanel.tsx`, which other UI stages (G2, G6) also touch. Schedule X1.5 after or serialized with them. X1.1 to X1.4 touch only sim files.

## 10. Risks

1. Tie deferral interacting with future same-ms followups (for example a Stim pulse at cast time) could defer a completion many times. It is bounded by the jobs queued at that ms; a test with several same-ms jobs pins termination.
2. `ApplyResult` still allows one event per job. Recall plus a bound-channel cancel needs a same-ms followup job. This makes the event order explicit, but it is easy to forget in G2. Document it in `channel.ts`.
3. `drainJobsUntil` is exported and also used as a primitive by tests. Changes to its loop could shift sequences if a sweep ever enqueues without a channel. The no-channel parity test guards this.
4. `EventQueue.push` re-sorts the whole array, and `removeWhere` adds another O(n) pass. That is fine at today's queue sizes; revisit if G1 perf budgets flag it.
5. UI files are hot spots shared with G2 and G6 (merge conflicts).
6. A future kit might model a "moving channel" (no "moved" in cancelOn) while `requiresStationary` is false. The anchor sweep must then skip it. This is covered by the `cancelOn` check and needs a test when the first such kit lands.

## 11. Open questions (with recommendations)

1. Add an explicit `{ kind: "cancel-channel" }` command? Recommend no. A move cancels, and hold deliberately does not. Add one only if G2 playtests show players want to stop defusing without moving.
2. Should `hold` cancel a channel? Recommend no. Hold means "stand here", which is compatible with planting or recalling.
3. Should plan-origin casts cancel a live channel? Recommend yes ("replaced"), so the event log makes it visible. Otherwise a plan cast would silently wait or be dropped.
4. Should a recall that is already in progress be restarted by a second recall of the same device? Recommend reject with `invalid-order` ("Already recalling"), to avoid accidental restarts from double clicks.
5. Should today's windups become interruptible on caster death? Recommend no until a source per ability says so. Then set `windupChannel` on that ability, update its fixture in the same change, and say so in the commit.
6. Should channel events of hidden enemies be removed from the attacker's event log? Recommend that X1 follow whatever filtering the log applies to other enemy events today, with no special case. G2 decides spike audio cues separately.
