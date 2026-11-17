import { evaluateCast } from "./agents/cast.ts";
import { getAgent, SHIPPED_CATALOG, type Catalog } from "./agents/catalog.ts";
import { getWeapon, hitProbabilityBp } from "./combat/assumed-rifle.ts";
import { EventQueue } from "./clock.ts";
import { compositionViolation } from "./composition/team.ts";
import { clipSegment, distanceMm } from "./map/geometry.ts";
import { getMap } from "./map/drill-hall.ts";
import { hasLineOfSight } from "./map/line-of-sight.ts";
import { createStream, type Rng } from "./rng.ts";
import type { Order, Scenario } from "./scenario/types.ts";
import type { Point, RejectionCode, Segment, SmokeVolume } from "./types.ts";
import { STANDARD_RULESET, type Ruleset } from "../rules/ruleset.ts";

export type AgentBody = {
  instanceId: string;
  definitionId: string;
  side: "attack" | "defense";
  xMm: number;
  yMm: number;
  hp: number;
  alive: boolean;
  charges: Record<string, number>;
};

export type World = {
  timeMs: number;
  agents: AgentBody[];
  smokes: SmokeVolume[];
};

export type SimEvent = {
  timeMs: number;
  sequence: number;
  agentId: string;
} & (
  | { type: "move-started"; from: Point; to: Point }
  | { type: "move-arrived"; at: Point }
  | { type: "move-blocked"; at: Point }
  | { type: "cast-accepted"; abilityId: string; target: Point; chargesRemaining: number }
  | { type: "cast-rejected"; abilityId: string; code: RejectionCode }
  | { type: "order-rejected"; orderType: string; code: RejectionCode }
  | { type: "smoke-active"; smokeId: string; xMm: number; yMm: number; radiusMm: number }
  | { type: "smoke-expired"; smokeId: string }
  | {
      type: "shot-withheld";
      targetInstanceId: string;
      reason: "no-line-of-sight" | "shooter-down" | "target-down";
    }
  | {
      type: "shot";
      targetInstanceId: string;
      weaponId: string;
      hitProbabilityBp: number;
      draw: number;
      hit: boolean;
      damage: number;
      targetHpAfter: number;
    }
);

export type RunSuccess = {
  ok: true;
  events: SimEvent[];
  initial: World;
  frames: World[];
  final: World;
};

export type RunFailure = {
  ok: false;
  code: RejectionCode;
  message: string;
};

export type RunResult = RunSuccess | RunFailure;

type Job =
  | { type: "move"; instanceId: string; to: Point; speedMmPerSec: number }
  | { type: "cast"; instanceId: string; abilityId: string; target: Point }
  | { type: "engage"; instanceId: string; targetInstanceId: string; weaponId: string }
  | { type: "move-resolve"; instanceId: string; at: Point; blocked: boolean }
  | { type: "smoke-active"; smokeId: string }
  | { type: "smoke-expire"; smokeId: string };

type ApplyResult = {
  world: World;
  event: SimEvent;
  followups: { atMs: number; agentId: string; job: Job }[];
};

/**
 * Scripted orders only. Opponent decision code is not called.
 * Withheld shots do not draw from the combat stream.
 */
