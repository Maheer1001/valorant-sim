import { getWeapon, hitProbabilityBp } from "../combat/assumed-rifle.ts";
import { grantKillUltPoints } from "../combat/ult-points.ts";
import {
  hasStatus,
  STATUS_BLIND,
  STATUS_CONCUSS,
  STATUS_HASTE,
  statusModifier,
  yawToward,
} from "../effects/status.ts";
import { clipSegment, distanceMm } from "../map/geometry.ts";
import { hasLineOfSight } from "../map/line-of-sight.ts";
import type { Segment } from "../types.ts";
import { findAgent, type AgentBody, type World } from "../world.ts";
import { applyStatusExpire } from "./status-expire.ts";
import type { ApplyResult, JobHandler, JobOf } from "./types.ts";

/* Engine-owned job handlers. Bodies moved verbatim from the applyJob if-chain in run.ts. */

const applyMove: JobHandler<JobOf<"move">> = (job, ctx) => {
  const { timeMs, sequence, walls, ruleset } = ctx;
  const next = ctx.world;
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
};

const applyMoveResolve: JobHandler<JobOf<"move-resolve">> = (job, ctx) => {
  const { timeMs, sequence } = ctx;
  const next = ctx.world;
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
};

const applySmoke: JobHandler<JobOf<"smoke-active"> | JobOf<"smoke-expire">> = (job, ctx) => {
  const { timeMs, sequence } = ctx;
  const next = ctx.world;
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
};

/** Formerly the fall-through at the end of applyJob. */
const applyEngage: JobHandler<JobOf<"engage">> = (job, ctx) => {
  const { timeMs, sequence, walls, combat, ruleset } = ctx;
  const next = ctx.world;
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
};

const applyAutoEngage: JobHandler<JobOf<"auto-engage">> = (job, ctx) => {
  const { timeMs, sequence, walls } = ctx;
  const next = ctx.world;
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
  return applyEngage(
    {
      type: "engage",
      instanceId: shooter.instanceId,
      targetInstanceId: target.instanceId,
      weaponId: job.weaponId,
    },
    ctx,
  );
};

type CoreHandledType = "move" | "move-resolve" | "engage" | "auto-engage" | "smoke-active" | "smoke-expire" | "status-expire";

/** Core handlers except `cast` (see jobs/cast.ts). */
export const CORE_JOB_HANDLERS: { [K in CoreHandledType]: JobHandler<JobOf<K>> } = {
  move: applyMove,
  "move-resolve": applyMoveResolve,
  engage: applyEngage,
  "auto-engage": applyAutoEngage,
  "smoke-active": applySmoke,
  "smoke-expire": applySmoke,
  "status-expire": (job, ctx) => applyStatusExpire(job, ctx.timeMs, ctx.sequence, ctx.world),
};

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
