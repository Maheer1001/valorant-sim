import type { Catalog } from "../catalog.ts";
import { getAgent } from "../catalog.ts";
import type { ApplyResult, Job, World } from "../../run.ts";
import { findAgent } from "../../run.ts";
import { clipSegment } from "../../map/geometry.ts";
import { hasLineOfSight } from "../../map/line-of-sight.ts";
import type { Point, RejectionCode, Segment } from "../../types.ts";
import type { Ruleset } from "../../../rules/ruleset.ts";
import {
  AFTERSHOCK_ID,
  FAULT_LINE_ID,
  FLASHPOINT_ID,
  ROLLING_THUNDER_ID,
} from "./breach.ts";
import { applyStatus, lookingAt, pointFromYaw, STATUS_BLIND, STATUS_CONCUSS } from "../../effects/status.ts";
import { pointInCylinder, pointInOrientedRect } from "../../effects/geometry-aoe.ts";
import { grantKillUltPoints, spendUltPoints } from "../../combat/ult-points.ts";

/** Design: Flashpoint look corridor half-width. Not a measured Valorant cone width. */
const FLASHPOINT_CORRIDOR_HALF_WIDTH_MM = 4000;

export type CastExtras = {
  aimYawDeg?: number;
  chargeValue?: number;
  mapTarget?: Point;
};

export function tryResolveBreachCast(
  job: { type: "cast"; instanceId: string; abilityId: string; target: Point } & CastExtras,
  timeMs: number,
  sequence: number,
  world: World,
  catalog: Catalog,
  _walls: readonly Segment[],
  ruleset: Ruleset,
): ApplyResult | null {
  if (
    job.abilityId !== AFTERSHOCK_ID &&
    job.abilityId !== FLASHPOINT_ID &&
    job.abilityId !== FAULT_LINE_ID &&
    job.abilityId !== ROLLING_THUNDER_ID
  ) {
    return null;
  }

  const agent = findAgent(world, job.instanceId);
  const definition = agent ? getAgent(catalog, agent.definitionId) : null;
  const ability = definition?.abilities.find((item) => item.id === job.abilityId);
  if (!agent || !definition) {
    return reject(world, timeMs, sequence, job.instanceId, job.abilityId, "unknown-agent");
  }
  if (!ability) {
    return reject(world, timeMs, sequence, agent.instanceId, job.abilityId, "ability-not-owned");
  }
  if (ability.implementation !== "complete") {
    return reject(world, timeMs, sequence, agent.instanceId, job.abilityId, "ability-not-executable");
  }

  const yaw = job.aimYawDeg ?? agent.facingDeg;
  agent.facingDeg = ((Math.round(yaw) % 360) + 360) % 360;

  if (ability.signatureCooldownMs != null) {
    const ready = agent.cooldownReadyAtMs[ability.id] ?? 0;
    if (timeMs < ready) {
      return reject(world, timeMs, sequence, agent.instanceId, job.abilityId, "signature-on-cooldown");
    }
    // Signature recharge restores the charge pool once the cooldown has elapsed.
    if (ability.maxCharges !== null) {
      agent.charges[ability.id] = ability.maxCharges;
    }
  }

  if (ability.ultPointCost != null && ability.ultPointCost > 0) {
    if (!spendUltPoints(agent, ability.ultPointCost)) {
      return reject(world, timeMs, sequence, agent.instanceId, job.abilityId, "insufficient-ult-points");
    }
  }

  if (ability.maxCharges !== null) {
    const charges = agent.charges[ability.id] ?? 0;
    if (charges <= 0) {
      return reject(world, timeMs, sequence, agent.instanceId, job.abilityId, "insufficient-charges");
    }
    agent.charges[ability.id] = charges - 1;
  }

  if (ability.signatureCooldownMs != null) {
    agent.cooldownReadyAtMs[ability.id] = timeMs + ability.signatureCooldownMs;
  }

  const chargesRemaining = ability.maxCharges === null ? -1 : (agent.charges[ability.id] ?? 0);
  const accepted = {
    type: "cast-accepted" as const,
    timeMs,
    sequence,
    agentId: agent.instanceId,
    abilityId: ability.id,
    target: job.target,
    chargesRemaining,
  };

  if (ability.id === AFTERSHOCK_ID) {
    const windup = 2200;
    const interval = 600;
    return {
      world,
      event: accepted,
      followups: [0, 1].map((burst) => ({
        atMs: timeMs + windup + burst * interval,
        agentId: agent.instanceId,
        job: {
          type: "aftershock-burst",
          instanceId: agent.instanceId,
          yawDeg: agent.facingDeg,
          burstIndex: burst,
        } satisfies Job,
      })),
    };
  }

  if (ability.id === FLASHPOINT_ID) {
    const windup = 500;
    const impactAt = timeMs + windup + ruleset.flashpointFlightMs;
    const impact = pointFromYaw({ xMm: agent.xMm, yMm: agent.yMm }, agent.facingDeg, 10000);
    return {
      world,
      event: accepted,
      followups: [
        {
          atMs: impactAt,
          agentId: agent.instanceId,
          job: {
            type: "flashpoint-impact",
            instanceId: agent.instanceId,
            impact,
            yawDeg: agent.facingDeg,
          },
        },
      ],
    };
  }

  if (ability.id === FAULT_LINE_ID) {
    const lengthM = clamp(job.chargeValue ?? 8, 8, 56);
    const chargeMs = 1000;
    const windup = 1100;
    return {
      world,
      event: accepted,
      followups: [
        {
          atMs: timeMs + chargeMs + windup,
          agentId: agent.instanceId,
          job: {
            type: "fault-line-wave",
            instanceId: agent.instanceId,
            yawDeg: agent.facingDeg,
            lengthMm: lengthM * 1000,
          },
        },
      ],
    };
  }

  // Rolling Thunder
  const channel = 600;
  const blasts = 8;
  const interval = 255;
  const followups = [];
  for (let i = 0; i < blasts; i += 1) {
    followups.push({
      atMs: timeMs + channel + i * interval,
      agentId: agent.instanceId,
      job: {
        type: "rolling-thunder-blast",
        instanceId: agent.instanceId,
        yawDeg: agent.facingDeg,
        blastIndex: i,
      } satisfies Job,
    });
  }
  return { world, event: accepted, followups };
}

