import { evaluateCast } from "./agents/cast.ts";
import { getAgent, SHIPPED_CATALOG, type Catalog } from "./agents/catalog.ts";
import { RIFLE_A } from "./combat/assumed-rifle.ts";
import { compareQueueKeys, EventQueue, type QueueItem } from "./clock.ts";
import { compositionViolation } from "./composition/team.ts";
import { hasStatus, STATUS_BLIND } from "./effects/status.ts";
import { getMap } from "./map/drill-hall.ts";
import { hasLineOfSight } from "./map/line-of-sight.ts";
import { forkSeed, resumeStream } from "./rng.ts";
import type { Scenario } from "./scenario/types.ts";
import type { Point, RejectionCode, Side } from "./types.ts";
import { STANDARD_RULESET, type Ruleset } from "../rules/ruleset.ts";
import {
  applyJob,
  createWorld,
  findAgent,
  lerpPoint,
  type AgentBody,
  type Job,
  type SimEvent,
  type World,
} from "./run.ts";

export type WindowOrder =
  | { kind: "hold"; instanceId: string }
  | { kind: "move"; instanceId: string; to: Point }
  | {
      kind: "cast";
      instanceId: string;
      abilityId: string;
      target: Point;
      aimYawDeg?: number;
      chargeValue?: number;
      mapTarget?: Point;
    }
  | { kind: "shoot"; instanceId: string; targetInstanceId: string };

/** Truth snapshot for an interactive round. */
export type RoundState = {
  seed: number;
  windowIndex: number;
  timeMs: number;
  agents: AgentBody[];
  smokes: World["smokes"];
  mapId: string;
  rulesetId: string;
  catalogVersion: string;
};

export type PlanSuccess = {
  ok: true;
  round: Round;
};

export type PlanFailure = {
  ok: false;
  code: RejectionCode;
  message: string;
  orderIndex?: number;
};

export type PlanResult = PlanSuccess | PlanFailure;

export type ResolveSuccess = {
  ok: true;
  round: Round;
  events: SimEvent[];
  state: RoundState;
};

export type ResolveFailure = {
  ok: false;
  code: RejectionCode;
  message: string;
};

export type ResolveResult = ResolveSuccess | ResolveFailure;

export type Round = {
  state: RoundState;
  pending: { attack: WindowOrder[] | null; defense: WindowOrder[] | null };
  pendingJobs: QueueItem<Job>[];
  nextSequence: number;
  combatState: number;
  catalog: Catalog;
  ruleset: Ruleset;
  lastWindowEvents: SimEvent[];
  lastWindowFrames: World[];
  windowStartSnapshot: World | null;
  cursor: number;
};

/**
 * Interactive round. Scenario scripted orders are ignored; teams and seed seed the truth.
 */
export function openRound(
  scenario: Scenario,
  catalog: Catalog = SHIPPED_CATALOG,
  ruleset: Ruleset = STANDARD_RULESET,
): Round | PlanFailure {
  if (scenario.rulesetId !== ruleset.id) {
    return { ok: false, code: "ruleset-mismatch", message: "Scenario ruleset does not match the active ruleset." };
  }
  if (scenario.catalogVersion !== catalog.version) {
    return { ok: false, code: "catalog-mismatch", message: "Scenario catalog version does not match the loaded catalog." };
  }
  const map = getMap(scenario.mapId);
  if (!map) {
    return { ok: false, code: "unknown-map", message: "Scenario map is not loaded." };
  }
  for (const member of [...scenario.attack.members, ...scenario.defense.members]) {
    if (!getAgent(catalog, member.definitionId)) {
      return { ok: false, code: "unknown-definition", message: `Unknown agent ${member.definitionId}.` };
    }
  }
  const violation = compositionViolation(scenario.attack, scenario.defense, ruleset);
  if (violation) {
    return { ok: false, code: violation, message: "Team composition violates the ruleset." };
  }

  const world = createWorld(scenario, ruleset);
  return {
    state: {
      seed: scenario.seed,
      windowIndex: 0,
      timeMs: world.timeMs,
      agents: structuredClone(world.agents),
      smokes: structuredClone(world.smokes),
      mapId: scenario.mapId,
      rulesetId: ruleset.id,
      catalogVersion: catalog.version,
    },
    pending: { attack: null, defense: null },
    pendingJobs: [],
    nextSequence: 1,
    combatState: forkSeed(scenario.seed, "combat"),
    catalog,
    ruleset,
    lastWindowEvents: [],
    lastWindowFrames: [],
    windowStartSnapshot: null,
    cursor: 0,
  };
}

