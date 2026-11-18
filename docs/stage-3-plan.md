# Stage 3 plan — Raze fully executable

Tag: **design**. Implementation plan only; no `src/` changes in this document. Target: Raze fully executable (Boom Bot C, Blast Pack Q, Paint Shells E, Showstopper X) in the Drill Hall interactive round, using the corrected mapping from `data/ability-primitives.json` / `data/primitive-stages.json` (stage 3 adds `projectile.homing`; Raze is the agent completed by that stage).

All four Raze abilities are **sheet**-sourced in `agent-reference.json`. Do not upgrade tags. Invent no numbers. Economy beyond what these four abilities need is out of scope except kill-linked signature recharge for Paint Shells.

Related: live-round migration is planned separately in [`docs/live-round-plan.md`](live-round-plan.md). This stage-3 plan assumes the **current** turn / window layer (`src/sim/round.ts`) unless noted; designs should stay compatible with a later live stepper (jobs + integer ms/mm).

## 1. Primitives and extra rules

### Shared (Raze union)

From the corrected mapping (core `resource.charges` / `resource.signatureRecharge` / `resource.ultPoints` are engine state, not listed per ability):

| Primitive | Boom Bot | Blast Pack | Paint Shells | Showstopper |
| --- | --- | --- | --- | --- |
| `projectile.homing` | yes | — | — | — |
| `projectile.generic` | yes | yes | yes | — |
| `projectile.bouncing` | — | yes | yes | — |
| `damage.zoneOrHit` | yes | yes | yes | yes |
| `device.summonOrPlaceable` | yes | — | — | — |
| `movement.knockback` | — | yes (launch) | — | yes (self knockback) |

Stage 1–2 already cover every Raze primitive except **`projectile.homing`**. Shared engine work still needed for Raze:

| Extra rule | Source / note | Engine stance |
| --- | --- | --- |
| Self-launch / self knockback | Blast Pack `launchesRaze: true`; Showstopper `knocksRazeBack: true` (sheet) | Horizontal displacement only on the flat map (same rule as Rolling Thunder). Magnitudes unpublished → named ASSUMED / DESIGN constants (§2). |
| Signature recharge on kills | Paint Shells `recharge: "2 kills"` (sheet); duelist pattern | General kill-counter on the agent; grant charge at 2 kills (§5). |
| Boom Bot concussable | `canBeConcussed: "12.02"` (sheet patch id) | Device can receive `status.concuss` from foreign sources; slows / behaviour while concussed needs ASSUMED mapping (§2, §3). |
| Boom Bot does not damage Raze | `damagesRaze: false` (sheet) | Explicit exemption. |
| Blast Pack damages allies? | `hitsAllies: true`, `teamDamage: null` (sheet) | Fraction unpublished → **no ally HP damage until sourced**; launch may still move Raze. |
| Falloff between inner/outer radii | Damage strings + min/max + radii (sheet); no `falloff` bool / curve | Do not invent a curve. Use a named **DESIGN** interpolation and document it (§2). |
| Showstopper switch/reequip | `canSwitchAndReequip: true` (sheet) | Out of scope for Drill Hall weapons; ignore weapon-switch sim; keep duration / rocket count only. |

## 2. Numbers per ability

### Raze — Boom Bot (C) — source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 300 | sheet |
| maxCharges | 1 | sheet |
| equipSec | 1.1 | sheet |
| windupSec | 0.6 | sheet |
| durationSec | 5 | sheet |
| health | 60 | sheet |
| detectConeM | 15 | sheet |
| explodeWithinM | 2.5 | sheet |
| explodeAfterSec | 0.6 | sheet |
| damageMin / damageMax | 30 / 80 | sheet |
| innerRadiusM / outerRadiusM | 2 / 6 | sheet |
| objectDamageMultiplier | 2.5 | sheet |
| canBeConcussed | "12.02" | sheet (patch id, not bool) |
| damagesRaze | false | sheet |
| hitsAllies / teamDamage | false / "none" | sheet |

**Missing / unpublished (do not invent):**

