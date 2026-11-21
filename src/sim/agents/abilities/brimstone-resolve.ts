import type { Catalog } from "../catalog.ts";
import { getAgent } from "../catalog.ts";
import type { ApplyResult, CastResolver, Job, JobHandler, JobOf } from "../../jobs/types.ts";
import { findAgent, type World } from "../../world.ts";
import type { BrimstoneJob } from "./brimstone-jobs.ts";
import { spendUltPoints } from "../../combat/ult-points.ts";
import {
  applyStatus,
  normalizeYawDeg,
  pointFromYaw,
  STATUS_COMBAT_STIM,
  STATUS_HASTE,
} from "../../effects/status.ts";
import { clipSegment, distanceMm } from "../../map/geometry.ts";
import type { DamageZone, Device, Point, RejectionCode, Segment, SmokeVolume } from "../../types.ts";
import type { Ruleset } from "../../../rules/ruleset.ts";
import { SKY_SMOKE_ID } from "./sky-smoke.ts";
import {
  INCENDIARY_ID,
  ORBITAL_STRIKE_ID,
  STIM_BEACON_ID,
} from "./brimstone.ts";

export type CastExtras = {
  aimYawDeg?: number;
  chargeValue?: number;
  mapTarget?: Point;
};

export function tryResolveBrimstoneCast(
  job: { type: "cast"; instanceId: string; abilityId: string; target: Point } & CastExtras,
  timeMs: number,
  sequence: number,
  world: World,
  catalog: Catalog,
  walls: readonly Segment[],
  ruleset: Ruleset,
): ApplyResult | null {
  if (
    job.abilityId !== STIM_BEACON_ID &&
    job.abilityId !== INCENDIARY_ID &&
    job.abilityId !== SKY_SMOKE_ID &&
    job.abilityId !== ORBITAL_STRIKE_ID
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
  if (definition.id !== "brimstone") {
    return reject(world, timeMs, sequence, agent.instanceId, job.abilityId, "ability-not-owned");
  }

  const place = job.mapTarget ?? job.target;
  if (job.aimYawDeg != null) {
    agent.facingDeg = ((Math.round(job.aimYawDeg) % 360) + 360) % 360;
  } else {
    agent.facingDeg = yawTo(agent, place);
  }

  if (ability.maxRangeMm != null && distanceMm({ xMm: agent.xMm, yMm: agent.yMm }, place) > ability.maxRangeMm) {
    return reject(world, timeMs, sequence, agent.instanceId, job.abilityId, "out-of-range");
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

  const chargesRemaining = ability.maxCharges === null ? -1 : (agent.charges[ability.id] ?? 0);
  const accepted = {
    type: "cast-accepted" as const,
    timeMs,
    sequence,
    agentId: agent.instanceId,
    abilityId: ability.id,
    target: place,
    chargesRemaining,
  };

  if (ability.id === SKY_SMOKE_ID) {
    if (ability.durationMs === null || ability.radiusMm === null) {
      return reject(world, timeMs, sequence, agent.instanceId, job.abilityId, "ability-not-executable");
    }
    const deploy = ability.deployDelayMs ?? 0;
    const smoke: SmokeVolume = {
      id: `smoke-${sequence}`,
      ownerInstanceId: agent.instanceId,
      abilityId: ability.id,
      xMm: place.xMm,
      yMm: place.yMm,
      radiusMm: ability.radiusMm,
      activeFromMs: timeMs + deploy,
      expiresAtMs: timeMs + deploy + ability.durationMs,
    };
    world.smokes.push(smoke);
    return {
      world,
      event: accepted,
      followups: [
        { atMs: smoke.activeFromMs, agentId: agent.instanceId, job: { type: "smoke-active", smokeId: smoke.id } },
        { atMs: smoke.expiresAtMs, agentId: agent.instanceId, job: { type: "smoke-expire", smokeId: smoke.id } },
      ],
    };
  }

  if (ability.id === STIM_BEACON_ID) {
    const clipped = clipSegment({ xMm: agent.xMm, yMm: agent.yMm }, place, walls);
    const device: Device = {
      id: `stim-${sequence}`,
      kind: "stim-beacon",
      ownerInstanceId: agent.instanceId,
      abilityId: STIM_BEACON_ID,
      side: agent.side,
      xMm: clipped.point.xMm,
      yMm: clipped.point.yMm,
      radiusMm: 6000,
      activeFromMs: timeMs,
      expiresAtMs: timeMs + 12000,
      enemiesSeeRadius: false,
      indestructible: true,
    };
    world.devices.push(device);
    const pulses: { atMs: number; agentId: string; job: Job }[] = [];
    for (let at = timeMs; at < device.expiresAtMs; at += ruleset.stimBeaconPulseMs) {
      pulses.push({
        atMs: at,
        agentId: agent.instanceId,
        job: { type: "stim-beacon-pulse", deviceId: device.id },
      });
    }
    pulses.push({
      atMs: device.expiresAtMs,
      agentId: agent.instanceId,
      job: { type: "device-expire", deviceId: device.id },
    });
    return {
      world,
      event: accepted,
      followups: pulses,
    };
  }

  if (ability.id === INCENDIARY_ID) {
    const yaw = agent.facingDeg;
    const detonate = resolveIncendiaryPath(
      { xMm: agent.xMm, yMm: agent.yMm },
      yaw,
      walls,
      ruleset.incendiaryFloorSpacingMm,
    );
    const equip = ability.deployDelayMs ?? 1100;
    return {
      world,
      event: accepted,
      followups: [
        {
          atMs: timeMs + equip,
          agentId: agent.instanceId,
          job: {
            type: "incendiary-detonate",
            instanceId: agent.instanceId,
            at: detonate.point,
            bounces: detonate.bounces,
          },
        },
      ],
    };
  }

  // Orbital Strike
  return {
    world,
    event: accepted,
    followups: [
      {
        atMs: timeMs + 2000,
        agentId: agent.instanceId,
        job: {
          type: "orbital-activate",
          instanceId: agent.instanceId,
          at: place,
        },
      },
    ],
  };
}

export function applyStimBeaconPulse(
  job: Extract<Job, { type: "stim-beacon-pulse" }>,
  timeMs: number,
  sequence: number,
  world: World,
): ApplyResult {
  const device = world.devices.find((item) => item.id === job.deviceId);
  if (!device || timeMs >= device.expiresAtMs) {
    return {
      world,
      followups: [],
      event: {
        type: "order-rejected",
        timeMs,
        sequence,
        agentId: "",
        orderType: "stim-beacon-pulse",
        code: "invalid-order",
      },
    };
  }
  const affected: string[] = [];
  for (const agent of world.agents) {
    if (!agent.alive || agent.side !== device.side) continue;
    if (distanceMm({ xMm: agent.xMm, yMm: agent.yMm }, { xMm: device.xMm, yMm: device.yMm }) > device.radiusMm) {
      continue;
    }
    // Linger 4 s after leaving: refresh untilMs to now + linger while inside.
    applyStatus(agent, {
      id: STATUS_COMBAT_STIM,
      sourceAbilityId: STIM_BEACON_ID,
      untilMs: timeMs + 4000,
      modifiers: {
        fireRate: 1.1,
        reloadTime: 0.9,
        drawTime: 0.9,
        spreadRecovery: 1.1,
      },
    });
    applyStatus(agent, {
      id: STATUS_HASTE,
      sourceAbilityId: STIM_BEACON_ID,
      untilMs: timeMs + 4000,
      modifiers: { movementSpeed: 1.1 },
    });
    affected.push(agent.instanceId);
  }
  return {
    world,
    followups: [],
    event: {
      type: "stim-pulse",
      timeMs,
      sequence,
      agentId: device.ownerInstanceId,
      deviceId: device.id,
      affectedInstanceIds: affected,
    },
  };
}

export function applyDeviceExpire(
  job: Extract<Job, { type: "device-expire" }>,
  timeMs: number,
  sequence: number,
  world: World,
): ApplyResult {
  const device = world.devices.find((item) => item.id === job.deviceId);
  world.devices = world.devices.filter((item) => item.id !== job.deviceId);
  return {
    world,
    followups: [],
    event: {
      type: "device-expired",
      timeMs,
      sequence,
      agentId: device?.ownerInstanceId ?? "",
      deviceId: job.deviceId,
    },
  };
}

export function applyIncendiaryDetonate(
  job: Extract<Job, { type: "incendiary-detonate" }>,
  timeMs: number,
  sequence: number,
  world: World,
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
        orderType: "incendiary-detonate",
        code: "unknown-agent",
      },
    };
  }
  const zone: DamageZone = {
    id: `incendiary-${sequence}`,
    abilityId: INCENDIARY_ID,
    ownerInstanceId: caster.instanceId,
    side: caster.side,
    xMm: job.at.xMm,
    yMm: job.at.yMm,
    fullRadiusMm: 4500,
    activeFromMs: timeMs,
    expiresAtMs: timeMs + 8000,
    burstEndMs: timeMs + 250,
    spreadEndMs: timeMs + 250 + 750,
    fullEndMs: timeMs + 8000,
    shrinkEndMs: null,
    damagesAllies: false,
    blocksVision: false,
    tickDamage: ruleset.incendiaryTickDamage,
    tickIntervalMs: ruleset.incendiaryTickIntervalMs,
  };
  world.zones.push(zone);
  const followups: { atMs: number; agentId: string; job: Job }[] = [];
  for (let at = timeMs; at < zone.expiresAtMs; at += zone.tickIntervalMs) {
    followups.push({
      atMs: at,
      agentId: caster.instanceId,
      job: { type: "zone-tick", zoneId: zone.id },
    });
  }
  followups.push({
    atMs: zone.expiresAtMs,
    agentId: caster.instanceId,
    job: { type: "zone-expire", zoneId: zone.id },
  });
  return {
    world,
    followups,
    event: {
      type: "incendiary-detonated",
      timeMs,
      sequence,
      agentId: caster.instanceId,
      at: job.at,
      bounces: job.bounces,
      zoneId: zone.id,
    },
  };
}

