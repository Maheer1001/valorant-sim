# Project status

Updated: 17 November 2026. Milestone 2 remains in place. **Stage 1 is complete** for Breach + Brimstone kits. **Interactive cast UI is playable** in the browser (plan a window, Resolve, watch overlays + event log).

Agent records for patch 13.10 are in `agent-reference.json`. That file is a reference, not the sim catalog. Breach and Brimstone catalog numbers are guarded against drift by `tests/sim/breach.test.ts` and `tests/sim/brimstone.test.ts`.

## Stack

React 19, TypeScript 6, and Vite 8. The board is SVG. Tests are Vitest 5 with Testing Library and jsdom. Lint is ESLint 10 with `typescript-eslint`. Typecheck is `tsc --noEmit`. Build is `vite build`. Aggregate gate: `npm run check` (lint → typecheck → test → build).

No backend. No machine-learning runtime. Opponent code, when it exists, will be ordinary TypeScript.

## Architecture

One package. `src/sim`, `src/tactics`, `src/learning`, `src/persistence`, and `src/rules` do not import React or the UI. A boundary test scans those folders. The UI holds a session or interactive round and renders snapshots.

```text
src/
  main.tsx
  ui/
    App.tsx
    board/MapView.tsx
    board/coords.ts
    draft/DraftPanel.tsx
    orders/AgentPanel.tsx
    orders/abilityUi.ts
    orders/rejectionMessages.ts
    scenario/playableDrill.ts
    timeline/Transport.tsx
    timeline/EventList.tsx
  sim/
    rng.ts
    clock.ts
    run.ts
    round.ts
    session.ts
    describe.ts
    map/geometry.ts
    map/line-of-sight.ts
    map/drill-hall.ts
    agents/definition.ts
    agents/catalog.ts
    agents/state.ts
    agents/cast.ts
    agents/abilities/sky-smoke.ts
    agents/abilities/breach.ts
    agents/abilities/breach-resolve.ts
    agents/abilities/brimstone.ts
    agents/abilities/brimstone-resolve.ts
    effects/status.ts
    effects/geometry-aoe.ts
    composition/team.ts
    composition/profile.ts
    composition/coverage.ts
    combat/assumed-rifle.ts
    combat/ult-points.ts
    economy/buy.ts
    scenario/types.ts
    scenario/default-drill.ts
  tactics/decision.ts
  tactics/defense-stub.ts
  learning/record.ts
  persistence/scenario-file.ts
  rules/provenance.ts
  rules/ruleset.ts
tests/
```

`runScenario` executes scenario orders only. It does not call `DecisionContext` or write learning records. Those modules export their contracts and version constants so later milestones can fill them without reshaping the runner.

`openRound` / `submitPlan` / `resolveWindow` run the interactive turn layer. Both sides submit a plan for a fixed window; the shared event queue drains `[t, t + windowMs]` with the same `(timeMs, sequence, agentId)` ordering. `view(side)` returns fog-of-war. `defenseHoldPlan` is a hold-position stub in `tactics/`.

Coverage is the only composition evaluator. `PLANNED_EVALUATORS` names map suitability, synergy, counter-composition, and supported plans. `evaluateCoverage` accepts an opposing profile and does not score it. A coverage report is not a match prediction.

## Simulation state and randomness

`runScenario` and `openSession` / `stepSession` do not render. The interactive UI stores a `Round`. Play, pause, and step walk the last resolved window log. The board reads positions, charges, and smokes from the stepped snapshot, fogged to attack view unless truth mode is on.

Time is integer milliseconds. Positions are integer millimeters. The queue orders events by `(timeMs, sequence, agentId)`.

`src/sim/rng.ts` forks named streams from the scenario seed and can resume a stream from a saved mulberry32 state across windows. The combat stream is `combat`. The simulation does not call `Math.random`. A withheld shot does not draw. A resolved shot stores hit chance, in basis points, and the draw as separate fields. Smoke placement is deterministic.

