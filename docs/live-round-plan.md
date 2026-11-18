# Live round plan — pauseable real-time play

Tag: **design**. Planning document only; no `src/` or `tests/` changes in this document.

This replaces the 3-second turn windows with the project owner's live-round model: pre-round buy + plan, then a live 1:40 round that the player can pause to command five agents. Spike plant and defuse are out of scope. Defense stays a hold stub; the engine must still expose what a future opponent needs (`view(side)` and a decision cadence).

## 1. Current state (windowed interactive round)

### What exists today

The interactive layer lives in `src/sim/round.ts`. Scripted scenarios still use `runScenario` in `src/sim/run.ts`, which drains the job queue until empty with no window cap.

| Piece | File / symbol | Behaviour today |
| --- | --- | --- |
| Order unit | `WindowOrder` (`hold` \| `move` \| `cast` \| `shoot`) | One discrete command; cast carries `aimYawDeg` / `chargeValue` / `mapTarget`. |
| Open | `openRound(scenario)` | Builds truth from teams + seed via `createWorld`. Ignores scenario scripted orders. Sets `windowIndex: 0`, empty `pending`, `pendingJobs`, `lastWindowFrames`. |
| Submit | `submitPlan(round, side, orders)` | One plan per side per window. Validates with `validateOrder`. Stores cloned orders in `pending[side]`. Rejects `plan-already-submitted`. |
| Resolve | `resolveWindow(round)` | Requires both plans. Restores `pendingJobs` into an `EventQueue`, enqueues all planned jobs at **`windowStart`**, pre-schedules `auto-engage` ticks for `[windowStart, windowEnd)`, drains jobs with `timeMs ≤ windowEnd` through `applyJob`, then `advanceInFlightMoves` + sets `timeMs = windowEnd`. |
| Window length | `ruleset.windowMs` = **3000** | Assumed lab turn (`WINDOW_MS_PROVENANCE`). Not a Valorant timer. |
| Cross-window carry | `pendingJobs` + `advanceInFlightMoves` | In-flight `move-resolve` jobs that finish after `windowEnd` are lerped to the boundary and rewritten; next resolve reloads them. |
| Replay buffers | `lastWindowEvents`, `lastWindowFrames`, `windowStartSnapshot`, `cursor` | Filled only for the last resolved window. |
| Timeline API | `stepRound`, `snapshotRound` | Step the event index inside the last window's frames. |
| Fog | `view(round, side)`, `viewWorld(mapId, world, side)` | Own agents + LOS-visible enemies; Stim Beacon radius hidden from enemies. |
| Defense stub | `tactics/defense-stub.ts` → `defenseHoldPlan` | Every living defender gets `hold`. |
| Decision stub | `tactics/decision.ts` | Types only (`DecisionContext`, `BeliefSnapshot`, `ActionIntent`). Not called by the runner. |

### Core engine already continuous

`src/sim/run.ts` is not turn-based:

- `Job` + `applyJob` mutate `World` and return followups.
- Queue key is `(timeMs, sequence, agentId)` via `EventQueue` / `compareQueueKeys` in `src/sim/clock.ts`.
- Movement: `move` → `move-started` → scheduled `move-resolve` with integer travel time from `walkSpeedMmPerSec` (haste / concuss modifiers).
- Auto-engage: nearest visible enemy on `autoFireIntervalMs` (Stim shortens via `autoFireIntervalFor`).
- Breach / Brimstone resolve modules enqueue windups, zone ticks, flashes, etc. as ordinary jobs.

**Reusable as-is for a live model:** `applyJob`, full `Job` / `SimEvent` vocabulary, ability resolve modules, LOS / smoke / devices / zones, RNG streams (`forkSeed` / `resumeStream`), `view` / `viewWorld`, `validateOrder`-style checks (minus plan-batch codes), `MapView` rendering of a `World`, cast gates in `abilityUi.ts`, `AgentPanel`, `describe.ts` event text, architecture boundary (sim never imports UI).