export function isRound(value: Round | PlanFailure): value is Round {
  return "state" in value;
}

export function submitPlan(round: Round, side: Side, orders: readonly WindowOrder[]): PlanResult {
  if (round.pending[side] !== null) {
    return {
      ok: false,
      code: "plan-already-submitted",
      message: `A ${side} plan is already queued for this window.`,
    };
  }
  const world = truthWorld(round.state);
  for (let index = 0; index < orders.length; index += 1) {
    const order = orders[index];
    if (!order) continue;
    const verdict = validateOrder(round, world, side, order);
    if (!verdict.ok) {
      return { ok: false, code: verdict.code, message: verdict.message, orderIndex: index };
    }
  }
  return {
    ok: true,
    round: {
      ...round,
      pending: { ...round.pending, [side]: orders.map(cloneOrder) },
    },
  };
}

export function resolveWindow(round: Round): ResolveResult {
  if (round.pending.attack === null || round.pending.defense === null) {
    return {
      ok: false,
      code: "missing-plan",
      message: "Both sides must submit a plan before the window can resolve.",
    };
  }

  const map = getMap(round.state.mapId);
  if (!map) {
    return { ok: false, code: "unknown-map", message: "Scenario map is not loaded." };
  }

  const windowStart = round.state.timeMs;
  const windowEnd = windowStart + round.ruleset.windowMs;
  const windowStartSnapshot = truthWorld(round.state);
  const world: World = truthWorld(round.state);
  const combat = resumeStream(round.combatState);
  const queue = new EventQueue<Job>();
  for (const item of round.pendingJobs) {
    queue.push(item);
  }

  let sequence = round.nextSequence;
  const planned = [...round.pending.attack, ...round.pending.defense];
  const shooters = new Set(
    planned.filter((order) => order.kind === "shoot").map((order) => order.instanceId),
  );

  const enqueueJobs: { timeMs: number; agentId: string; job: Job; sortKey: string }[] = [];

  for (const order of planned) {
    if (order.kind === "hold") continue;
    if (order.kind === "move") {
      enqueueJobs.push({
        timeMs: windowStart,
        agentId: order.instanceId,
        sortKey: `move:${order.instanceId}`,
        job: {
          type: "move",
          instanceId: order.instanceId,
          to: order.to,
          speedMmPerSec: round.ruleset.walkSpeedMmPerSec,
        },
      });
      continue;
    }
    if (order.kind === "cast") {
      enqueueJobs.push({
        timeMs: windowStart,
        agentId: order.instanceId,
        sortKey: `cast:${order.instanceId}:${order.abilityId}`,
        job: {
          type: "cast",
          instanceId: order.instanceId,
          abilityId: order.abilityId,
          target: order.target,
          aimYawDeg: order.aimYawDeg,
          chargeValue: order.chargeValue,
          mapTarget: order.mapTarget,
        },
      });
      continue;
    }
    enqueueJobs.push({
      timeMs: windowStart,
      agentId: order.instanceId,
      sortKey: `shoot:${order.instanceId}:${order.targetInstanceId}`,
      job: {
        type: "engage",
        instanceId: order.instanceId,
        targetInstanceId: order.targetInstanceId,
        weaponId: RIFLE_A.id,
      },
    });
  }

  for (const agent of world.agents) {
    if (!agent.alive || shooters.has(agent.instanceId)) continue;
    const interval = round.ruleset.autoFireIntervalMs;
    for (let at = windowStart; at < windowEnd; at += interval) {
      enqueueJobs.push({
        timeMs: at,
        agentId: agent.instanceId,
        sortKey: `auto:${agent.instanceId}:${at}`,
        job: {
          type: "auto-engage",
          instanceId: agent.instanceId,
          weaponId: RIFLE_A.id,
        },
      });
    }
  }

  enqueueJobs.sort((a, b) => {
    if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
    if (a.agentId < b.agentId) return -1;
    if (a.agentId > b.agentId) return 1;
    if (a.sortKey < b.sortKey) return -1;
    if (a.sortKey > b.sortKey) return 1;
    return 0;
  });

  for (const item of enqueueJobs) {
    queue.push({
      timeMs: item.timeMs,
      sequence,
      agentId: item.agentId,
      payload: item.job,
    });
    sequence += 1;
  }

  const events: SimEvent[] = [];
  const frames: World[] = [];

  while (queue.length > 0) {
    const next = queue.peek();
    if (!next || next.timeMs > windowEnd) break;
    const item = queue.pop();
    if (!item) break;
    const applied = applyJob(
      item.payload,
      item.timeMs,
      item.sequence,
      world,
      round.catalog,
      map.walls,
      combat,
      round.ruleset,
    );
    world.timeMs = item.timeMs;
    events.push(applied.event);
    frames.push(structuredClone(world));
    for (const followup of applied.followups) {
      queue.push({
        timeMs: followup.atMs,
        sequence,
        agentId: followup.agentId,
        payload: followup.job,
      });
      sequence += 1;
    }
  }

  const remaining = drainQueue(queue);
  advanceInFlightMoves(world, remaining, windowEnd);
  world.timeMs = windowEnd;

  const nextRound: Round = {
    state: {
      seed: round.state.seed,
      windowIndex: round.state.windowIndex + 1,
      timeMs: world.timeMs,
      agents: structuredClone(world.agents),
      smokes: structuredClone(world.smokes),
      mapId: round.state.mapId,
      rulesetId: round.state.rulesetId,
      catalogVersion: round.state.catalogVersion,
    },
    pending: { attack: null, defense: null },
    pendingJobs: remaining,
    nextSequence: sequence,
    combatState: combat.getState(),
    catalog: round.catalog,
    ruleset: round.ruleset,
    lastWindowEvents: events,
    lastWindowFrames: frames,
    windowStartSnapshot,
    cursor: 0,
  };

  return { ok: true, round: nextRound, events, state: nextRound.state };
}

