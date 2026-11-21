import { hasStatus, STATUS_CONCUSS, STATUS_HASTE, statusModifier, yawToward } from "../effects/status.ts";
import { clipSegment, distanceMm } from "../map/geometry.ts";
import type { Point, Segment } from "../types.ts";
import type { Ruleset } from "../../rules/ruleset.ts";
import { lerpPoint, type AgentBody } from "../world.ts";
import { markWaypointReached } from "./plan-steps.ts";
import type { LiveRound, StandingOrder } from "./types.ts";

export function moveSpeedFor(agent: AgentBody, timeMs: number, ruleset: Ruleset): number {
  let speed = ruleset.walkSpeedMmPerSec;
  const haste = statusModifier(agent, STATUS_HASTE, "movementSpeed", timeMs);
  if (haste != null) {
    speed = Math.round(speed * haste);
  }
  if (hasStatus(agent, STATUS_CONCUSS, timeMs)) {
    speed = Math.round((speed * ruleset.concussWalkSpeedMultiplierBp) / 10000);
  }
  return Math.max(1, speed);
}

/** Begin walking toward `waypoints[index]` from the agent's current position. Speed is fixed for the segment. */
export function startSegment(
  round: LiveRound,
  agent: AgentBody,
  waypoints: Point[],
  index: number,
  startMs: number,
  walls: readonly Segment[],
): StandingOrder {
  const from = { xMm: agent.xMm, yMm: agent.yMm };
  const target = waypoints[index]!;
  if (from.xMm !== target.xMm || from.yMm !== target.yMm) {
    agent.facingDeg = yawToward(from, target);
  }
  const clip = clipSegment(from, target, walls);
  const speed = moveSpeedFor(agent, startMs, round.ruleset);
  const travelMs = Math.round((distanceMm(from, clip.point) * 1000) / speed);
  round.events.push({
    type: "move-started",
    timeMs: startMs,
    sequence: round.nextSequence,
    agentId: agent.instanceId,
    from,
    to: { ...target },
  });
  round.nextSequence += 1;
  return {
    kind: "move-route",
    waypoints,
    index,
    segmentFrom: from,
    segmentTo: clip.point,
    segmentStartMs: startMs,
    segmentArrivalMs: startMs + travelMs,
    blocked: clip.blocked,
  };
}

export function advanceStanding(round: LiveRound, agent: AgentBody, newTime: number, walls: readonly Segment[]): void {
  let order = round.standing[agent.instanceId];
  if (!order || order.kind !== "move-route") return;
  if (!agent.alive) {
    round.standing[agent.instanceId] = { kind: "hold" };
    return;
  }
  while (order.kind === "move-route" && newTime >= order.segmentArrivalMs) {
    agent.xMm = order.segmentTo.xMm;
    agent.yMm = order.segmentTo.yMm;
    if (order.segmentFrom.xMm !== order.segmentTo.xMm || order.segmentFrom.yMm !== order.segmentTo.yMm) {
      agent.facingDeg = yawToward(order.segmentFrom, order.segmentTo);
    }
    round.events.push({
      type: order.blocked ? "move-blocked" : "move-arrived",
      timeMs: order.segmentArrivalMs,
      sequence: round.nextSequence,
      agentId: agent.instanceId,
      at: { ...order.segmentTo },
    });
    round.nextSequence += 1;
    const reachedIndex = order.index;
    if (order.blocked) {
      markWaypointReached(round, agent.instanceId, reachedIndex, "blocked-early");
      order = { kind: "hold" };
      break;
    }
    markWaypointReached(round, agent.instanceId, reachedIndex, "arrived");
    if (order.index + 1 >= order.waypoints.length) {
      order = { kind: "hold" };
      break;
    }
    order = startSegment(round, agent, order.waypoints, order.index + 1, order.segmentArrivalMs, walls);
  }
  round.standing[agent.instanceId] = order;
  if (order.kind === "move-route") {
    const at = standingPositionAt(order, newTime, { xMm: agent.xMm, yMm: agent.yMm });
    agent.xMm = at.xMm;
    agent.yMm = at.yMm;
  }
}

/**
 * Pure position for a standing order at `atMs`. `holdAt` is the position
 * used when the order is `hold`. Mid-segment positions use `lerpPoint`.
 */
export function standingPositionAt(order: StandingOrder, atMs: number, holdAt: Point): Point {
  if (order.kind === "hold") return { xMm: holdAt.xMm, yMm: holdAt.yMm };
  const span = order.segmentArrivalMs - order.segmentStartMs;
  if (span <= 0 || atMs >= order.segmentArrivalMs) return { ...order.segmentTo };
  if (atMs <= order.segmentStartMs) return { ...order.segmentFrom };
  const t = (atMs - order.segmentStartMs) / span;
  return lerpPoint(order.segmentFrom, order.segmentTo, t);
}
