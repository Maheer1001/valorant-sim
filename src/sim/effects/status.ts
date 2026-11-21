import type { AgentBody } from "../world.ts";
import type { StatusEffect } from "../types.ts";

export const STATUS_CONCUSS = "concuss";
export const STATUS_BLIND = "blind";
export const STATUS_HASTE = "haste";
export const STATUS_COMBAT_STIM = "combat-stim";

export function statusModifier(agent: AgentBody, statusId: string, key: string, timeMs: number): number | null {
  const status = activeStatuses(agent, timeMs).find((item) => item.id === statusId);
  if (!status?.modifiers || !(key in status.modifiers)) return null;
  return status.modifiers[key] ?? null;
}

export function activeStatuses(agent: AgentBody, timeMs: number): StatusEffect[] {
  return agent.statuses.filter((status) => timeMs < status.untilMs);
}

export function hasStatus(agent: AgentBody, id: string, timeMs: number): boolean {
  return activeStatuses(agent, timeMs).some((status) => status.id === id);
}

export function applyStatus(
  agent: AgentBody,
  status: StatusEffect,
): void {
  const existing = agent.statuses.findIndex(
    (item) => item.id === status.id && item.sourceAbilityId === status.sourceAbilityId,
  );
  if (existing >= 0) {
    const current = agent.statuses[existing]!;
    agent.statuses[existing] = {
      ...current,
      untilMs: Math.max(current.untilMs, status.untilMs),
    };
    return;
  }
  agent.statuses.push({ ...status });
}

export function pruneStatuses(agent: AgentBody, timeMs: number): StatusEffect[] {
  const expired = agent.statuses.filter((status) => timeMs >= status.untilMs);
  agent.statuses = agent.statuses.filter((status) => timeMs < status.untilMs);
  return expired;
}

export function normalizeYawDeg(yawDeg: number): number {
  const rounded = Math.round(yawDeg) % 360;
  return rounded < 0 ? rounded + 360 : rounded;
}

/** Smallest signed turn from `fromDeg` to `toDeg` in (-180, 180]. */
export function yawDeltaDeg(fromDeg: number, toDeg: number): number {
  let delta = normalizeYawDeg(toDeg) - normalizeYawDeg(fromDeg);
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

export function yawToward(from: { xMm: number; yMm: number }, to: { xMm: number; yMm: number }): number {
  const rad = Math.atan2(to.yMm - from.yMm, to.xMm - from.xMm);
  return normalizeYawDeg((rad * 180) / Math.PI);
}

export function lookingAt(
  viewerYawDeg: number,
  viewer: { xMm: number; yMm: number },
  target: { xMm: number; yMm: number },
  halfAngleDeg: number,
): boolean {
  const bearing = yawToward(viewer, target);
  return Math.abs(yawDeltaDeg(viewerYawDeg, bearing)) <= halfAngleDeg;
}

export function pointFromYaw(
  origin: { xMm: number; yMm: number },
  yawDeg: number,
  distanceMm: number,
): { xMm: number; yMm: number } {
  const rad = (normalizeYawDeg(yawDeg) * Math.PI) / 180;
  return {
    xMm: Math.round(origin.xMm + Math.cos(rad) * distanceMm),
    yMm: Math.round(origin.yMm + Math.sin(rad) * distanceMm),
  };
}