export function applyAftershockBurst(
  job: Extract<Job, { type: "aftershock-burst" }>,
  timeMs: number,
  sequence: number,
  world: World,
): ApplyResult {
  const caster = findAgent(world, job.instanceId);
  if (!caster) {
    return {
      world,
      followups: [],
      event: {
        type: "order-rejected",
        timeMs,
        sequence,
        agentId: job.instanceId,
        orderType: "aftershock-burst",
        code: "unknown-agent",
      },
    };
  }
  // Design geometry: axis along yaw for cylinderLength 10 m, radius 3 m (verified lengths).
  // Already-accepted casts resolve from the body even if the caster dies mid-windup.
  const origin = { xMm: caster.xMm, yMm: caster.yMm };
  const hits: { targetInstanceId: string; damage: number; targetHpAfter: number }[] = [];
  for (const other of world.agents) {
    if (!other.alive || other.instanceId === caster.instanceId) continue;
    if (
      pointInCylinder(origin, job.yawDeg, 10000, 3000, { xMm: other.xMm, yMm: other.yMm })
    ) {
      const wasAlive = other.alive;
      other.hp = Math.max(0, other.hp - 80);
      other.alive = other.hp > 0;
      if (wasAlive && !other.alive) {
        grantKillUltPoints(caster, other);
      }
      hits.push({ targetInstanceId: other.instanceId, damage: 80, targetHpAfter: other.hp });
    }
  }
  return {
    world,
    followups: [],
    event: {
      type: "ability-damage",
      timeMs,
      sequence,
      agentId: caster.instanceId,
      abilityId: AFTERSHOCK_ID,
      burstIndex: job.burstIndex,
      hits,
    },
  };
}

