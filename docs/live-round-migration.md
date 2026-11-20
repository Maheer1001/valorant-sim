# Live round migration notes

Status: **complete** (Stage e, 20 November 2026). The windowed API (`openRound` / `submitPlan` / `resolveWindow`, `src/sim/round.ts`) is deleted. The live runner in `src/sim/live-round.ts` is the only interactive engine. Scripted `runScenario` is unchanged.

## Stage (a): the shim

During stages (a)–(d) `resolveWindow` was a compatibility shim. It:

1. Applied both pending window plans as jobs at `windowStart` (move jobs, casts and shoot orders).
2. Pre-batched auto-engage for `[windowStart, windowEnd)`.
3. Advanced in `simStepMs` increments, draining jobs with `drainJobsUntil` (shared with the live runner).
4. Captured `lastWindowEvents` / `lastWindowFrames` for the old UI.
5. Lerped in-flight moves at `windowEnd`.

Characterization fixtures captured from the pre-shim API still deep-equalled after the shim landed, so Stage (a) changed no windowed behaviour.

## Stage (e): what replaced it

| Old | New |
| --- | --- |
| `openRound(scenario)` | `openLiveRound(scenario)` |
| `submitPlan(round, side, orders)` | `issueOrders(round, side, commands)`. Same per-command validation and rejection codes; the whole batch is rejected on the first failure. |
| `{ kind: "move", to }` | `{ kind: "move-route", waypoints: [to] }` |
| `resolveWindow(round)` | `stepLive(round, n)` (`n × simStepMs` of sim time). There is no "both sides must submit" gate. |
| `view(round, side)` | `viewLive(round, side)` |
| `round.state` (immutable snapshot) | `round.world` (mutable truth) or `truthLiveWorld(round)` (copy) |
| `defenseHoldPlan(round)` | Not needed: agents hold by default. `defenseHoldDecide` remains for the decide hook. |
| `ruleset.windowMs` | Removed. Tests use a local 3000 ms slice (`SLICE_MS`) that is not a game rule. |
| `missing-plan`, `plan-already-submitted` | Removed rejection codes. |
| `PlanFailure` in `round.ts` | Exported from `live-round.ts`. |

### Behaviour differences the tests now pin

- **Same-instant ordering.** The window shim sorted all t=0 jobs by `(agentId, sortKey)`, so `alpha-defense` moved before `zeta-attack` whichever side planned first. The live runner applies accepted batches in **issue order** (the order log is the reproducibility spine). `tests/sim/round.test.ts` asserts both orders.
- **Auto-engage.** Live fire uses last-fire + interval scheduling instead of a pre-batched window grid.
- **Round end.** Live rounds stop stepping when a side is eliminated or the timer runs out. Characterization fixtures now record `result`.
- **Moves.** Standing routes move every step instead of `move` / `move-resolve` jobs plus an end-of-window lerp.

### Guards kept

| Guard | How |
| --- | --- |
| Live ability timing equals the old window engine | `tests/sim/live-round.test.ts` compares live ability events (Aftershock, Orbital Strike, Incendiary) with events **recorded from `resolveWindow` just before deletion** in `tests/fixtures/window-parity/`. These fixtures are frozen; do not regenerate them. |
| Live engine does not drift silently | `tests/sim/characterization.test.ts` re-records the seven former window scenarios through the live runner (same t=0 orders, same total sim time). Regenerate on purpose with `VALSIM_UPDATE_FIXTURES=1 npx vitest run tests/sim/characterization.test.ts` and review the diff. |
| Ability behaviour | Every Breach / Brimstone interactive case was rewritten onto `tests/sim/support/live-harness.ts`; none were dropped. |

## Test migration status

| File / test | Fate | Notes |
| --- | --- | --- |
| `tests/sim/characterization.test.ts` | **Re-recorded (Stage e)** | Live captures; fixture ids for auto-fire renamed to `auto-fire-seed-N-9000ms`. |
| `tests/sim/round.test.ts` | **Rewritten (Stage e)** | Live determinism, issue-order batches, wall block, smoke vs auto-engage, rejection, fog. |
| `tests/sim/breach.test.ts` — interactive cases | **Rewritten (Stage e)** | Live harness. |
| `tests/sim/brimstone.test.ts` — interactive cases | **Rewritten (Stage e)** | Live harness. |
| `tests/sim/live-round.test.ts` — window parity | **Rewritten (Stage e)** | Compares against frozen window-parity fixtures. |
| `tests/sim/breach.test.ts` / `brimstone.test.ts` — catalog drift, pure apply paths | **Kept** | Never used the window API. |
| `tests/ui/round-play.test.tsx` | **Rewritten (Stage b)** | Live flow: immediate orders, Space/speed, right-click move, replay, fog, ult/buy/charges. |
| `tests/ui/DraftPanel.test.tsx` | **Rewritten (Stage b)** | Dropped Resolve/Step timeline; keeps catalog coverage + scenario export. |
| `tests/ui/hostLoop.test.ts` | **New (Stage b)** | Pure host clock. |
| `tests/ui/replayFile.test.ts` | **New (Stage b)** | Replay JSON round trip. |
| Scripted `runScenario` tests | **Kept** | Unrelated to windows. |