### UI today (`src/ui/App.tsx`)

1. Player queues attack `WindowOrder`s in React state.
2. **Resolve window** builds a full attack plan (missing living attackers → hold), `submitPlan(attack)`, `submitPlan(defense, defenseHoldPlan)`, `resolveWindow`.
3. Board shows `snapshotRound` then optional `viewWorld(..., "attack")`.
4. `Transport` Play / Pause / Step walk **`lastWindowEvents` / frames`** on a ~700 ms interval — event replay of the last batch, not a live sim clock.
5. Known playtest pain: agents **jump** between discrete resolve positions; many clicks to place orders; no path / aim / area preview before commit (aim line and range rings exist only while arming a cast).

### What is window-specific (replace or retire)

- Dual-side plan batch: `pending`, `submitPlan`, `resolveWindow`, `windowIndex`, `windowMs` as the only way time advances.
- Rejection codes `missing-plan`, `plan-already-submitted`.
- `lastWindowFrames` / `windowStartSnapshot` / post-hoc `stepRound` as the primary “play” path.
- `defenseHoldPlan` returning `WindowOrder[]` for a 3 s batch.
- UI copy and tests that say “Resolve window”.

---

## 2. Live engine design

**Keep (non-negotiable):** integer ms and mm; seeded named RNG streams; deterministic results; `(timeMs, sequence, agentId)` job ordering; all existing Breach and Brimstone abilities; `view(side)` fog; `sim/` never imports UI.

### 2.1 Fixed simulation step (**design**)

Recommend **`simStepMs = 50`** (assumed), stored on `Ruleset` with provenance in `src/rules/ruleset.ts`.

| Why 50 ms | Rationale |
| --- | --- |
| Divides common timings | Auto-fire 1000, Incendiary tick 100, Orbital 150, Stim pulse 500, window 100_000 all divide evenly. |
| Determinism | Wall-clock `requestAnimationFrame` never feeds the sim. Only “how many steps this frame” changes with speed. |
| Granularity | Fine enough for movement lerp and future opponent cadence without drowning in jobs. |

**Invariant:** one step advances sim time by exactly `simStepMs`, drains / applies every job with `timeMs ≤ newTime`, and updates standing-order movement. Speed multipliers (`0`, `0.5`, `1`, `2`, `4`) change only how many steps the host runs per animation frame. Pause = 0 steps.

Retire `windowMs` as the advance mechanism. Keep the constant only behind a thin compatibility shim during migration (see §2.8), then remove from the standard ruleset.

### 2.2 Continuous movement (**design**)

Replace one-shot window `move` with **standing orders** on each agent:

```text
StandingOrder =
  | { kind: "hold" }
  | { kind: "move-route"; waypoints: Point[]; index: number }