Identical scenario, ruleset, catalog version, seed, and window plans deep-equal. Seeds 1 and 2 change the rifle draw and keep the same hit chance.

## Rules and provenance

Standard ruleset id: `standard-competitive`.

| Rule | Scope in this build | Tag |
| --- | --- | --- |
| Team size 5 | `teamSize` | secondary. Wiki gameplay summary says ten players are split into two teams. Not confirmed in the live client. |
| Agent uniqueness | `per-team` | secondary. The same page says one of each agent can be selected on each team, and that the other team's locks stay hidden until the first buy phase. That is not a cross-team ban. Not confirmed in the live client, so it is not verified. |
| `per-match` and `none` | selectable on a ruleset | available for later modes and tests. They are not the standard ruleset. |
| Planning window 3000 ms | `windowMs` | assumed. Lab turn length for simultaneous plans. Not a Valorant timer. |
| Walk speed 3500 mm/s | `walkSpeedMmPerSec` | assumed. Matches the milestone-1 drill script. Not a measured Valorant walk speed. |
| Auto-fire interval 1000 ms | `autoFireIntervalMs` | assumed. Agents without a shoot order auto-engage the nearest visible enemy with Rifle A on this interval. Not a Valorant fire rate. |
| Starting credits 800 | `startingCredits` | assumed. Drill buyCharge stub only. Not a live buy phase. |
| Concuss walk multiplier 7000 bp | `concussWalkSpeedMultiplierBp` | assumed. Lab stand-in for concuss slow. |
| Concuss hit penalty 2000 bp | `concussHitChancePenaltyBp` | assumed. Subtracted from Rifle A hit chance while concussed. |
| Flash look half-angle 90° | `flashLookHalfAngleDeg` | assumed / design. Looking-at flash until a measured cone exists. |
| Flashpoint flight 400 ms | `flashpointFlightMs` | assumed. `travelSpeed` 2400 has no unit in the reference and is not converted. |
| Rolling Thunder knockback 1500 mm | `rollingThunderKnockbackMm` | assumed horizontal displacement per blast. Vertical knockup estimate withheld. |
| Incendiary floor spacing 4000 mm | `incendiaryFloorSpacingMm` | assumed flat-map floor-contact spacing. |
| Incendiary tick 6 / 100 ms | `incendiaryTickDamage` / `incendiaryTickIntervalMs` | design batch of sheet 1×60 ticks/s (same 60 DPS). |
| Stim Beacon pulse 500 ms | `stimBeaconPulseMs` | assumed buff refresh cadence. |

The same agent may be drafted on both teams. A second copy on one team is rejected. A sixth member is rejected.

Sky Smoke figures are secondary, from the Sky Smoke wiki page: 3 charges, 100 credits, 19.25 s, 1 s deploy, 4.15 m radius, 55 m cast range. They were not re-measured in the client. Patch 13.05 is the primary source for blocking ending once the smoke is gone. The instant cutoff at `expiresAtMs`, and the rule that any intersection with the disk blocks sight, are assumed. There is no fade.

Rifle A is an original assumed weapon. It is not a Valorant rifle. Body damage is 40. Hit chance falls from 7500 to 2500 basis points over 15 m. A draw below the chance hits. There is no headshot, armor, spray, or reload. Starting hp is 100 (assumed). Death is `hp <= 0`.

The drill starts with recorded charge pools already full. That setup note is assumed. It is not a buy phase.

Unimplemented ability stats are omitted rather than copied in as if they were active.

