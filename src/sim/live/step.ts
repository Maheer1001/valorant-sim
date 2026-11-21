import { getMap } from "../map/drill-hall.ts";
import { resumeStream, type Rng } from "../rng.ts";
import type { Segment } from "../types.ts";
import { runDecisions } from "./decide.ts";
import { drainJobsUntil } from "./drain.ts";
import { scheduleFires } from "./fire.ts";
import { applyPendingBatch } from "./orders.ts";
import { fireDuePlanSteps } from "./plan-fire.ts";
import { markUnfiredPlanSteps } from "./plan-steps.ts";
import { evaluateResult } from "./result.ts";
import { advanceStanding } from "./standing.ts";
import type { LiveRound } from "./types.ts";

/** State shared by the phases of one fixed step. */
export type StepContext = {
  round: LiveRound;
  walls: readonly Segment[];
  combat: Rng;
  prevTime: number;
  /** Next boundary, capped at the round length. */
  newTime: number;
  eventStart: number;
  /** Set when the round ends; later phases of this step are skipped. */
  ended: boolean;
};

export type StepPhase = (ctx: StepContext) => void;

/** Fire plan steps due at the current committed time (at-time 0 on first step). */
const firePlanSteps: StepPhase = (ctx) => {
  fireDuePlanSteps(ctx.round, ctx.prevTime);
};

/** a. Apply batches issued since the last step at the current time. */
const applyBatchesNow: StepPhase = (ctx) => {
  const { round, walls, combat, prevTime } = ctx;
  const hadBatch = round.pendingBatch.length > 0;
  applyPendingBatch(round, walls);
  if (hadBatch) {
    // Run casts/engages issued "now" before bodies move, so they see committed positions.
    round.nextSequence = drainJobsUntil(
      round.queue,
      round.world,
      prevTime,
      round.catalog,
      walls,
      combat,
      round.ruleset,
      round.nextSequence,
      round.events,
    );
  }
};

/** c. Standing move-routes. */
const advanceStandingRoutes: StepPhase = (ctx) => {
  for (const agent of ctx.round.world.agents) {
    advanceStanding(ctx.round, agent, ctx.newTime, ctx.walls);
  }
};

// Plan waypoint steps marked due during movement fire at the next step start.
// Also flush any at-time steps that become due exactly at newTime after commit below
// by leaving them for the following step (trigger.timeMs <= world.timeMs).

/** e. Auto-engage / shoot-override fire times in (prevTime, newTime], scheduled at exact times. */
const scheduleFirePhase: StepPhase = (ctx) => {
  scheduleFires(ctx.round, ctx.prevTime, ctx.newTime);
};

/** d. Drain every job due by newTime at its exact time. */
const drainToNewTime: StepPhase = (ctx) => {
  const { round } = ctx;
  round.nextSequence = drainJobsUntil(
    round.queue,
    round.world,
    ctx.newTime,
    round.catalog,
    ctx.walls,
    ctx.combat,
    round.ruleset,
    round.nextSequence,
    round.events,
  );
};

/** Keep this step's events in time order (route events and job events interleave). */
const sortStepEvents: StepPhase = (ctx) => {
  const { round, eventStart } = ctx;
  if (round.events.length - eventStart > 1) {
    const slice = round.events.splice(eventStart);
    slice.sort((a, b) => a.timeMs - b.timeMs);
    for (const event of slice) round.events.push(event);
  }
};

/** g. Commit time. */
const commitTime: StepPhase = (ctx) => {
  ctx.round.world.timeMs = ctx.newTime;
};

/** h. Round result. */
const roundResult: StepPhase = (ctx) => {
  const { round, newTime } = ctx;
  const result = evaluateResult(round, newTime);
  if (result) {
    round.phase = "ended";
    round.result = result;
    markUnfiredPlanSteps(round);
    round.events.push({
      type: "round-ended",
      timeMs: newTime,
      sequence: round.nextSequence,
      agentId: "",
      result,
    });
    round.nextSequence += 1;
    ctx.ended = true;
  }
};

/** f. Opponent decision cadence (fogged view only; logged through issueOrders). */
const decisionCadence: StepPhase = (ctx) => {
  const { round, newTime } = ctx;
  if (round.enableDecide && round.decide && newTime >= round.nextDecisionAtMs) {
    runDecisions(round, round.decide);
    while (round.nextDecisionAtMs <= newTime) {
      round.nextDecisionAtMs += round.ruleset.decisionIntervalMs;
    }
  }
};

/** Ordered phases of one fixed step (same order as before H0). */
export const STEP_PHASES: readonly StepPhase[] = [
  firePlanSteps,
  applyBatchesNow,
  advanceStandingRoutes,
  scheduleFirePhase,
  drainToNewTime,
  sortStepEvents,
  commitTime,
  roundResult,
  decisionCadence,
];

/** Advance the live round by `nSteps` fixed steps (stops early when the round ends). */
export function stepLive(round: LiveRound, nSteps: number): LiveRound {
  if (round.phase === "ended" || nSteps <= 0) return round;
  const map = getMap(round.mapId);
  const walls: readonly Segment[] = map?.walls ?? [];
  const combat = resumeStream(round.combatState);
  try {
    for (let step = 0; step < nSteps && round.phase === "live"; step += 1) {
      stepOnce(round, walls, combat);
    }
  } finally {
    round.combatState = combat.getState();
  }
  return round;
}

function stepOnce(round: LiveRound, walls: readonly Segment[], combat: Rng): void {
  const prevTime = round.world.timeMs;
  const ctx: StepContext = {
    round,
    walls,
    combat,
    prevTime,
    newTime: Math.min(prevTime + round.ruleset.simStepMs, round.ruleset.roundDurationMs),
    eventStart: round.events.length,
    ended: false,
  };
  for (const phase of STEP_PHASES) {
    if (ctx.ended) break;
    phase(ctx);
  }
}
