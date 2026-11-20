# Stage K5 plan - KAY/O and Tejo fully executable (`status.suppress`)

Tag: **design**. This document is a plan only. It changes nothing under `src/`, `tests/` or `data/`.

Target: KAY/O (FRAG/ment C, FLASH/drive Q, ZERO/point E, NULL/cmd X) and Tejo (Stealth Drone C, Special Delivery Q, Guided Salvo E, Armageddon X) fully executable in the live engine (`openLiveRound` / `issueOrders` / `stepLive` in `src/sim/live-round.ts`). `data/primitive-stages.json` stage 5 adds exactly one primitive, `status.suppress`, and lists KAY/O and Tejo as the agents it completes.

Rules for this plan: copy numbers from `agent-reference.json` (patch 13.10) exactly; never upgrade a tag; every engine number the reference lacks becomes a named ASSUMED constant or a named DESIGN rule. The windowed layer (`round.ts`) is deleted; nothing here uses it.

---

## 1. Goal and non-goals

### Goal

1. A shared `status.suppress` primitive: a suppressed agent cannot start an ability cast (rejected in `validateCommand` and again when the cast job resolves), cannot `recall` (X1 command), and any in-progress ability channel (X1 `ChannelState`) is cancelled with `ChannelCancelReason` `"suppressed"`. Rifle fire is not affected.
2. KAY/O upgraded from the four `listed(...)` placeholders in `src/sim/agents/catalog.ts` to four `implementation: "complete"` abilities in `src/sim/agents/abilities/kayo.ts` + `kayo-resolve.ts`.
3. Tejo added to the catalog as a new agent with four complete abilities in `src/sim/agents/abilities/tejo.ts` + `tejo-resolve.ts`.
4. Drift tests that pin every engine-used number to `agent-reference.json`, and a test that flips each KAY/O ability from `placeholder` to `complete`.
5. UI: cast flows, previews and a visible suppressed state, inside the one-screen rule at 1366x768.

### Non-goals

- KAY/O NULL/cmd **downed / stabilise / revive** state (`downedHp`, `downedSec`, `stabilizeSec`, `reviveSec`, `reviveHpMax`, `reviveScalesWithDownedHp`). That needs dead-body state from K10 `support.revive`. K5 records the numbers in `referenceStats` and lists `"downed state (K10 support.revive)"` in `notModeled`. KAY/O dies normally during NULL/cmd.
- Suppress on devices (turrets, drones, beacons). No source in the reference says suppress disables devices. Agents only.
- Underhand / alt-fire throws (FRAG/ment `altFire`, FLASH/drive `fuseAltSec`, Special Delivery `altFireBounces`). Recorded, not modeled.
- Height (`flightHeightM`), weapon equip / re-equip timing (`equipSec`, `instantReequip`), audio telegraphs (`telegraphSec`).
- Object HP combat (Stealth Drone `health` 42 is recorded; the drone is not destroyable until a later stage adds object damage, same stance as Stage 3 Boom Bot).
- Ally damage where the reference gives no fraction (effect-primitives decision 8).
- Economy rules for Guided Salvo's "1 free, +150, max 2" signature replenish (G5 owns signature replenish).
- Bot use of these abilities (O2).

## 2. Current state (read for this plan)