| Agent | Role tag | Live ability | Other abilities |
| --- | --- | --- | --- |
| Brimstone | Controller, secondary, wiki page | Stim Beacon, Incendiary, Sky Smoke, Orbital Strike — all complete | Incendiary/Orbital sheet-sourced; no ally damage (no published fraction). Incendiary/Orbital grant area-denial coverage. |
| Breach | Initiator, secondary, wiki page | Aftershock, Flashpoint, Fault Line, Rolling Thunder — all complete (verified 13.10 numbers) | Rolling Thunder marks `notModeled: verticalKnockup (estimate withheld, flat map)` |
| KAY/O | Initiator, secondary, wiki page | none | FLASH/DRIVE is a basic flash placeholder. ZERO/point is the signature placeholder. FRAG/ment and NULL/cmd are placeholders |
| Jett | Duelist, secondary | none | Cloudburst is a basic smoke placeholder and does not grant smoke coverage. Tailwind is the signature entry placeholder. Updraft is not treated as entry. Blade Storm is a placeholder |
| Cypher | Sentinel, secondary | none | Trapwire is a basic flank-watch placeholder. Spycam is the signature placeholder. Cyber Cage and Neural Theft are placeholders |

Slot labels for the unimplemented kits come from the abilities wiki table and are secondary. Sova and every unlisted agent are absent from the catalog.

## Milestone 1 result

Seeded Drill Hall drill with a real draft.

Drill Hall is an original two-room schematic with a doorway, a dividing wall, and Site A. It is not a Valorant map.

Default scenario: Brimstone on attack walks to the doorway and casts Sky Smoke. Jett on defense holds the angle. The shot during the smoke is withheld. The shot after expiry resolves with Rifle A. The user can replace either agent, add catalog agents up to five per team, inspect a kit, and read coverage. Play, pause, and step follow the engine log. Export and import round-trip scenario JSON version 1.

### Checks (Milestone 1)

| Command | Result |
| --- | --- |
| `npm test` | Pass. Vitest 5.0.5, 10 files, 22 tests, 21 October 2026. |
| `npm run lint` | Pass. ESLint completed with no findings. |
| `npm run typecheck` | Pass. `tsc --noEmit` completed with no errors. |
| `npm run build` | Pass. Vite 8.3.4 produced `dist/` in 346 ms. |

Browser check on the dev server: stepping reached the active smoke on the board; removing Brimstone cleared smoke coverage and rejected the scripted smoke; Brimstone could be added to defense while attack still had Brimstone; a second Brimstone on attack was refused; play advanced the timeline to event 2 and pause held it there.

### Acceptance

1. The four commands above succeeded.
2. The isolated modules do not import React or the UI. `tests/architecture.test.ts` reads the sources.
3. Seed 4 repeats. Seeds 1 and 2 change the rifle draw and share the hit chance.
4. A wall blocks movement and sight. An active Sky Smoke blocks sight. At the expiry timestamp the same ray is clear.
5. Shot events store `hitProbabilityBp` and `draw` separately. Withheld shots do not draw.
6. Sky Smoke spends one charge, from 3 to 2. At zero charges the cast is `insufficient-charges` and no smoke is created.
7. Jett casting Sky Smoke is `ability-not-owned`. Cloudburst is `ability-not-executable`.
8. A sixth agent is `team-full`. A second copy on the same team is `duplicate-agent`. The same agent on the other team is legal under the standard ruleset.
9. Five fixture duelists with complete entry tools are legal. Their report is an entry overlap of 5 and a smoke gap. The shipped Jett kit contributes no smoke offer. A controller label with only a placeholder smoke also contributes no smoke offer.
10. Removing Brimstone rejects the scripted cast with `unknown-agent` and creates no smoke.
11. JSON parse preserves teams, assignments, charges, seed, and catalog version. Version 2 throws `unknown-version`.
12. The draft panel lists the four agents, shows implementation badges, and the attack coverage text loses Brimstone Sky Smoke when he is removed.
13. Step and play advance the session cursor. The event list is the session log.

## Milestone 2 result

Interactive chess-like planning windows on Drill Hall.

Each side submits orders for a 3000 ms window (assumed). `resolveWindow` merges both plans into the existing event queue and drains through the window end. Defense uses a hold stub. Attack plans from the UI: select an attacker, click the map to queue a move or Sky Smoke, then resolve. The board shows `view('attack')` by default, with a truth toggle. Timeline play/pause/step walks the last window's event log.