```

- Each step, if `move-route`, advance position along the current segment using the same integer speed / wall-clip rules as today's `applyJob("move")` / `lerpPoint` (haste, concuss). On reaching a waypoint, bump `index`; if exhausted, become `hold`.
- Position at sim time `t` is a pure function of standing order + speed + walls (plus knockback impulses as discrete jobs). Mid-segment, store `segmentStartMs`, `from`, `to` so any time in `[start, arrival]` can be evaluated.
- **Auto-engage** while moving or holding: schedule the next `auto-engage` job from “last fire + interval”, not a pre-batched 3 s grid. Explicit `shoot` target overrides nearest-enemy selection until cleared or invalid.
- **UI interpolation:** render between committed step snapshots with `requestAnimationFrame`, lerping agent x/y (and optional facing) by wall-clock fraction *within* the current step only. Interpolation must never call `applyJob`. Scrubbing / pause shows the last committed step (or exact segment math at `timeMs`).

This removes the jumpiness caused by only committing positions at `windowEnd`.

### 2.3 Order timestamps and reproducibility (**design**)

```text
LiveOrder = {
  simTimeMs: number;   // applied at next step boundary ≥ issue time
  side: Side;
  orders: AgentCommand[];  // move-route | hold | cast | shoot | cancel-plan-tail …
  result: "accepted" | RejectionCode;
}
```

- Orders issued while **paused or running** are stamped with the current sim time (pause freezes time, so stamp = frozen `timeMs`) and applied on the **next step boundary**.
- Append every attempt to an **order log** (accepted and rejected).
- **Invariant:** `seed + scenario (teams, map, catalogVersion, rulesetId, pre-round plan, buys) + order log` → deep-equal world and event stream. No hidden wall-clock entropy.

**Tests that enforce the invariant (planned):**

1. Same seed + scenario + identical order log → deep-equal agent positions, hp, charges, ult, smokes/zones/devices at round end.
2. Same inputs with different wall-clock frame timing / speed multipliers → identical final state (host runs N steps offline).
3. Order issued while paused at `t` appears in the log at `t` and affects the first step after resume identically to an order issued at `t` while running then immediately paused.
4. Seeds 1 vs 2 change rifle draws only; utility-only logs stay equal where combat is not drawn.
5. Replay from log without UI produces the same `SimEvent` sequence (hash or deep-equal).

### 2.4 Pre-round plan vs live orders (**design**)

**Pre-round plan** (data model):

```text
AgentPlan = {
  instanceId: string;
  route: Point[];  // waypoints in order
  abilities: PlanAbility[];
}
PlanAbility = {
  abilityId: string;
  trigger: { kind: "at-time"; timeMs: number }  // from round start
         | { kind: "at-waypoint"; waypointIndex: number };
  aimYawDeg?: number;
  chargeValue?: number;
  mapTarget?: Point;
}
```

- When the round goes **live**, materialise each `AgentPlan` into a standing `move-route` plus scheduled cast jobs (or “armed” plan steps that fire when the trigger hits).
- **Live order vs plan:** a live move replaces the standing route (cancels remaining waypoints). A live cast at “now” spends resources immediately and does **not** remove unrelated plan casts unless the player issues an explicit cancel or a conflicting same-slot override. **Recommended default:** live move cancels remaining route waypoints; live cast of ability A cancels any **untriggered** plan steps for A on that agent; other agents' plans untouched. (**design**)

Pre-round buys mutate charges / credits before `timeMs = 0` live start; recorded in the scenario or a buy log prefix so reproducibility still holds.

### 2.5 Clocks (**design**)

| Clock | Owner-specified | Notes |
| --- | --- | --- |
| Round timer | **100_000 ms** (1:40) | Counts down while unpaused; reaches 0 → defenders win (until spike exists). |
| Pause | Free pause anytime | Speed 0; sim time frozen. |
| Pre-round countdown | **ASSUMED** `buyPhaseMs` | Not stated by owner. Recommend **30_000 ms** assumed, provenance in `ruleset.ts`, clearly labelled drill / Plant-like buy+plan phase — not a verified Valorant buy length. |
| Sim step | **ASSUMED** `simStepMs = 50` | See §2.1. |
| Opponent decision cadence | **ASSUMED** `decisionIntervalMs` | Recommend **500 ms** assumed (see §2.9). |

Phase enum: `pre-round` → `live` → `ended`.

### 2.6 Round result (**design**)

```text
RoundResult =
  | { kind: "attack-eliminated" }   // all attackers dead
  | { kind: "defense-eliminated" }  // all defenders dead
  | { kind: "timeout"; winner: "defense" }
