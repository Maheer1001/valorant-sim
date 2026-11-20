# Parallel build plan

Tag: **design**. Written 20 November 2026 alongside the wave 1 stage plans. Planning only; nothing here is implemented.

Baseline at the time of writing: `npm run check` green at commit `08d2dfb` (lint, typecheck, 25 test files / 156 tests, build).

This document answers four questions for every stage in [`roadmap.md`](roadmap.md):

1. Which files will it most likely touch?
2. Which stages can be built at the same time without touching the same file or depending on each other?
3. Which files are hot spots, and how do we stop them causing merge conflicts?
4. In what order do branches merge, and what must each branch pass first?

## 1. How the file lists were made

- **Stages with a plan** (G1-G6, O1, O2, X1, D1, K3, K4, K5): taken from section 8 "Files touched" of each `docs/stage-<id>-plan.md` (K3 from the file table in [`stage-3-plan.md`](stage-3-plan.md)). Each plan's writer read the code before listing files.
- **Stages without a plan yet** (K6-K24, X2-X4, O3-O6, D1 parts 2 and 3): predicted from how existing code is wired, verified by reading it:
  - A kit today is wired through `src/sim/agents/abilities/<agent>.ts` and `<agent>-resolve.ts` (new files), plus `src/sim/agents/catalog.ts` (the agent list), `src/sim/run.ts` (imports `tryResolve<Agent>Cast`, dispatches it in the `cast` branch of `applyJob`, and holds the `Job` and `SimEvent` unions), `src/sim/types.ts` (`RejectionCode`, `Device`), `src/rules/ruleset.ts` (assumed constants), `src/ui/board/previews.ts` (one `case` per ability id), `src/ui/orders/abilityUi.ts` (`castKind`), `src/ui/board/MapView.tsx` (overlays; it imports `zoneRadiusMm` from `brimstone-resolve.ts`), `src/sim/describe.ts` (22 event cases), `src/ui/scenario/playableDrill.ts` and `src/ui/App.tsx`.
  - `src/ui/App.tsx` is one `App()` component of about 1,150 lines that owns pre-round, live, setup drawer and replay state.

## 2. Files per stage

"Shared" lists existing files the stage modifies. "Own" lists the main new files (tests omitted). Paths are under `src/` unless they start with another top-level folder.

### Planned stages