/** Fogged world for one side: own agents plus enemies currently in line of sight. */
export function view(round: Round, side: Side): World {
  return viewWorld(round.state.mapId, truthWorld(round.state), side);
}

/** Fog-of-war filter over an arbitrary world snapshot (for timeline stepping). */
export function viewWorld(mapId: string, world: World, side: Side): World {
  const map = getMap(mapId);
  const walls = map?.walls ?? [];
  const own = world.agents.filter((agent) => agent.side === side);
  const enemies = world.agents.filter((agent) => agent.side !== side);
  const visibleEnemies = enemies.filter((enemy) =>
    own.some((ally) => {
      if (!ally.alive || !enemy.alive) return false;
      if (hasStatus(ally, STATUS_BLIND, world.timeMs)) return false;
      return hasLineOfSight(
        { xMm: ally.xMm, yMm: ally.yMm },
        { xMm: enemy.xMm, yMm: enemy.yMm },
        walls,
        world.smokes,
        world.timeMs,
      );
    }),
  );
  return {
    timeMs: world.timeMs,
    agents: [...own, ...visibleEnemies],
    smokes: structuredClone(world.smokes),
  };
}

export function truthWorld(state: RoundState): World {
  return {
    timeMs: state.timeMs,
    agents: structuredClone(state.agents),
    smokes: structuredClone(state.smokes),
  };
}

/** Board snapshot while stepping the last resolved window, else current truth. */
export function snapshotRound(round: Round): World {
  if (round.lastWindowEvents.length === 0) {
    return truthWorld(round.state);
  }
  if (round.cursor <= 0) {
    return structuredClone(round.windowStartSnapshot ?? truthWorld(round.state));
  }
  return (
    structuredClone(round.lastWindowFrames[round.cursor - 1]) ??
    structuredClone(round.lastWindowFrames[round.lastWindowFrames.length - 1]!)
  );
}

export function stepRound(round: Round): Round {
  if (round.cursor >= round.lastWindowEvents.length) return round;
  return { ...round, cursor: round.cursor + 1 };
}

