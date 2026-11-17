# Stage 1 plan — Breach + Brimstone fully executable

Tag: **design**. Implementation plan only; no `src/` changes in this document. Target: both agents fully executable in the existing Drill Hall interactive round (`src/sim/round.ts`), using corrected mapping from `data/ability-primitives.json` / `data/primitive-stages.json` (Breach completes at generated stage 1; Brimstone at stage 2).

Economy beyond what these eight abilities need is out of scope.

## 1. Primitives and extra rules

### Shared (union for Breach ∪ Brimstone)

From the corrected mapping (core charge / signature-recharge / ult-point fields are engine state, not listed per ability):

| Primitive | Breach | Brimstone |
| --- | --- | --- |
| `projectile.generic` | Aftershock, Flashpoint, Fault Line, Rolling Thunder | Incendiary |
| `projectile.flash` | Flashpoint | — |
| `projectile.bouncing` | — | Incendiary |
| `damage.zoneOrHit` | Aftershock | Incendiary, Orbital Strike |
| `status.concuss` | Fault Line, Rolling Thunder | — |
| `movement.knockback` | Rolling Thunder | — |
| `device.summonOrPlaceable` | — | Stim Beacon |
| `status.combatStim` | — | Stim Beacon |
| `status.haste` | — | Stim Beacon |
| `vision.smoke` | — | Sky Smoke |
| `placement.mapTargeted` | — | Sky Smoke, Orbital Strike |
| `vision.wallOrVolume` | — | Orbital Strike (LOS/flash/recon block while active) |

### Extra rules (not inventing numbers)

