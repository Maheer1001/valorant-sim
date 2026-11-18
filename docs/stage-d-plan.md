# Stage (d) plan -- pre-round buy and plan phase

Tag: **design**. Planning document only; no `src/` or `tests/` implementation in this document.

Consistent with [`docs/live-round-plan.md`](live-round-plan.md) sections 2.4, 2.5, 3.1, 4(d), 5 (#5, #6, #9), and 6. Stages (a)--(c1) are shipped. Stage (e) (retire window shim) is **not** in this stage.

## Goal

Before the live round, the player gets a pre-round phase lasting `ruleset.buyPhaseMs` (**30_000 ms**, assumed). In that phase the player can:

1. **Buy** -- spend credits on ability charges per attacker (weapons and armor are roadmap; leave an extension point, invent no prices).
2. **Plan** -- draw a route per attacker and queue ability casts as either **timed** (cast at `t` ms after live start) or **waypoint** (cast when the agent reaches waypoint index `N`). Same semantic payload the live engine already uses for standing `move-route` and `cast` commands.
3. **Go** -- press Go (or let the buy timer hit 0) to open the live round with those orders installed. The round clock **1:40** (`roundDurationMs`, owner) starts at Go; sim `timeMs` is 0 at that instant.

Defense stays the hold stub. Spike is out of scope.

---

## 1. Data model

### 1.1 Pure types (no React)

Place in `src/sim/preround.ts` (or `src/sim/scenario/preround.ts`). Must not import UI.

Align with live-round-plan section 2.4:

```text
PlanTrigger =
  | { kind: "at-time"; timeMs: number }           // from live round start, integer ms
  | { kind: "at-waypoint"; waypointIndex: number } // 0-based index into that agent's route

PlanAbility = {
  id: string;              // stable within the plan (UI edit/delete key)
  abilityId: string;
  trigger: PlanTrigger;
  aimYawDeg?: number;
  chargeValue?: number;
  mapTarget?: Point;
  target: Point;           // aim click / map point used for cast validation
}

AgentPlan = {
  instanceId: string;
  route: Point[];          // waypoints in order; empty = hold at spawn
  abilities: PlanAbility[];
}

BuyLine = {
  instanceId: string;
  abilityId: string;       // one bought charge (reuse buyCharge semantics)
}

PreRoundPlan = {
  version: 1;
  side: "attack";          // defense plan out of scope this stage
  buys: BuyLine[];         // ordered; applied before live open
  agents: AgentPlan[];     // one entry per living attacker (missing => hold, no casts)
}
```

**Extension point (weapons / armor):** on `PreRoundPlan` or `AgentPlan`, reserve an optional field that stage (d) never reads:

```text
loadoutFuture?: {
  // ROADMAP -- weapons and armor. Do not invent prices or ids here.
  // Later: weaponId?, armorTier?, provenance tags per field.
}
```

UI may show a disabled "Weapons / armor (roadmap)" note next to the buy list. No catalog prices, no new ruleset constants for guns or armor.

### 1.2 Convert PreRoundPlan into a live round at Go

Pure helper (suggested name):

```text
startLiveFromPreRound(scenario, plan, catalog, ruleset, options?)
  -> LiveRound | PlanFailure
```

Steps (all at sim `timeMs === 0`, no wall clock):

1. **Validate** the whole `PreRoundPlan` (section 3). Reject entirely on first hard error (same spirit as `issueOrders` batch reject), or reject per-line with codes -- recommend **whole-plan reject** for Go so the player fixes before start; buy clicks can reject per line while still in pre-round UI.
2. **Clone scenario** and apply `buys` in order via the same rules as `buyCharge` (mutate member charges / credits on the scenario team). Starting credits remain `ruleset.startingCredits` (assumed 800) unless the scenario instance already overrode credits.
3. `openLiveRound(scenarioAfterBuys, ...)`.
4. For each `AgentPlan` with a non-empty `route`, `issueOrders(attack, [{ kind: "move-route", instanceId, waypoints: route }])` at `timeMs === 0`. Empty route => leave default hold (or explicit `hold`).
5. **Install** each `PlanAbility` as an untriggered plan step on the `LiveRound` (new field, e.g. `planSteps: PlanStepState[]`). Do **not** spend cast charges at install time; spend when the step **fires** (same as a live cast at that sim time).
6. Return the live round with `phase: "live"`, `world.timeMs === 0`, round timer full. UI may still start **paused** (speed 0) so the player can review -- owner already chose free pause; recommend start paused with "Press Space to start" for parity with stage (b), while the **sim clock and 1:40** only advance when unpaused. Document this in playtest: Go ends buy phase; Space starts motion.

### 1.3 Firing plan steps (engine, still stage d)

`stepLive` (or a helper it calls) after advancing standing movement:

- **at-time:** when `world.timeMs >= trigger.timeMs` and the step is still armed, `issueOrders` a `cast` for that agent (logs at current `simTimeMs`).
- **at-waypoint:** when the standing route's waypoint `index` advances past `waypointIndex` (agent has **arrived** at that waypoint), fire the same way. If the route was replaced by a live move before arrival, cancel per section 1.5.

Cast validation at fire time uses live world state (charges, cooldown, ult, range, alive). If fire-time validation fails, log a rejected `OrderLogEntry` at that `simTimeMs` and drop the step (plain-language message via existing codes).

### 1.4 Order log and replay

Append-only `orderLog` stays the reproducibility spine for live commands.

| When | What is logged |
| --- | --- |
| Go / start helper | Each accepted t=0 `move-route` / `hold` via normal `issueOrders` |
| Plan cast fires | Normal `cast` `issueOrders` entry at fire `simTimeMs` |
| Live overrides after Go | Unchanged stage (b)/(c) logging |

**Buys** are not `AgentCommand`s. Record them so replays match:

- Prefer: scenario snapshot **after** buys is what `openLiveRound` / replay uses (credits and charges already applied), **and** store `preRoundPlan` (or at least `buys` + `agents`) on the replay file for UI reload / audit.
- Replay file version bump (e.g. version 2):

```text
ReplayFileV2 = {
  version: 2;
  scenario;           // post-buy teams preferred
  seed;
  orderLog;
  simTimeMs;
  preRoundPlan?: PreRoundPlan;  // optional; required if replaying a round that used planning
}
```

`replayOrderLog` path: if `preRoundPlan` present, run `startLiveFromPreRound` then replay remaining log entries with `enableDecide: false` (skip duplicate t=0 moves already applied by start helper -- either strip them from the log on save, or make replay idempotent by comparing). Recommend **on Download**: save post-buy scenario + full orderLog from the live round + `preRoundPlan` copy; on Load: `startLiveFromPreRound` then `replayOrderLog` only for entries with `simTimeMs > 0` **or** replay the whole log against a round opened without re-issuing t=0 routes. Pick one approach in implementation and lock it with a round-trip test.

Scenario JSON export (draft) stays teams/seed; exporting a **plan** is optional in stage (d) (versioned plan file or embed later). Not required for Go.

### 1.5 Live override vs plan (owner decision #6)

From live-round-plan:

- Live **move** replaces the standing route and **cancels remaining waypoints**; cancel **untriggered** plan steps whose `at-waypoint` index is no longer reachable, and recommend cancelling all untriggered `at-waypoint` steps on that agent when the route is replaced (simplest consistent rule).
- Live **cast** of ability A cancels untriggered plan steps for A on that agent.
- Other agents untouched.

UI should mark cancelled steps in the plan list (struck / "cancelled").

---

## 2. Determinism

- **No wall-clock in the engine.** `buyPhaseMs` countdown is UI-host only (same pattern as pause/speed): elapsed wall ms reduces a React/host remaining-ms value; at 0 the host calls Go. The engine never sees the buy countdown.
- Engine inputs at Go: scenario (post-buy) + `PreRoundPlan` + seed + ruleset + catalog. Identical inputs => identical `orderLog` and `events` after N `stepLive` calls (existing live invariant).
- Plan triggers use **sim** `timeMs` and standing waypoint index only.
- Do not call `Math.random`. Combat draws stay on the forked combat stream after live start.

---

## 3. Validation and rejection messages

Reuse `src/ui/orders/rejectionMessages.ts` / `RejectionCode` wherever the code already exists. Add new codes only if unavoidable; prefer `invalid-order` with a clear `message` for plan-only shape errors.

### 3.1 Buy (per click or per BuyLine)

| Failure | Code | Message (reuse / align) |
| --- | --- | --- |
| Unknown agent | `unknown-agent` | That agent is not in the round. |
| Ability not on kit | `ability-not-owned` | That agent does not own this ability. |
| Not a bought charge / ult | `invalid-order` | (existing buyCharge text) not a bought charge ability. |
| Already at max charges | `charges-full` | That ability is already at max charges. |
| Not enough credits | `insufficient-credits` | Not enough credits to buy that charge. |
| Wrong side | `wrong-side` | That agent is not on your side. |

Apply via `buyCharge` (or shared pure helper) so live Buy button and pre-round stay aligned.

### 3.2 Route

| Failure | Code | Message |
| --- | --- | --- |
| Non-integer / empty malformed points | `invalid-order` | Route waypoints must be integer millimeters. (already used for move-route) |
| Unknown / down agent | `unknown-agent` / `agent-down` | existing |
| Waypoint index out of range for a cast | `invalid-order` | Waypoint index is not on this agent's route. (**new** message string; code `invalid-order`) |

Wall clipping is **not** a reject: live move already clips; show clipped preview ETA (existing `routeTravelMs`). A route that ends short of a click is accepted; optional UI note "path blocked by wall" from `clipSegment.blocked` without a RejectionCode.

### 3.3 Plan casts (validate at queue time and again at fire time)

Queue-time (pre-round):

| Failure | Code | Message |
| --- | --- | --- |
| Unknown ability / not owned | `ability-not-owned` / `ability-not-executable` | existing |
| Map target out of range (from **spawn** or from **waypoint** position for at-waypoint) | `out-of-range` | existing plain-language range message |
| at-time `timeMs` < 0 or > `roundDurationMs` | `invalid-order` | Cast time must be within the round. |
| Insufficient charges **relative to other queued casts of same ability** + current pool | `insufficient-charges` | No charges left for this ability. |
| Ult cost vs starting ult / drill ult | `insufficient-ult-points` | existing |
| Missing aim / map fields for kind | `invalid-order` | existing invalid-order |

Fire-time: same codes as live `issueOrders` cast (cooldown may now apply, agent may be down, etc.).

### 3.4 Go

If validation fails, do not open live; show the rejection message in the pre-round status line. Keep the player in pre-round with timer paused or still counting (recommend: timer keeps counting unless paused by a future control; v1: timer always counts down in host).

---

## 4. UI (board-first at 1366x768)

### 4.1 Layout

Keep stage (c1) one-screen rule: document does not scroll at 1366x768.

```text
[ thin header: Pre-round | buy timer m:ss | Go ]
[ board ~70%+ : same MapView, previews, plan markers ]
[ bottom: attacker HUD cards -- buy strip + plan summary ]
[ Setup drawer: draft / scenario -- closed by default ]
```

- Buy timer in the top bar (host countdown from `buyPhaseMs`). Label **assumed**.
- **Go** primary button; when timer hits 0, auto-Go with current plan (even if empty => live hold-only).
- After Go, swap to the existing live top bar (1:40, pause, speed). Do not keep both clocks visible as competing primaries.
- Previews: reuse `src/ui/board/previews.ts` (movement polyline + ETA, armed ability shapes). Add plan markers: waypoint discs with index; cast icons on waypoint or on a thin scrub bar 0..100 s under the board (compact).

### 4.2 Edit / delete plan steps

- Select attacker (1-5 / click) -- same as live.
- **Route:** right-click / Move click appends or replaces (match live: replace on right-click, Shift+right-click append). Clear route: Hold or explicit "Clear route" on the card.
- **Queue cast:** C/Q/E/X arm, board click for aim/map (same as live). Then a small popover or HUD control: trigger = **Time** (slider/input 0..100 s) or **Waypoint** (dropdown of current route indices). Confirm adds `PlanAbility` (does not spend charge yet).
- **Edit:** click a plan step in the agent card list -- reopens trigger + shows preview; save replaces that `id`.
- **Delete:** Delete key or "x" on the step row; Escape cancels arming only (same as live).

### 4.3 Click budget (common case)

Route + one cast <= **4 clicks** (plus optional hotkey):

1. Select agent (or already selected / key 1) -- may be 0 if default selection.
2. Right-click waypoint (route).
3. Hotkey C/Q/E/X (not a click) + left-click aim/map.
4. Confirm trigger default (**at-waypoint** last index, or **at-time** 0) with one click on "Add to plan" -- **or** auto-accept default trigger on the aim click to hit 3 interactions.

**Recommended default to hit the budget:** aim click while armed adds the cast with trigger `at-waypoint: last route index` if a route exists, else `at-time: 0`. Changing trigger is an edit (extra clicks), not required for the common case. Document in playtest.

Buy: one click per charge on the HUD buy control (existing AgentPanel pattern, inlined compact on the card).

---

## 5. Tests and stage (e)

### 5.1 Stage (e) first?

**No.** Live-round-plan keeps `resolveWindow` through (d); stage (e) retires it after. Characterization and Breach/Brimstone window harnesses stay on the shim. Stage (d) must not delete or require retirement of the shim.

### 5.2 New tests

| Area | Cases |
| --- | --- |
| Pure plan validate | credits, charges-full, unknown ability, bad waypoint index, out-of-range map cast, over-subscribed charges across two queued casts |
| `startLiveFromPreRound` | t=0 routes in standing + orderLog; buys reflected in world charges/credits; empty plan => hold |
| Timed cast | step to `timeMs`; cast appears in orderLog/events; charges decrement at fire not at Go |
| Waypoint cast | arrive at waypoint N; cast fires once; live move before arrival cancels untriggered waypoint steps |
| Live cast cancel | plan step for A cancelled when live cast A issued |
| Determinism | same plan+seed => deep-equal events after N steps; host buy-timer length does not appear in engine |
| Replay v2 | Go, play, download, load => same positions / time / charges |
| UI | buy timer counts down with fake timers; Go starts live 1:40; auto-Go at 0; queue cast with default trigger in <= 4 clicks; edit/delete step; previews visible in pre-round; rejection toast for insufficient credits |

### 5.3 Existing tests to rewrite / extend

| File | Change |
| --- | --- |
| `tests/ui/round-play.test.tsx` | App may boot into pre-round first -- either skip with "Go" in `beforeEach`, or keep a drill flag `skipPreRound` for live-only tests. Prefer **one Go click in setup** so live tests keep intent. |
| `tests/ui/DraftPanel.test.tsx` | Open Setup; may need Go if draft is behind pre-round. |
| `tests/ui/replayFile.test.ts` | Version 2 + optional `preRoundPlan`. |
| `docs/playtest.md` | Pre-round section before live checklist. |
| `PROJECT_STATUS.md` | Stage (d) result when implemented (not in this planning commit beyond the in-progress line). |

Do not weaken characterization fixtures. Do not rewrite Breach/Brimstone window tests in (d).

---

## 6. Provenance (assumed vs owner vs unknown)

| Item | Value | Tag | Notes |
| --- | --- | --- | --- |
| `buyPhaseMs` | 30_000 | **assumed** | Already on standard ruleset; do not upgrade. UI labels assumed. |
| `roundDurationMs` | 100_000 | **owner** | Live timer starts at Go. |
| `simStepMs` | 50 | **assumed** | Unchanged. |
| `startingCredits` | 800 | **assumed** | Buy pool; already tagged. |
| Ability `costCredits` / maxCharges | catalog | existing tags per ability | No new prices. |
| Weapons / armor prices | -- | **unknown** | Extension point only; invent nothing. |
| Default cast trigger (last waypoint / t=0) | UX default | **design** | Not a Valorant rule. |
| Plan fire vs live cancel rules | section 1.5 | **design** (owner #6) | Already decided in live-round-plan. |
| Start paused after Go | yes | **design** | Matches stage (b) UX; sim at 0 until Space. |
| Defense pre-round plan | none | out of scope | Hold stub at live start. |

Do not upgrade any provenance tag. Do not add unverified Valorant buy-phase lengths.

---

## 7. Risks and open questions

### Risks

1. **Plan cast scheduling is new engine state** (`planSteps`) -- risk of desync with order log if fires are not logged through `issueOrders`. Mitigation: only fire via `issueOrders`.
2. **Replay v2 complexity** (double-apply t=0 routes). Mitigation: one locked round-trip test; strip or skip duplicate entries.
3. **Charge double-count** if queue-time and fire-time both spend. Mitigation: spend only at fire (and at live cast); queue-time only reserves by counting planned spends.
4. **1366x768** overcrowding with scrub bar + HUD buys. Mitigation: compact scrub, buy on card, no second sidebar; keep Setup drawer closed.
5. **Auto-Go at 0** surprises players mid-edit. Mitigation: playtest note; optional "timer paused while arming" later if needed (not required for v1).
6. **Assumed 30 s buy** mistaken for live Valorant. Mitigation: provenance + UI "assumed" label (live-round-plan risk #6).

### Open questions

1. After Go, should the UI start **paused** (recommended) or running at 1x?
2. Should Download replay require `preRoundPlan` always, or only when the round used pre-round?
3. Is **reserving** charges at queue-time (soft lock) required, or is fire-time reject enough when over-queued? (Recommend soft count at queue-time for clearer UX.)
4. May defenders receive a future pre-round plan in a later stage without changing `PreRoundPlan.version`? (Leave `side` field; only attack filled in (d).)

---

## 8. Implementation sketch (files, no code in this step)

| Piece | Where |
| --- | --- |
| Types + validate + `startLiveFromPreRound` | `src/sim/preround.ts` |
| `planSteps` on `LiveRound` + fire in `stepLive` | `src/sim/live-round.ts` |
| Replay v2 | `src/ui/live/replayFile.ts` |
| Pre-round React screen / host buy timer | `src/ui/preround/*`, wire in `App.tsx` |
| Previews / markers | extend `previews.ts` + `MapView.tsx` |
| Tests | `tests/sim/preround.test.ts`, UI pre-round + rewritten boot in `round-play` |

Shim `resolveWindow` / `submitPlan` untouched.

---

## Out of scope (stage d)

Spike plant/defuse; real opponent; weapons/armor economy; retiring the window API (stage e); inventing buy-phase length beyond the existing assumed 30 s; defense planning UI; IndexedDB.

---

## Stage (d1) engine decisions (owner overrides)

Implemented in `src/sim/preround.ts` + `planSteps` on `LiveRound` (no pre-round UI yet).

| ID | Decision |
| --- | --- |
| D1 | Replay **version 2** stores post-buy `scenario`, `seed`, full `orderLog`. Load replays the log only; never re-runs plan steps. `preRoundPlan` is optional audit only. Version 1 files still parse. |
| D2 | `at-waypoint` fires on arrival, or when the route stops early on a wall (cast from stop; order log message notes the block). Unfired steps become `not-reached` at round end. |
| D3 | Queue-time soft reserve of charges and ult; over-queue uses existing rejection codes/messages. Fire-time validation still runs. |
| D4 | Live move cancels that agent's untriggered `at-waypoint` steps; live cast of A cancels untriggered plan steps for A. Status stays `cancelled` for UI. |
| D5 | After `startLiveFromPreRound`, `timeMs === 0` and nothing has fired. `at-time` 0 fires on the first `stepLive`. |

### Waypoint fire timing (intentional)

An `at-waypoint` step is marked due when the standing segment for that waypoint completes (arrival or wall block) during `advanceStanding`. It is issued at the **start of the next** `stepLive` (with `origin: "plan"`). That is up to one `simStepMs` after the arrival/block event. This lag matches live `issueOrders` applying at the next step boundary and is intentional.

### Plan vs live cast cancel

Only batches with `origin: "live"` cancel untriggered plan steps (D4). Plan-fired casts use `origin: "plan"` and do not cancel sibling plan steps for the same ability. Order log entries record `origin` for replay; missing `origin` on old logs means `"live"`.