| Stage | Depends on | Shared (existing files modified) | Own (new) |
| --- | --- | --- | --- |
| X1 Channels | live | `sim/run.ts`, `sim/live-round.ts`, `sim/types.ts`, `sim/clock.ts`, `sim/describe.ts`, `sim/agents/definition.ts`, `sim/agents/abilities/breach-resolve.ts`, `brimstone-resolve.ts`, `ui/board/MapView.tsx`, `ui/orders/AgentPanel.tsx`, `ui/orders/rejectionMessages.ts`, `ui/App.tsx`, `ui/styles.css` | `sim/effects/channel.ts` |
| G1 Map sites | live | `sim/map/drill-hall.ts`, `sim/map/geometry.ts`, `sim/map/line-of-sight.ts`, `sim/fog.ts`, `sim/run.ts`, `sim/live-round.ts`, `ui/board/MapView.tsx`, `ui/board/coords.ts`, `ui/App.tsx`, `package.json`, `tsconfig.json` | `data/maps/drill-hall.json`, `sim/map/{types,registry,regions,load,wall-index,pathfinding,synthetic-grid}.ts`, `tools/validate-map.mjs` |
| G6 Defense pre-round | live | `sim/preround.ts`, `sim/live-round.ts`, `ui/live/replayFile.ts`, `ui/preround/planState.ts`, `ui/orders/AttackerHud.tsx`, `ui/App.tsx`, `ui/styles.css` | `ui/preround/hotSeat.ts` |
| K3 Raze | live | `sim/agents/catalog.ts`, `sim/types.ts`, `sim/run.ts`, `sim/agents/state.ts`, `rules/ruleset.ts`, `sim/live-round.ts`, `sim/fog.ts`, `ui/orders/abilityUi.ts`, `ui/board/previews.ts`, `ui/board/MapView.tsx`, `ui/App.tsx` | `sim/agents/abilities/raze.ts`, `raze-resolve.ts`, `sim/effects/falloff.ts` |
| D1 Draft report (part 1) | live | `sim/types.ts`, `sim/agents/definition.ts`, `sim/agents/abilities/{breach,brimstone,sky-smoke}.ts`, `sim/composition/{profile,coverage}.ts`, `ui/draft/DraftPanel.tsx`, `ui/styles.css`, `tests/architecture.test.ts` | `sim/composition/{tags,synergy,counter}.ts` |
| G3 Weapons + armor | live | `sim/run.ts`, `sim/live-round.ts`, `sim/types.ts`, `sim/agents/state.ts`, `sim/scenario/types.ts`, `sim/combat/assumed-rifle.ts`, `sim/economy/buy.ts`, `sim/preround.ts`, `sim/describe.ts`, `rules/ruleset.ts`, `persistence/scenario-file.ts`, `ui/preround/planState.ts`, `ui/orders/AttackerHud.tsx`, `ui/orders/rejectionMessages.ts`, `ui/App.tsx`, `ui/styles.css` | `data/weapons.json`, `sim/combat/weapons.ts` |
| O1 Beliefs | live (K4 optional) | `sim/live-round.ts` (decision cadence only), `tactics/decision.ts`, `ui/board/MapView.tsx`, `ui/App.tsx`, `ui/styles.css`, `tests/architecture.test.ts` | `tactics/beliefs.ts`, `tactics/belief-decide.ts`, `ui/board/beliefOverlay.ts` |
| K4 Sova | K3 | `sim/agents/catalog.ts`, `sim/run.ts`, `sim/live-round.ts`, `sim/fog.ts`, `sim/types.ts`, `sim/effects/status.ts`, `sim/describe.ts`, `ui/board/{MapView.tsx,previews.ts}`, `ui/orders/{abilityUi,rejectionMessages}.ts`, `ui/orders/AttackerHud.tsx`, `ui/scenario/playableDrill.ts`, `ui/App.tsx` | `sim/agents/abilities/sova.ts`, `sova-resolve.ts`, `sim/effects/{reveal,bounce-path}.ts` |
| G2 Spike | G1, X1 | `sim/run.ts`, `sim/live-round.ts`, `sim/fog.ts`, `sim/types.ts`, `sim/scenario/types.ts`, `sim/describe.ts`, `sim/combat/ult-points.ts`, `sim/effects/channel.ts` (X1-new), `rules/ruleset.ts`, `persistence/scenario-file.ts`, `ui/board/{MapView.tsx,previews.ts}`, `ui/live/RoundEndBanner.tsx`, `ui/orders/{AttackerHud.tsx,rejectionMessages.ts,hotkeys.ts}`, `ui/scenario/playableDrill.ts`, `ui/App.tsx`, `ui/styles.css` | `sim/spike.ts`, `ui/live/spikeUi.ts` |
| K5 KAY/O, Tejo | K4, X1 | `sim/agents/catalog.ts`, `sim/run.ts`, `sim/live-round.ts`, `sim/fog.ts`, `sim/types.ts`, `sim/preround.ts` (rejection text only), `sim/effects/status.ts`, `ui/board/{MapView.tsx,previews.ts}`, `ui/orders/{abilityUi,rejectionMessages}.ts`, `ui/App.tsx` | `sim/agents/abilities/{kayo,kayo-resolve,tejo,tejo-resolve}.ts`, `sim/effects/suppress.ts` |
| G4 Match | G2, G6 | `ui/live/RoundEndBanner.tsx`, `ui/App.tsx`, `ui/styles.css` | `rules/match-rules.ts`, `sim/match.ts`, `ui/live/{matchReplayFile,Scoreboard}.ts(x)`, `ui/scenario/playableMatch.ts` |
| O2 Opponent | O1, G2, G6 | `ui/App.tsx`, `ui/styles.css`, `tests/architecture.test.ts`; `sim/live-round.ts` only in O2.6 (attack bot) | `tactics/opponent/**`, `ui/setup/DifficultyPicker.tsx` |
| G5 Economy | G3, G4 | `sim/economy/buy.ts`, `sim/agents/definition.ts`, `sim/agents/abilities/{breach,sky-smoke}.ts`, `sim/match.ts` (G4-new, one line in G5.3), `ui/scenario/playableMatch.ts` (G4-new), `ui/orders/AttackerHud.tsx`, `ui/App.tsx`, `ui/styles.css` | `sim/economy/{rules,kills,round-end,carry}.ts`, `ui/preround/economyView.ts` |