export function applyFlashpointImpact(
  job: Extract<Job, { type: "flashpoint-impact" }>,
  timeMs: number,
  sequence: number,
  world: World,
  walls: readonly Segment[],
  ruleset: Ruleset,
): ApplyResult {
  const caster = findAgent(world, job.instanceId);
  if (!caster) {
    return {
      world,
      followups: [],
      event: {
        type: "order-rejected",
        timeMs,
        sequence,
        agentId: job.instanceId,
        orderType: "flashpoint-impact",
        code: "unknown-agent",
      },
    };
  }
  const blinded: string[] = [];
  const blocked: string[] = [];
  const origin = { xMm: caster.xMm, yMm: caster.yMm };
  for (const other of world.agents) {
    if (!other.alive || other.side === caster.side) continue;
    // Design: flash corridor = wallDepth 10 m ahead, half-width FLASHPOINT_CORRIDOR_HALF_WIDTH_MM.
    const inCorridor = pointInOrientedRect(origin, job.yawDeg, 0, 10000, FLASHPOINT_CORRIDOR_HALF_WIDTH_MM, {
      xMm: other.xMm,
      yMm: other.yMm,
    });
    if (!inCorridor) continue;
    // Through-walls: ignore solid walls; active smoke still blocks the flash look.
    if (!hasLineOfSight(origin, { xMm: other.xMm, yMm: other.yMm }, [], world.smokes, timeMs)) {
      blocked.push(other.instanceId);
      continue;
    }
    if (
      !lookingAt(other.facingDeg, { xMm: other.xMm, yMm: other.yMm }, job.impact, ruleset.flashLookHalfAngleDeg)
    ) {
      continue;
    }
    applyStatus(other, {
      id: STATUS_BLIND,
      sourceAbilityId: FLASHPOINT_ID,
      untilMs: timeMs + 2250,
    });
    blinded.push(other.instanceId);
  }
  return {
    world,
    followups: blinded.map((id) => ({
      atMs: timeMs + 2250,
      agentId: id,
      job: { type: "status-expire", instanceId: id, statusId: STATUS_BLIND, sourceAbilityId: FLASHPOINT_ID },
    })),
    event: {
      type: "flash-resolved",
      timeMs,
      sequence,
      agentId: caster.instanceId,
      abilityId: FLASHPOINT_ID,
      blindedInstanceIds: blinded,
      blockedInstanceIds: blocked,
    },
  };
}

export function applyFaultLineWave(
  job: Extract<Job, { type: "fault-line-wave" }>,
  timeMs: number,
  sequence: number,
  world: World,
): ApplyResult {
  const caster = findAgent(world, job.instanceId);
  if (!caster) {
    return {
      world,
      followups: [],
      event: {
        type: "order-rejected",
        timeMs,
        sequence,
        agentId: job.instanceId,
        orderType: "fault-line-wave",
        code: "unknown-agent",
      },
    };
  }
  const origin = { xMm: caster.xMm, yMm: caster.yMm };
  const affected: string[] = [];
  for (const other of world.agents) {
    if (!other.alive || other.side === caster.side) continue;
    if (
      pointInOrientedRect(origin, job.yawDeg, 8000, job.lengthMm, 4000, {
        xMm: other.xMm,
        yMm: other.yMm,
      })
    ) {
      applyStatus(other, {
        id: STATUS_CONCUSS,
        sourceAbilityId: FAULT_LINE_ID,
        untilMs: timeMs + 2500,
      });
      affected.push(other.instanceId);
    }
  }
  return {
    world,
    followups: affected.map((id) => ({
      atMs: timeMs + 2500,
      agentId: id,
      job: { type: "status-expire", instanceId: id, statusId: STATUS_CONCUSS, sourceAbilityId: FAULT_LINE_ID },
    })),
    event: {
      type: "status-wave",
      timeMs,
      sequence,
      agentId: caster.instanceId,
      abilityId: FAULT_LINE_ID,
      statusId: STATUS_CONCUSS,
      affectedInstanceIds: affected,
      durationMs: 2500,
    },
  };
}

