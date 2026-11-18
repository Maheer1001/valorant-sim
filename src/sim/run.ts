import { evaluateCast } from "./agents/cast.ts";
import { getAgent, SHIPPED_CATALOG, type Catalog } from "./agents/catalog.ts";
import {
  applyAftershockBurst,
  applyFaultLineWave,
  applyFlashpointImpact,
  applyRollingThunderBlast,
  applyStatusExpire,
  tryResolveBreachCast,
} from "./agents/abilities/breach-resolve.ts";
import {
  applyDeviceExpire,
  applyIncendiaryDetonate,
  applyOrbitalActivate,
  applyOrbitalShrink,
  applyStimBeaconPulse,
  applyZoneExpire,
  applyZoneTick,
  tryResolveBrimstoneCast,
} from "./agents/abilities/brimstone-resolve.ts";
import { getWeapon, hitProbabilityBp } from "./combat/assumed-rifle.ts";
import { grantKillUltPoints } from "./combat/ult-points.ts";
import { EventQueue } from "./clock.ts";
import { compositionViolation } from "./composition/team.ts";
import {
  hasStatus,
  STATUS_BLIND,
  STATUS_COMBAT_STIM,
  STATUS_CONCUSS,
  STATUS_HASTE,
  statusModifier,
  yawToward,
} from "./effects/status.ts";
import { clipSegment, distanceMm } from "./map/geometry.ts";
import { getMap } from "./map/drill-hall.ts";
import { hasLineOfSight } from "./map/line-of-sight.ts";
import { createStream, type Rng } from "./rng.ts";
import type { Order, Scenario } from "./scenario/types.ts";
import type {
  DamageZone,
  Device,
  Point,
  RejectionCode,
  Segment,
  SmokeVolume,
  StatusEffect,
} from "./types.ts";
import { STANDARD_RULESET, type Ruleset } from "../rules/ruleset.ts";

export type AgentBody = {
  instanceId: string;
  definitionId: string;
  side: "attack" | "defense";
  xMm: number;
  yMm: number;
  hp: number;
  alive: boolean;
  facingDeg: number;
  credits: number;
  charges: Record<string, number>;
  cooldownReadyAtMs: Record<string, number>;
  ultimatePoints: number;
  statuses: StatusEffect[];
};

export type World = {
  timeMs: number;
  agents: AgentBody[];
  smokes: SmokeVolume[];
  devices: Device[];
  zones: DamageZone[];
};

/** Outcome of a live round (defined here so `SimEvent` needs no import cycle; re-exported by live-round.ts). */
export type RoundResult =
  | { kind: "attack-eliminated" }
  | { kind: "defense-eliminated" }
  | { kind: "timeout"; winner: "defense" };

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
      reason: "no-line-of-sight" | "shooter-down" | "target-down" | "blinded";
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
  | {
      type: "ability-damage";
      abilityId: string;
      burstIndex: number;
      hits: { targetInstanceId: string; damage: number; targetHpAfter: number }[];
    }
  | {
      type: "flash-resolved";
      abilityId: string;
      blindedInstanceIds: string[];
      blockedInstanceIds: string[];
    }
  | {
      type: "status-wave";
      abilityId: string;
      statusId: string;
      affectedInstanceIds: string[];
      durationMs: number;
      blastIndex?: number;
    }
  | {
      type: "status-expired";
      statusId: string;
      sourceAbilityId: string;
      removed: boolean;
    }
  | { type: "stim-pulse"; deviceId: string; affectedInstanceIds: string[] }
  | { type: "device-expired"; deviceId: string }
  | { type: "incendiary-detonated"; at: Point; bounces: number; zoneId: string }
  | { type: "orbital-activated"; zoneId: string; at: Point }
  | { type: "orbital-shrink"; zoneId: string; radiusMm: number }
  | {
      type: "zone-damage";
      abilityId: string;
      zoneId: string;
      radiusMm: number;
      hits: { targetInstanceId: string; damage: number; targetHpAfter: number }[];
    }
  | { type: "zone-expired"; zoneId: string }
  | { type: "round-ended"; result: RoundResult }
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