Every planned stage also writes `docs/status/<stage>.md` (section 4.2).

### Stages without a plan yet (predicted)

| Stage | Depends on | Likely shared files | Likely own files |
| --- | --- | --- | --- |
| K6-K24 (each kit) | previous kit stage, plus the X stage named in the roadmap | the kit wiring list in section 1; `sim/fog.ts` for vision kits (K8 nearsight, K12 snapshot, K21 intangible); `sim/live-round.ts` for movement kits (K7 teleport, K15 pull, K19 dash) | `sim/agents/abilities/<agent>.ts`, `<agent>-resolve.ts`, `sim/effects/<primitive>.ts` |
| X2 Steering samples | live | `sim/live-round.ts` (`AgentCommand` cast and validation), `sim/run.ts` (`cast` job), `ui/orders/abilityUi.ts`, `ui/board/previews.ts` | `sim/effects/steer.ts` |
| X3 Audio cues | live | `sim/fog.ts`, `sim/live-round.ts` (`viewLive`), `ui/board/MapView.tsx` | `sim/audio.ts` |
| X4 Height stub | live | `sim/effects/status.ts`, `sim/live-round.ts` (`advanceStanding`) | `sim/effects/height.ts` |
| O3 Planner | O2 | `sim/preround.ts` (compile to `PreRoundPlan`), `ui/App.tsx` | `tactics/planner/**` |
| O4 Reactive plans | O3 | `tactics/planner/**`, `tactics/opponent/index.ts` | `tactics/planner/react.ts` |
| O5 Learning records | O3, G4, G5 | `learning/record.ts`, `sim/match.ts` (record hook), `tests/architecture.test.ts` (version pin) | `learning/store.ts` |
| O6 Replay judgments | O5 | `ui/App.tsx` | `learning/judge.ts`, `tools/batch-run.mjs` |
| D1 part 2: map fit | G1, D1 | `sim/composition/coverage.ts` (evaluator lists), `tests/architecture.test.ts`, `ui/draft/DraftPanel.tsx` | `sim/composition/map-fit.ts` |
| D1 part 3: supported plans | O3, D1 | same as part 2 | `sim/composition/supported-plans.ts` |

## 3. Hot spots

Counted over the 13 planned stages (12 wave 1 plans plus K3):

| File | Stages touching it | Why it is hot |
| --- | --- | --- |
| `src/ui/App.tsx` | 12 of 13 | One component holds all UI state and wiring. |
| `src/sim/live-round.ts` | 10 | Commands, validation, the step pipeline, results, decide cadence and plan steps all live in one file. |
| `src/ui/styles.css` | 9 | One global stylesheet. |
| `PROJECT_STATUS.md` | 8 (before the status rule below) | Every stage wanted a status line. |
| `src/sim/run.ts` | 7 | `AgentBody`, `World`, the `Job` and `SimEvent` unions, and the single `applyJob` switch. |
| `src/sim/types.ts` | 7 | The `RejectionCode` union and shared types. |
| `src/ui/board/MapView.tsx` | 7 | Every overlay is drawn inline. |
| `src/ui/orders/rejectionMessages.ts` | 5 | One `Record<RejectionCode, string>`. |
| `src/ui/orders/AttackerHud.tsx` | 5 | Buy, plan and cast controls in one HUD. |
| `src/sim/describe.ts` | 4 | Per-event text. |
| `src/sim/fog.ts` | 5 | The single visibility function. |
| `src/sim/agents/catalog.ts` | every kit stage | The shipped agent list. |

Result of scheduling as the code stands today (computed from the tables above, respecting dependencies): **the 13 planned stages need 10 sequential waves**, almost one stage at a time, because nearly every pair shares `live-round.ts`, `run.ts` or `MapView.tsx`. Treating the UI and status files as merge-time integration files (4.1) alone still leaves 10 waves. Splitting the engine hot spots first (H0, 4.3) brings it to **5 waves**.

## 4. Avoiding conflicts

