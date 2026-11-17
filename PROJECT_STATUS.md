# Project status

Updated: 21 October 2026. Milestone 1 is implemented. Git is initialized. No commit has been made.

Agent records for patch 13.08 are in `agent-reference.json`. Each ability stores the sheet's duration, effect, damage, team damage, windup, and remaining stats. That file is a reference, not the sim catalog.

## Inspection before this milestone

The workspace contained only this file. There was no package manifest, source tree, test runner, or git history. There was no application code to reuse.

`node` and `npm` are not on the system PATH. The checks below were run with a portable Node.js 24.18.1. A normal terminal in this folder will not find `npm` until Node.js is installed on the PATH.

The folder is under OneDrive and its name contains a space. Install and the production build completed there. If file watching later fails, move the project off OneDrive before adding features.

## Stack

React 19, TypeScript 6, and Vite 8. The board is SVG. Tests are Vitest 5 with Testing Library and jsdom. Lint is ESLint 10 with `typescript-eslint`. Typecheck is `tsc --noEmit`. Build is `vite build`.

No backend. No machine-learning runtime. Opponent code, when it exists, will be ordinary TypeScript.

## Architecture

One package. `src/sim`, `src/tactics`, `src/learning`, `src/persistence`, and `src/rules` do not import React or the UI. A boundary test scans those folders. The UI holds a session and renders snapshots.

```text
src/
  main.tsx
  ui/
    App.tsx
    board/MapView.tsx
    draft/DraftPanel.tsx
    timeline/Transport.tsx
    timeline/EventList.tsx
  sim/
    rng.ts
    clock.ts
    run.ts
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
    composition/team.ts
    composition/profile.ts
    composition/coverage.ts
    combat/assumed-rifle.ts
    scenario/types.ts
    scenario/default-drill.ts
  tactics/decision.ts
  learning/record.ts
  persistence/scenario-file.ts
  rules/provenance.ts
  rules/ruleset.ts
tests/
```

`runScenario` executes scenario orders only. It does not call `DecisionContext` or write learning records. Those modules export their contracts and version constants so later milestones can fill them without reshaping the runner.

Coverage is the only composition evaluator. `PLANNED_EVALUATORS` names map suitability, synergy, counter-composition, and supported plans. `evaluateCoverage` accepts an opposing profile and does not score it. A coverage report is not a match prediction.

## Simulation state and randomness

`runScenario` and `openSession` / `stepSession` do not render. React stores the latest session. Play, pause, and step call the session. The board reads positions, charges, and smokes from the snapshot at the cursor.

Time is integer milliseconds. Positions are integer millimeters. The queue orders events by `(timeMs, sequence, agentId)`.

`src/sim/rng.ts` forks named streams from the scenario seed. The combat stream is `combat`. The simulation does not call `Math.random`. A withheld shot does not draw. A resolved shot stores hit chance, in basis points, and the draw as separate fields. Smoke placement is deterministic.

Identical scenario, ruleset, catalog version, and seed deep-equal. Seeds 1 and 2 change the rifle draw and keep the same hit chance.

## Rules and provenance

Standard ruleset id: `standard-competitive`.

| Rule | Scope in this build | Tag |
| --- | --- | --- |
| Team size 5 | `teamSize` | secondary. Wiki gameplay summary says ten players are split into two teams. Not confirmed in the live client. |
| Agent uniqueness | `per-team` | secondary. The same page says one of each agent can be selected on each team, and that the other team's locks stay hidden until the first buy phase. That is not a cross-team ban. Not confirmed in the live client, so it is not verified. |
| `per-match` and `none` | selectable on a ruleset | available for later modes and tests. They are not the standard ruleset. |

The same agent may be drafted on both teams. A second copy on one team is rejected. A sixth member is rejected.

Sky Smoke figures are secondary, from the Sky Smoke wiki page: 3 charges, 100 credits, 19.25 s, 1 s deploy, 4.15 m radius, 55 m cast range. They were not re-measured in the client. Patch 13.05 is the primary source for blocking ending once the smoke is gone. The instant cutoff at `expiresAtMs`, and the rule that any intersection with the disk blocks sight, are assumed. There is no fade.

Rifle A is an original assumed weapon. It is not a Valorant rifle. Body damage is 40. Hit chance falls from 7500 to 2500 basis points over 15 m. A draw below the chance hits. There is no headshot, armor, spray, or reload.

The drill starts with recorded charge pools already full. That setup note is assumed. It is not a buy phase.

Unimplemented ability stats are omitted rather than copied in as if they were active.

| Agent | Role tag | Live ability | Other abilities |
| --- | --- | --- | --- |
| Brimstone | Controller, secondary, wiki page read this session | Sky Smoke, signature, complete | Stim Beacon, Incendiary, Orbital Strike are placeholders |
| KAY/O | Initiator, secondary, wiki page read this session | none | FLASH/DRIVE is a basic flash placeholder. ZERO/point is the signature placeholder. FRAG/ment and NULL/cmd are placeholders |
| Jett | Duelist, secondary. The Jett page was not re-fetched this session | none | Cloudburst is a basic smoke placeholder and does not grant smoke coverage. Tailwind is the signature entry placeholder. Updraft is not treated as entry. Blade Storm is a placeholder |
| Cypher | Sentinel, secondary. The Cypher page was not re-fetched this session | none | Trapwire is a basic flank-watch placeholder. Spycam is the signature placeholder. Cyber Cage and Neural Theft are placeholders |