export function applyOrbitalActivate(
  job: Extract<Job, { type: "orbital-activate" }>,
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
        orderType: "orbital-activate",
        code: "unknown-agent",
      },
    };
  }
  const activeMs = 3000;
  const shrinkMs = 750;
  const zone: DamageZone = {
    id: `orbital-${sequence}`,
    abilityId: ORBITAL_STRIKE_ID,
    ownerInstanceId: caster.instanceId,
    side: caster.side,
    xMm: job.at.xMm,
    yMm: job.at.yMm,
    fullRadiusMm: 9000,
    activeFromMs: timeMs,
    expiresAtMs: timeMs + activeMs + shrinkMs,
    burstEndMs: timeMs,
    spreadEndMs: timeMs,
    fullEndMs: timeMs + activeMs,
    shrinkEndMs: timeMs + activeMs + shrinkMs,
    damagesAllies: false,
    blocksVision: true,
    tickDamage: 20,
    tickIntervalMs: 150,
  };
  world.zones.push(zone);
  const smoke: SmokeVolume = {
    id: `orbital-vision-${sequence}`,
    ownerInstanceId: caster.instanceId,
    abilityId: ORBITAL_STRIKE_ID,
    xMm: job.at.xMm,
    yMm: job.at.yMm,
    radiusMm: 9000,
    activeFromMs: timeMs,
    expiresAtMs: zone.expiresAtMs,
  };
  world.smokes.push(smoke);

  const followups: { atMs: number; agentId: string; job: Job }[] = [];
  for (let at = timeMs; at < timeMs + activeMs; at += 150) {
    followups.push({
      atMs: at,
      agentId: caster.instanceId,
      job: { type: "zone-tick", zoneId: zone.id },
    });
  }
  // Shrink: update vision radius linearly over shrinkMs.
  const shrinkSteps = 5;
  for (let i = 1; i <= shrinkSteps; i += 1) {
    const at = timeMs + activeMs + Math.round((shrinkMs * i) / shrinkSteps);
    followups.push({
      atMs: at,
      agentId: caster.instanceId,
      job: {
        type: "orbital-shrink",
        zoneId: zone.id,
        smokeId: smoke.id,
        radiusMm: Math.round(9000 * (1 - i / shrinkSteps)),
      },
    });
  }
  followups.push({
    atMs: zone.expiresAtMs,
    agentId: caster.instanceId,
    job: { type: "zone-expire", zoneId: zone.id },
  });
  followups.push({
    atMs: smoke.expiresAtMs,
    agentId: caster.instanceId,
    job: { type: "smoke-expire", smokeId: smoke.id },
  });
  return {
    world,
    followups,
    event: {
      type: "orbital-activated",
      timeMs,
      sequence,
      agentId: caster.instanceId,
      zoneId: zone.id,
      at: job.at,
    },
  };
}