### 4.1 Integration files (edited at merge, append-only)

These files are edited only by short, append-only changes, and only in the merge step (by the integrator, or as the last commit on the branch right before merge, after rebasing on main):

- `src/ui/App.tsx`: one import plus one mount line per stage. All stage UI lives in the stage's own component files.
- `src/ui/styles.css`: no new rules. Each new component imports its own `<Component>.css` (Vite supports this).
- `PROJECT_STATUS.md`, `README.md`, `docs/playtest.md`, `docs/roadmap.md`: changed only from the stage's `docs/status/<stage>.md` text (4.2).
- `src/ui/orders/rejectionMessages.ts`, `src/sim/describe.ts`: one entry per new code or event (after H0, these become registries, 4.3).
- `tests/architecture.test.ts`: only the pinned arrays or versions that the stage's plan names.

### 4.2 Status files

- Each stage writes `docs/status/<stage>.md` on its branch: what shipped, sub-stages done, the check results it actually ran, playtest steps, open questions, and the exact paragraphs to apply to `PROJECT_STATUS.md`, `README.md`, `docs/playtest.md` and `docs/roadmap.md`.
- Stage branches never edit those four shared docs. The integrator applies the text at merge, in merge order, so the shared docs are always consistent with main.
- Every wave 1 plan lists `docs/status/<stage>.md` in its files-touched table (consistency pass).

### 4.3 H0: split the engine hot spots first (wave 0)

H0 is a refactor-only stage that runs alone before wave 1. It changes no behaviour: every existing test passes unchanged (only import paths may change), and `tests/fixtures/characterization/` and `tests/fixtures/window-parity/` show no diff.

1. **`live-round.ts`** becomes a barrel that re-exports from `src/sim/live/`, so no caller changes: `types.ts` (`LiveRound`, `AgentCommand`, `OrderLogEntry`, `PlanFailure`), `open.ts` (`openLiveRound`), `orders.ts` (`issueOrders`, `applyPendingBatch`), `validate.ts` (`validateCommand` dispatching on `command.kind` through a handler table), `step.ts` (`stepLive` / `stepOnce` as an ordered list of phases), `standing.ts` (`advanceStanding`, `startSegment`, `standingPositionAt`), `fire.ts` (`scheduleFires`), `result.ts` (`evaluateResult` as an ordered rule list), `decide.ts` (`runDecisions`), `plan-steps.ts` (fire, cancel and mark helpers), `replay.ts` (`replayOrderLog`), `view.ts` (`viewLive`, `truthLiveWorld`).
2. **`run.ts`** keeps `World`, `AgentBody` and `applyJob`, but the `Job`, `SimEvent` and `RejectionCode` unions are built from interface maps that other modules extend with TypeScript module augmentation (`interface JobMap { "aftershock-burst": {...} }` in `breach-resolve.ts`; `type Job = JobMap[keyof JobMap]`). `applyJob` looks up a handler table that each resolve module registers into, so a kit adds a file instead of a `case`.
3. **`MapView.tsx`** renders an ordered list of overlay layers from `src/ui/board/layers/`, one file per layer.
4. **`fog.ts`** becomes an ordered list of visibility rules (line of sight today; reveal, nearsight and snapshot later).
5. **`rejectionMessages.ts` and `describe.ts`** become registries keyed by code or event type, filled from per-module files.
6. **Reserved slots.** In every remaining append-only spot (`AgentBody`, `World`, `Ruleset` and `STANDARD_RULESET` fields, `AgentCommand` members, the agent list in `catalog.ts`, the registries above), H0 adds one empty, labelled block per planned stage (`// --- G2 ---`, `// --- X1 ---`, ...) separated by unchanged lines. Each stage writes only inside its own block, so two branches never change adjacent lines.
7. **`App.tsx`** is split into `PreRoundScreen`, `LiveScreen` and `SetupDrawer` components, with slot arrays for HUD buttons, setup sections and board overlays.

H0 needs its own short plan doc before it starts (it is not one of the wave 1 plans).

### 4.4 Pairs that must not run in parallel even after H0