Slot labels for the unimplemented kits come from the abilities wiki table and are secondary. Sova and every unlisted agent are absent from the catalog.

## Milestone 1 result

Seeded Drill Hall drill with a real draft.

Drill Hall is an original two-room schematic with a doorway, a dividing wall, and Site A. It is not a Valorant map.

Default scenario: Brimstone on attack walks to the doorway and casts Sky Smoke. Jett on defense holds the angle. The shot during the smoke is withheld. The shot after expiry resolves with Rifle A. The user can replace either agent, add catalog agents up to five per team, inspect a kit, and read coverage. Play, pause, and step follow the engine log. Export and import round-trip scenario JSON version 1.

### Checks

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

## Agent reference review (21 October 2026, revised sheet)

A second patch 13.08 roster sheet was checked against Riot notes 13.08, 11.08, and 7.04, and against the Weird Gloop wiki stat tables. It was not copied into the catalog. Hush is announced for 27 October 2026 and is not a live agent.

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
- Trapwire no longer says 50% or tether. The 4m distance and 5 damage are on the wiki page fetched in this review. Reveal is not only on the zap: the 11.08 history says the wire reveals when the windup finishes if it was not destroyed, or when the player moves 4m away. Crossing applies the slow immediately.
- Duelist two-kill recharge covers Tailwind, Paint Shells, Neon's slide, Refract, Curveball, Gatecrash, and Hush Displacement. Double Tap, Reyna's orb spend, and Neon's sprint battery are the exceptions.

Still secondary, and not copied into the catalog:

- Stim wording. The 11.08 unification block states reload time 0.9 and draw time 0.9. The same note also describes a 10% draw-speed increase, which is a time multiplier of about 0.909. Brimstone's movement bonus is a separate 10%. Miks and Veto use the sheet's +10% shorthand.
- Ult points from a kill, death, orb, plant, or defuse. Ally damage is stored only where an ability row states it. The sheet says reduced to allies for Incendiary, Orbital Strike, and Blaze, and it does not give a fraction. Bullets do not damage teammates.
- Deadlock's quick-reference row, if it still lists GravNet on C. The detailed keys are the ones that match the wiki.

A live smoke or cage blocks the look a flash needs, and that block ends when the volume ends. Patch 13.05 fixed Brimstone smokes and Cyber Cages that kept blocking line-of-sight abilities after they should have stopped. Suppress stops casts. Concuss, nearsight, slow, hinder, decay, vulnerable, and detain stay separate. Two vision blockers can share a coverage kind only with their own duration, radius, charges, and deploy delay attached.

## Known limitations

- One original map and four agents. Only Sky Smoke executes.
- No flash, dash, trip, spike, economy, buy phase, or ultimate effect.
- No opponent choice, tendency update, or difficulty preset.
- No IndexedDB. Persistence is versioned JSON text.
- Jett's Tailwind page and Cypher's Trapwire and Cyber Cage pages were opened for the revised sheet. Their roles were not re-fetched as separate pages.
- Uniqueness and team size are secondary, not client-verified.
- Drill Hall is 20 m wide, so the secondary 4.15 m smoke covers a large part of the doorway. That is the recorded radius on this small schematic.
- `npm` is not on PATH in this environment.

## Roadmap

1. **Done.** Drill, catalog, live smoke, both-team draft, coverage, JSON scenario.
2. **Next.** KAY/O FLASH/DRIVE, Jett Tailwind, and Cypher Trapwire. Ownership, charges, timing, and geometry. Keep every new number secondary or verified. Definitions already exist as placeholders.
3. Richer draft report: map fit, synergies, counter-composition, and which plans a composition can support. Suitability stays separate from any win claim.
4. More complete kits and Sova recon. Each new ability flips its own status.
5. Versioned weapons and armor. Replace Rifle A only where a primary source exists.
6. Beliefs. Smokes, and later trips and recon, limit what a decision context may contain.
7. Spike plant and defuse, including post-plant utility that exists.
8. Economy, ability purchases, and signature replenishment.
9. Halves, side switch, overtime.
10. Planner. Steps name the agent, resources, timing, dependencies, and fallbacks. Beginner and Intermediate presets.
11. Feasible plans change with the draft, deaths, and spent utility.
12. Learning records keyed by agent, sequence, map, side, economy band, and both composition ids. Radiant and VCT read that store under the same rules.
13. Replay judgments and batch comparison.

## Next task

Implement milestone 2: make FLASH/DRIVE, Tailwind, and Trapwire executable, with tests for ownership, charges, timing, and geometry. Tag these from the sources already opened: FLASH/DRIVE underhand maximum 2.25s (11.08), Trapwire windup 0.7s (13.00), Tailwind windup 1s and dash window 7.5s (7.04). Leave Trapwire slow potency and the 11m dash distance unmarked. If Nightfall decay is stored later, use 75 from the US 11.08 note and keep the wiki's 80 beside it. Store nearsight radii per ability: Prowler 7m, Paranoia 7.5m, Leer 6m, Seekers 7.5m.