```

Emit a `SimEvent` e.g. `{ type: "round-ended"; result: RoundResult; timeMs }` and stop stepping. Spike plant / defuse results are explicitly **not** in this milestone.

### 2.7 Migration / retirement of the window API

**Strategy (**design**):** introduce a live runner (`openLiveRound` / `issueOrders` / `stepLive` / `setSpeed`) beside the old API; keep `resolveWindow` as a **thin compatibility layer** during stages (a)–(d) that internally steps `windowMs / simStepMs` times after applying both plans as orders at `windowStart`. Retire the public window surface in stage (e) once tests are rewritten.

#### Every existing test that depends on windows / `resolveWindow`

| File | Test | Fate | Why |
| --- | --- | --- | --- |
| `tests/sim/round.test.ts` | `tags assumed window rules on the standard ruleset` | **Rewrite** | Assert `simStepMs` / `roundDurationMs` / retire or demote `windowMs` provenance. |
| `tests/sim/round.test.ts` | `deep-equals for the same seed and plans…` | **Rewrite** | Same invariant via order log + live steps (compat layer OK temporarily). |
| `tests/sim/round.test.ts` | `resolves both sides in queue order, not attacker-first` | **Keep via compat** then **rewrite** | Ordering invariant stays; drive through shared queue, not window batch language. |
| `tests/sim/round.test.ts` | `blocks movement on a wall` | **Rewrite** | Standing move-route over N steps; same wall clip. |
| `tests/sim/round.test.ts` | `blocks auto-engage through smoke until the smoke expires` | **Rewrite** | Multi-step live time instead of multi-window holds. |
| `tests/sim/round.test.ts` | `rejects an invalid plan…` | **Rewrite** | `issueOrders` rejection; drop `plan-already-submitted` / adapt codes. |
| `tests/sim/round.test.ts` | `hides an enemy behind a wall in view(attack)…` | **Keep** | Already window-free; only uses `openRound` + `view`. |
| `tests/sim/breach.test.ts` | catalog drift guard | **Keep** | No window API. |
| `tests/sim/breach.test.ts` | ownership / charges / cooldown / ult / timing / geometry / concuss / flash / smoke / deep-equal / fog / buy | **Keep via compat** then **rewrite** harness | Assertions are ability behaviour; replace `mustSubmit`+`resolveWindow` with live step helpers without deleting cases. |
| `tests/sim/brimstone.test.ts` | catalog drift guard | **Keep** | No window API. |
| `tests/sim/brimstone.test.ts` | ownership / buy / ult / stim / incendiary / orbital / sky smoke interactive / deep-equal | **Keep via compat** then **rewrite** harness | Same as Breach. Pure `apply*` Orbital/Incendiary unit paths **Keep**. |
| `tests/ui/round-play.test.tsx` | Resolve-dependent cases | **Rewrite** | Pause / resume / live resolve language; keep coverage of cast aim, Fault Line slider, buy, ult gate, fog. |
| `tests/ui/round-play.test.tsx` | queue-only cases (move, Flashpoint aim, Fault Line, out-of-range unit, fog hide) | **Rewrite** lightly | Adapt selectors/labels; keep intent. |
| `tests/ui/DraftPanel.test.tsx` | `steps the timeline and exports…` | **Rewrite** | Transport becomes live pause/speed; export still round-trips scenario. |

Do **not** delete tests merely to go green. Scripted `runScenario` tests (`run.test.ts`, sky-smoke scripted paths, etc.) stay unchanged.

### 2.8 Compatibility shim (temporary)

```text
resolveWindow(round) ≈
  issue both pending plans as orders at timeMs
  → stepLive (windowMs / simStepMs) times
  → fill lastWindowEvents from the step buffer for old UI