export function applyZoneTick(
  job: Extract<Job, { type: "zone-tick" }>,
  timeMs: number,
  sequence: number,
  world: World,
): ApplyResult {
  const zone = world.zones.find((item) => item.id === job.zoneId);
  if (!zone || timeMs < zone.activeFromMs || timeMs >= zone.expiresAtMs) {
    return {
      world,
      followups: [],
      event: {
        type: "order-rejected",
        timeMs,
        sequence,
        agentId: "",
        orderType: "zone-tick",
        code: "invalid-order",
      },
    };
  }
  const radius = zoneRadiusMm(zone, timeMs);
  const hits: { targetInstanceId: string; damage: number; targetHpAfter: number }[] = [];
  for (const other of world.agents) {
    if (!other.alive) continue;
    if (!zone.damagesAllies && other.side === zone.side) continue;
    if (distanceMm({ xMm: other.xMm, yMm: other.yMm }, { xMm: zone.xMm, yMm: zone.yMm }) > radius) {
      continue;
    }
    other.hp = Math.max(0, other.hp - zone.tickDamage);
    other.alive = other.hp > 0;
    hits.push({ targetInstanceId: other.instanceId, damage: zone.tickDamage, targetHpAfter: other.hp });
  }
  return {
    world,
    followups: [],
    event: {
      type: "zone-damage",
      timeMs,
      sequence,
      agentId: zone.ownerInstanceId,
      abilityId: zone.abilityId,
      zoneId: zone.id,
      radiusMm: radius,
      hits,
    },
  };
}