| Path | What it does today |
| --- | --- |
| `src/sim/agents/catalog.ts` | `SHIPPED_CATALOG` = Brimstone, KAY/O, Jett, Cypher, Breach; `CATALOG_VERSION = "m2-stage1-brimstone-2026-11-17"`. KAY/O abilities are `listed(...)` placeholders with ids `frag-ment`, `flash-drive` (name `"FLASH/DRIVE"`), `zero-point`, `null-cmd`; `figures` secondary wiki; `capability: "flash"` on `flash-drive`, null elsewhere. No Tejo. |
| `src/sim/agents/definition.ts` | `AbilityDefinition` with `implementation`, `maxCharges`, `costCredits`, `deployDelayMs`, `radiusMm`, `maxRangeMm`, `ultPointCost?`, `signatureCooldownMs?`, `notModeled?`, `referenceStats?: Record<string, number \| boolean \| null>` (strings cannot go in). |
| `src/sim/agents/cast.ts` | `evaluateCast(definition, instance, abilityId, origin, target)`: ownership, `implementation === "complete"`, charges, `maxRangeMm`. No time input, so no status checks. |
| `src/sim/agents/abilities/breach.ts`, `breach-resolve.ts` | Pattern to copy: ability constants with `referenceStats`; `tryResolveBreachCast(job, ...)` returns `ApplyResult \| null`, checks cooldown / ult (`spendUltPoints`) / charges, emits `cast-accepted`, returns followup jobs. Comment: "Already-accepted casts resolve from the body even if the caster dies mid-windup." `applyStatusExpire` handles `status-expire` jobs refresh-safely. Flash and concuss apply to enemies only (`other.side === caster.side` skipped) even though the reference says `hitsAllies: true`. |
| `src/sim/agents/abilities/brimstone-resolve.ts` | Stim Beacon applies `STATUS_COMBAT_STIM` with modifiers `fireRate 1.1, reloadTime 0.9, drawTime 0.9, spreadRecovery 1.1`. Zone damage ticks do not check walls. |
| `src/sim/effects/status.ts` | `STATUS_CONCUSS`, `STATUS_BLIND`, `STATUS_HASTE`, `STATUS_COMBAT_STIM`; `hasStatus`, `applyStatus` (same id + source extends `untilMs`), `pointFromYaw`, `lookingAt`. |
| `src/sim/effects/geometry-aoe.ts` | `pointInCylinder`, `pointInOrientedRect`, `orientedRectCorners`. |
| `src/sim/run.ts` | `AgentBody`, `World { timeMs, agents, smokes, devices, zones }`, `SimEvent` union (includes `status-wave`, `ability-damage`, `flash-resolved`), `Job` union, `applyJob`. The `cast` branch tries `tryResolveBreachCast`, then `tryResolveBrimstoneCast`, then falls back to `evaluateCast` rejection. Shots: `engage` / `auto-engage` check alive, blind, LOS, concuss penalty. |
| `src/sim/live-round.ts` | `validateCommand(round, side, command)` (private): unknown agent, wrong side, down; for `cast` checks integer fields then `evaluateCast`; for `shoot` checks target, blind, LOS. `issueOrders` rejects the whole batch on the first invalid command. `applyPendingBatch` enqueues `cast` jobs at the current time. `fireDuePlanSteps` issues plan casts through `issueOrders` and marks failures `status: "rejected"`. `viewLive` wraps `viewWorld`. |
| `src/sim/fog.ts` | `viewWorld`: own agents + enemies with LOS from a non-blind ally; devices of own side or with `enemiesSeeRadius`; zones of own side or `blocksVision`. |
| `src/sim/types.ts` | `RejectionCode` union (no `"suppressed"`), `StatusEffect`, `Device` with `kind: "stim-beacon"` only. |
| `src/ui/orders/abilityUi.ts` | `castKind(id)` sets AIMED / MAP_TARGETED; `castGate(agent, ability, timeMs)` mirrors charge, cooldown and ult checks. |
| `src/ui/orders/rejectionMessages.ts` | `MESSAGES: Record<RejectionCode, string>`; a new code is a compile error until it has a message. `"insufficient-ult-points"` text hard-codes "need 8" (wrong for Tejo's 9). |
| `src/sim/preround.ts` | `rejectionText` uses `Partial<Record<RejectionCode, string>>` with the same "need 8" text. |
| `src/ui/scenario/playableDrill.ts` | Defense includes `kayo-defense`. `tests/sim/brimstone.test.ts` uses `kayo-attack` as an ally fixture. |
| `tests/sim/composition.test.ts` | Pins the list of complete ability ids and asserts `flash-drive` is `placeholder`. Both assertions change in K5. |
| `tests/sim/breach.test.ts` | Drift test pattern: looks up reference abilities **by name**, compares `costCredits`, `maxCharges`, ult points and every `referenceStats` key. |
| `tests/sim/support/live-harness.ts` | `mustOpenLive`, `mustIssue`, `issueRejected`, `advance`, `playAttack`, `agentIn`. |
| `tests/architecture.test.ts` | No `Math.random`; `src/sim` never imports `tactics`, `learning`, `persistence`, React or `ui`. Evaluator lists are unaffected by K5. |

## 3. Design

### 3.1 Primitives and extra rules

From `data/ability-primitives.json` (core resources omitted):

| Primitive | FRAG/ment | FLASH/drive | ZERO/point | NULL/cmd | Stealth Drone | Special Delivery | Guided Salvo | Armageddon |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `status.suppress` | - | - | yes | yes | yes | - | - | - |
| `projectile.generic` | yes | yes | yes | - | yes | yes | - | - |
| `damage.zoneOrHit` | yes | - | - | - | - | yes | yes | yes |
| `projectile.flash` | - | yes | - | - | - | - | - | - |
| `info.reveal` | - | - | yes | - | yes | - | - | - |
| `status.combatStim` | - | - | - | yes | - | - | - | - |
| `device.summonOrPlaceable` | - | - | - | - | yes | - | - | - |
| `projectile.bouncing` | - | - | - | - | - | yes | - | - |
| `status.concuss` | - | - | - | - | - | yes | - | - |
| `placement.mapTargeted` | - | - | - | - | - | - | yes | yes |

`agentRequirements` in `data/primitive-stages.json`: KAY/O = damage.zoneOrHit, info.reveal, projectile.flash, projectile.generic, status.combatStim, status.suppress. Tejo = damage.zoneOrHit, device.summonOrPlaceable, info.reveal, placement.mapTargeted, projectile.bouncing, projectile.generic, status.concuss, status.suppress. Everything except `status.suppress` lands in stages 1 to 4 (`info.reveal` is K4).

| Extra rule | Source / note | Engine stance |
| --- | --- | --- |
| Suppress blocks casts | effect-primitives `status.suppress`: "blocks casts"; PROJECT_STATUS: "Suppress stops casts" | Reject in `validateCommand` and at cast-job resolve; reject X1 `recall`; cancel ability channels. |
| Suppress and rifle fire | No source says suppress affects guns | **No effect** on `engage` / `auto-engage`. See open question 1. |
| ZERO/point through walls | `throughWalls: true` (sheet) | Suppress sphere ignores walls and smokes. |
| NULL/cmd, Stealth Drone wall rule | Not stated (sheet) | **DESIGN** `SUPPRESS_UNSTATED_WALLS_BLOCK`: walls block, smokes do not. |
| NULL/cmd downed | `effect` lists "downed" (sheet); not in the primitive mapping | Kept out; `notModeled`. K10 owns revive. |
| NULL/cmd Combat Stim | `stim: "+10%"`, `stimMatchVerified: "11.08"` (sheet); `globals.combatStim` | Reuse `STATUS_COMBAT_STIM` with the globals modifiers (same values Stim Beacon uses). |
| Flash / concuss on allies | FLASH/drive `hitsAllies: true` (verified row); Special Delivery `hitsAllies: true` (sheet) | Follow code precedent (Flashpoint, Fault Line skip allies): **enemies only**. Open question 4. |
| Special Delivery concuss 2.5 s | `concussSec: 2.5`; `globals.concussExactly2_5s` lists Tejo Special Delivery | Concuss 2500 ms, `concussFalloff: false` so full duration anywhere in radius. |
| Guided Salvo targets | `targets: "one or two"` (sheet) | One missile per cast; two missiles = two cast commands in one batch. No `AgentCommand` change. |
| Guided Salvo terrain | `pathsAroundTerrain: true` (sheet) | Use G1 `findPath` length when available; else straight-line distance (**design** fallback). |
| Stealth Drone hidden | `hiddenFromEnemies: true` (sheet) | Device with `enemiesSeeRadius: false`; never in enemy `viewWorld`. |

### 3.2 Numbers per ability

Doc tags: **sheet** = value from an `agent-reference.json` row whose `source` is `"sheet"`; **verified** = row `source: "verified"` (FLASH/drive only). In code, sheet rows use `Provenance.kind: "secondary"` with source `"agent-reference.json sheet row"` (Brimstone Incendiary precedent); the FLASH/drive row uses `kind: "verified"` (Breach precedent). Seconds become integer ms by x1000; metres become mm by x1000 (derived, same tag).

#### KAY/O - FRAG/ment (C) - source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits / maxCharges / recharge | 200 / 1 / "bought" | sheet |
| equipSec / windupSec | 0.7 / 0.5 | sheet |
| innerRadiusM / outerRadiusM | 1 / 4 | sheet |
| pulses / pulseIntervalSec | 4 / 1 | sheet |
| damageMin / damageMax (per pulse) | 25 / 60 | sheet |
| damageTotalMin / damageTotalMax | 100 / 240 | sheet |
| damage string | "4 pulses, 25 to 60 each, 100 to 240 total" | sheet |
| altFire | "underhand" | sheet |
| hitsAllies / teamDamage | null / null | sheet |

| Gap | Engine will... |
| --- | --- |
| Throw range | **ASSUMED** `FRAG_MENT_MAX_THROW_MM` as `maxRangeMm`; landing = target clipped by walls (`clipSegment`). |
| Flight time | **ASSUMED** `FRAG_MENT_FLIGHT_MS`. |
| When pulse 1 fires | **DESIGN** `WINDUP_FROM_CAST`: windup counts from cast acceptance (Aftershock / Flashpoint precedent), then flight; pulse k at `cast + 500 + FRAG_MENT_FLIGHT_MS + k x 1000`, k = 0..3. |
| Falloff 60 to 25 over 1 to 4 m | **DESIGN** `RADIAL_FALLOFF_LINEAR`: max at inner, min at outer, linear between, 0 beyond outer; reuse Stage 3 `damageAtRadius` if landed. |
| Wall gating of damage | **DESIGN** follow zone precedent: no wall check. |
| Ally damage | None (fraction unpublished). |

#### KAY/O - FLASH/drive (Q) - source **verified**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits / maxCharges / recharge | 250 / 2 / "bought" | verified |
| durationSec / blindSec | 2.25 / 2.25 | verified |
| equipSec | 0.8 | verified |
| fuseFireSec / fuseAltSec / fuseAfterBounceSec | 1.6 / 1 / 0.8 | verified |
| telegraphSec | 0.3 | verified |
| requiresLooking | true | verified |
| underhandMaxVerified | "11.08" | verified (patch id string) |
| overhandDuration | "not in that 11.08 bullet" | verified row note |
| hitsAllies / teamDamage | true / null | verified |

| Gap | Engine will... |
| --- | --- |
| Overhand blind length | The row's own note says the 11.08 bullet covered underhand max, not overhand. Use 2.25 s (`blindSec`) and copy that note into the provenance `note`. Do not re-tag. |
| Throw range | **ASSUMED** `FLASH_DRIVE_MAX_THROW_MM` as `maxRangeMm`; pop point = target clipped by walls. |
| Pop timing | **DESIGN**: pop at `cast + 1600` (`fuseFireSec`). Bounce fuse (`fuseAfterBounceSec`) not modeled: no bounce on default fire. |
| Look test | Reuse Flashpoint rule: `lookingAt` with existing `ruleset.flashLookHalfAngleDeg` (assumed) plus LOS (walls, smokes) from victim to pop point. |
| Telegraph 0.3 s | Not modeled (no audio layer); `notModeled`. |
| Allies | Enemies only (precedent); open question 4. |

#### KAY/O - ZERO/point (E) - source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits / maxCharges | 0 / 1 | sheet |
| recharge / cooldownSec | "50s" / 50 | sheet (also `globals.initiatorSignatureCooldownSec` 50) |
| durationSec / suppressSec | 8 / 8 | sheet |
| equipSec / windupSec | 0.8 / 1 | sheet |
| radiusM | 15 | sheet |
| throughWalls | true | sheet |
| reveal | "that they were hit" | sheet |
| hitsAllies / teamDamage | false / null | sheet |

| Gap | Engine will... |
| --- | --- |
| Throw range | **ASSUMED** `ZERO_POINT_MAX_THROW_MM` as `maxRangeMm`; knife sticks at target clipped by the first wall. |
| Flight time | **ASSUMED** `ZERO_POINT_FLIGHT_MS`. |
| Pulse timing | **DESIGN** `WINDUP_FROM_CAST`: stick and pulse at `cast + 1000 + ZERO_POINT_FLIGHT_MS`; one pulse. Open question 3. |
| Reveal meaning and length | **DESIGN**: each suppressed enemy gets a K4 reveal for **ASSUMED** `ZERO_POINT_REVEAL_MS`. |
| Knife health / destroy | Not in sheet; knife is not destroyable. |
| Knife visibility | **DESIGN**: own side always; enemies only with LOS from a living enemy (`Device.enemyLosVisible`). |

#### KAY/O - NULL/cmd (X) - source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| ultPoints (agent `ultimatePoints`) | 8 / 8 | sheet |
| windupSec | 1 | sheet |
| durationSec / overloadSec | 12 / 12 | sheet |
| pulses / pulseIntervalSec | 5 / 3 | sheet |
| radiusM | 42.5 | sheet |
| suppressSec (per pulse) | 4 | sheet |
| stim | "+10%" | sheet |
| stimMatchVerified | "11.08" | sheet (patch id string) |
| globals.combatStim fireRate / reloadTime / drawTime / spreadRecovery | 1.1 / 0.9 / 0.9 / 1.1 | sheet globals (11.08 unification note) |
| downedHp / downedSec / stabilizeSec / reviveSec / reviveHpMax | 850 / 15 / 1.5 / 1.55 / 100 | sheet (recorded, not modeled) |
| reviveScalesWithDownedHp | true | sheet (recorded, not modeled) |

| Gap | Engine will... |
| --- | --- |
| Pulse schedule | **DESIGN**: overload runs `cast + 1000` to `cast + 13000`; pulse k at `cast + 1000 + k x 3000`, k = 0..4 (5 pulses fill the 12 s). Each pulse centred on KAY/O's position at that time. |
| Wall rule | Not stated. **DESIGN** `SUPPRESS_UNSTATED_WALLS_BLOCK`. Open question 2. |
| Death during overload | Downed not modeled; on death the remaining pulses resolve as no-ops and the stim is removed (**design**). |
| Allies | `hitsAllies: null`: enemies only. |
| globals note on 0.9 vs about 0.909 | Keep 0.9 / 1.1 exactly as `globals.combatStim` lists; do not reinterpret. |

#### Tejo - Stealth Drone (C) - source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits / maxCharges / recharge | 400 / 1 / "bought" | sheet |
| durationSec / windupSec | 6 / 0.4 | sheet |
| health | 42 | sheet (recorded) |
| visionM | 18 | sheet |
| pulseRadiusM / pulseExpandSec | 16 / 0.7 | sheet |
| suppressSec | 8 | sheet |
| hiddenFromEnemies | true | sheet |
| reveal | "full" | sheet |
| hitsAllies / teamDamage | false / null | sheet |

| Gap | Engine will... |
| --- | --- |
| Drone speed | **ASSUMED** `STEALTH_DRONE_SPEED_MM_PER_SEC`. |
| Steering | **DESIGN**: no live steering; the cast `target` is the flight end point (wall-clipped), straight line. Open question 5. |
| Pulse trigger | **DESIGN**: automatic on arrival, or at `spawn + 6000` if not arrived, whichever first. Drone removed when the pulse ends. |
| Pulse expansion | **DESIGN**: radius grows linearly 0 to 16000 mm over 700 ms in `ruleset.simStepMs` ticks; each enemy hit at most once. |
| Wall rule | Not stated. **DESIGN** `SUPPRESS_UNSTATED_WALLS_BLOCK`. |
| Reveal length | **ASSUMED** `STEALTH_DRONE_REVEAL_MS` (K4 reveal). |
| Tejo while piloting | Not modeled; Tejo may move and shoot. Open question 5. |
| Range | No range field: flight capped by `durationSec` x speed. |

#### Tejo - Special Delivery (Q) - source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits / maxCharges / recharge | 200 / 1 / "bought" | sheet |
| durationSec / concussSec | 2.5 / 2.5 | sheet (+ `globals.concussExactly2_5s`) |
| windupSec | 0.9 | sheet |
| maxFlightSec | 3 | sheet |
| innerRadiusM / outerRadiusM | 1.25 / 5.25 | sheet |
| damageMin / damageMax | 20 / 35 | sheet |
| damage string | "20 to 35 by distance" | sheet |
| concussFalloff | false | sheet |
| instantReequip | true | sheet (not modeled) |
| altFireBounces | 1 | sheet (not modeled) |
| hitsAllies / teamDamage | true / null | sheet |

| Gap | Engine will... |
| --- | --- |
| Projectile speed | **ASSUMED** `SPECIAL_DELIVERY_SPEED_MM_PER_SEC`; `maxRangeMm` = speed x 3000 ms / 1000 (derived from the assumed speed and sheet `maxFlightSec`). |
| Detonation | **DESIGN**: sticky; detonates on arrival at target clipped by walls, `cast + 900 + flight`. |
| Damage falloff | **DESIGN** `RADIAL_FALLOFF_LINEAR` 35 at 1.25 m to 20 at 5.25 m. |
| Concuss radius | **DESIGN**: concuss everyone in `outerRadiusM`, full 2500 ms. |
| Allies | No ally HP (teamDamage null); concuss enemies only (precedent). |

#### Tejo - Guided Salvo (E) - source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits / maxCharges | 150 / 2 | sheet |
| recharge | "bought; no cooldown recharge" | sheet |
| agent signatureRecharge | "1 free, +150, max 2; no recharge" | sheet |
| windupSec | 1.25 | sheet |
| rangeM | 45 | sheet |
| flightHeightM | 2 | sheet (not modeled) |
| ticks / tickIntervalSec | 3 / 0.8 | sheet |
| innerDamage / outerDamage (per tick) | 65 / 50 | sheet |
| innerTotal / outerTotal | 195 / 150 | sheet |
| innerRadiusM / outerRadiusM | 2.5 / 4.5 | sheet |
| targets | "one or two" | sheet |
| pathsAroundTerrain | true | sheet |
| hitsAllies / teamDamage | null / null | sheet |

| Gap | Engine will... |
| --- | --- |
| Missile speed | **ASSUMED** `GUIDED_SALVO_SPEED_MM_PER_SEC`. |
| Tick timing | **DESIGN**: tick k at `impact + k x 800`, k = 0..2; impact = `cast + 1250 + flight`. |
| Damage bands | **DESIGN** `STEPPED_BANDS`: 65 if distance <= 2500 mm, 50 if <= 4500 mm, else 0 (two discrete sheet values, no interpolation). |
| Path length | G1 `findPath` length if landed, else straight line. |
| Walls | Zone precedent: no wall check at the blast. |
| Free first charge | G5 economy; drill keeps the existing full-charge assumption (`FULL_CHARGES_PROVENANCE`). |

#### Tejo - Armageddon (X) - source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| ultPoints (agent `ultimatePoints`) | 9 / 9 | sheet |
| rangeM | 52.5 | sheet |
| windupSec | 3.08 | sheet |
| segments / segmentLengthM | 16 / 2 | sheet |
| lengthM / widthM | 32 / 12 | sheet |
| ticksPerSegment / damagePerTick | 4 / 60 | sheet |
| segmentIntervalSec | 0.25 | sheet |
| damage string | "4 ticks of 60 per segment" | sheet |
| hitsAllies / teamDamage | null / null | sheet |

| Gap | Engine will... |
| --- | --- |
| Tick interval inside a segment | **ASSUMED** `ARMAGEDDON_TICK_INTERVAL_MS`. |
| Targeting | **DESIGN**: `mapTarget` = strip start, `aimYawDeg` = strip direction; range check on start only (`maxRangeMm` 52500). Missing either field -> `cast-rejected` `invalid-order` at resolve. |
| Segment timing | **DESIGN**: segment s starts at `cast + 3080 + s x 250`, its ticks at `+ t x ARMAGEDDON_TICK_INTERVAL_MS`, t = 0..3. |
| Geometry | `pointInOrientedRect` per segment (2000 mm long, 12000 mm wide). |
| Walls | Zone precedent: no wall check. |

### 3.3 `status.suppress` design

```ts
// src/sim/effects/status.ts (modify)
export const STATUS_SUPPRESS = "suppress";

// src/sim/types.ts (modify)
export type RejectionCode = /* existing */ | "suppressed";

// src/sim/effects/suppress.ts (new)
export function isSuppressed(agent: AgentBody, timeMs: number): boolean; // hasStatus(agent, STATUS_SUPPRESS, timeMs)

export type SuppressInput = {
  sourceAbilityId: string;
  casterInstanceId: string;
  durationMs: number;
  timeMs: number;
};

/** Applies (or extends) suppress and returns the followups it needs. */
export function applySuppress(
  target: AgentBody,
  input: SuppressInput,
): { atMs: number; agentId: string; job: Job }[];
// followups:
//  1. { type: "status-expire", instanceId, statusId: STATUS_SUPPRESS, sourceAbilityId } at timeMs + durationMs
//  2. X1 { type: "channel-cancel", instanceId, reason: "suppressed" } at timeMs,
//     only when target.channel is an ability channel (see 9, contract notes)
```

Where suppress is enforced (live engine only):

1. **Issue time** - `validateCommand` in `src/sim/live-round.ts`: for `command.kind === "cast"` and X1 `"recall"`, after the alive check: `if (isSuppressed(agent, world.timeMs)) return { ok: false, code: "suppressed", ... }`. `issueOrders` then rejects the batch and logs `"suppressed"`; `replayOrderLog` compares that result like any other.
2. **Resolve time** - `applyJob` in `src/sim/run.ts`, `cast` branch, **before** the `tryResolve*Cast` dispatch: if the caster is suppressed at `timeMs`, emit `cast-rejected` with code `"suppressed"`; no charge, cooldown or ult point is spent. This catches a cast issued in the same step that a suppress job lands earlier in the queue, and every agent's resolver gets it with one check.
3. **Plan steps** - no new code: `fireDuePlanSteps` goes through `issueOrders`, so a suppressed plan cast becomes `status: "rejected"`.
4. **Channels** - `applySuppress` emits X1's `channel-cancel` job with `ChannelCancelReason` `"suppressed"`. Refunds follow X1's rules (none unless a source states one). Non-ability channels (G2 plant / defuse) are not cancelled: no source says suppress stops planting.
5. **Not blocked** - `move-route`, `hold`, `shoot`, `engage`, `auto-engage`. `evaluateCast` stays time-free; the UI mirrors the check in `castGate`.
6. **Stacking** - `applyStatus` already merges same id + source by max `untilMs`; ZERO/point and NULL/cmd suppress are separate entries and `hasStatus` checks any.

Events: suppress pulses use the existing `status-wave` event with `statusId: "suppress"`; expiry uses `status-expired`. No new event type for suppress itself.

### 3.4 Kit type sketches

```ts
// src/sim/agents/abilities/kayo.ts (new)
export const FRAG_MENT_ID = "frag-ment";
export const FLASH_DRIVE_ID = "flash-drive";
export const ZERO_POINT_ID = "zero-point";
export const NULL_CMD_ID = "null-cmd";
export const KAYO_ABILITIES: readonly AbilityDefinition[]; // names match agent-reference: "FRAG/ment", "FLASH/drive", "ZERO/point", "NULL/cmd"
export const FRAG_MENT_MAX_THROW_MM: number;   // assumed
export const FRAG_MENT_FLIGHT_MS: number;      // assumed
export const FLASH_DRIVE_MAX_THROW_MM: number; // assumed
export const ZERO_POINT_MAX_THROW_MM: number;  // assumed
export const ZERO_POINT_FLIGHT_MS: number;     // assumed
export const ZERO_POINT_REVEAL_MS: number;     // assumed
export const KAYO_ASSUMED_PROVENANCE: Record<string, Provenance>; // one kind:"assumed" entry per constant

// src/sim/agents/abilities/tejo.ts (new)
export const STEALTH_DRONE_ID = "stealth-drone";
export const SPECIAL_DELIVERY_ID = "special-delivery";
export const GUIDED_SALVO_ID = "guided-salvo";
export const ARMAGEDDON_ID = "armageddon";
export const TEJO_ABILITIES: readonly AbilityDefinition[];
export const STEALTH_DRONE_SPEED_MM_PER_SEC: number;   // assumed
export const STEALTH_DRONE_REVEAL_MS: number;          // assumed
export const SPECIAL_DELIVERY_SPEED_MM_PER_SEC: number;// assumed
export const GUIDED_SALVO_SPEED_MM_PER_SEC: number;    // assumed
export const ARMAGEDDON_TICK_INTERVAL_MS: number;      // assumed
export const TEJO_ASSUMED_PROVENANCE: Record<string, Provenance>;

// src/sim/types.ts (modify) - Device grows; existing stim-beacon rows unchanged
export type Device = {
  /* existing fields */
  kind: "stim-beacon" | "zero-point-knife" | "stealth-drone";
  /** Owner-side vision radius from the device (Stealth Drone visionM). */
  visionRadiusMm?: number;
  /** Enemies see it only with LOS from a living enemy (ZERO/point knife). */
  enemyLosVisible?: boolean;
  /** Recorded HP; not destroyable until object damage exists. */
  health?: number;
  /** Straight-line flight for the drone. */
  flight?: { from: Point; to: Point; departMs: number; arriveMs: number };
};

// src/sim/run.ts (modify) - Job additions
type K5Job =
  | { type: "frag-ment-pulse"; instanceId: string; at: Point; pulseIndex: number }
  | { type: "flash-drive-pop"; instanceId: string; at: Point }
  | { type: "zero-point-stick"; instanceId: string; at: Point }
  | { type: "null-cmd-pulse"; instanceId: string; pulseIndex: number }
  | { type: "stealth-drone-tick"; deviceId: string }
  | { type: "stealth-drone-pulse"; deviceId: string; tickIndex: number; hitIds: string[] }
  | { type: "special-delivery-blast"; instanceId: string; at: Point }
  | { type: "special-delivery-concuss"; instanceId: string; at: Point }
  | { type: "guided-salvo-tick"; instanceId: string; at: Point; tickIndex: number }
  | { type: "armageddon-tick"; instanceId: string; origin: Point; yawDeg: number; segmentIndex: number; tickIndex: number };

// src/sim/run.ts (modify) - SimEvent additions
type K5Event =
  | { type: "device-placed"; deviceId: string; deviceKind: Device["kind"]; at: Point }
  | { type: "device-moved"; deviceId: string; at: Point };
// Damage reuses "ability-damage" (burstIndex = pulse / tick / segment x 4 + tick);
// FLASH/drive reuses "flash-resolved"; suppress and concuss reuse "status-wave".
```

Resolver shape: `tryResolveKayoCast` and `tryResolveTejoCast` copy `tryResolveBreachCast` (ownership, complete, cooldown restore for ZERO/point, `spendUltPoints` for NULL/cmd and Armageddon, charge spend, `cast-accepted`, followups). `applyJob` dispatches the new job types to `apply*` functions in `kayo-resolve.ts` / `tejo-resolve.ts`.

NULL/cmd at cast accept also queues the stim: the `null-cmd-pulse` with `pulseIndex 0` applies `STATUS_COMBAT_STIM` to KAY/O with `untilMs = cast + 13000` and the globals modifiers, then the first suppress wave.

## 4. Determinism and fog implications

Determinism:

- All times are integer ms and all positions integer mm. Sheet decimals convert exactly (3.08 s = 3080 ms, 1.55 s = 1550 ms, 42.5 m = 42500 mm, 52.5 m = 52500 mm, 1.25 m = 1250 mm).
- No RNG draw in any K5 job. Only rifle shots use the combat stream, and suppress does not change shots, so `combatState` sequences are unchanged for scenarios without K5 casts.
- Queue order stays `(timeMs, sequence, agentId)`. Followups get sequences in return order; resolvers loop `world.agents` in array order and push affected ids in that order.
- Drone pulse ring: hit time for an enemy at distance d is the first tick whose radius `Math.round(16000 x elapsed / 700)` >= d. `hitIds` travels in the job payload, so no hidden state.
- Suppress at resolve time is checked against `timeMs` of the cast job, so a same-ms suppress and cast resolve by sequence; tests pin both orders.
- Replay: `"suppressed"` is a new logged `result`; `replayOrderLog` reproduces it because validation is pure over world state. Old logs contain no K5 casts and replay unchanged, except that `CATALOG_VERSION` changes (see risks).

Fog (`src/sim/fog.ts`, after K4):

| Item | Own side | Enemy side |
| --- | --- | --- |
| Suppress status on an agent | Visible on own agents | Visible only if that agent is visible (statuses ride on the agent copy) |
| ZERO/point knife | Always | Only with LOS from a living enemy (`enemyLosVisible`) |
| Stealth Drone | Always; adds vision: enemies within 18000 mm with LOS (walls, smokes) from the drone become visible to the owner side | Never (`hiddenFromEnemies`) |
| Reveals from ZERO/point and Stealth Drone | Through the K4 reveal state | Not shown to the revealed side as positions |
| FRAG/ment, Guided Salvo, Armageddon zones | Existing zone rules if modeled as zones; K5 uses jobs, not zones | Not shown before impact |
| NULL/cmd range ring | Own side preview only | Not shown |

The `LiveDecideFn` keeps receiving fogged data only. O1 will read reveals from the fogged world later; K5 adds nothing to `src/tactics`.

## 5. Provenance and unknowns

| Value | Tag | Named constant (if assumed / design) | How to confirm |
| --- | --- | --- | --- |
| All KAY/O FRAG/ment, ZERO/point, NULL/cmd numbers in 3.2 | sheet | - | `agent-reference.json` rows 19:C, 19:E, 19:X; drift test |
| All FLASH/drive numbers in 3.2 | verified (row source) | - | Row 19:Q; drift test |
| FLASH/drive overhand blind length | verified row with explicit caveat | - | Riot patch note for overhand duration |
| All Tejo numbers in 3.2 | sheet | - | Rows 22:C, 22:Q, 22:E, 22:X; drift test |
| Combat Stim modifiers 1.1 / 0.9 / 0.9 / 1.1 | sheet globals | - | `globals.combatStim`; Riot 11.08 |
| FRAG/ment throw range | assumed | `FRAG_MENT_MAX_THROW_MM` | In-game measurement or wiki stat |
| FRAG/ment flight time | assumed | `FRAG_MENT_FLIGHT_MS` | Measurement |
| FLASH/drive throw range | assumed | `FLASH_DRIVE_MAX_THROW_MM` | Measurement |
| ZERO/point throw range | assumed | `ZERO_POINT_MAX_THROW_MM` | Measurement |
| ZERO/point flight time | assumed | `ZERO_POINT_FLIGHT_MS` | Measurement |
| ZERO/point reveal length | assumed | `ZERO_POINT_REVEAL_MS` | Patch note or wiki |
| Stealth Drone speed | assumed | `STEALTH_DRONE_SPEED_MM_PER_SEC` | Wiki stat |
| Stealth Drone reveal length | assumed | `STEALTH_DRONE_REVEAL_MS` | Wiki stat |
| Special Delivery speed | assumed | `SPECIAL_DELIVERY_SPEED_MM_PER_SEC` | Wiki stat |
| Guided Salvo speed | assumed | `GUIDED_SALVO_SPEED_MM_PER_SEC` | Wiki stat |
| Armageddon tick spacing in a segment | assumed | `ARMAGEDDON_TICK_INTERVAL_MS` | Wiki stat or frame count |
| Windup counted from cast, then flight | design | `WINDUP_FROM_CAST` (doc rule, comment in resolvers) | Owner review |
| Linear radial falloff | design | `RADIAL_FALLOFF_LINEAR` | Owner review; game files |
| Guided Salvo stepped bands | design | `STEPPED_BANDS` | Owner review |
| Unstated suppress wall rule | design | `SUPPRESS_UNSTATED_WALLS_BLOCK` | Patch note / wiki for NULL/cmd and Stealth Drone |
| Flash / concuss enemies only despite hitsAllies | design (code precedent) | - | Owner decision across kits |
| Suppress does not affect rifle fire | design | - | Patch note wording on Suppress |
| Existing `ruleset.flashLookHalfAngleDeg`, `simStepMs`, `concussWalkSpeedMultiplierBp`, `concussHitChancePenaltyBp` | assumed (unchanged) | existing | Already tracked in `ruleset.ts` |

All new assumed constants live in `kayo.ts` / `tejo.ts` (the modules that own them) with `kind: "assumed"` provenance, not in `ruleset.ts`, to keep `ruleset.ts` out of the parallel merge path. The implementing PR picks the integers; this plan invents none.

## 6. Staged delivery

Each sub-stage ends with `npm run check` green (to be checked by the implementer) and a browser check at 1366x768.

### K5.1 Suppress core (needs X1 merged)

- `STATUS_SUPPRESS`, `RejectionCode "suppressed"`, `src/sim/effects/suppress.ts`, issue-time and resolve-time guards, recall guard, channel cancel followup, UI message, `castGate` check, suppressed badge.
- **Acceptance** - `tests/sim/suppress.test.ts` (new) asserts:
  1. A scenario member pre-loaded with a `suppress` status (`Scenario` members carry `statuses`) cannot issue a Breach `aftershock` cast: `issueRejected` returns `"suppressed"`; the order log entry has `result: "suppressed"`.
  2. The same agent can `move-route`, `hold` and `shoot` while suppressed; auto-engage still produces `shot` events with the same draws as an unsuppressed control.
  3. Calling `applyJob` with a `cast` job for a suppressed caster emits `cast-rejected` `"suppressed"` and leaves charges, `cooldownReadyAtMs` and `ultimatePoints` unchanged.
  4. After `untilMs` passes, the same cast is accepted.
  5. An armed at-time plan step for a suppressed agent ends with `status: "rejected"`.
  6. An X1 ability channel in progress is cancelled: an X1 cancel event with reason `"suppressed"` appears and no `channel-complete` follows. A non-ability channel (fixture with no ability source) is not cancelled.
  7. X1 `recall` is rejected `"suppressed"`.
  8. Replay: `replayOrderLog` over a log containing a `"suppressed"` rejection reproduces it.
- `tests/ui/round-play.test.tsx` (modify): a suppressed attacker's ability buttons are disabled with the suppressed reason.
- Browser: load a drill where an attacker starts suppressed; badge shows; ability buttons greyed; moving works.

### K5.2 KAY/O complete (needs K4 for reveal)

- `kayo.ts`, `kayo-resolve.ts`, catalog swap from `listed(...)` to `KAYO_ABILITIES`, rename `"FLASH/DRIVE"` to `"FLASH/drive"` so the name lookup in the drift test matches, `CATALOG_VERSION` bump, knife device + fog visibility.
- **Acceptance** - `tests/sim/kayo.test.ts` (new) asserts:
  1. Drift: every KAY/O `costCredits`, `maxCharges`, `ultPointCost` (8) and each numeric / boolean `referenceStats` key equals `agent-reference.json` (lookup by name, Breach pattern).
  2. Status flip: for each of `frag-ment`, `flash-drive`, `zero-point`, `null-cmd`, `implementation` is `"complete"`; `null-cmd` `notModeled` contains `"downed state (K10 support.revive)"`.
  3. Ownership: a Breach casting `zero-point` -> `ability-not-owned`.
  4. Charges: FLASH/drive 2 -> 1 -> 0 then `insufficient-charges`; FRAG/ment single charge.
  5. ZERO/point cooldown: second cast before 50000 ms -> `signature-on-cooldown`; accepted after.
  6. NULL/cmd ult gate: rejected at 7 points, accepted at 8, points spent.
  7. FRAG/ment: 4 `ability-damage` events 1000 ms apart; damage 60 at <= 1000 mm, 25 at 4000 mm, 0 beyond; no ally damage.
  8. FLASH/drive: pop at cast + 1600; enemy facing the pop with LOS gets `blind` for 2250 ms; enemy facing away or behind a wall does not; allies untouched.
  9. ZERO/point: enemies within 15000 mm of the knife are suppressed for 8000 ms **through a wall**; allies are not; a K4 reveal is recorded per hit; an enemy beyond 15000 mm is not.
  10. ZERO/point -> channel: an enemy mid-channel (X1) is cancelled with `"suppressed"`.
  11. NULL/cmd: 5 suppress waves 3000 ms apart starting at cast + 1000; KAY/O has `combat-stim` with fireRate 1.1 until cast + 13000; `autoFireIntervalFor` shortens; KAY/O death stops later waves.
  12. Determinism: two runs with the same seed and orders deep-equal (events and final world).
  13. Fog: the knife is absent from the enemy `viewLive` without LOS and present with LOS.
- `tests/sim/composition.test.ts` (modify): the complete-ids list adds the four KAY/O ids; the `flash-drive` placeholder assertion becomes `"complete"`.
- Browser: select KAY/O on defense via hot-seat or draft; each ability castable; ZERO/point ring preview 15 m; NULL/cmd ring follows KAY/O.

### K5.3 Tejo agent + Special Delivery, Guided Salvo, Armageddon

- New `TEJO` agent in the catalog (role initiator, provenance `secondary`, source `"agent-reference.json agent row"`), `tejo.ts`, `tejo-resolve.ts` for Q, E, X. Stealth Drone defined but left `implementation: "placeholder"` until K5.4.
- **Acceptance** - `tests/sim/tejo.test.ts` (new) asserts:
  1. Drift for all four Tejo abilities, `ultPointCost` 9 for Armageddon.
  2. Special Delivery: detonation at cast + 900 + flight; damage 35 inside 1250 mm, 20 at 5250 mm; enemies in 5250 mm concussed 2500 ms at any distance (no falloff); allies take neither.
  3. Guided Salvo: 3 ticks 800 ms apart; 65 inside 2500 mm, 50 inside 4500 mm; two casts in one batch give two missiles and spend both charges; `mapTarget` beyond 45000 mm -> `out-of-range`.
  4. Armageddon: rejected at 8 points, accepted at 9; segment 0 first tick at cast + 3080; segment s starts 250 ms after s - 1; 4 ticks of 60 per segment; missing `aimYawDeg` -> `cast-rejected` `invalid-order`; start beyond 52500 mm -> `out-of-range`.
  5. Suppressed Tejo cannot cast any of them (`"suppressed"`).
  6. Determinism deep-equal.
- Browser: draft Tejo; Guided Salvo two-click, Armageddon strip preview fits on screen.

### K5.4 Tejo Stealth Drone

- Drone device, `stealth-drone-tick` movement, owner-side vision in `fog.ts`, expanding pulse, reveal, removal. Flip `stealth-drone` to `complete`.
- **Acceptance** - `tests/sim/tejo.test.ts` (extend):
  1. Drone spawns at cast + 400 (`device-placed`), moves by the assumed speed per tick, stops at a wall.
  2. Pulse on arrival or at spawn + 6000; enemy at distance d suppressed at the first tick whose radius covers d; each enemy hit once; walls block; smoke does not; suppress 8000 ms; K4 reveal recorded.
  3. Enemy `viewLive` never contains the drone; owner `viewLive` contains enemies within 18000 mm of the drone with LOS from it.
  4. Status flip: all four Tejo abilities `"complete"`.
  5. Determinism deep-equal; architecture test still passes.
- Browser: drone path line and 18 m / 16 m rings visible; drone hidden in the defense hot-seat view.

### K5.5 UI polish and previews

- Previews in `previews.ts` for all eight abilities, rejection text fix ("need N"), map-strip cast kind for Armageddon, status badges for suppress.
- **Acceptance** - `tests/ui/previews.test.ts` (modify): preview geometry for FRAG/ment rings (1000 / 4000 mm), ZERO/point 15000 mm, Special Delivery (1250 / 5250), Guided Salvo (2500 / 4500 + 45000 range), Armageddon rect 32000 x 12000; `tests/ui/round-play.test.tsx` (modify): Armageddon takes 3 clicks, NULL/cmd 1 click.
- Browser at 1366x768: no document scroll in the live screen with KAY/O and Tejo selected; NULL/cmd 42.5 m ring clipped to the map viewport, not the page.

## 7. UI impact

| Ability | Cast kind | Clicks (after selecting the agent) | Preview | Overlay |
| --- | --- | --- | --- | --- |
| FRAG/ment | aimed | 2 (hotkey or button, map click) | Inner / outer rings at landing point, throw-range circle | Pulse flashes |
| FLASH/drive | aimed | 2 | Pop point + range circle | Pop marker |
| ZERO/point | aimed | 2 | 15 m ring at stick point (wall-clipped) | Knife marker, suppress ring on pulse |
| NULL/cmd | instant | 1 | 42.5 m ring around KAY/O | Ring follows KAY/O for 12 s, stim badge |
| Stealth Drone | aimed | 2 | Flight line, 18 m vision ring and 16 m pulse ring at end | Drone marker (own side only) |
| Special Delivery | aimed | 2 | 1.25 / 5.25 m rings, range circle | Blast flash |
| Guided Salvo | map-targeted | 2 per missile | 2.5 / 4.5 m rings, 45 m range circle | Impact rings for 3 ticks |
| Armageddon | map-strip (new) | 3 (button, start click, direction click) | 32 x 12 m strip with 16 segment lines, 52.5 m range circle | Segment sweep |

Suppressed state: a "SUP" badge on the map token (`MapView.tsx` status labels) and in `AgentPanel.tsx`'s status list (already generic over `activeStatuses`); ability buttons disabled with "Suppressed for X.X s" from `castGate`. Rifle controls stay enabled.

One-screen rule: no new panels; previews draw inside the existing `MapView` SVG; the agent panel gains at most one badge row. The Draft roster gains one button (Tejo) in the existing grid.

## 8. Files touched

> Build protocol (consistency pass): this stage is built under [`parallel-build-plan.md`](parallel-build-plan.md). Edits listed here to `src/ui/App.tsx`, `src/ui/styles.css`, `rejectionMessages.ts`, `describe.ts` and the shared docs are integration-file edits: the stage's UI lives in its own component files (with their own CSS), and the App mount lines, message entries and doc text are applied at merge. After H0, engine edits go into the split modules and this stage's reserved slots.

| File | New / modify | Sub-stage | Change |
| --- | --- | --- | --- |
| `src/sim/effects/status.ts` | modify | K5.1 | `STATUS_SUPPRESS` |
| `src/sim/effects/suppress.ts` | new | K5.1 | `isSuppressed`, `applySuppress` |
| `src/sim/types.ts` | modify | K5.1, K5.2, K5.4 | `"suppressed"` code; `Device.kind` members and optional fields |
| `src/sim/live-round.ts` | modify | K5.1 | `validateCommand` suppress check for `cast` and `recall` |
| `src/sim/run.ts` | modify | K5.1 to K5.4 | Resolve-time suppress guard; dispatch to Kayo / Tejo resolvers; new `Job` and `SimEvent` members |
| `src/sim/preround.ts` | modify | K5.1, K5.5 | `rejectionText` entry for `"suppressed"`; drop hard-coded "need 8" |
| `src/sim/agents/abilities/kayo.ts` | new | K5.2 | Definitions, assumed constants, provenance |
| `src/sim/agents/abilities/kayo-resolve.ts` | new | K5.2 | `tryResolveKayoCast`, `apply*` jobs |
| `src/sim/agents/abilities/tejo.ts` | new | K5.3 | Definitions, assumed constants, provenance |
| `src/sim/agents/abilities/tejo-resolve.ts` | new | K5.3, K5.4 | `tryResolveTejoCast`, `apply*` jobs |
| `src/sim/agents/catalog.ts` | modify | K5.2, K5.3 | KAY/O uses `KAYO_ABILITIES`; add `TEJO`; `CATALOG_VERSION` bump |
| `src/sim/fog.ts` | modify | K5.2, K5.4 | Knife LOS visibility; drone owner vision |
| `src/ui/orders/abilityUi.ts` | modify | K5.1, K5.2, K5.3, K5.5 | `castGate` suppress; `castKind` sets; `"map-strip"` kind |
| `src/ui/orders/rejectionMessages.ts` | modify | K5.1, K5.5 | `"suppressed"` message; ult text without a fixed 8 |
| `src/ui/board/previews.ts` | modify | K5.5 | Eight ability previews |
| `src/ui/board/MapView.tsx` | modify | K5.1, K5.4 | Suppress badge; knife and drone markers |
| `src/ui/App.tsx` | modify | K5.3, K5.5 | Map-strip cast flow (start + direction clicks) |
| `tests/sim/suppress.test.ts` | new | K5.1 | Section 6 K5.1 |
| `tests/sim/kayo.test.ts` | new | K5.2 | Section 6 K5.2 |
| `tests/sim/tejo.test.ts` | new | K5.3, K5.4 | Section 6 K5.3, K5.4 |
| `tests/sim/composition.test.ts` | modify | K5.2, K5.3 | Complete-ids list; `flash-drive` flips to complete |
| `tests/ui/round-play.test.tsx` | modify | K5.1, K5.5 | Suppressed buttons; click counts |
| `tests/ui/previews.test.ts` | modify | K5.5 | Preview geometry |
| `tests/ui/DraftPanel.test.tsx` | modify (if it counts agents) | K5.3 | Tejo in roster |
| `docs/status/k5.md` | new | K5 close | Stage result, playtest steps and the exact text for PROJECT_STATUS.md / README.md / docs/playtest.md / docs/roadmap.md. The integrator applies that text at merge (docs/parallel-build-plan.md); this stage's branch never edits those shared docs. |

Not touched: `src/rules/ruleset.ts`, `src/tactics/`, `data/`, `agent-reference.json`, `tests/architecture.test.ts` (no evaluator change), characterization fixtures (they use Brimstone and Jett only).

## 9. Dependencies

Must land first:

- **K4 Sova** (`info.reveal`): reveal state on the world and its fog consumption. K5 calls K4's reveal entry point for ZERO/point and Stealth Drone hits. K4 also edits `src/sim/fog.ts`; K5 edits it after.
- **X1 Channels**: `ChannelState` on the agent body, job type `channel-cancel`, `ChannelCancelReason` with member `"suppressed"`, `AgentCommand` `{ kind: "recall"; instanceId; deviceId }`.
- **K3 Raze** (transitively through K4): the shared `damageAtRadius` falloff helper planned in `docs/stage-3-plan.md`. If K3 has not shipped it, K5.2 adds the same helper in `src/sim/effects/` and K3 reuses it.

Optional:

- **G1** `findPath(map, from, to)` for Guided Salvo path length. Without it, straight-line distance.
- **G5** signature replenish for Guided Salvo's free charge.

Contract names consumed: X1 `ChannelState`, `channel-cancel`, `ChannelCancelReason`, `recall`; K4 reveal state; G1 `findPath`. Names K5 needs that the brief does not define (to agree with the X1 and K4 writers):

- `AgentBody.channel: ChannelState | null` and a field on `ChannelState` that marks an ability channel (proposed `abilityId: string | null`), so suppress cancels ability channels but not plant / defuse.
- The `channel-cancel` job payload (proposed `{ type: "channel-cancel"; instanceId: string; reason: ChannelCancelReason }`).
- K4's reveal entry point (proposed `applyReveal(world, targetInstanceId, revealingSide, untilMs, sourceAbilityId)`).

## 10. Risks

1. **X1 shape drift.** If X1 does not mark ability channels or names the cancel job differently, K5.1 test 6 and `applySuppress` change. Mitigation: agree the three names in section 9 before K5.1.
2. **Windups that X1 does not convert to channels.** Existing Breach / Brimstone windups resolve "even if the caster dies mid-windup". If X1 leaves them as plain followups, suppress cannot cancel them. K5 does not change that; it is X1's call.
3. **Catalog version bump** breaks saved scenario files with `catalog-mismatch`. Mitigation: same as earlier kit stages; note in `docs/status/k5.md` (applied to PROJECT_STATUS at merge) when it ships.
4. **Coverage and draft output change** once FLASH/drive is complete (defense gains flash coverage). Tests in `composition.test.ts` and possibly `DraftPanel.test.tsx` change; review them as intended changes, not regressions.
5. **Many assumed constants** (10) shape timing and reach. Mitigation: all named, provenance `assumed`, grouped in two modules for one-pass review.
6. **NULL/cmd 42.5 m ring** may dominate the small Drill Hall and suppress the whole enemy team every pulse. That is faithful to the sheet radius; balance is not this stage's concern.

## 11. Open questions

| # | Question | Recommended answer |
| --- | --- | --- |
| 1 | `docs/effect-primitives.md` section 5 item 6 says "Auto-fire must respect Suppress". Does suppress stop rifle fire? | No. That line is a design note, not a source; suppress blocks abilities only. Revisit if a patch note says otherwise. |
| 2 | Do NULL/cmd and Stealth Drone suppress pulses go through walls? | Walls block, smokes do not (`SUPPRESS_UNSTATED_WALLS_BLOCK`) until a source says otherwise. ZERO/point is through walls per the sheet. |
| 3 | ZERO/point `windupSec` 1: before the throw or after the knife sticks? | Count from cast (`WINDUP_FROM_CAST`, Breach precedent), then flight, then a single pulse. Change one constant if the owner prefers stick-then-wait. |
| 4 | `hitsAllies: true` on FLASH/drive and Special Delivery: blind / concuss allies? | Keep enemies only to match Flashpoint and Fault Line in code; decide once for all kits in a later cross-kit pass. |
| 5 | Stealth Drone: steerable and does Tejo freeze while piloting? | No steering in K5 (straight line to the cast target, auto pulse); Tejo stays free. A piloting channel can be added on X1 later. |
| 6 | ZERO/point "reveal that they were hit": reveal positions or only report a count? | Reveal positions through K4 for `ZERO_POINT_REVEAL_MS`; owner to confirm the reading and the length. |