export function applyRollingThunderBlast(
  job: Extract<Job, { type: "rolling-thunder-blast" }>,
  timeMs: number,
  sequence: number,
  world: World,
  walls: readonly Segment[],
  ruleset: Ruleset,
): ApplyResult {
  const caster = findAgent(world, job.instanceId);
  if (!caster) {
    return {
      world,
      followups: [],
      event: {
        type: "order-rejected",
        timeMs,
        sequence,
        agentId: job.instanceId,
        orderType: "rolling-thunder-blast",
        code: "unknown-agent",
      },
    };
  }
  const origin = { xMm: caster.xMm, yMm: caster.yMm };
  const affected: string[] = [];
  for (const other of world.agents) {
    if (!other.alive || other.side === caster.side) continue;
    if (
      pointInOrientedRect(origin, job.yawDeg, 8000, 32000, 9000, {
        xMm: other.xMm,
        yMm: other.yMm,
      })
    ) {
      applyStatus(other, {
        id: STATUS_CONCUSS,
        sourceAbilityId: ROLLING_THUNDER_ID,
        untilMs: timeMs + 4000,
      });
      const pushed = pointFromYaw(
        { xMm: other.xMm, yMm: other.yMm },
        job.yawDeg,
        ruleset.rollingThunderKnockbackMm,
      );
      const clipped = clipSegment({ xMm: other.xMm, yMm: other.yMm }, pushed, walls);
      other.xMm = clipped.point.xMm;
      other.yMm = clipped.point.yMm;
      affected.push(other.instanceId);
    }
  }
  return {
    world,
    followups: affected.map((id) => ({
      atMs: timeMs + 4000,
      agentId: id,
      job: {
        type: "status-expire",
        instanceId: id,
        statusId: STATUS_CONCUSS,
        sourceAbilityId: ROLLING_THUNDER_ID,
      },
    })),
    event: {
      type: "status-wave",
      timeMs,
      sequence,
      agentId: caster.instanceId,
      abilityId: ROLLING_THUNDER_ID,
      statusId: STATUS_CONCUSS,
      affectedInstanceIds: affected,
      durationMs: 4000,
      blastIndex: job.blastIndex,
    },
  };
}

export function applyStatusExpire(
  job: Extract<Job, { type: "status-expire" }>,
  timeMs: number,
  sequence: number,
  world: World,
): ApplyResult {
  const agent = findAgent(world, job.instanceId);
  if (!agent) {
    return {
      world,
      followups: [],
      event: {
        type: "order-rejected",
        timeMs,
        sequence,
        agentId: job.instanceId,
        orderType: "status-expire",
        code: "unknown-agent",
      },
    };
  }
  // Only drop the status when its untilMs has actually elapsed (refresh-safe).
  const before = agent.statuses.length;
  agent.statuses = agent.statuses.filter((status) => {
    if (status.id !== job.statusId || status.sourceAbilityId !== job.sourceAbilityId) return true;
    return status.untilMs > timeMs;
  });
  return {
    world,
    followups: [],
    event: {
      type: "status-expired",
      timeMs,
      sequence,
      agentId: agent.instanceId,
      statusId: job.statusId,
      sourceAbilityId: job.sourceAbilityId,
      removed: agent.statuses.length < before,
    },
  };
}

function reject(
  world: World,
  timeMs: number,
  sequence: number,
  agentId: string,
  abilityId: string,
  code: RejectionCode,
): ApplyResult {
  return {
    world,
    followups: [],
    event: {
      type: "cast-rejected",
      timeMs,
      sequence,
      agentId,
      abilityId,
      code,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