export function applyOrbitalShrink(
  job: Extract<Job, { type: "orbital-shrink" }>,
  timeMs: number,
  sequence: number,
  world: World,
): ApplyResult {
  const zone = world.zones.find((item) => item.id === job.zoneId);
  const smoke = world.smokes.find((item) => item.id === job.smokeId);
  if (smoke) smoke.radiusMm = job.radiusMm;
  return {
    world,
    followups: [],
    event: {
      type: "orbital-shrink",
      timeMs,
      sequence,
      agentId: zone?.ownerInstanceId ?? "",
      zoneId: job.zoneId,
      radiusMm: job.radiusMm,
    },
  };
}

export function applyZoneExpire(
  job: Extract<Job, { type: "zone-expire" }>,
  timeMs: number,
  sequence: number,
  world: World,
): ApplyResult {
  const zone = world.zones.find((item) => item.id === job.zoneId);
  world.zones = world.zones.filter((item) => item.id !== job.zoneId);
  return {
    world,
    followups: [],
    event: {
      type: "zone-expired",
      timeMs,
      sequence,
      agentId: zone?.ownerInstanceId ?? "",
      zoneId: job.zoneId,
    },
  };
}

/**
 * Current Incendiary / Orbital radius.
 * Incendiary: radius 0 during burst, grows 0→full over spread (design), then full.
 * Orbital: full until fullEndMs, then linear shrink (handled via smoke updates; zone radius for damage stays full until shrink jobs — damage only during activeSec ticks).
 */
export function zoneRadiusMm(zone: DamageZone, timeMs: number): number {
  if (zone.abilityId === ORBITAL_STRIKE_ID) {
    if (zone.shrinkEndMs != null && timeMs >= zone.fullEndMs && zone.shrinkEndMs > zone.fullEndMs) {
      const t = (timeMs - zone.fullEndMs) / (zone.shrinkEndMs - zone.fullEndMs);
      return Math.max(0, Math.round(zone.fullRadiusMm * (1 - Math.min(1, Math.max(0, t)))));
    }
    return zone.fullRadiusMm;
  }
  // Incendiary
  if (timeMs < zone.burstEndMs) return 0;
  if (timeMs < zone.spreadEndMs) {
    const span = zone.spreadEndMs - zone.burstEndMs;
    const t = span <= 0 ? 1 : (timeMs - zone.burstEndMs) / span;
    return Math.round(zone.fullRadiusMm * Math.min(1, Math.max(0, t)));
  }
  return zone.fullRadiusMm;
}