| Pair | Reason | Resolution in the waves |
| --- | --- | --- |
| G3 and G6 | Both reshape `PreRoundPlan`, `validatePlan` and `startLiveFromPreRound` in `preround.ts`, plus `planState.ts` and the HUD. | G6 in wave 1, G3 in wave 2, rebased on G6. |
| O1 and G6 | Both change `runDecisions` (O1: cadence fix; G6: plan-lock filter for `hold`). | G6 in wave 1, O1 in wave 2. |
| D1 and K4 | D1 adds `AbilityDefinition.effects`; K4 applies the reserved `info.reveal` tag. | Same wave; D1 merges first and K4 rebases before tagging. |
| G2 and K5 | G2 adds plant and defuse to X1's `ChannelWhat`; K5 adds `STATUS_SUPPRESS -> "suppressed"` to X1's interrupt map. Different reserved slots in `channel.ts`. | Same wave; allowed only with H0's reserved slots in `channel.ts`. |
| G4 and G5 | G5 implements G4's `EconomyStep` and edits `playableMatch.ts`. | Different waves (G5 after G4). |

## 5. Waves

Each wave starts from main after the previous wave has fully merged. Within a wave, no two stages share a file outside the integration files and H0's reserved slots, and none depends on another.

| Wave | Stages | Notes |
| --- | --- | --- |
| W0 | H0 | Alone. Behaviour-neutral split (4.3). |
| W1 | X1, G1, G6, K3 | Foundations: channels, maps, two-sided plans, the first new kit. |
| W2 | D1, G3, O1, K4 | K4 needs K3. G3 waits for G6 (4.4). O1 waits for G6 (4.4). |
| W3 | G2, K5 | G2 needs G1 and X1. K5 needs K4 and X1. |
| W4 | G4, O2 | Both need G2 and G6. O2 also needs O1. |
| W5 | G5 | Needs G3 and G4. |
| W6 | K6, X2, O3, D1 part 2 | O3 needs O2. D1 part 2 needs G1. |
| W7 | K7, X3, O4 | |
| W8 | K8, X4, O5 | O5 needs O3, G4, G5. |
| W9 | K9, O6, D1 part 3 | D1 part 3 needs O3. |
| W10+ | K10, K11, ... K24, one kit per wave | Kits form a chain. K12 and K13 need X3, K20 needs X4, K23 and K24 need X2: all land earlier. Any later non-kit stage can share a kit's wave if its files do not overlap. |

Without H0, waves 1 to 5 above collapse into 10 single-stage waves. That is the cost H0 removes.

## 6. Merge order

1. Within a wave, merge in the order listed in the table (foundational first): W1 X1, G1, G6, K3; W2 D1, G3, O1, K4; W3 G2, K5; W4 G4, O2.
2. Before merging, the branch rebases on main (which already contains the earlier merges of the same wave) and reruns the gate.
3. The integrator then applies the stage's integration-file lines (4.1) and the `docs/status/<stage>.md` text (4.2) as the final commit of the merge.
4. The next wave starts only when the whole wave is merged and main is green.

## 7. Per-branch gate

A branch merges only when all of these hold:

1. `npm run check` is green on the branch after rebasing on current main (lint, typecheck, tests, build), and the result is recorded in `docs/status/<stage>.md` from an actual run.
2. Browser check at 1366x768 from the stage plan's acceptance criteria: the described flow works and there is no document scroll.
3. **No tag upgrades.** A diff of provenance `kind` values shows no assumed -> secondary/verified, secondary -> verified or sheet -> verified change unless the branch adds the primary source that justifies it, named in the status file.
4. **No test deleted or weakened to go green.** Test count does not go down; any changed assertion is listed with its reason in the status file.
5. Fixtures: `tests/fixtures/window-parity/` never changes. `tests/fixtures/characterization/` changes only if the stage plan says so, regenerated deliberately with `VALSIM_UPDATE_FIXTURES=1` and reviewed (no wave 1 plan changes existing fixtures; K4 adds one new capture).
6. No edits to another stage's owned names (`docs/roadmap.md` ownership and the plans' contract tables) and no edits outside the stage's own reserved slots in append-only files.
7. Assumed constants that need an owner value (G2 timers, G4 match format, G5 credit amounts, G3 weapon entries) have the owner's value and provenance before the sub-stage that ships them merges. Tests use labelled fixture values until then.
