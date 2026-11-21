/**
 * Live (pauseable) round engine. Time advances only when the host calls
 * `stepLive`; pausing is simply not calling it. Frozen sim time freezes windups,
 * zone ticks, moves and the decision cadence alike, with no extra flag.
 *
 * Mutation model: `openLiveRound`, `issueOrders` and `stepLive` mutate the
 * `LiveRound` in place and return the same object. The hot path never clones
 * the world. Use `truthLiveWorld` / `viewLive` for snapshots.
 *
 * Since stage H0 this file is a barrel over `src/sim/live/`. Every name it
 * exported before H0 is still exported from here, so importers are unchanged.
 */
export type {
  IssueOrdersOptions,
  IssueResult,
  LiveDecideFn,
  LiveRound,
  OpenLiveOptions,
  OrderLogEntry,
  OrderOrigin,
  PendingBatch,
  PlanFailure,
  PlanStepState,
  PlanStepStatus,
  PlanStepTrigger,
  RoundPhase,
  RoundResult,
  StandingOrder,
} from "./live/types.ts";
export type { AgentCommand } from "./live/commands.ts";
export { isLiveRound, openLiveRound } from "./live/open.ts";
export { flushPendingBatches, issueOrders } from "./live/orders.ts";
export { stepLive } from "./live/step.ts";
export { standingPositionAt } from "./live/standing.ts";
export { drainJobsUntil } from "./live/drain.ts";
export { replayOrderLog } from "./live/replay.ts";
export { truthLiveWorld, viewLive } from "./live/view.ts";
