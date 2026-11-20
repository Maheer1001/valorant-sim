# Stage K4 plan - Sova fully executable (`info.reveal`)

Tag: **design**. Plan only; no `src/` changes in this document. Target: Sova fully executable (Owl Drone C, Shock Bolt Q, Recon Bolt E, Hunter's Fury X) on the live engine (`src/sim/live-round.ts`), using the corrected mapping in `data/ability-primitives.json` / `data/primitive-stages.json` (stage 4 adds `info.reveal`; Sova is the agent completed by that stage).

Same format as [`stage-3-plan.md`](stage-3-plan.md), but planned against the live runner only (`openLiveRound` / `issueOrders` / `stepLive` / `viewLive`). The window layer is gone; nothing here refers to it.

Owl Drone, Shock Bolt and Hunter's Fury are **sheet** rows in `agent-reference.json`. Recon Bolt is a **verified** row (its windup is a sheet estimate). Tags are copied, never upgraded. Every number below is copied from `agent-reference.json`; every gap is a named ASSUMED constant or a DESIGN rule.

## 1. Goal and non-goals

**Goal.**

1. Add the `info.reveal` primitive: a truth-side list of reveal marks on `World`, consumed by `viewWorld` in `src/sim/fog.ts`, so a revealed enemy becomes visible to the revealing side for a bounded time even without line of sight.
2. Ship all four Sova abilities as `implementation: "complete"` with live validation, resolve jobs, fog rules, UI and tests.
3. Expose reveals in the fogged view in a shape that O1 (`updateBeliefs(prev, fogged: World, timeMs)`) can read later without K4 touching `src/tactics`.

**Non-goals.**

- No change to combat targeting: a revealed-only enemy is still not a legal `shoot` target and is never picked by `auto-engage` (both keep using truth line of sight).
- No beliefs, decay or last-seen memory (O1 owns that). No opponent use of reveals (O2).
- No audio cues (`enemyAudioLoopWhenSpotted`, `soundLouder` are `info.audioOrMinimap`, which is not in Sova's primitive list).
- No drone recall (X1 owns the `recall` command). No steering of the drone after launch (`projectile.steerable` is not in Sova's list).
- No vertical play, no charge-level distance model for bolts (Section 3.2 gaps).
- No device shooting unless K3 has already landed a device-damage path (Section 3.6).

## 2. Current state (read in this pass)

| File | What it does today |
| --- | --- |
| `src/sim/live-round.ts` | `openLiveRound` builds `LiveRound` with `world = createWorld(...)`; `issueOrders` -> `validateCommand` (ownership/charges/range via `evaluateCast`, integer `aimYawDeg` 0..359, integer `chargeValue`, integer `mapTarget`; `shoot` needs truth LOS and a non-blind shooter); `stepLive` -> `stepOnce` (plan steps, pending batch, `advanceStanding`, `scheduleFires`, `drainJobsUntil`, `evaluateResult`, `runDecisions` every `decisionIntervalMs` with `viewLive`). `viewLive(round, side)` = `viewWorld(...)` plus a clone of `agents`. |
| `src/sim/fog.ts` | `viewWorld(mapId, world, side)`: own agents plus enemies that any living, non-blind ally sees by `hasLineOfSight` (walls + active smokes). Own devices always; enemy devices only when `enemiesSeeRadius`. Smokes cloned; zones filtered to own side or `blocksVision`. No reveal concept. |
| `src/sim/run.ts` | `AgentBody`, `World = { timeMs, agents, smokes, devices, zones }`, `SimEvent` and `Job` unions, `applyJob` (cast dispatch to `tryResolveBreachCast` then `tryResolveBrimstoneCast`, else `cast-rejected`), `nearestVisibleEnemy` (truth LOS for auto-engage), `createWorld` (`devices: []`, `zones: []`). |
| `src/sim/types.ts` | `Device` with `kind: "stim-beacon"` only, no HP; `RejectionCode` union; `StatusEffect` with optional numeric `modifiers`. |
| `src/sim/agents/cast.ts` | `evaluateCast`: owned, complete, charges (skipped when `signatureCooldownMs` is set), `maxRangeMm`. No ult check (resolve does it). |
| `src/sim/agents/abilities/breach-resolve.ts` | Pattern for signature cooldown (`cooldownReadyAtMs`, restore charges, `signature-on-cooldown`), ult spend (`spendUltPoints`), damage plus `grantKillUltPoints`, `applyStatusExpire`. |
| `src/sim/agents/abilities/brimstone-resolve.ts` | Pattern for devices (`stim-${sequence}` ids), `applyDeviceExpire`, `resolveIncendiaryPath` (flat-map bounces with axis reflection). |
| `src/sim/agents/abilities/brimstone.ts` | Orbital Strike `referenceStats.blocksFlashesAndRecon: true` (sheet) is mirrored but unused. Sheet rows are coded as `kind: "secondary"` with source "agent-reference.json sheet row" (Incendiary precedent); verified rows as `kind: "verified"` (Stim Beacon precedent). |
| `src/sim/effects/geometry-aoe.ts` | `pointInCylinder(origin, yaw, lengthMm, radiusMm, point)`, `cylinderOutline`. |
| `src/sim/combat/ult-points.ts` | `grantKillUltPoints(killer, victim)` (+1 each, no self-kill guard), `spendUltPoints`. |
| `src/sim/agents/catalog.ts` | `CATALOG_VERSION = "m2-stage1-brimstone-2026-11-17"`; `SHIPPED_CATALOG.agents = [BRIMSTONE, KAYO, JETT, CYPHER, BREACH]`. Sova is absent. |
| `src/ui/orders/abilityUi.ts` | `castKind` from `AIMED` / `MAP_TARGETED` sets; `src/ui/orders/hotkeys.ts` maps C/Q to the two `basic` abilities in catalog order, E signature, X ultimate. |
| `src/ui/board/MapView.tsx`, `previews.ts`, `src/ui/App.tsx` | Draw `world.agents`, smokes, zones, devices (circle at `device.xMm/yMm`). App shows `viewLive(live, "attack")` unless "Showing truth". App builds an empty `World` literal (line ~407). Fault Line length slider is the only `chargeValue` UI. |
| `tests/sim/characterization.test.ts` | Compares `finalWorld` with `toEqual`; `VALSIM_UPDATE_FIXTURES=1` rewrites fixtures. |
| `tests/sim/composition.test.ts` | Pins the exact list of complete ability ids. |
| `tests/architecture.test.ts` | No `Math.random`; `src/sim` imports no `tactics`. K4 implements no evaluator, so `PLANNED_EVALUATORS` / `IMPLEMENTED_EVALUATORS` do not change. |

Drill Hall (`src/sim/map/drill-hall.ts`) is 20000 x 12000 mm with one doorway wall at x=8000.

## 3. Design

### 3.1 Primitives and extra rules

From `data/primitive-stages.json` `agentRequirements.Sova`: `damage.zoneOrHit`, `device.summonOrPlaceable`, `info.reveal`, `placement.mapTargeted`, `projectile.bouncing`, `projectile.generic`. Core `resource.*` are engine state.

| Primitive | Owl Drone | Shock Bolt | Recon Bolt | Hunter's Fury |
| --- | --- | --- | --- | --- |
| `info.reveal` | yes (dart pings) | - | yes (pulses) | yes (hit reveal) |
| `projectile.generic` | yes | yes | yes | - |
| `projectile.bouncing` | - | yes | - (mapping lists generic only; bounce field exists, see 3.2) | - |
| `device.summonOrPlaceable` | yes | - | - (bolt is still stored as a device, design) | - |
| `damage.zoneOrHit` | - | yes | - | yes |
| `placement.mapTargeted` | - | - | - | yes |

Only `info.reveal` is new; the rest exist from stages 1 and 2 (or K3 for falloff).

| Extra rule | Source | Engine stance |
| --- | --- | --- |
| Shock Bolt damages Sova | `damagesSova: true`, `teamDamage: "damages allies and Sova"` (sheet) | Sova takes falloff damage (owner decision 8: apply self rules where stated). Allies: no fraction given -> no ally damage until the owner confirms (Q3). |
| Self-kill ult points | not in reference | **design**: a self-kill grants the victim's death point only, never a kill point (guard in `sova-resolve.ts`, not in `ult-points.ts`). |
| Orbital Strike blocks Recon | Brimstone `blocksFlashesAndRecon: true` (sheet) | Active Orbital Strike zones block Recon pulses (first consumer of that field). |
| Recon bolt shootable | `enemiesCanShoot: true`, `health: 20` (sheet) | HP stored on the device; destroy only through K3's device-damage path if it exists (3.6). |
| Hunter's Fury through walls | `throughWalls: true` (sheet) | Beam ignores walls and smokes. |
| Hunter's Fury self knockback | `knockbackOnSovaM: 1.5` (sheet) | Horizontal only, opposite aim yaw, wall-clipped (same flat-map rule as Rolling Thunder). |
| Owl Drone pilot | not in reference | **design**: caster is locked while piloting (Q4). |

### 3.2 Numbers per ability

Unit conversions are exact (m -> mm x1000, s -> ms x1000). The only rounding is the Recon windup estimate (0.667 s -> 667 ms), which is tagged assumed.

#### Sova - Owl Drone (C) - source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 400 | sheet |
| maxCharges | 1 | sheet |
| recharge | "bought" | sheet |
| durationSec / stats.durationSec | 7 / 7 | sheet |
| windupSec | null | sheet (gap) |
| health | 100 | sheet |
| dartCooldownSec | 5 | sheet |
| pings | 2 | sheet |
| firstPingAfterHitSec | 1.6 | sheet |
| secondPingAfterSec | 1.2 | sheet |
| enemyAudioLoopWhenSpotted | "11.00" | sheet (patch id; audio not modeled) |

| Gap | Engine will... |
| --- | --- |
| Deploy delay (`windupSec` null) | **ASSUMED** `OWL_DRONE_DEPLOY_DELAY_MS`. |
| Flight speed | **ASSUMED** `OWL_DRONE_SPEED_MM_PER_SEC`. Straight line from caster to cast `target`, wall-clipped; hovers at the end until `durationSec`. |
| Steering after launch | Not modeled (`projectile.steerable` is not in the kit). One destination per drone. |
| Drone vision | **design**: the active drone is a line-of-sight source for its side in `viewWorld` (walls and smokes block, same as agents). |
| Dart aim and hit test | **design**: recasting `owl-drone` while the drone is alive fires a dart. It tags the living enemy in drone LOS nearest to the recast `target`; none in LOS -> `dart-missed`. No RNG, no travel time, no range constant. |
| First dart availability | **design**: ready at deploy; then `dartCooldownSec` between darts. |
| Ping reveal length | **ASSUMED** `OWL_DART_PING_REVEAL_MS`. Pings at hit + 1600 ms and hit + 1600 + 1200 ms; each ping reveals through walls. Pings continue if the drone dies. |
| Enemy shooting the drone | Uses K3's device-damage path if present; otherwise HP is recorded only. |

#### Sova - Shock Bolt (Q) - source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 150 | sheet |
| maxCharges | 2 | sheet |
| recharge | "bought" | sheet |
| windupSec / stats.windupSec | 0.4 / 0.4 | sheet |
| damage | "1 to 75" | sheet |
| damageMin / damageMax | 1 / 75 | sheet |
| innerRadiusM / outerRadiusM | 1.5 / 4 | sheet |
| bounces | 2 | sheet |
| chargeStepsSec | [0.333, 0.667, 1] | sheet |
| teamDamage / hitsAllies / damagesSova | "damages allies and Sova" / true / true | sheet |

| Gap | Engine will... |
| --- | --- |
| Bolt flight speed | **ASSUMED** `SOVA_BOLT_SPEED_MM_PER_SEC` (shared with Recon Bolt). |
| Charge level -> distance | Not modeled. Cast `target` is the intended landing point; `chargeStepsSec` is mirrored for drift only (`notModeled: ["charge-draw-time"]`). |
| Bounce count chosen | `chargeValue` = bounces, clamped to 0..`bounces` (2). Default 0. |
| Bounce geometry | **design**: shared `resolveBouncePath` (3.4): straight toward target; a wall hit with bounces left reflects by the Incendiary axis rule; total path length = distance(caster, target); otherwise sticks at the wall hit. |
| Detonation timing | **design**: detonate on stick (no extra fuse; none published). |
| Falloff 75 -> 1 over 1.5 -> 4 m | K3 **design** helper `damageAtRadius` (linear, max at inner, min at outer, 0 beyond outer). |
| Ally damage fraction | None given -> no ally damage until Q3 is answered. Sova takes it. |

#### Sova - Recon Bolt (E) - source **verified** (windup is a sheet estimate)

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 0 | verified row |
| maxCharges | 1 | verified row |
| recharge / cooldownSec | "50s" / 50 | verified row (globals `initiatorSignatureCooldownSec` 50, 13.00) |
| durationSec / revealSec | 0.75 / 0.75 | verified row |
| windupSec | { value: 0.667, estimate: true } | estimate (sheet est.) |
| health | 20 | verified row |
| radiusM | 30 | verified row |
| pulses | 2 | verified row (`scansVerified`: "7.04 reduced 3 to 2") |
| pulseIntervalSec | 1.6 | verified row |
| enemiesCanShoot | true | verified row |
| bounces | 2 | verified row |
| chargeStepsSec | [0.333, 0.667, 1] | verified row |
| soundLouder | "11.00" | verified row (audio; not modeled) |

| Gap | Engine will... |
| --- | --- |
| Windup is an estimate | **ASSUMED** `RECON_BOLT_WINDUP_MS` (value from the sheet estimate; never coded as verified). |
| Flight speed | **ASSUMED** `SOVA_BOLT_SPEED_MM_PER_SEC`. |
| Delay from stick to first pulse | **ASSUMED** `RECON_BOLT_FIRST_PULSE_DELAY_MS`. Second pulse 1600 ms after the first. Bolt device expires at the second pulse. |
| What blocks a pulse | **design**: walls and active Orbital Strike zones block; ordinary smokes do not (Q2). |
| Reveal behaviour | Each pulse marks every living enemy within 30000 mm and unblocked; mark lasts 750 ms (3.3). |
| Charge level / bounces | Same as Shock Bolt (`chargeValue` = bounces 0..2; charge draw not modeled). |
| Enemy shooting the bolt | K3 device-damage path if present; a destroyed bolt cancels remaining pulses. |

#### Sova - Hunter's Fury (X) - source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| ultPoints / recharge | 8 / "8 ult points" | sheet |
| costCredits | null | sheet |
| maxCharges / shots | 3 / 3 | sheet |
| durationSec / windowSec | 6 / 6 | sheet |
| windupSec / windupEachSec | 1 / 1 | sheet |
| damage | "80 per shot" / 80 | sheet |
| beamLengthM / beamRadiusM | 66 / 1.76 | sheet |
| revealSec | 1 | sheet |
| knockbackOnSovaM | 1.5 | sheet |
| throughWalls | true | sheet |
| teamDamage / hitsAllies | null / null | sheet |

| Gap | Engine will... |
| --- | --- |
| Activation vs shots | **design**: first cast spends 8 ult points, opens a 6000 ms window with 3 shots and fires shot 1. Recasts inside the window fire the next shot with no ult cost. Unfired shots are lost at window end. |
| Shot overlap | **design**: a shot resolves 1000 ms after its cast; a recast before that is rejected `caster-busy`. |
| Beam shape | **design**: `pointInCylinder(caster, yaw, 66000, 1760, enemy)`; `beamRadiusM` read as cylinder radius. Origin is the caster position at resolve time. |
| Ally damage | `hitsAllies` null -> none (decision 8). |
| Movement during the ult | Not modeled (no lock); `notModeled: ["movement-during-ult"]`. |
| Knockback direction | **design**: opposite aim yaw, horizontal, wall-clipped, applied when the shot resolves. |
| Window state storage | **design**: a status `STATUS_HUNTERS_FURY` on the caster, `untilMs` = window end, `modifiers = { shotsLeft, nextShotReadyAtMs }`. No new `AgentBody` field. |

### 3.3 `info.reveal` design (the new primitive)

Truth holds marks; fog decides what each side sees.

```ts
// src/sim/types.ts (new)
export type RevealSource = "recon-pulse" | "owl-dart-ping" | "hunters-fury-hit";

export type RevealMark = {
  id: string;                 // `reveal-${sequence}-${targetInstanceId}`
  targetInstanceId: string;
  revealingSide: Side;
  sourceAbilityId: string;
  sourceInstanceId: string;   // the Sova who caused it
  source: RevealSource;
  fromMs: number;
  untilMs: number;            // exclusive
};

// src/sim/run.ts
export type World = {
  timeMs: number;
  agents: AgentBody[];
  smokes: SmokeVolume[];
  devices: Device[];
  zones: DamageZone[];
  reveals?: RevealMark[];     // new, optional; absent until the first mark, deleted when the last expires (same rule as X1's `channel?`), so worlds without reveals serialise exactly as today
};
```

```ts
// src/sim/effects/reveal.ts (new, pure)
export function applyReveal(world: World, mark: RevealMark): void;            // append; no dedupe
export function activeReveals(world: World, timeMs: number): RevealMark[];   // fromMs <= t < untilMs
export function isRevealedTo(world: World, side: Side, targetInstanceId: string, timeMs: number): boolean;
export function pruneReveal(world: World, revealId: string): boolean;         // used by the reveal-expire job
```

Rules:

1. **Live tracking for the mark's lifetime (design, Q1).** While a mark is active, the revealing side sees the target's current truth position. After `untilMs` the target disappears from the view unless LOS or another mark covers it. Nothing is remembered; memory is O1's job.
2. **Only targets of a mark.** A pulse marks only enemies that pass that pulse's radius and blocking test at that instant. Moving into range after a pulse does not create a mark.
3. **Dead targets are not shown.** `viewWorld` checks `alive` exactly as for LOS enemies.
4. **Redaction (design, Q5).** A revealed-only enemy (no LOS) is added to `view.agents` as a copy through `redactRevealed(body)`: keeps `instanceId`, `definitionId`, `side`, `xMm`, `yMm`, `alive`, `facingDeg`, `hp` (same as the LOS policy today); sets `credits: 0`, `charges: {}`, `cooldownReadyAtMs: {}`, `ultimatePoints: 0`, `statuses: []`. LOS-visible enemies keep today's shape (no change in K4).
5. **Who sees which marks.** `view.reveals` = active marks with `revealingSide === side`, plus active marks whose target is on `side` (the revealed player knows they were revealed). No mark carries a source position.
6. **No combat effect.** `validateCommand` `shoot` and `nearestVisibleEnemy` keep truth LOS. A revealed-only enemy is never a legal target.
7. **Expiry.** Each mark schedules a `reveal-expire` job at `untilMs` that prunes it and emits `reveal-expired`. Fog also filters by time, so a mark can never be seen past `untilMs` even inside a step.

`viewWorld` sketch (`src/sim/fog.ts`):

```ts
export function viewWorld(mapId: string, world: World, side: Side): World {
  // 1. vision sources: living non-blind own agents + own active owl drones (devicePositionAt)
  // 2. LOS-visible enemies (unchanged test, now over all vision sources)
  // 3. revealed-only enemies: alive, not LOS-visible, isRevealedTo(world, side, id, timeMs) -> redactRevealed
  // 4. devices: own always; enemy if enemiesSeeRadius or (K3 rule) LOS from a vision source
  // 5. reveals: structuredClone(filtered marks per rule 5)
}
```

`viewLive` also clones `reveals`. O1 later reads `fogged.reveals` plus the revealed positions in `fogged.agents`.

### 3.4 Shared helpers

```ts
// src/sim/effects/bounce-path.ts (new; reusable by Tejo in K5)
export function resolveBouncePath(
  origin: Point, target: Point, walls: readonly Segment[], maxBounces: number,
): { point: Point; bounces: number; contacts: Point[]; lengthMm: number };
```

Axis-reflection rule copied from `resolveIncendiaryPath` (design). Flight ms = `Math.round(lengthMm * 1000 / SOVA_BOLT_SPEED_MM_PER_SEC)`.

```ts
// src/sim/types.ts Device additions (optional fields keep old fixtures equal)
export type Device = {
  // existing fields...
  kind: "stim-beacon" | "owl-drone" | "recon-bolt"; // K3 adds its own kinds
  hp?: number;                                       // K3 owns if it lands first
  motion?: { from: Point; to: Point; startMs: number; arriveMs: number }; // K4
  visionSource?: boolean;                            // K4: owl drone
  dartReadyAtMs?: number;                            // K4: owl drone
};
export function devicePositionAt(device: Device, timeMs: number): Point; // lerpPoint on motion
```

Drone position is analytic (lerp), so no per-tick jobs or events. MapView and fog use `devicePositionAt`.

### 3.5 Jobs, events and codes

```ts
// Job additions (src/sim/run.ts)
| { type: "bolt-impact"; instanceId: string; abilityId: string; at: Point; bounces: number }
| { type: "recon-pulse"; deviceId: string; pulseIndex: number }
| { type: "owl-drone-arrive"; deviceId: string }
| { type: "owl-dart-ping"; instanceId: string; targetInstanceId: string; pingIndex: number }
| { type: "hunters-fury-shot"; instanceId: string; yawDeg: number; shotIndex: number }
| { type: "hunters-fury-end"; instanceId: string }
| { type: "reveal-expire"; revealId: string }

// SimEvent additions
| { type: "bolt-impact"; abilityId: string; at: Point; bounces: number }
| { type: "reveal-pulse"; abilityId: string; deviceId: string; pulseIndex: number; revealedInstanceIds: string[] }
| { type: "drone-deployed"; deviceId: string; to: Point }
| { type: "dart-tagged"; deviceId: string; targetInstanceId: string }
| { type: "dart-missed"; deviceId: string }
| { type: "dart-ping"; targetInstanceId: string; pingIndex: number; revealId: string | null }
| { type: "hunters-fury-shot"; shotIndex: number; yawDeg: number;
    hits: { targetInstanceId: string; damage: number; targetHpAfter: number }[];
    revealedInstanceIds: string[] }
| { type: "reveal-expired"; revealId: string }
// Shock Bolt detonation reuses "ability-damage" (burstIndex 0).
// "shot-withheld" reason gains "piloting".

// RejectionCode addition (src/sim/types.ts)
| "caster-busy"   // piloting Owl Drone, or Hunter's Fury shot still winding up
```

`STATUS_PILOTING` and `STATUS_HUNTERS_FURY` are added to `src/sim/effects/status.ts`. Pilot lock: `validateCommand` rejects `move-route`, `shoot` and any cast other than `owl-drone` with `caster-busy` while `STATUS_PILOTING` is active; `advanceStanding` turns a piloting agent's standing route into `hold`; `nearestVisibleEnemy` returns null with reason `piloting`. The status expires with the drone via the existing `status-expire` job.

### 3.6 What K4 reuses from K3 (Raze), and fallbacks

K4 does not need `projectile.homing` or the kill-based signature recharge. It reuses four K3 pieces, imported in one block at the top of `sova-resolve.ts` / `fog.ts` so a rename is a one-line import change:

| K3 piece (stage-3-plan name) | K4 use | Fallback if K3 has not landed or renamed it |
| --- | --- | --- |
| Falloff helper `damageAtRadius(distance, inner, outer, dMin, dMax)` (stage-3 Section 6, design, linear max-at-inner) | Shock Bolt damage | K4.0 adds it as `src/sim/effects/falloff.ts` under that name and orientation; K3 then imports it. |
| Device HP field and destroy path (Boom Bot `health`) | Owl Drone 100, Recon Bolt 20 | `Device.hp?: number` added by K4; no destroy path (HP recorded only). |
| Enemy LOS visibility of devices in fog (stage-3 Section 3 item 5) | Enemies see drone and bolt only with LOS | K4 adds the same rule in `viewWorld` step 4. |
| Horizontal self knockback (Showstopper `knocksRazeBack`) | Hunter's Fury 1500 mm | Inline `pointFromYaw` + `clipSegment` (already used by Rolling Thunder). |

## 4. Determinism and fog implications

- **No RNG.** Reveal, pulse, dart and beam resolution draw nothing from the combat stream. Shock Bolt and beam damage are deterministic. Auto-fire draws are unchanged, so existing seeds keep their streams.
- **Integer ms and mm only.** All new times come from sheet values x1000 or named constants; drone positions via `lerpPoint` (rounded).
- **Ordering.** New jobs use the existing queue order `(timeMs, sequence, agentId)`. Targets are iterated in `world.agents` order; mark ids use the job sequence, so replays rebuild identical ids.
- **Replay.** All Sova actions are `cast` commands (`aimYawDeg`, `chargeValue`, `target`), already logged and cloned by `cloneCommand`. `replayOrderLog` must give a deep-equal `World` including `reveals`.
- **World shape.** `World.reveals` is optional and omitted while empty (consistency pass: the same rule as X1's `AgentBody.channel?` and G3's optional loadout fields), so `truthLiveWorld` output for rounds without reveals is unchanged and the existing characterization and window-parity fixtures must not change. Fog code reads `world.reveals ?? []`.
- **Fog leak rules (tested).** (a) Revealed-only enemy appears for the revealing side only during `[fromMs, untilMs)`. (b) Never for enemies outside the pulse radius, behind walls or inside an active Orbital zone at pulse time. (c) Private fields redacted. (d) The other side sees marks on its own agents only. (e) Truth is never returned by `viewLive`; `LiveDecideFn` keeps receiving fogged data.
- **O1 input.** `fogged.reveals` (with `source`, `fromMs`, `untilMs`) plus redacted bodies are the K4 contract for O1. K4 adds no code in `src/tactics`.

## 5. Provenance and unknowns

| Value | Tag | Named constant (if assumed) | How to confirm |
| --- | --- | --- | --- |
| Owl Drone 400 credits, 1 charge, 7 s, 100 HP, dart cooldown 5 s, 2 pings, 1.6 s, 1.2 s | sheet (code `secondary`, source "agent-reference.json sheet row") | - | Drift test vs `agent-reference.json` |
| Owl Drone deploy delay | assumed | `OWL_DRONE_DEPLOY_DELAY_MS` | Owner measurement or patch note |
| Owl Drone flight speed | assumed | `OWL_DRONE_SPEED_MM_PER_SEC` | Owner measurement |
| Dart ping reveal length | assumed | `OWL_DART_PING_REVEAL_MS` | Wiki / patch note |
| Dart targeting (nearest in drone LOS to the click) | design | - | Owner review (playtest) |
| Shock Bolt 150 credits, 2 charges, 0.4 s, 1..75, 1.5 / 4 m, 2 bounces | sheet (code `secondary`) | - | Drift test |
| Bolt flight speed (Shock and Recon) | assumed | `SOVA_BOLT_SPEED_MM_PER_SEC` | Owner measurement |
| Bounce reflection rule | design | - | Copy of Incendiary rule; unit test |
| Falloff curve | design (K3) | - | stage-3 Q2 owner answer |
| Shock Bolt ally fraction | unknown (not applied) | - | Owner (Q3) |
| Recon Bolt 0 credits, 1 charge, 50 s, 20 HP, 30 m, 2 pulses, 1.6 s, 0.75 s | verified row (code `verified`, Stim Beacon precedent) | - | Drift test; Q6 |
| Recon Bolt windup 0.667 s (est.) | estimate -> assumed in code | `RECON_BOLT_WINDUP_MS` | Primary source |
| Stick -> first pulse delay | assumed | `RECON_BOLT_FIRST_PULSE_DELAY_MS` | Owner measurement |
| Smokes do not block pulses | design | - | Owner (Q2) |
| Orbital blocks Recon | sheet (Brimstone row) | - | Drift test on `blocksFlashesAndRecon` |
| Hunter's Fury 8 points, 3 shots, 6 s, 1 s each, 80, 66 m, 1.76 m, reveal 1 s, 1.5 m knockback, through walls | sheet (code `secondary`) | - | Drift test |
| Beam radius read as cylinder radius | design | - | Owner review |
| Shot cadence (recast after resolve) | design | - | Owner review |
| Pilot lock | design | - | Owner (Q4) |
| Live tracking while revealed | design | - | Owner (Q1) |
| Self-kill gives no kill point | design | - | Owner review |

Constants live in `src/sim/agents/abilities/sova.ts` with `Provenance` objects `kind: "assumed"` (module-owned, like `geometry-constants.ts`), so `Ruleset` and the ruleset id do not change. The implementing PR picks the integers and writes a note per constant; this plan picks none.

## 6. Staged delivery

Each sub-stage ends with `npm run check` green (to be run by the implementer) and a browser check at 1366x768 with no document scroll.

**K4.0 - Reveal core and K3 contract check.**
- Add `RevealMark`, optional `World.reveals` (not set by `createWorld`), `src/sim/effects/reveal.ts`, `reveal-expire` job and `reveal-expired` event, fog rules 1 to 7, `redactRevealed`, `viewLive` clone. The App empty-world literal is unchanged.
- Check K3 names (3.6); add fallbacks that are missing (`falloff.ts`, `Device.hp`, device LOS rule).
- Do not regenerate characterization fixtures; they must still pass unchanged.
- Accept: `tests/sim/reveal.test.ts` (new) asserts: a mark inserted with `applyReveal` makes a wall-hidden enemy appear in `viewLive(round, "attack")` at `fromMs` and not at `untilMs`; position tracks truth while active; redacted fields are empty; defense view shows the mark on its own agent and no attacker; dead target hidden; `shoot` at a revealed-only enemy still returns `target-not-visible`; `reveal-expire` prunes. `tests/sim/characterization.test.ts` passes with the existing fixtures unchanged. Existing `breach.test.ts` / `brimstone.test.ts` fog tests unchanged. If `falloff.ts` is added: endpoint tests at inner/outer radius.
- Browser: existing drill plays; truth toggle unchanged.

**K4.1 - Sova in the catalog, Recon Bolt complete.**
- `sova.ts` with all four definitions (Recon `complete`, others `placeholder`), `referenceStats` mirrors, constants; `SOVA` in `catalog.ts`, `CATALOG_VERSION` bumped; `resolveBouncePath`; `tryResolveSovaCast` dispatched from `applyJob`; `recon-pulse`, `bolt-impact`.
- Accept: `tests/sim/sova.test.ts` (new): drift test for every Sova `referenceStats` key vs `agent-reference.json`; non-Sova casting `recon-bolt` -> `ability-not-owned`; second cast inside 50000 ms -> `signature-on-cooldown`, accepted after; `chargeValue` 0/1/2 bounce paths and clamp; pulse at stick + delay and +1600 ms; enemy inside 30 m with no wall is revealed for 750 ms; enemy behind the x=8000 wall is not; enemy behind an active Orbital zone is not; enemy in Sky Smoke is (design Q2); same-seed run deep-equal including `reveals`. `tests/sim/composition.test.ts` complete-ids list gains `recon-bolt`.
- Browser: Sova selectable in Draft; Recon cast from the drill (basic UI from K4.5 not yet required; `castKind` default may be `instant` until then, so the browser check is the draft listing and no errors).

**K4.2 - Shock Bolt complete.**
- Charges 2 -> 1 -> 0; windup 400 ms; flight; `ability-damage` with falloff; Sova self damage; no ally damage; self-kill guard.
- Accept (`tests/sim/sova.test.ts`): charge spend and `insufficient-charges`; damage at inner radius = 75, at outer = 1, beyond = 0 (via the K3 helper); Sova inside radius loses HP; ally inside radius does not; kill grants ult points to Sova; self-kill grants no kill point; composition list gains `shock-bolt`.
- Browser: no regression.

**K4.3 - Owl Drone complete.**
- Device with `motion`, `visionSource`, `hp: 100`, `dartReadyAtMs`; `drone-deployed`, `owl-drone-arrive`, dart recast, `owl-dart-ping` x2, `STATUS_PILOTING`, `caster-busy`, `shot-withheld` reason `piloting`, standing route set to hold.
- Accept: drone position at time t equals `lerpPoint` along the wall-clipped path; drone LOS adds enemies to the owner's view; enemy sees drone only with LOS; dart tags nearest enemy in drone LOS to the click; second dart before 5000 ms -> `caster-busy` (or `dart-missed` with no cooldown spent, whichever the PR documents); pings at +1600 / +2800 ms produce marks through walls; while piloting, `move-route` and `shoot` -> `caster-busy` and auto-engage is withheld; lock ends at drone expiry; replay deep-equal. Composition list gains `owl-drone`.
- Browser: no regression.

**K4.4 - Hunter's Fury complete.**
- `STATUS_HUNTERS_FURY` window, `hunters-fury-shot`, `hunters-fury-end`, beam via `pointInCylinder`, reveal 1000 ms, knockback 1500 mm.
- Accept: below 8 points -> `insufficient-ult-points`; at 8 accepted and points spent once for three shots; recast within 1000 ms -> `caster-busy`; fourth shot or cast after 6000 ms re-requires ult points; beam hits an enemy behind the wall (through walls) for 80 and reveals it for 1000 ms; ally on the beam untouched; Sova moved 1500 mm opposite aim, clipped at a wall. Composition list gains `hunters-fury`.
- Browser: no regression.

**K4.5 - UI, describe, docs.**
- `castKind`, previews, bounce stepper, recast affordances, reveal overlay, drone marker, `describe.ts` lines, rejection message for `caster-busy`, optional Sova in the playable drill, `PROJECT_STATUS.md`, `docs/playtest.md`.
- Accept: `tests/ui/previews.test.ts` new cases (bolt path with 0/1/2 bounces against the doorway wall; Shock rings at impact; beam outline length 66000 and radius 1760); `tests/ui/round-play.test.tsx` case: after a Recon pulse the attack view renders a revealed marker for a wall-hidden defender and removes it after 750 ms of sim time.
- Browser at 1366x768: cast each Sova ability from the HUD; revealed enemy drawn as an outline through the wall and gone after expiry; no document scroll.

## 7. UI impact

| Ability | Clicks | Preview | Overlay |
| --- | --- | --- | --- |
| Recon Bolt (E) | 2 (key or button, then target click); bounce stepper 0/1/2 inline, default 0 | Bolt path polyline with bounce dots; 30 m pulse circle at impact | Bolt marker; pulse ring flash; revealed enemies as hollow outlined markers with a remaining-ms label |
| Shock Bolt (Q) | 2, same stepper | Path + inner 1.5 m / outer 4 m rings at impact | `ability-damage` flash |
| Owl Drone (C) | 2 to deploy (key, destination click); 2 per dart (key again, click near an enemy) | Flight line to the wall-clipped destination | Drone marker at `devicePositionAt`; drone LOS is not drawn as a cone; "Piloting" badge on Sova's HUD row |
| Hunter's Fury (X) | 2 per shot (key, aim click); shots-left counter | Beam outline (`cylinderOutline`, 66 m x 1.76 m radius) | Beam flash; knockback arrow on Sova |

One-screen rule: the bounce stepper reuses the Fault Line slider slot in the cast strip; the shots-left and piloting labels go in the existing `AttackerHud` row. No new panel, no document scroll at 1366x768. The truth toggle shows truth positions as today; the fogged view is the default.

## 8. Files touched

> Build protocol (consistency pass): this stage is built under [`parallel-build-plan.md`](parallel-build-plan.md). Edits listed here to `src/ui/App.tsx`, `src/ui/styles.css`, `rejectionMessages.ts`, `describe.ts` and the shared docs are integration-file edits: the stage's UI lives in its own component files (with their own CSS), and the App mount lines, message entries and doc text are applied at merge. After H0, engine edits go into the split modules and this stage's reserved slots.

| File | new / modify | Sub-stage | Change |
| --- | --- | --- | --- |
| `src/sim/effects/reveal.ts` | new | K4.0 | `applyReveal`, `activeReveals`, `isRevealedTo`, `pruneReveal`, `applyRevealExpire` |
| `src/sim/effects/falloff.ts` | new (only if K3 has not landed it) | K4.0 | `damageAtRadius` under the stage-3 name |
| `src/sim/effects/bounce-path.ts` | new | K4.1 | `resolveBouncePath` |
| `src/sim/effects/status.ts` | modify | K4.3, K4.4 | `STATUS_PILOTING`, `STATUS_HUNTERS_FURY` |
| `src/sim/types.ts` | modify | K4.0, K4.3 | `RevealMark`, `RevealSource`, `Device` kinds and optional fields, `devicePositionAt` (or in reveal/fog module), `caster-busy` |
| `src/sim/run.ts` | modify | K4.0 to K4.4 | optional `World.reveals`, Job and SimEvent unions, `applyJob` dispatch to `tryResolveSovaCast` and new jobs, `piloting` withheld reason in `nearestVisibleEnemy` path |
| `src/sim/fog.ts` | modify | K4.0, K4.3 | Vision sources incl. drones, revealed-only enemies, `redactRevealed`, `reveals` filter, enemy-device LOS rule |
| `src/sim/live-round.ts` | modify | K4.0, K4.3 | `viewLive` clones `reveals`; `validateCommand` pilot lock; `advanceStanding` hold while piloting |
| `src/sim/agents/abilities/sova.ts` | new | K4.1 | Four `AbilityDefinition`s, figures, `referenceStats`, assumed constants with provenance |
| `src/sim/agents/abilities/sova-resolve.ts` | new | K4.1 to K4.4 | `tryResolveSovaCast` and all Sova `apply*` jobs; K3 import block |
| `src/sim/agents/catalog.ts` | modify | K4.1 | `SOVA` definition, role provenance, `CATALOG_VERSION` bump |
| `src/sim/describe.ts` | modify | K4.5 | Lines for new events |
| `src/ui/orders/abilityUi.ts` | modify | K4.5 | Sova ids in `AIMED` |
| `src/ui/orders/rejectionMessages.ts` | modify | K4.3 | `caster-busy` message (required by the `Record<RejectionCode, string>` type) |
| `src/ui/board/previews.ts` | modify | K4.5 | Bolt path, rings, beam previews |
| `src/ui/board/MapView.tsx` | modify | K4.5 | Revealed markers, drone and bolt device markers |
| `src/ui/orders/AttackerHud.tsx` | modify | K4.5 | Piloting badge, shots-left |
| `src/ui/App.tsx` | modify | K4.5 | Bounce stepper; `chargeValue` for bolts |
| `src/ui/scenario/playableDrill.ts` | modify (optional, owner call) | K4.5 | Sova in the drill |
| `tests/sim/reveal.test.ts` | new | K4.0 | Reveal and fog leak tests |
| `tests/sim/sova.test.ts` | new | K4.1 to K4.4 | Kit tests and drift |
| `tests/sim/characterization/scenarios.ts` | modify | K4.1 | Optional `sova-recon` capture |
| `tests/fixtures/characterization/sova-recon.json` | new (existing fixtures unchanged) | K4.1 | New capture, recorded once with `VALSIM_UPDATE_FIXTURES=1` and reviewed |
| `tests/sim/composition.test.ts` | modify | K4.1 to K4.4 | Complete-ids list |
| `tests/ui/previews.test.ts` | modify | K4.5 | New preview cases |
| `tests/ui/round-play.test.tsx` | modify | K4.5 | Reveal render case |
| `docs/status/k4.md` | new | K4 close | Stage result, playtest steps and the exact text for PROJECT_STATUS.md / README.md / docs/playtest.md / docs/roadmap.md. The integrator applies that text at merge (docs/parallel-build-plan.md); this stage's branch never edits those shared docs. |

Not touched: `src/tactics/*`, `tests/architecture.test.ts`, `src/rules/ruleset.ts`, `src/sim/combat/ult-points.ts`, `data/*`, `agent-reference.json`.

## 9. Dependencies

- **Must land first:** live engine (done); **K3 Raze** for the falloff helper and device HP / device fog rule (Section 3.6 gives fallbacks, so K4 stays buildable if K3 slips or renames).
- **Consumes from the ownership contract:** nothing from G1 to G6, X1 or O1. K4 explicitly does not use X1 channels or `recall` (pilot lock and ult windup are statuses, not channels).
- **K4 owns (per contract):** `info.reveal`, `src/sim/agents/abilities/sova.ts` + `sova-resolve.ts`, reveal state consumed by `src/sim/fog.ts`. Names introduced here for later stages: `RevealMark`, `RevealSource`, `World.reveals`, `isRevealedTo`, `redactRevealed`, `devicePositionAt`, `resolveBouncePath`, `caster-busy`.
- **Unblocks:** O1 (beliefs read `fogged.reveals`), K5 (KAY/O ZERO/point and Tejo Stealth Drone reuse `info.reveal`, `resolveBouncePath` and drone devices).
- **Coordination:** `src/sim/run.ts`, `src/sim/types.ts`, `src/sim/fog.ts`, `src/sim/agents/catalog.ts` and `tests/sim/composition.test.ts` are also edited by K3; schedule K4 after K3 merges or rebase on it.

## 10. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | A non-optional `reveals` would change every `finalWorld` fixture and any `toEqual` on a view | Keep `World.reveals` optional and absent when empty; the existing fixtures are the guard. |
| 2 | K3 names differ or K3 is not merged | Single import block plus the fallbacks in 3.6; K4.0 checks before anything else. |
| 3 | Knockback (Hunter's Fury) is overwritten by an active standing route on the next step | Clear Sova's standing route to `hold` at shot resolve, or document that the route resumes from the new point; test both ends. |
| 4 | Recon 30 m radius covers all of Drill Hall, so only walls and Orbital limit it | Expected from the sheet; playtest notes say so; G1 maps will be larger. |
| 5 | `chargeValue` means metres for Fault Line and bounces for bolts | Document per ability in `sova.ts` and the UI; clamp in resolve. |
| 6 | C/Q hotkeys shift while only one Sova basic is complete (K4.2 before K4.3) | Expected; hotkey map follows complete abilities in catalog order; final order is Owl Drone C, Shock Bolt Q. |

## 11. Open questions

| # | Question | Recommended answer |
| --- | --- | --- |
| 1 | Does a reveal track live position or show a snapshot? | Live position for the mark's lifetime (750 ms Recon, 1000 ms Hunter's Fury, assumed for darts); no memory after. |
| 2 | Do ordinary smokes block Recon pulses? | No. Walls and active Orbital Strike zones block (only Orbital carries `blocksFlashesAndRecon`). |
| 3 | "damages allies and Sova" gives no fraction. Full damage to allies? | Apply to Sova now (decision 8); skip allies until the owner confirms full damage, then flip one flag. |
| 4 | Lock Sova while piloting Owl Drone? | Yes: no moves, shots or other casts; auto-engage withheld; ends at drone expiry. Revisit as an X1 channel later. |
| 5 | Redact private fields of enemies in the fogged view? | Redact revealed-only enemies in K4; apply the same to LOS enemies in O1's fog pass. |
| 6 | Recon Bolt row is `verified`, but the reference usage note warns against calling copied values verified. Which code tag? | Keep `verified` for the row values (Stim Beacon precedent, no upgrade), with the windup estimate as the assumed `RECON_BOLT_WINDUP_MS`. |