| Gap | Engine will… |
| --- | --- |
| Movement speed | **ASSUMED** `boomBotSpeedMmPerSec` in ruleset / raze module provenance. |
| Turning rate | **ASSUMED** `boomBotTurnDegPerSec` (or discrete yaw snap per tick). |
| Detect cone **angle** | **DESIGN** half-angle until measured; store as `boomBotDetectHalfAngleDeg`. |
| Sequence of `explodeWithinM` vs `explodeAfterSec` | **DESIGN** interpretation below. |
| Falloff 30→80 over 2→6 m | **DESIGN** discrete radial bands or linear-in-radius interpolation tagged design — pick one in §7. |
| Concuss effect on bot while `canBeConcussed` | **ASSUMED** use existing concuss walk multiplier on bot speed; no new concuss numbers. |

**Recommended explode sequence (**design**):** after windup, bot patrols / homes for up to `durationSec`. When any valid enemy enters the **detection cone** (`detectConeM` + design half-angle) **and** distance ≤ `explodeWithinM`, start an arm timer of `explodeAfterSec`, then resolve `damage.zoneOrHit` with falloff. If the enemy leaves before arm completes, **cancel arm and resume seeking** (alternative in §3). Hard stop / despawn at `durationSec` if never detonated. HP 60; destroyable by damage jobs when those exist for objects — until then, record health on the device and accept scripted destroy in tests.

### Raze — Blast Pack (Q) — source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 200 | sheet |
| maxCharges | 2 | sheet |
| durationSec / autoDetonateSec | 5 / 5 | sheet |
| windupSec / armSec | 1.5 / 1.5 | sheet |
| health | 20 | sheet |
| damageMin / damageMax | 20 / 50 | sheet |
| innerRadiusM / outerRadiusM | 2 / 5 | sheet |
| objectDamageMultiplier | 2.25 | sheet |
| launchesRaze | true | sheet |
| slowsReduceLaunch | true | sheet |
| slowsReduceLaunchVerified | "11.08" | verified patch note reference on sheet field |
| hitsAllies | true | sheet |
| teamDamage | null | sheet |
| damage string | "20 to 50 (2m / 5m) only if armed" | sheet |

**Missing / unpublished:**

| Gap | Engine will… |
| --- | --- |
| equipSec | Omit or treat cast validation without equip delay until sourced; do not invent. |
| Launch strength / distance / velocity | **ASSUMED** `blastPackLaunchMm` horizontal only (§4). |
| How slows reduce launch | **DESIGN**: multiply launch displacement by existing concuss walk multiplier (bp) when caster is concussed; no new slow stats. Tag assumed coupling. |
| Bounce count | **ASSUMED** `blastPackMaxBounces` for Drill Hall segments, or 0-bounce place-at-aim until sourced — **recommend** place satchel at aim point / first wall hit without inventing bounce N; document. |
| Ally damage fraction | **No ally HP damage** until fraction sourced (despite `hitsAllies: true`). |
| Falloff 20→50 over 2→5 m | Same **DESIGN** falloff policy as Boom Bot. |
| Does Blast Pack damage Raze? | Sheet states launch; **`damagesRaze` only on Boom Bot**. **Do not assume self damage.** Launch only unless a source says otherwise. |

### Raze — Paint Shells (E) — source **sheet** (submunition fuse estimate)

| Field | Value | Tag |
| --- | --- | --- |
| costCredits | 0 | sheet |
| maxCharges | 1 | sheet |
| recharge | "2 kills" | sheet |
| equipSec | 0.8 | sheet |
| fuseSec | 2.25 | sheet |
| submunitions | 4 | sheet |
| submunitionFuseSec | 0.67 | sheet (**estimate: true**) |
| damageMin / damageMax | 1 / 55 | sheet |
| innerRadiusM | 2.5 | sheet |
| outerRadiusM | [5.5, 5.25] | sheet (array; unlabeled meaning) |
| altFire | "underhand" | sheet |

**Missing / unpublished / estimate:**

