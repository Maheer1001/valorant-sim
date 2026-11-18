# Live round migration notes (Stage a)

## Characterization

Fixtures under `tests/fixtures/characterization/` were captured from the **pre-shim** windowed API (`openRound` / `submitPlan` / `resolveWindow`) and are asserted by `tests/sim/characterization.test.ts`.

Scenarios:

| Fixture id | Coverage |
| --- | --- |
| `wall-move` | Move into the Drill Hall divider |
| `auto-fire-seed-1-windows-3` | Rifle auto-fire over 3 windows, seed 1 |
| `auto-fire-seed-2-windows-3` | Same plans, seed 2 (draw changes) |
| `breach-aftershock` | Aftershock + hold windows |
| `breach-fault-line` | Fault Line + hold windows |
| `brimstone-orbital` | Orbital Strike + hold windows |
| `brimstone-incendiary` | Incendiary + hold windows |

### Differences found after the shim

**None.** After reimplementing `resolveWindow` to drain with `simStepMs` steps via shared `drainJobsUntil`, every characterization fixture still deep-equals. Window auto-engage remains **pre-batched** for `[windowStart, windowEnd)`; moves remain **move / move-resolve jobs** (not live standing routes). That is intentional so Stage (a) does not silently change windowed behaviour.

Live `stepLive` uses standing `move-route` orders and last-fire auto-engage scheduling. Those differences are **live-only**; they are not applied inside the shim.

## Shim shape

`resolveWindow` now:

1. Applies both pending window plans as jobs at `windowStart` (unchanged enqueue, including move jobs and shoot).
2. Pre-batches auto-engage for the window (unchanged).
3. Advances time in `simStepMs` increments, draining jobs with `drainJobsUntil` (shared with the live runner).
4. Captures `lastWindowEvents` / `lastWindowFrames` per applied job for the old UI.
5. Runs `advanceInFlightMoves` at `windowEnd`.

## Test migration status

| File / test | Fate (Stage a) | Notes |
| --- | --- | --- |
| `tests/sim/characterization.test.ts` | **Keep** | Guards shim fidelity. |
| `tests/sim/round.test.ts` — all window cases | **Keep via shim** | Still call `resolveWindow`. |
| `tests/sim/round.test.ts` — `tags assumed window rules…` | **Keep** (extend later) | Still asserts `windowMs`; live constants covered in `live-round.test.ts`. |
| `tests/sim/breach.test.ts` — interactive cases | **Keep via shim** | Harness unchanged. |
| `tests/sim/breach.test.ts` — catalog drift | **Keep** | No window API. |
| `tests/sim/brimstone.test.ts` — interactive cases | **Keep via shim** | Harness unchanged. |
| `tests/sim/brimstone.test.ts` — catalog / pure apply | **Keep** | No window API. |
| `tests/ui/round-play.test.tsx` | **Keep via shim** | No UI changes in Stage a. |
| `tests/ui/DraftPanel.test.tsx` | **Keep via shim** | Resolve window still works. |
| `tests/sim/live-round.test.ts` | **New** | Live API coverage for Stage a. |
| Scripted `runScenario` tests | **Keep** | Unrelated to windows. |

Stage (e) will rewrite window harnesses to live helpers; until then do not delete window tests.