export function runScenario(
  scenario: Scenario,
  catalog: Catalog = SHIPPED_CATALOG,
  ruleset: Ruleset = STANDARD_RULESET,
): RunResult {
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

  const initial = createWorld(scenario);
  let world = structuredClone(initial);
  const frames: World[] = [];
  const events: SimEvent[] = [];
  const queue = new EventQueue<Job>();
  let sequence = 1;
  const combat = createStream(scenario.seed, "combat");

  for (const order of scenario.orders) {
    queue.push({
      timeMs: orderTime(order),
      sequence: sequence,
      agentId: order.instanceId,
      payload: orderToJob(order),
    });
    sequence += 1;
  }

  while (queue.length > 0) {
    const item = queue.pop();
    if (!item) break;
    const applied = applyJob(item.payload, item.timeMs, item.sequence, world, catalog, map.walls, combat);
    world = applied.world;
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

  return { ok: true, events, initial, frames, final: world };
}

function orderTime(order: Order): number {
  return order.kind === "move" ? order.startMs : order.atMs;
}

function orderToJob(order: Order): Job {
  if (order.kind === "move") {
    return {
      type: "move",
      instanceId: order.instanceId,
      to: order.to,
      speedMmPerSec: order.speedMmPerSec,
    };
  }
  if (order.kind === "cast") {
    return {
      type: "cast",
      instanceId: order.instanceId,
      abilityId: order.abilityId,
      target: order.target,
    };
  }
  return {
    type: "engage",
    instanceId: order.instanceId,
    targetInstanceId: order.targetInstanceId,
    weaponId: order.weaponId,
  };
}

function applyJob(
  job: Job,
  timeMs: number,
  sequence: number,
  world: World,
  catalog: Catalog,
  walls: readonly Segment[],
  combat: Rng,
): ApplyResult {
  const next = world;
  next.timeMs = timeMs;

  if (job.type === "move") {
    const agent = findAgent(next, job.instanceId);
    if (!agent) {
      return {
        world: next,
        followups: [],
        event: {
          type: "order-rejected",
          timeMs,
          sequence,
          agentId: job.instanceId,
          orderType: "move",
          code: "unknown-agent",
        },
      };
    }
    if (job.speedMmPerSec <= 0) {
      return {
        world: next,
        followups: [],
        event: {
          type: "order-rejected",
          timeMs,
          sequence,
          agentId: job.instanceId,
          orderType: "move",
          code: "invalid-order",
        },
      };
    }
    const from = { xMm: agent.xMm, yMm: agent.yMm };
    const clip = clipSegment(from, job.to, walls);
    const travelMs = Math.round((distanceMm(from, clip.point) * 1000) / job.speedMmPerSec);
    return {
      world: next,
      event: { type: "move-started", timeMs, sequence, agentId: agent.instanceId, from, to: job.to },
      followups: [
        {
          atMs: timeMs + travelMs,
          agentId: agent.instanceId,
          job: { type: "move-resolve", instanceId: agent.instanceId, at: clip.point, blocked: clip.blocked },
        },
      ],
    };
  }

  if (job.type === "move-resolve") {
    const agent = findAgent(next, job.instanceId);
    if (!agent) {
      return {
        world: next,
        followups: [],
        event: {
          type: "order-rejected",
          timeMs,
          sequence,
          agentId: job.instanceId,
          orderType: "move",
          code: "unknown-agent",
        },
      };
    }
    agent.xMm = job.at.xMm;
    agent.yMm = job.at.yMm;
    return {
      world: next,
      followups: [],
      event: job.blocked
        ? { type: "move-blocked", timeMs, sequence, agentId: agent.instanceId, at: { ...job.at } }
        : { type: "move-arrived", timeMs, sequence, agentId: agent.instanceId, at: { ...job.at } },
    };
  }

  if (job.type === "cast") {
    const agent = findAgent(next, job.instanceId);
    const definition = agent ? getAgent(catalog, agent.definitionId) : null;
    const origin = agent ? { xMm: agent.xMm, yMm: agent.yMm } : { xMm: 0, yMm: 0 };
    const verdict = evaluateCast(definition, agent ? toInstance(agent) : null, job.abilityId, origin, job.target);
    if (!verdict.ok || !agent) {
      return {
        world: next,
        followups: [],
        event: {
          type: "cast-rejected",
          timeMs,
          sequence,
          agentId: job.instanceId,
          abilityId: job.abilityId,
          code: verdict.ok ? "unknown-agent" : verdict.code,
        },
      };
    }
    if (verdict.ability.id !== "sky-smoke" || verdict.ability.durationMs === null || verdict.ability.radiusMm === null) {
      return {
        world: next,
        followups: [],
        event: {
          type: "cast-rejected",
          timeMs,
          sequence,
          agentId: agent.instanceId,
          abilityId: job.abilityId,
          code: "ability-not-executable",
        },
      };
    }
    const remaining = (agent.charges[verdict.ability.id] ?? 0) - 1;
    agent.charges[verdict.ability.id] = remaining;
    const deploy = verdict.ability.deployDelayMs ?? 0;
    const smoke: SmokeVolume = {
      id: `smoke-${sequence}`,
      ownerInstanceId: agent.instanceId,
      abilityId: verdict.ability.id,
      xMm: job.target.xMm,
      yMm: job.target.yMm,
      radiusMm: verdict.ability.radiusMm,
      activeFromMs: timeMs + deploy,
      expiresAtMs: timeMs + deploy + verdict.ability.durationMs,
    };
    next.smokes.push(smoke);
    return {
      world: next,
      event: {
        type: "cast-accepted",
        timeMs,
        sequence,
        agentId: agent.instanceId,
        abilityId: verdict.ability.id,
        target: job.target,
        chargesRemaining: remaining,
      },
      followups: [
        { atMs: smoke.activeFromMs, agentId: agent.instanceId, job: { type: "smoke-active", smokeId: smoke.id } },
        { atMs: smoke.expiresAtMs, agentId: agent.instanceId, job: { type: "smoke-expire", smokeId: smoke.id } },
      ],
    };
  }

  if (job.type === "smoke-active" || job.type === "smoke-expire") {
    const smoke = next.smokes.find((item) => item.id === job.smokeId);
    if (!smoke) {
      return {
        world: next,
        followups: [],
        event: {
          type: "order-rejected",
          timeMs,
          sequence,
          agentId: "",
          orderType: job.type,
          code: "invalid-order",
        },
      };
    }
    if (job.type === "smoke-active") {
      return {
        world: next,
        followups: [],
        event: {
          type: "smoke-active",
          timeMs,
          sequence,
          agentId: smoke.ownerInstanceId,
          smokeId: smoke.id,
          xMm: smoke.xMm,
          yMm: smoke.yMm,
          radiusMm: smoke.radiusMm,
        },
      };
    }
    return {
      world: next,
      followups: [],
      event: {
        type: "smoke-expired",
        timeMs,
        sequence,
        agentId: smoke.ownerInstanceId,
        smokeId: smoke.id,
      },
    };
  }

  const shooter = findAgent(next, job.instanceId);
  const target = findAgent(next, job.targetInstanceId);
  if (!shooter || !target) {
    return {
      world: next,
      followups: [],
      event: {
        type: "order-rejected",
        timeMs,
        sequence,
        agentId: job.instanceId,
        orderType: "engage",
        code: "unknown-agent",
      },
    };
  }
  const weapon = getWeapon(job.weaponId);
  if (!weapon) {
    return {
      world: next,
      followups: [],
      event: {
        type: "order-rejected",
        timeMs,
        sequence,
        agentId: shooter.instanceId,
        orderType: "engage",
        code: "invalid-order",
      },
    };
  }
  if (!shooter.alive) {
    return withheld(next, timeMs, sequence, shooter.instanceId, target.instanceId, "shooter-down");
  }
  if (!target.alive) {
    return withheld(next, timeMs, sequence, shooter.instanceId, target.instanceId, "target-down");
  }
  const from = { xMm: shooter.xMm, yMm: shooter.yMm };
  const to = { xMm: target.xMm, yMm: target.yMm };
  if (!hasLineOfSight(from, to, walls, next.smokes, timeMs)) {
    return withheld(next, timeMs, sequence, shooter.instanceId, target.instanceId, "no-line-of-sight");
  }
  const probability = hitProbabilityBp(distanceMm(from, to));
  const draw = combat.nextInt(10000);
  const hit = draw < probability;
  const damage = hit ? weapon.bodyDamage : 0;
  target.hp = Math.max(0, target.hp - damage);
  target.alive = target.hp > 0;
  return {
    world: next,
    followups: [],
    event: {
      type: "shot",
      timeMs,
      sequence,
      agentId: shooter.instanceId,
      targetInstanceId: target.instanceId,
      weaponId: weapon.id,
      hitProbabilityBp: probability,
      draw,
      hit,
      damage,
      targetHpAfter: target.hp,
    },
  };
}

function withheld(
  world: World,
  timeMs: number,
  sequence: number,
  agentId: string,
  targetInstanceId: string,
  reason: "no-line-of-sight" | "shooter-down" | "target-down",
): ApplyResult {
  return {
    world,
    followups: [],
    event: { type: "shot-withheld", timeMs, sequence, agentId, targetInstanceId, reason },
  };
}

function findAgent(world: World, instanceId: string): AgentBody | null {
  return world.agents.find((agent) => agent.instanceId === instanceId) ?? null;
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
    charges: agent.charges,
    cooldownReadyAtMs: {},
    ultimatePoints: 0,
    statuses: [],
  };
}

function createWorld(scenario: Scenario): World {
  const agents = [...scenario.attack.members, ...scenario.defense.members].map((member) => ({
    instanceId: member.instanceId,
    definitionId: member.definitionId,
    side: member.side,
    xMm: member.xMm,
    yMm: member.yMm,
    hp: member.hp,
    alive: member.hp > 0,
    charges: { ...member.charges },
  }));
  return { timeMs: 0, agents, smokes: [] };
}