| Gap | Engine will… |
| --- | --- |
| `submunitionFuseSec` estimate | Store behind provenance **estimate**; do not promote to verified. Prefer primary fuse `fuseSec` for the primary grenade; apply estimate only to submunition jobs with `implementation` note. |
| Which outer radius is primary vs submunition | **DESIGN**: treat `5.5` as primary outer, `5.25` as submunition outer (document as design guess from array order — **or** ask owner §7). Do not invent a third value. |
| Throw speed / bounce count | Discrete throw job to aim point / wall clip; **ASSUMED** flight time stub if needed (same pattern as Flashpoint). |
| Ally damage | `hitsAllies` / `teamDamage` null → **no ally damage** until sourced. |
| Falloff 1→55 | **DESIGN** falloff policy; submunitions “deal the full grenade damage” (sheet string) → each submunition uses the same min/max + radii rules as the primary. |
| Underhand alt-fire | Out of scope unless UI exposes a second cast mode; default overhand / standard aim cast. |

### Raze — Showstopper (X) — source **sheet**

| Field | Value | Tag |
| --- | --- | --- |
| ultPoints | 8 | sheet |
| maxCharges | 1 | sheet |
| equipSec | 1.4 | sheet |
| durationSec / timeToFireSec | 10 / 10 | sheet |
| rockets | 1 | sheet |
| damageMin / damageMax | 30 / 150 | sheet |
| innerRadiusM / outerRadiusM | 4 / 7 | sheet |
| objectDamageMultiplier | 10 | sheet |
| knocksRazeBack | true | sheet |
| canSwitchAndReequip | true | sheet |

**Missing / unpublished:**

| Gap | Engine will… |
| --- | --- |
| Rocket travel speed / max range | **ASSUMED** `showstopperRocketSpeedMmPerSec` and/or hit on first enemy/wall along aim within duration. |
| Knockback magnitude | **ASSUMED** `showstopperSelfKnockbackMm` horizontal (§4). |
| Ally damage fraction | **No ally damage** until sourced. |
| Falloff 30→150 over 4→7 m | **DESIGN** falloff policy. |
| Weapon switch during ult | Ignore (`canSwitchAndReequip` not modeled). |

### ASSUMED / DESIGN constants table (engine needs; reference lacks)

| Constant | Purpose | Tag |
| --- | --- | --- |
| `boomBotSpeedMmPerSec` | Homing / patrol translation | assumed |
| `boomBotTurnDegPerSec` | Yaw rate while seeking | assumed |
| `boomBotDetectHalfAngleDeg` | Cone angle with `detectConeM` | design |
| `blastPackLaunchMm` | Horizontal self-launch distance when armed pack detonates | assumed |
| `showstopperSelfKnockbackMm` | Horizontal self knockback on rocket fire | assumed |
| `showstopperRocketSpeedMmPerSec` | Rocket travel | assumed |
| Radial falloff interpolation | Map distance ∈ [inner, outer] → damage ∈ [max, min] or [min, max] per sheet string orientation | design |
| Paint Shells outer radius roles | `5.5` vs `5.25` | design |
| Blast Pack bounce count | If any; else place-at-impact | assumed |
| Concuss × bot speed | Reuse `concussWalkSpeedMultiplierBp` | assumed coupling |
| Slows reduce Blast Pack launch | Scale `blastPackLaunchMm` by concuss multiplier when caster concussed | assumed (ties to verified 11.08 flag) |

**Do not invent numeric values in this plan.** Implementation PR fills the table with chosen integers and provenance notes in `ruleset.ts` / `raze.ts`.

## 3. Design of `projectile.homing` (Boom Bot) for the turn layer

Integer ms/mm; jobs still ordered `(timeMs, sequence, agentId)`.

### Recommended design (**design**)

1. **Cast** spends charge; after `equipSec` + `windupSec`, spawn a `Device` (or dedicated `HomingProjectile` on `World`) with HP 60, facing = caster yaw, side = caster side.
2. **Motion:** every `simStep` or fixed `homingTickMs` (can equal window auto-fire granularity or 50 ms later), advance position by assumed speed along current yaw; turn toward **nearest valid enemy** in detection cone (retarget each tick — matches `docs/effect-primitives.md` engine note).
3. **Walls:** stop or slide along wall normal; no pathfinding through walls (**design**: stop and turn along free direction).
4. **Smoke:** bot body is not a vision agent; enemies still need LOS rules only where detection requires vision — **recommend** detection uses geometric cone + range **without** requiring shooter LOS through smoke (bot “hears/sees” in cone); smoke does not block the bot’s movement. Flag if owner prefers LOS-gated detection (§7).
5. **Fog `view(side)`:** owning side always sees own Boom Bot. Enemy side sees the bot only with LOS from a living enemy agent to the bot position (treat as a visible device), unless behind wall/smoke volume rules used for agents. Radius rings: N/A (no enemiesSeeRadius field); do not show a detect cone to enemies.
6. **Concuss:** if a concuss status is applied to the device (from future/foreign abilities), multiply speed by `concussWalkSpeedMultiplierBp`. Boom Bot does not apply concuss itself.
7. **Detonation:** per §2 sequence; damage zone ignores Raze (`damagesRaze: false`); no ally damage.