Window orders: hold, move (assumed walk speed, walls clip), cast (existing validation and rejection codes), shoot a named visible enemy. Agents without a shoot order auto-engage the nearest visible enemy on the assumed auto-fire interval with Rifle A. Invalid plans are rejected entirely with a typed reason and are not stored.

### Checks (Milestone 2)

| Command | Result |
| --- | --- |
| `npm test` | Pass. Vitest 5.0.5, 11 files, 29 tests, 17 November 2026. |
| `npm run lint` | Pass. ESLint completed with no findings. |
| `npm run typecheck` | Pass. `tsc --noEmit` completed with no errors. |
| `npm run build` | Pass. Vite 8.3.4 produced `dist/` in 171 ms. |

### Acceptance

1. Same seed and plans deep-equal; a different seed changes the draw but not the hit chance.
2. Both sides' same-time actions resolve in queue order (`timeMs`, then `sequence`, then `agentId`), not attacker-first.
3. Walls block movement. An active smoke blocks auto-engage until it expires.
4. An invalid order rejects the whole plan with a typed reason.
5. `view('attack')` hides an enemy behind a wall and shows them once in line of sight.
6. Existing Milestone 1 tests still pass. Architecture boundary test still passes.

## Agent reference review (17 November 2026, patches 13.09 / 13.10)

`agent-reference.json` is now patch 13.10, recorded 2026-11-17. It stays a reference file, not the sim catalog. New source tag: `aggregator` = third-party site that says it reads game files, not checked against the files or a primary page.

13.09 / 13.10 data updates in the file:

- Clove Pick-me-up bonus movement speed 15% → 10% (secondary, Liquipedia 13.09).
- Clove Not Dead Yet: killing Clove after cast grants the killer 1 ult point and 1 signature refresh point; earlier rewards not stated and not guessed (secondary).
- `buffTerms`: Haste (movement speed), Combat Stim (fire rate / equip / reload / recovery), Snapshot (still-image silhouette reveal). Haste shown by Stim Beacon, Pick-me-up, Harmonize, High Gear, Overdrive, and Waylay Convergent Paths (renamed to Haste). Snapshot from Neural Theft and Spycam. Names only (secondary).
- Cypher Spycam destroy cooldown 60s → 45s, reclaim 15s → 20s (verified, Riot 13.10). Killjoy Turret and Vyse Arc Rose destroy cooldowns 60s → 45s (verified). Sage Healing Orb: ally targeting accuracy and visible crosshair note only (verified).
- `rules.assists`: damageAssist (>10 damage within 3s), totalDamageAssist (≥50 damage whenever dealt), healingAssist (kill within 10s after heal ends); `givesUltPoints: false` matches the existing ult-point rule (verified for the three assist definitions).
- Hush is live (file id 30; Riot calls Hush Agent 31 — not used as the id). Keys C Flow, Q Flashbulb, E Displacement, X Suspension, plus Telekinesis. Aggregator raw units are stored unlabeled and not converted to meters.
- Deadlock keys in JSON were already C Barrier Mesh, Q Sonic Sensor, E GravNet; left unchanged.

Still unconfirmed for Hush: Telekinesis range; Flashbulb charges; Flow levitate duration; Flashbulb radius; Displacement/Suspension radius units; costs and numbers not confirmed by a primary source opened here. Displacement aggregator concuss 1.5s conflicts with the standardised 2.5s Concuss list in globals; both are kept.

## Agent reference review (21 October 2026, revised sheet)

A second patch 13.08 roster sheet was checked against Riot notes 13.08, 11.08, and 7.04, and against the Weird Gloop wiki stat tables. It was not copied into the catalog. Hush was then announced for 27 October 2026; the 17 November 2026 update above records Hush as live in the reference file.

The revision fixes several earlier mismatches, and those fixes match the sources:

- Deadlock's detailed rows and the sheet's own key note match the wiki: C Barrier Mesh, Q Sonic Sensor, E GravNet. The quick-reference row still lists GravNet on C and Barrier Mesh on E.
- Trapwire's 1.25s slow, 5 damage, 4m leave distance, 15m wire, 20m place distance, 1.5s arm, 2s re-arm, and 0.7s windup match the wiki stat table. The 0.7s windup is also in Riot's 13.00 note. The 1.25s slow is tagged v8.08 on the wiki, and the table lists no strength. Patch 11.08 removed the tether.
- Cyber Cage does not slow. The wiki records that change in v0.50. Radius 3.72m and 7.25s duration match the game-file stats. It blocks vision and plays a sound when an enemy crosses.
- Jett Tailwind is a 1s windup and a 7.5s dash window. Riot's 7.04 note changed those from 0.75s and 12s. Dash time 0.45s is a wiki game-file stat. The 11m distance is marked estimated on the wiki, and the sheet marks it the same way. Cloudburst's 2.5s duration is in that same 7.04 note.
- Phoenix Curveball and Yoru Gatecrash are signatures with a free charge, a bought extra charge, and a 2-kill recharge. The wiki infoboxes say so. Curveball's flash windup is 0.6s (v11.00) and its maximum blind is 1.5s (v5.01). Gatecrash's beacon lasts 20s in the wiki, citing v13.01.
- Neon Fast Lane deals no damage. The wiki records that removal in v4.08. The walls are a vision block: 3.5m apart, 45m forward, 4s, then a 2s dissolve.
- Sky Smoke's wiki figures already in the sim match the sheet: 55m range, 1s deploy, 4.15m radius, 19.25s duration. Liquipedia's 10m diameter is a different size and is not used.
- Run it Back restores full health and armor up to what Phoenix had at cast. That matches the earlier wiki reading.

The sheet's author then corrected the five remaining conflicts. Those lines now match the sources:

- Nightfall decay is stored as 75 from Riot's US 11.08 note, with the wiki stat table's 80 named beside it. Duration 8s and width 20m stay in both copies.
- Nearsight radii are per ability: Prowler 7m, Paranoia 7.5m, Leer 6m, Seekers 7.5m, with the 11.08 "5m to 7m" note kept as the patch text.
- Gravity Well uses Riot's word Fragile for 2.5s and records that the wiki calls the same debuff Vulnerable.
- Trapwire no longer says 50% or tether. The 4m distance and 5 damage are on the wiki page. Reveal is not only on the zap: the 11.08 history says the wire reveals when the windup finishes if it was not destroyed, or when the player moves 4m away. Crossing applies the slow immediately.
- Duelist two-kill recharge covers Tailwind, Paint Shells, Neon's slide, Refract, Curveball, Gatecrash, and Hush Displacement. Double Tap, Reyna's orb spend, and Neon's sprint battery are the exceptions.

Still secondary, and not copied into the catalog:

- Stim wording. The 11.08 unification block states reload time 0.9 and draw time 0.9. The same note also describes a 10% draw-speed increase, which is a time multiplier of about 0.909. Brimstone's movement bonus is a separate 10%. Miks and Veto use the sheet's +10% shorthand.
- Ult points from a kill, death, orb, plant, or defuse. Ally damage is stored only where an ability row states it. The sheet says reduced to allies for Incendiary, Orbital Strike, and Blaze, and it does not give a fraction. Bullets do not damage teammates.
- Deadlock's quick-reference row, if it still lists GravNet on C. The detailed keys are the ones that match the wiki.

A live smoke or cage blocks the look a flash needs, and that block ends when the volume ends. Patch 13.05 fixed Brimstone smokes and Cyber Cages that kept blocking line-of-sight abilities after they should have stopped. Suppress stops casts. Concuss, nearsight, slow, hinder, decay, vulnerable, and detain stay separate. Two vision blockers can share a coverage kind only with their own duration, radius, charges, and deploy delay attached.