```

Remove once UI and tests no longer import `submitPlan` / `resolveWindow`.

### 2.9 Future opponent decision cadence (**design**)

- Every `decisionIntervalMs` (**ASSUMED** 500 ms) while live and unpaused, build `DecisionContext` from `view(side)` (not truth).
- Bot returns `AgentCommand[]`; engine validates and appends to the **same order log** with `side: "defense"` (or attack in attack-stub drills).
- Hold stub becomes: on each cadence, issue hold (or no-op if already holding). No search / ML in this milestone.
- Pause freezes cadence (no decisions while `timeMs` frozen), matching frozen windups (§5).

---

## 3. UI design (React only; no sim logic in UI)

### 3.1 Pre-round screen

- **Buy panel** for up to five attack agents: credits, charges, `buyCharge` with plain-language refusals (reuse `AgentPanel` patterns).
- **Route drawing:** select agent → click / Shift-click waypoints on the board; path polyline + ETA from pure UI helpers using `walkSpeedMmPerSec`.
- **Ability queue:** arm with hotkeys, click aim/map target, choose trigger (time on a simple round timeline 0…100 s, or waypoint index). Timeline markers on the route and on a scrub bar.
- Countdown display for assumed `buyPhaseMs`; **Lock in / Start round** when ready (or auto-start at 0).

### 3.2 Live screen

- Continuous board render; **round timer** (100 s); pause / resume; speed `[` `]` ; selected-agent ability + status panel; event log append-only for recent sim events.
- Fog toggle (`view('attack')` default, truth for debug) stays.
- Replace “Resolve window” with live command application + optional “Paused” badge.

### 3.3 Fewer clicks (**design**)

| Input | Action |
| --- | --- |
| Click agent / keys **1–5** | Select |
| Shift-click / drag-box | Multi-select |
| **Right-click** ground | Move (replace route) for selection |
| **Shift+right-click** | Queue waypoint |
| **C / Q / E / X** | Arm that slot on primary selected agent (Valorant-like), then click to confirm aim/map |
| **Space** | Pause / resume |
| **Escape** | Cancel arming / clear multi-select |
| **[ ]** | Cycle speed 0.5 ↔ 1 ↔ 2 ↔ 4 (and pause via Space) |
| Group move | Same destination **offset** from each agent's current position (formation-preserving), not one shared point |

Justification: today's flow needs Select → Move/Cast button → click → Resolve. Hotkeys + right-click cut mode toggles; multi-select addresses five-agent command time (the reason pause exists).

### 3.4 Previews before commit (**design**)

Drawn in `src/ui` from pure functions (extend `coords.ts` / new `src/ui/board/previews.ts`), using the **same geometry constants** the sim already exposes (radii, ranges, Fault Line length from chargeValue). No reimplementation of damage rules.

- Movement path polyline + ETA label.
- Aim line for aimed abilities.
- Range ring + ability radius / cone / rectangle outline for armed casts.
- Plan markers: where a queued plan cast will fire (waypoint halo or time marker).

### 3.5 Rendering approach (**design**)

**Recommend keep SVG + `requestAnimationFrame` interpolation** for this milestone.

| Reason | Detail |
| --- | --- |
| Continuity | Existing `MapView` overlays, Testing Library queries, and click mapping already SVG. |
| Smoothness | Interpolate only between step snapshots; sim stays discrete. |
| Testability | jsdom + Testing Library keep working; add unit tests for preview geometry and a fake-clock test that N steps at 2x match N*2 steps at 1x. Canvas hit-testing and a11y would be a larger rewrite. |

Revisit canvas only if SVG node count becomes a measured problem (many devices/zones/agents).

---

## 4. Staged implementation order

Recommended shape (owner sketch preserved; stage (e) last so ability tests stay green under the shim):

### (a) Engine clock, standing orders, order log, result — testable without new chrome

**Deliverable:** Vitest can open a live round, issue moves/casts, step to timeout / elimination, assert order-log determinism.

**Files:** `src/rules/ruleset.ts` (new assumed constants); `src/sim/round.ts` or new `src/sim/live-round.ts`; `src/sim/run.ts` (standing move helper); `src/tactics/defense-stub.ts` (live hold); `tests/sim/live-round.test.ts`; keep `resolveWindow` as shim calling the live stepper.

### (b) Live UI: smooth movement, pause, speed

**Deliverable:** Browser shows agents walking continuously; Space pauses; speed controls change playback only.

**Files:** `src/ui/App.tsx`, `MapView.tsx`, replace/repurpose `Transport.tsx`, styles; thin React hook for rAF + step batching.

### (c) Fast controls and previews

**Deliverable:** Right-click move, hotkey arm, multi-select, path/aim/area previews; fewer clicks than today.

**Files:** `App.tsx`, `MapView.tsx`, `orders/*`, `board/previews.ts`, `tests/ui/*`.

### (d) Pre-round buy and plan screen

**Deliverable:** Countdown phase, buy five agents, draw routes, queue timed/waypoint abilities, then go live.

**Files:** new `src/ui/preround/*`, scenario/plan types in `src/sim/scenario/` or live-round module, persistence version bump if plans are exported.

### (e) Retire the window layer

**Deliverable:** No `submitPlan` / `resolveWindow` / `windowMs` in the public API; all former window tests rewritten to live helpers; PROJECT_STATUS + playtest updated.

**Files:** delete or internalise shim; update `rejectionMessages`; purge window copy from UI.

**Why this order:** engine invariants first (deterministic live time), then visible motion (fixes jumpiness), then UX (fixes click pain), then pre-round (largest UI surface), then delete the old API so nothing depends on 3 s batches.

---

## 5. Decisions needed from the owner (max 10)

| # | Question | Recommended answer |
| --- | --- | --- |
| 1 | Should pause ever be limited (max pauses, timed pause)? | **No — free pause.** Owner: commanding five agents takes time. |
| 2 | May the player issue orders while the round is running? | **Yes.** Pause is optional convenience, not required for input. |
| 3 | What happens to windups and in-flight abilities during pause? | **Frozen** with sim time (no progress on windups, zone ticks, moves, or bot cadence). |
| 4 | How should a future opponent receive information? | **`view(side)` only**, on `decisionIntervalMs`, never truth. Same order log as the player. |
| 5 | Pre-round buy phase length? | **ASSUMED 30 s** in ruleset until a primary Plant/buy length is adopted. |
| 6 | Live move vs remaining plan waypoints? | **Replace route; cancel untriggered casts of the same ability** on that agent. |
| 7 | Multi-select group move semantics? | **Shared offset** from each agent (formation), not converge to one point. |
| 8 | Keep SVG or move to canvas for smooth motion? | **SVG + rAF interpolation** this milestone. |
| 9 | Compatibility: keep `resolveWindow` during migration? | **Yes**, as a thin stepper shim until stage (e). |
| 10 | Round timer on timeout? | **Defenders win at 0** until spike plant exists (owner). |

---

## 6. Risks (max 6)

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | Rewriting all Breach/Brimstone window harnesses breaks coverage. | Compat shim first; rewrite tests file-by-file; never delete cases to go green. |
| 2 | rAF interpolation drifts from sim truth. | Interpolate only within one `simStepMs`; pause/scrub show committed state; determinism tests ignore wall clock. |
| 3 | Order-at-next-boundary feels laggy at 50 ms. | Document as design; allow optional 16–20 ms step later only if tests and timings still divide cleanly. |
| 4 | Pre-round plan triggers disagree with live overrides. | Explicit cancel rules (§2.4); UI shows which plan steps remain. |
| 5 | Five-agent hotkeys collide with browser / draft focus. | Scope hotkeys to live/pre-round board focus; Escape clears arming. |
| 6 | Assumed buy phase / step / decision interval mistaken for live Valorant. | Provenance tags on every new ruleset field; UI labels “assumed” where shown. |

---

## Out of scope (this plan)

Spike plant and defuse; real opponent / tendencies / difficulty; armor / weapons beyond Rifle A; IndexedDB; changing Breach/Brimstone combat numbers; inventing new game numbers beyond named ASSUMED / design clock constants above.