Works inside a planning window: bot continues via `pendingJobs` / followup ticks across `windowEnd` the same way Incendiary ticks do today.

### Alternative (**design**)

**Waypoint patrol without continuous retarget:** bot drives straight along cast yaw until cone acquires a target, then homes only after lock; if lock lost, resume straight. Simpler, less “seeks each tick,” worse match to the primitives doc note. Prefer the recommended retarget-each-tick design.

## 4. Raze self-launch (Blast Pack / Showstopper)

Flat Drill Hall: **horizontal displacement only** (same rule as Rolling Thunder knockup withheld).

| Ability | Sheet | Model |
| --- | --- | --- |
| Blast Pack | `launchesRaze: true`; slows reduce launch (11.08) | On armed detonation, move Raze away from pack center (or along caster→pack yaw) by `blastPackLaunchMm`, wall-clipped. If Raze concussed (or slowed when slow exists), scale by concuss multiplier. **No vertical.** |
| Showstopper | `knocksRazeBack: true` | On rocket fire, push Raze opposite aim yaw by `showstopperSelfKnockbackMm`, wall-clipped. **No vertical.** |

Flag: magnitudes are **assumed**; do not invent heights; do not use Rolling Thunder’s estimate 7 m. Until assumed constants are chosen in implementation, casts may apply **0 mm** displacement with `notModeled: launchMagnitude` — **recommend** pick assumed mm in the implementing PR and tag provenance rather than shipping 0 silently.

## 5. Signature recharge on kills (Paint Shells)

**General enough for later duelist 2-kill signatures; implement only Paint Shells now.**

| Concern | Design |
| --- | --- |
| Where kill counts live | On `AgentBody` / `AgentInstance`: `signatureKillProgress: Record<abilityId, number>` or a single `signatureKillsTowardCharge` while the signature ability id is known from definition. |
| What counts | A kill event where this agent is the **killer** in the existing ult ledger / shot-kill path (`SimEvent` kill). Assists do not count (`givesUltPoints: false` already). |
| Threshold | At 2 kills, add 1 charge to Paint Shells if below `maxCharges`, then reset that ability’s progress to 0. |
| Per round | **Reset progress at round start** (and on `openRound`). Charges bought/granted mid-round persist as today. |
| Interaction with ult ledger | Orthogonal: kills still grant ult points per existing rules; signature progress is a separate counter. Spending ult for Showstopper does not clear signature kills. |
| Window / live | Counter updates inside `applyJob` when a kill is recorded so both `resolveWindow` and a future live stepper see it. |

## 6. File-by-file change plan, tests, UI

### Files

| Area | Plan |
| --- | --- |
| `src/sim/agents/abilities/raze.ts` | IDs + `AbilityDefinition` for all four; sheet provenance; `implementation: "complete"` when resolve exists. |
| `src/sim/agents/abilities/raze-resolve.ts` | Cast + followup jobs: homing ticks, satchel arm/detonate, grenade/submunition, rocket. |
| `src/sim/agents/catalog.ts` | Register Raze as shipped executable agent. |
| `src/sim/types.ts` / `run.ts` | Device/projectile fields for homing yaw, HP, arm timers; jobs `homing-tick`, `satchel-detonate`, `submunition-burst`, `rocket-resolve`; rejection codes if needed. |
| `src/sim/agents/state.ts` | `signatureKillProgress` (or equivalent). |
| `src/sim/combat/` or kill path in `run.ts` | On kill, bump signature progress + maybe grant charge. |
| `src/sim/effects/` | Shared **DESIGN** falloff helper `damageAtRadius(distance, inner, outer, dMin, dMax)`. |
| `src/sim/round.ts` | Cast orders already support aim / mapTarget; ensure Raze casts validate ownership/charges/ult. |
| `view(side)` | Boom Bot visibility rules (§3). |
| `src/rules/ruleset.ts` | ASSUMED / DESIGN constants table entries with provenance. |
| UI | See below. |
| Tests | `tests/sim/raze.test.ts` (+ catalog drift vs `agent-reference.json`). |