- **Through-walls:** Aftershock, Fault Line, Rolling Thunder apply through walls (`throughWalls: true`, verified / sheet as tagged on each ability).
- **Flash facing:** Flashpoint `requiresLooking: true` (verified) — use approved facing yaw + ±90° until measured (**design**).
- **Ally damage:** Incendiary and Orbital Strike say “reduced to allies” with **no fraction** → do not damage allies until a source gives a fraction (approved decision #8). Aftershock **does** damage allies (`teamDamage: "damages allies"`, verified).
- **Sky Smoke** already executable; generalise cast order to `placement.mapTargeted` (tactical map point) instead of treating it as a one-off.
- **Stim Beacon** indestructible; enemies do not see radius (`enemiesSeeRadius: false`, verified).
- **Rolling Thunder** knockup height is **estimate** — see §2.
- **Orbital Strike** DPS listed as approximate on the sheet — use interval damage numbers, not the approximate DPS label, for ticks.

## 2. Numbers per ability

### Breach — Aftershock (C) — source **verified**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 200 | verified |
| maxCharges | 1 | verified |
| equipSec | 0.9 | verified |
| rangeM | 35 | verified |
| cylinderLengthM | 10 | verified |
| radiusM | 3 | verified |
| windupSec | 2.2 | verified |
| bursts | 2 | verified |
| damagePerBurst | 80 | verified |
| burstIntervalSec | 0.6 | verified |
| damageTotal | 160 | verified |
| falloff | false | verified |
| damagesObjects | true | verified |
| throughWalls | true | verified |

Missing / unpublished: none for execution. Ally damage: damages allies (stated).

### Breach — Flashpoint (Q) — source **verified**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 250 | verified |
| maxCharges | 2 | verified |
| equipSec | 1.1 | verified |
| rangeM | 35 | verified |
| wallDepthM | 10 | verified |
| windupSec | 0.5 | verified |
| blindSec | 2.25 | verified |
| travelSpeed | 2400 | verified (patch note 12.00); **unit not labeled in sheet** |
| requiresLooking | true | verified |

Missing: travel speed **unit** (m/s vs game units). **Engine:** treat `2400` as mm/s equivalent only if documented later; until then store as `travelSpeedRaw: 2400` with tag verified-value / unlabeled unit, and scale on Drill Hall with an **assumed** mm conversion factor called out in provenance — **or** keep projectile timing as `rangeM / impliedSpeed` using range 35 m and a duration derived without inventing speed by using windup+blind only for flash timing and an **assumed** flight time stub. **Recommendation:** do **not** invent m/s; use discrete window jobs: spawn at cast+windup through wall depth, apply flash at impact event timed from `equipSec+windupSec` pathing along facing for `rangeM`, with flight duration tagged **assumed** until unit is known. Document assumed flight duration in `provenance.ts`.

### Breach — Fault Line (E) — source **verified**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 0 | verified |
| maxCharges | 1 | verified |
| recharge / cooldownSec | 50 s | verified |
| equipSec | 0.8 | verified |
| chargeSec | 1 | verified |
| lengthMinM / lengthMaxM | 8 / 56 | verified |
| widthM | 8 | verified |
| startsAheadM | 8 | verified |
| windupSec | 1.1 | verified |
| concussSec | 2.5 | verified |
| throughWalls | true | verified |

Missing: none.

### Breach — Rolling Thunder (X) — source **verified** (knockup estimate)

| Field | Value | Tag |
| --- | --- | --- |
| ultPoints | 8 | verified |
| equipSec | 1.1 | verified |
| channelSec | 0.6 | verified |
| lengthM / widthM / startsAheadM | 32 / 18 / 8 | verified |
| blasts | 8 | verified |
| blastIntervalSec | 0.255 | verified |
| concussSec | 4 | verified |
| knockupM | 7 | **estimate** |
| throughWalls | true | verified |

Missing / estimate: vertical knockup. **Engine (approved flat map):** apply `movement.knockback` as horizontal impulse / brief stun displacement only; **do not** use estimate `7` as truth — either omit vertical and tag knockup **not modeled (estimate withheld)** or store estimate behind `implementation: partial` with provenance estimate and no catalog claim of verified height.

### Brimstone — Stim Beacon (C) — source **verified**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 200 | verified |
| maxCharges | 1 | verified |
| radiusM | 6 | verified |
| beaconSec | 12 | verified |
| lingerAfterLeavingSec | 4 | verified |
| unequipSec | 0.7 | verified |
| fireRate / reloadTime / drawTime / spreadRecovery | 1.1 / 0.9 / 0.9 / 1.1 | verified |
| movementSpeed | 1.1 | verified |
| indestructible | true | verified |

Missing: none.

### Brimstone — Incendiary (Q) — source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 250 | sheet |
| maxCharges | 1 | sheet |
| equipSec | 1.1 | sheet |
| radiusM | 4.5 | sheet |
| burstSec / spreadSec / fullSizeSec | 0.25 / 0.75 / 7 | sheet |
| damagePerTick / ticksPerSec / dps | 1 / 60 / 60 | sheet |
| damageTotalMin / Max | 420 / 465 | sheet |
| objectDamageMultiplier | 0.5 | sheet |
| floorBounces | 2 | sheet |

Missing: ally damage **fraction**. **Engine:** no friendly fire from Incendiary until sourced. Floor bounce on flat Drill Hall: resolve as up to 2 ground contacts then detonate (**sheet** rule).

### Brimstone — Sky Smoke (E) — source **secondary**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 100 | secondary |
| maxCharges | 3 | secondary |
| rangeM | 55 | secondary |
| deploySec | 1 | secondary |
| radiusM | 4.15 | secondary |
| durationSec | 19.25 | secondary |
| equipSec | 0.8 | secondary |
| recharge | 1 free + bought extras | secondary |

Already implemented. Missing for “bought extras”: buy step (§4).

### Brimstone — Orbital Strike (X) — source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| ultPoints | 8 | sheet |
| rangeM | 60 | sheet |
| windupSec | 2 | sheet |
| radiusM | 9 | sheet |
| damageEverySec | 0.15 | sheet |
| damagePerInterval | 20 | sheet |
| activeSec | 3 | sheet |
| shrinkSec | 0.75 | sheet |
| damageTotalMin / Max | 400 / 500 | sheet |
| blocksLineOfSight / flashes / recon | true | sheet |
| dps | 133 | sheet (**approximate** flag) |

Missing: ally damage fraction. **Engine:** tick `damagePerInterval` every `damageEverySec` for `activeSec`; ignore approximate DPS field for math. No ally damage until fraction sourced. Vision block while active via `vision.wallOrVolume` / smoke-like LOS flag.

## 3. File-by-file change plan

| Area | Plan |
| --- | --- |
| `src/sim/types.ts` | Status ids (`concuss`, `haste`, `combatStim`, …); facing yaw; rejection codes if needed. |
| `src/sim/agents/state.ts` | Persist statuses, facing, `ultPoints`, `cooldownReadyAtMs`, buyable charge pools. |
| `src/sim/agents/catalog.ts` + `abilities/*` | Mark Breach kit + remaining Brimstone abilities `complete` with provenance from reference tags only. |
| `src/sim/combat/` or `src/sim/effects/` | New modules: `status.ts`, `projectiles.ts`, `damage-zone.ts`, `devices.ts`, `flash.ts` — one file per primitive family. |
| `src/sim/run.ts` | New `Job` kinds: `projectile-advance`, `flash-resolve`, `zone-tick`, `status-expire`, `ult-cast`, `channel-blast`, `map-strike-windup`. Keep `(timeMs, sequence, agentId)` ordering. |
| `src/sim/round.ts` | Extend `WindowOrder`: `cast` with `aimYaw` / `lengthCharge` / `mapTarget` / `steerSamples[]` (max 4). Carry statuses, devices, zones, projectiles on `RoundState`. Pending jobs across windows. |
| `view(side)` | Hide enemy agents without LOS; show enemy Stim Beacon radius only if `enemiesSeeRadius` (false). Orbital vision block affects LOS. Flashed/nearsight later; concuss does not hide. |
| UI (later) | Map-click for smokes/orbital; aim control for Breach cones; not required to finish this doc. |

### Discretising multi-stage abilities (approved decisions)

- **Flashpoint:** order includes facing yaw; flight is one projectile job; flash applies on impact if target facing test passes and LOS not smoke-blocked. No continuous mouse.
- **Fault Line:** order includes charge parameter → length between 8–56 m; single wave job after `chargeSec+windupSec`.
- **Rolling Thunder:** channel `channelSec` then 8 blast jobs at `blastIntervalSec` along facing rectangle; knockup vertical withheld (estimate) on flat map.
- **Orbital Strike:** `placement.mapTargeted` point; windup 2 s then zone ticks; steer N/A.
- **Incendiary:** throw along aim; up to 2 floor bounces then zone ticks.

## 4. Ult points, signature recharge, charges, minimal buy

| Concern | Behaviour for this milestone |
| --- | --- |
| Charges | Aftershock 1, Flashpoint 2, Stim 1, Incendiary 1, Sky Smoke 3 — spend on cast; reject `insufficient-charges`. |
| Signature | Fault Line: `cooldownReadyAtMs` += 50 000 on cast. Sky Smoke: free/bought extras already modeled as charge pool; no 50s cooldown. |
| Ult points | Breach & Brimstone ult cost 8. Start drill with **assumed** full 8 for tests that need ults, or earn via existing kill/death/orb/plant/defuse rules without assists (`givesUltPoints: false`). Tag starting-full-ult **assumed** in provenance if used. |
| Buy step | Minimal: before round or between windows, `buyCharge(instanceId, abilityId)` if credits ≥ cost and charges &lt; max — **credits stub**: grant **assumed** starting credits enough for one of each bought ability in the drill, or allow free refill in test harness only. Full shop UI out of scope. |

## 5. Vitest list

1. **Ownership:** Jett casting Aftershock → `ability-not-owned`; Brimstone casting Fault Line → `ability-not-owned`.
2. **Charges:** Flashpoint spends 2→1→0; third cast `insufficient-charges`. Sky Smoke 3→2 as today.
3. **Signature cooldown:** Fault Line second cast inside 50 s rejected; after ready, accepted.
4. **Ult gate:** Rolling Thunder / Orbital with 0 points rejected; with 8 accepted and points spent.
5. **Timing:** Aftershock bursts 0.6 s apart; Orbital ticks every 0.15 s for 3 s; Stim linger 4 s after leaving.
6. **Geometry:** Aftershock damages through Drill Hall divider; Flashpoint blocked by active Sky Smoke for vision-dependent blind; Incendiary clipped by walls for travel.
7. **Concuss:** Fault Line applies 2.5 s; Rolling Thunder 4 s; auto-engage / move speed interaction deterministic.
8. **Stim:** haste + combat stim modifiers applied; stacks per approved decision.
9. **Determinism:** same seed + plans deep-equal; combat stream unchanged for non-shot utility.
10. **Fog:** `view('attack')` hides defender behind wall; Orbital active volume blocks LOS; Stim radius not shown to enemies.
11. **Ally damage:** Aftershock hits allied bot in fixture; Incendiary does not until fraction exists.
12. **Architecture:** `sim/` still free of React; no `Math.random`.

## 6. Risks and open questions (max 5)

| # | Risk / question | Recommended answer |
| --- | --- | --- |
| 1 | Flashpoint `travelSpeed: 2400` has no unit. | Do not invent m/s; time flash impact with an **assumed** flight duration derived for Drill Hall ranges, tagged assumed, until a primary unit is opened. |
| 2 | Rolling Thunder knockup is estimate. | Withhold vertical knockup on 2D map; keep concuss + horizontal displacement only. |
| 3 | Ally damage fractions unpublished for Incendiary/Orbital. | No friendly fire for those two until sourced; Aftershock keeps ally damage. |
| 4 | Map UI for Sky Smoke / Orbital in the SVG board. | Accept point clicks as map targets in stage-1 UI follow-up; engine orders ready first. |
| 5 | Starting ult points / credits for interactive drills. | Tag assumed full ult (8) and assumed credits for one buy of each paid basic in the default Breach/Brimstone drill; not a live buy phase. |