export type Job =
  | { type: "move"; instanceId: string; to: Point; speedMmPerSec: number }
  | {
      type: "cast";
      instanceId: string;
      abilityId: string;
      target: Point;
      aimYawDeg?: number;
      chargeValue?: number;
      mapTarget?: Point;
    }
  | { type: "engage"; instanceId: string; targetInstanceId: string; weaponId: string }
  | { type: "auto-engage"; instanceId: string; weaponId: string }
  | {
      type: "move-resolve";
      instanceId: string;
      from: Point;
      at: Point;
      startMs: number;
      blocked: boolean;
    }
  | { type: "smoke-active"; smokeId: string }
  | { type: "smoke-expire"; smokeId: string }
  | { type: "aftershock-burst"; instanceId: string; yawDeg: number; burstIndex: number }
  | { type: "flashpoint-impact"; instanceId: string; impact: Point; yawDeg: number }
  | { type: "fault-line-wave"; instanceId: string; yawDeg: number; lengthMm: number }
  | { type: "rolling-thunder-blast"; instanceId: string; yawDeg: number; blastIndex: number }
  | {
      type: "status-expire";
      instanceId: string;
      statusId: string;
      sourceAbilityId: string;
    }
  | { type: "stim-beacon-pulse"; deviceId: string }
  | { type: "device-expire"; deviceId: string }
  | { type: "incendiary-detonate"; instanceId: string; at: Point; bounces: number }
  | { type: "orbital-activate"; instanceId: string; at: Point }
  | { type: "orbital-shrink"; zoneId: string; smokeId: string; radiusMm: number }
  | { type: "zone-tick"; zoneId: string }
  | { type: "zone-expire"; zoneId: string };