## Stage 1 result (Breach + Brimstone)

Executable in the Drill Hall round: full Breach kit and full Brimstone kit.

Shared plumbing: agent `facingDeg`, `statuses`, `ultimatePoints`, `cooldownReadyAtMs`, charges, `credits`; concuss, blind, haste, combat-stim; devices and damage zones on `World` / `RoundState`; ult ledger (+1 killer / +1 victim; orbs/plant/defuse TODO); `buyCharge`; cast `aimYawDeg` / `chargeValue` / `mapTarget`.

**Breach.** Aftershock cylinder (design axis along yaw; verified 10 m × 3 m). Flashpoint: verified wallDepth 10 m enforced as first→last wall-hit span; corridor uses verified range 35 m with design half-width 4 m; smoke still blocks look. Fault Line / Rolling Thunder as in part 1.

**Brimstone.** Sky Smoke cast places via `mapTarget ?? target`. Stim Beacon: 6 m, 12 s, indestructible, enemies cannot see radius in `view(side)`; allies get Combat Stim (fire rate 1.1 shortens auto-fire interval; reload/draw/spread stored on the status, no other sim effect yet) and Haste (movement 1.1); 4 s linger after leaving. Incendiary: up to 2 floor bounces (assumed spacing) then detonate; 4.5 m zone; spread radius grows linearly (design); 6 damage / 100 ms (design); no ally damage. Orbital Strike: mapTarget within 60 m, 2 s windup, 20 / 0.15 s for 3 s, 0.75 s linear shrink (design), LOS block via smoke volume; no ally damage.

### Assumed / design constants added in stage 1 part 2

| Constant | Value | Tag |
| --- | --- | --- |
| `incendiaryFloorSpacingMm` | 4000 | assumed |
| `incendiaryTickDamage` | 6 | design |
| `incendiaryTickIntervalMs` | 100 | design |
| `stimBeaconPulseMs` | 500 | assumed |
| Flashpoint corridor half-width | 4000 mm | design |
| Incendiary spread radius growth | linear 0→full over 0.75 s | design |
| Orbital shrink radius | linear full→0 over 0.75 s | design |

### Checks (Stage 1 — `npm run check`, 17 November 2026)

| Step | Result |
| --- | --- |
| lint | Pass. ESLint completed with no findings. |
| typecheck | Pass. `tsc --noEmit` completed with no errors. |
| test | Pass. Vitest 5.0.5, 15 files, 65 tests. |
| build | Pass. Vite 8.3.4 produced `dist/` in 267 ms (49 modules). |

## Interactive cast UI (17 November 2026)

React-only playable Drill Hall round. Default attack = Breach + Brimstone; defense = KAY/O + Jett via `defenseHoldPlan`. Draft panel and scenario import/export still work.

**Order builder (per selected attacker):** Move (board click), Hold, Cast — only complete owned abilities. Aimed casts (Aftershock, Flashpoint, Fault Line, Rolling Thunder, Incendiary, Stim Beacon) set `aimYawDeg` from agent→click with an aim line. Map-targeted casts (Sky Smoke, Orbital Strike) show cast-range ring + ability-radius preview; out-of-range clicks show a plain-language message. Fault Line has an 8–56 m charge-length slider → `chargeValue`. Cast buttons show charges, ult `x/8`, Fault Line cooldown remaining; disabled with tooltip when charges / cooldown / ult would reject.

**Board overlays** (from fogged or truth snapshot): smokes, incendiary zones (live radius), Orbital circle + shrink, Stim Beacon radius for own team only, facing arrows, status badges with seconds left, HP bars, ult points. Fog toggle: `view('attack')` default, truth for debug.

**Agent panel:** HP, facing, credits, charges, ult, signature cooldown, statuses; Buy per buyable ability → `buyCharge` with rejection text.

**Drill option (assumed):** starting ult points per agent (default 0) to test ultimates.