/**
 * Flat-map Incendiary path: floor contacts every spacingMm; first two are bounces,
 * third detonates. Wall hits also consume a bounce (reflect) or detonate if none left.
 * `contacts` lists bounce points (not including the final detonation point).
 */
export function resolveIncendiaryPath(
  origin: Point,
  yawDeg: number,
  walls: readonly Segment[],
  spacingMm: number,
): { point: Point; bounces: number; contacts: Point[] } {
  let pos = { ...origin };
  let yaw = normalizeYawDeg(yawDeg);
  let bounces = 0;
  const contacts: Point[] = [];
  const maxBounces = 2;
  for (let contact = 1; contact <= maxBounces + 1; contact += 1) {
    const next = pointFromYaw(pos, yaw, spacingMm);
    const clip = clipSegment(pos, next, walls);
    if (clip.blocked) {
      if (bounces >= maxBounces) {
        return { point: clip.point, bounces, contacts };
      }
      bounces += 1;
      // Reflect off axis-aligned wall: if stopped short of next, reverse dominant axis.
      const traveled = distanceMm(pos, clip.point);
      if (Math.abs(next.xMm - pos.xMm) >= Math.abs(next.yMm - pos.yMm)) {
        yaw = normalizeYawDeg(180 - yaw);
      } else {
        yaw = normalizeYawDeg(-yaw);
      }
      pos = clip.point;
      contacts.push({ ...pos });
      if (traveled < 1 && contact > 1) {
        return { point: pos, bounces, contacts };
      }
      continue;
    }
    pos = clip.point;
    if (contact <= maxBounces) {
      bounces += 1;
      contacts.push({ ...pos });
    } else {
      return { point: pos, bounces, contacts };
    }
  }
  return { point: pos, bounces, contacts };
}

function yawTo(agent: { xMm: number; yMm: number }, to: Point): number {
  const rad = Math.atan2(to.yMm - agent.yMm, to.xMm - agent.xMm);
  return ((Math.round((rad * 180) / Math.PI) % 360) + 360) % 360;
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

/** Brimstone job handlers (same calls as the former applyJob branches). */
export const BRIMSTONE_JOB_HANDLERS: { [K in BrimstoneJob["type"]]: JobHandler<JobOf<K>> } = {
  "stim-beacon-pulse": (job, ctx) => applyStimBeaconPulse(job, ctx.timeMs, ctx.sequence, ctx.world),
  "device-expire": (job, ctx) => applyDeviceExpire(job, ctx.timeMs, ctx.sequence, ctx.world),
  "incendiary-detonate": (job, ctx) => applyIncendiaryDetonate(job, ctx.timeMs, ctx.sequence, ctx.world, ctx.ruleset),
  "orbital-activate": (job, ctx) => applyOrbitalActivate(job, ctx.timeMs, ctx.sequence, ctx.world),
  "orbital-shrink": (job, ctx) => applyOrbitalShrink(job, ctx.timeMs, ctx.sequence, ctx.world),
  "zone-tick": (job, ctx) => applyZoneTick(job, ctx.timeMs, ctx.sequence, ctx.world),
  "zone-expire": (job, ctx) => applyZoneExpire(job, ctx.timeMs, ctx.sequence, ctx.world),
};

/** Brimstone casts, including Sky Smoke (same call as the former second branch of the cast job). */
export const BRIMSTONE_CAST_RESOLVER: CastResolver = {
  agentId: "brimstone",
  abilityIds: [STIM_BEACON_ID, INCENDIARY_ID, SKY_SMOKE_ID, ORBITAL_STRIKE_ID],
  resolve: (job, ctx) =>
    tryResolveBrimstoneCast(job, ctx.timeMs, ctx.sequence, ctx.world, ctx.catalog, ctx.walls, ctx.ruleset),
};