export type ApplyResult = {
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

  const initial = createWorld(scenario, ruleset);
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
    const applied = applyJob(item.payload, item.timeMs, item.sequence, world, catalog, map.walls, combat, ruleset);
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

export function applyJob(
  job: Job,
  timeMs: number,
  sequence: number,
  world: World,
  catalog: Catalog,
  walls: readonly Segment[],
  combat: Rng,
  ruleset: Ruleset = STANDARD_RULESET,
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
    agent.facingDeg = yawToward(from, job.to);
    const clip = clipSegment(from, job.to, walls);
    let speed = job.speedMmPerSec;
    const haste = statusModifier(agent, STATUS_HASTE, "movementSpeed", timeMs);
    if (haste != null) {
      speed = Math.round(speed * haste);
    }
    if (hasStatus(agent, STATUS_CONCUSS, timeMs)) {
      speed = Math.round((speed * ruleset.concussWalkSpeedMultiplierBp) / 10000);
    }
    const safeSpeed = Math.max(1, speed);
    const travelMs = Math.round((distanceMm(from, clip.point) * 1000) / safeSpeed);
    return {
      world: next,
      event: { type: "move-started", timeMs, sequence, agentId: agent.instanceId, from, to: job.to },
      followups: [
        {
          atMs: timeMs + travelMs,
          agentId: agent.instanceId,
          job: {
            type: "move-resolve",
            instanceId: agent.instanceId,
            from,
            at: clip.point,
            startMs: timeMs,
            blocked: clip.blocked,
          },
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
    agent.facingDeg = yawToward(job.from, job.at);
    return {
      world: next,
      followups: [],
      event: job.blocked
        ? { type: "move-blocked", timeMs, sequence, agentId: agent.instanceId, at: { ...job.at } }
        : { type: "move-arrived", timeMs, sequence, agentId: agent.instanceId, at: { ...job.at } },
    };
  }

  if (job.type === "cast") {
    const breach = tryResolveBreachCast(job, timeMs, sequence, next, catalog, walls, ruleset);
    if (breach) return breach;
    const brimstone = tryResolveBrimstoneCast(job, timeMs, sequence, next, catalog, walls, ruleset);
    if (brimstone) return brimstone;

    const agent = findAgent(next, job.instanceId);
    const definition = agent ? getAgent(catalog, agent.definitionId) : null;
    const place = job.mapTarget ?? job.target;
    const origin = agent ? { xMm: agent.xMm, yMm: agent.yMm } : { xMm: 0, yMm: 0 };
    const verdict = evaluateCast(definition, agent ? toInstance(agent) : null, job.abilityId, origin, place);
    return {
      world: next,
      followups: [],
      event: {
        type: "cast-rejected",
        timeMs,
        sequence,
        agentId: job.instanceId,
        abilityId: job.abilityId,
        code: !agent ? "unknown-agent" : verdict.ok ? "ability-not-executable" : verdict.code,
      },
    };
  }

  if (job.type === "aftershock-burst") {
    return applyAftershockBurst(job, timeMs, sequence, next);
  }
  if (job.type === "flashpoint-impact") {
    return applyFlashpointImpact(job, timeMs, sequence, next, walls, ruleset);
  }
  if (job.type === "fault-line-wave") {
    return applyFaultLineWave(job, timeMs, sequence, next);
  }
  if (job.type === "rolling-thunder-blast") {
    return applyRollingThunderBlast(job, timeMs, sequence, next, walls, ruleset);
  }
  if (job.type === "status-expire") {
    return applyStatusExpire(job, timeMs, sequence, next);
  }
  if (job.type === "stim-beacon-pulse") {
    return applyStimBeaconPulse(job, timeMs, sequence, next);
  }
  if (job.type === "device-expire") {
    return applyDeviceExpire(job, timeMs, sequence, next);
  }
  if (job.type === "incendiary-detonate") {
    return applyIncendiaryDetonate(job, timeMs, sequence, next, ruleset);
  }
  if (job.type === "orbital-activate") {
    return applyOrbitalActivate(job, timeMs, sequence, next);
  }
  if (job.type === "orbital-shrink") {
    return applyOrbitalShrink(job, timeMs, sequence, next);
  }
  if (job.type === "zone-tick") {
    return applyZoneTick(job, timeMs, sequence, next);
  }
  if (job.type === "zone-expire") {
    return applyZoneExpire(job, timeMs, sequence, next);
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

  if (job.type === "auto-engage") {
    const shooter = findAgent(next, job.instanceId);
    if (!shooter) {
      return {
        world: next,
        followups: [],
        event: {
          type: "order-rejected",
          timeMs,
          sequence,
          agentId: job.instanceId,
          orderType: "auto-engage",
          code: "unknown-agent",
        },
      };
    }
    if (!shooter.alive) {
      return withheld(next, timeMs, sequence, shooter.instanceId, shooter.instanceId, "shooter-down");
    }
    if (hasStatus(shooter, STATUS_BLIND, timeMs)) {
      return withheld(next, timeMs, sequence, shooter.instanceId, shooter.instanceId, "blinded");
    }
    const target = nearestVisibleEnemy(next, walls, shooter, timeMs);
    if (!target) {
      return withheld(next, timeMs, sequence, shooter.instanceId, shooter.instanceId, "no-line-of-sight");
    }
    return applyJob(
      {
        type: "engage",
        instanceId: shooter.instanceId,
        targetInstanceId: target.instanceId,
        weaponId: job.weaponId,
      },
      timeMs,
      sequence,
      next,
      catalog,
      walls,
      combat,
      ruleset,
    );
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
  if (hasStatus(shooter, STATUS_BLIND, timeMs)) {
    return withheld(next, timeMs, sequence, shooter.instanceId, target.instanceId, "blinded");
  }
  const from = { xMm: shooter.xMm, yMm: shooter.yMm };
  const to = { xMm: target.xMm, yMm: target.yMm };
  if (!hasLineOfSight(from, to, walls, next.smokes, timeMs)) {
    return withheld(next, timeMs, sequence, shooter.instanceId, target.instanceId, "no-line-of-sight");
  }
  let probability = hitProbabilityBp(distanceMm(from, to));
  if (hasStatus(shooter, STATUS_CONCUSS, timeMs)) {
    probability = Math.max(0, probability - ruleset.concussHitChancePenaltyBp);
  }
  const draw = combat.nextInt(10000);
  const hit = draw < probability;
  const damage = hit ? weapon.bodyDamage : 0;
  const wasAlive = target.alive;
  target.hp = Math.max(0, target.hp - damage);
  target.alive = target.hp > 0;
  if (wasAlive && !target.alive) {
    grantKillUltPoints(shooter, target);
  }
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

function nearestVisibleEnemy(
  world: World,
  walls: readonly Segment[],
  shooter: AgentBody,
  timeMs: number,
): AgentBody | null {
  if (hasStatus(shooter, STATUS_BLIND, timeMs)) return null;
  let best: AgentBody | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const from = { xMm: shooter.xMm, yMm: shooter.yMm };
  for (const other of world.agents) {
    if (!other.alive || other.side === shooter.side) continue;
    const to = { xMm: other.xMm, yMm: other.yMm };
    if (!hasLineOfSight(from, to, walls, world.smokes, timeMs)) continue;
    const distance = distanceMm(from, to);
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

function withheld(
  world: World,
  timeMs: number,
  sequence: number,
  agentId: string,
  targetInstanceId: string,
  reason: "no-line-of-sight" | "shooter-down" | "target-down" | "blinded",
): ApplyResult {
  return {
    world,
    followups: [],
    event: { type: "shot-withheld", timeMs, sequence, agentId, targetInstanceId, reason },
  };
}

export function findAgent(world: World, instanceId: string): AgentBody | null {
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
    facingDeg: agent.facingDeg,
    credits: agent.credits,
    charges: agent.charges,
    cooldownReadyAtMs: { ...agent.cooldownReadyAtMs },
    ultimatePoints: agent.ultimatePoints,
    statuses: structuredClone(agent.statuses),
  };
}

export function createWorld(scenario: Scenario, ruleset: Ruleset = STANDARD_RULESET): World {
  const agents = [...scenario.attack.members, ...scenario.defense.members].map((member) => ({
    instanceId: member.instanceId,
    definitionId: member.definitionId,
    side: member.side,
    xMm: member.xMm,
    yMm: member.yMm,
    hp: member.hp,
    alive: member.hp > 0,
    facingDeg: member.facingDeg ?? 0,
    credits: member.credits ?? ruleset.startingCredits,
    charges: { ...member.charges },
    cooldownReadyAtMs: { ...member.cooldownReadyAtMs },
    ultimatePoints: member.ultimatePoints ?? 0,
    statuses: structuredClone(member.statuses ?? []),
  }));
  return { timeMs: 0, agents, smokes: [], devices: [], zones: [] };
}

/** Auto-fire interval, shortened by Combat Stim fireRate when present. */
export function autoFireIntervalFor(agent: AgentBody, timeMs: number, ruleset: Ruleset): number {
  const rate = statusModifier(agent, STATUS_COMBAT_STIM, "fireRate", timeMs);
  if (rate == null || rate <= 0) return ruleset.autoFireIntervalMs;
  return Math.max(1, Math.round(ruleset.autoFireIntervalMs / rate));
}

/** Linear interpolate integer mm positions. */
export function lerpPoint(from: Point, to: Point, t: number): Point {
  return {
    xMm: Math.round(from.xMm + (to.xMm - from.xMm) * t),
    yMm: Math.round(from.yMm + (to.yMm - from.yMm) * t),
  };
}