**Plan errors:** every typed rejection code maps to plain language (`src/ui/orders/rejectionMessages.ts`). Event log humanizes flash, concuss, damage tick, zone start, ult spend, kill.

**Coords:** pure helpers in `src/ui/board/coords.ts` (svg↔mm, yaw, point-in-range) with unit tests. No sim logic duplicated in the UI.

Manual checklist: [`docs/playtest.md`](docs/playtest.md).

**Orbital Strike damage note (Part A):** a defender who stays inside for the full activation (including shrink) takes **400** total (20 × 20 ticks), inside the 400–500 reference band. No engine change.

### Checks (Cast UI — `npm run check`, 17 November 2026)

| Step | Result |
| --- | --- |
| lint | Pass. ESLint completed with no findings. |
| typecheck | Pass. `tsc --noEmit` completed with no errors. |
| test | Pass. Vitest 5.0.5, 17 files, 78 tests. |
| build | Pass. Vite 8.3.4 produced `dist/` in 207 ms (54 modules). |

## Known limitations

- One original map. Five catalog agents. Executable: full Breach + full Brimstone. Jett / KAY/O / Cypher stay placeholders.
- Combat Stim reload, draw, and spread recovery are stored on the status only — no reload/draw/spread sim yet.
- Flashpoint `travelSpeed` 2400 unit unknown — flight timing is an assumed stub.
- Rolling Thunder vertical knockup (estimate 7 m) is not modeled.
- Incendiary / Orbital ally damage fraction unpublished — no friendly fire.
- `buyCharge` is a minimal stub with a per-ability Buy button — not a full shop / buy phase.
- Ult orbs, plant, and defuse points are out of scope (TODO on the ledger). Starting ult in the UI is a **drill option, assumed**, not live economy.
- Defense is a hold stub. No opponent choice, tendency update, or difficulty preset.
- Drill Hall is smaller than Sky Smoke 55 m / Orbital 60 m cast ranges, so out-of-range map clicks cannot occur on this map; the UI still guards with `pointInRange` + message (covered by unit tests).
- No IndexedDB. Persistence is versioned JSON text.
- Uniqueness and team size are secondary, not client-verified.
- Planning window, walk speed, auto-fire interval, and the assumed/design tables above are lab values.
- No armor. Auto-engage and player shoot orders use Rifle A only.
- Mid-window moves that finish after the window end are advanced by integer lerp and carried in the pending queue.

## Roadmap

1. **Done.** Drill, catalog, live smoke, both-team draft, coverage, JSON scenario.
2. **Done.** Interactive planning windows, fog-of-war view, defense hold stub, auto-engage, hp/death.
3. **Done.** Stage 1 per [`docs/stage-1-plan.md`](docs/stage-1-plan.md): Breach + Brimstone fully executable. Primitives docs: [`docs/effect-primitives.md`](docs/effect-primitives.md).
4. **Done.** Interactive cast UI: aim / map-target / Fault Line charge, overlays, agent panel, event log, playtest doc.
5. Richer draft report: map fit, synergies, counter-composition, and which plans a composition can support. Suitability stays separate from any win claim.
6. More complete kits and Sova recon. Each new ability flips its own status.
7. Versioned weapons and armor. Replace Rifle A only where a primary source exists.
8. Beliefs. Smokes, and later trips and recon, limit what a decision context may contain. Wire `view(side)` into `DecisionContext`.
9. Spike plant and defuse, including post-plant utility that exists.
10. Economy, ability purchases, and signature replenishment.
11. Halves, side switch, overtime.
12. Planner. Steps name the agent, resources, timing, dependencies, and fallbacks. Beginner and Intermediate presets.
13. Feasible plans change with the draft, deaths, and spent utility.
14. Learning records keyed by agent, sequence, map, side, economy band, and both composition ids. Radiant and VCT read that store under the same rules.
15. Replay judgments and batch comparison.

## Next task

Richer draft / composition reporting, or the next executable kits beyond Breach + Brimstone. Keep sim free of React.