function validateOrder(
  round: Round,
  world: World,
  side: Side,
  order: WindowOrder,
): { ok: true } | { ok: false; code: RejectionCode; message: string } {
  const agent = findAgent(world, order.instanceId);
  if (!agent) {
    return { ok: false, code: "unknown-agent", message: `Unknown agent ${order.instanceId}.` };
  }
  if (agent.side !== side) {
    return { ok: false, code: "wrong-side", message: `Agent ${order.instanceId} is not on ${side}.` };
  }
  if (!agent.alive) {
    return { ok: false, code: "agent-down", message: `Agent ${order.instanceId} is down.` };
  }
  if (order.kind === "hold") {
    return { ok: true };
  }
  if (order.kind === "move") {
    if (!Number.isInteger(order.to.xMm) || !Number.isInteger(order.to.yMm)) {
      return { ok: false, code: "invalid-order", message: "Move target must be integer millimeters." };
    }
    return { ok: true };
  }
  if (order.kind === "cast") {
    if (order.aimYawDeg != null) {
      if (!Number.isInteger(order.aimYawDeg) || order.aimYawDeg < 0 || order.aimYawDeg > 359) {
        return { ok: false, code: "invalid-order", message: "aimYawDeg must be an integer in 0..359." };
      }
    }
    if (order.chargeValue != null && !Number.isInteger(order.chargeValue)) {
      return { ok: false, code: "invalid-order", message: "chargeValue must be an integer." };
    }
    if (order.mapTarget != null) {
      if (!Number.isInteger(order.mapTarget.xMm) || !Number.isInteger(order.mapTarget.yMm)) {
        return { ok: false, code: "invalid-order", message: "mapTarget must be integer millimeters." };
      }
    }
    const definition = getAgent(round.catalog, agent.definitionId);
    const origin = { xMm: agent.xMm, yMm: agent.yMm };
    const verdict = evaluateCast(definition, toInstance(agent), order.abilityId, origin, order.target);
    if (!verdict.ok) {
      return { ok: false, code: verdict.code, message: `Cast rejected: ${verdict.code}.` };
    }
    return { ok: true };
  }
  const target = findAgent(world, order.targetInstanceId);
  if (!target) {
    return { ok: false, code: "unknown-agent", message: `Unknown target ${order.targetInstanceId}.` };
  }
  if (target.side === side) {
    return { ok: false, code: "target-not-enemy", message: "Shoot target must be an enemy." };
  }
  if (!target.alive) {
    return { ok: false, code: "agent-down", message: `Target ${order.targetInstanceId} is down.` };
  }
  if (hasStatus(agent, STATUS_BLIND, world.timeMs)) {
    return { ok: false, code: "target-not-visible", message: "Shooter is blinded." };
  }
  const map = getMap(round.state.mapId);
  if (!map) {
    return { ok: false, code: "unknown-map", message: "Scenario map is not loaded." };
  }
  if (
    !hasLineOfSight(
      { xMm: agent.xMm, yMm: agent.yMm },
      { xMm: target.xMm, yMm: target.yMm },
      map.walls,
      world.smokes,
      world.timeMs,
    )
  ) {
    return { ok: false, code: "target-not-visible", message: "Shoot target is not in line of sight." };
  }
  return { ok: true };
}

function advanceInFlightMoves(world: World, remaining: QueueItem<Job>[], windowEnd: number): void {
  for (const item of remaining) {
    if (item.payload.type !== "move-resolve" || item.timeMs <= windowEnd) continue;
    const job = item.payload;
    const agent = findAgent(world, job.instanceId);
    if (!agent) continue;
    const span = item.timeMs - job.startMs;
    if (span <= 0) {
      agent.xMm = job.at.xMm;
      agent.yMm = job.at.yMm;
      continue;
    }
    const t = Math.min(1, Math.max(0, (windowEnd - job.startMs) / span));
    const mid = lerpPoint(job.from, job.at, t);
    agent.xMm = mid.xMm;
    agent.yMm = mid.yMm;
    item.payload = {
      ...job,
      from: mid,
      startMs: windowEnd,
    };
  }
  remaining.sort(compareQueueKeys);
}

function drainQueue(queue: EventQueue<Job>): QueueItem<Job>[] {
  const items: QueueItem<Job>[] = [];
  while (queue.length > 0) {
    const item = queue.pop();
    if (item) items.push(item);
  }
  return items;
}

function cloneOrder(order: WindowOrder): WindowOrder {
  if (order.kind === "move") {
    return { kind: "move", instanceId: order.instanceId, to: { ...order.to } };
  }
  if (order.kind === "cast") {
    return {
      kind: "cast",
      instanceId: order.instanceId,
      abilityId: order.abilityId,
      target: { ...order.target },
      aimYawDeg: order.aimYawDeg,
      chargeValue: order.chargeValue,
      mapTarget: order.mapTarget ? { ...order.mapTarget } : undefined,
    };
  }
  if (order.kind === "shoot") {
    return {
      kind: "shoot",
      instanceId: order.instanceId,
      targetInstanceId: order.targetInstanceId,
    };
  }
  return { kind: "hold", instanceId: order.instanceId };
}

function toInstance(agent: AgentBody) {
  return {
    instanceId: agent.instanceId,
    definitionId: agent.definitionId,
    side: agent.side,
    assignment: null,
    xMm: agent.xMm,
    yMm: agent.yMm,
    hp: agent.hp,
    facingDeg: agent.facingDeg,
    credits: agent.credits,
    charges: agent.charges,
    cooldownReadyAtMs: { ...agent.cooldownReadyAtMs },
    ultimatePoints: agent.ultimatePoints,
    statuses: structuredClone(agent.statuses),
  };
}