### Vitest list

1. **Catalog drift:** every Raze sheet field used by the engine matches `agent-reference.json` (same pattern as Breach/Brimstone).
2. **Ownership:** non-Raze casting Boom Bot → `ability-not-owned`.
3. **Charges:** Blast Pack 2→1→0; Boom Bot / Paint Shells single charge spend.
4. **Ult gate:** Showstopper rejected below 8; accepted at 8 and points spent.
5. **Homing:** bot advances deterministically toward a visible enemy; same seed deep-equal.
6. **Detonation sequence:** enter `explodeWithinM` → wait `explodeAfterSec` → damage; Raze exempt (`damagesRaze: false`).
7. **Concuss on bot:** when concussed, speed uses assumed multiplier (fixture applies status).
8. **Blast Pack:** armed detonation damages in radii; launches Raze horizontally by assumed mm; unarmed does not deal pack damage (sheet: only if armed).
9. **Paint Shells:** primary fuse then 4 submunitions; estimate fuse tagged; 2 kills restores a charge; progress resets next round.
10. **Showstopper:** rocket resolves with falloff; self knockback horizontal; duration/timeToFire gating as designed.
11. **Fog:** enemy without LOS does not see Boom Bot; owner does.
12. **Determinism / architecture:** no `Math.random`; `sim/` free of React.
13. **Falloff helper unit tests:** endpoints at inner/outer radii match min/max orientation chosen in §7.

### UI work (React only)

| Ability | Cast UX | Overlay |
| --- | --- | --- |
| Boom Bot | Aimed cast (click sets deploy yaw / initial heading); optional click confirms. | Bot marker + facing; optional detect cone preview while arming (own side). |
| Blast Pack | Aimed throw / place click; preview inner/outer radii. | Pack device marker; launch arrow preview on detonate (optional). |
| Paint Shells | Aimed throw; preview blast radii. | Grenade / submunition zone flashes. |
| Showstopper | Aimed; ult gate like Rolling Thunder / Orbital. | Rocket path preview; self-knockback arrow. |

Reuse `castKind` / aim line / range patterns from `abilityUi.ts` + `MapView`. Add Raze to default playable drill only when stage-3 ships (not required to finish this doc).

## 7. Risks and open questions (max 6)

| # | Risk / question | Recommended answer |
| --- | --- | --- |
| 1 | Boom Bot: what is the order of `explodeWithinM` vs `explodeAfterSec`? | Enter ≤2.5 m after cone detect → arm 0.6 s → explode; leaving early cancels arm. |
| 2 | Falloff between inner and outer radii (all four abilities)? | **DESIGN** linear in radius from damageMax at innerRadius to damageMin at outerRadius (sheet strings list max with inner). Unit-test endpoints. |
| 3 | Paint Shells `outerRadiusM: [5.5, 5.25]`? | Primary 5.5 m, submunition 5.25 m (array order). Confirm with owner if wrong. |
| 4 | Blast Pack ally damage / damages Raze? | No ally HP and no self HP until sourced; launch only for Raze. |
| 5 | Homing detection through smoke / walls? | Cone + range; walls block movement and block detection through solid; smoke does **not** block bot detection (**design**). |
| 6 | Launch / rocket / bot speeds unpublished. | Named ASSUMED constants at implementation time; never silent magic numbers; withhold vertical entirely. |

---

## Out of scope

Upgrading sheet → verified; inventing missing metres/speeds in this document; implementing other duelist 2-kill signatures; spike/plant interaction with Raze; full object-HP combat beyond Boom Bot / Blast Pack health fields; live-round UI migration (see `docs/live-round-plan.md`).
