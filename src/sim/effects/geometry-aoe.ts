import type { Point } from "../types.ts";
import { normalizeYawDeg } from "./status.ts";

/**
 * Aftershock cylinder (design): axis from origin along yaw for lengthMm,
 * hit if axial projection in [0, length] and perpendicular distance <= radiusMm.
 */
export function pointInCylinder(
  origin: Point,
  yawDeg: number,
  lengthMm: number,
  radiusMm: number,
  point: Point,
): boolean {
  const rad = (normalizeYawDeg(yawDeg) * Math.PI) / 180;
  const fx = Math.cos(rad);
  const fy = Math.sin(rad);
  const dx = point.xMm - origin.xMm;
  const dy = point.yMm - origin.yMm;
  const along = dx * fx + dy * fy;
  if (along < 0 || along > lengthMm) return false;
  const px = dx - along * fx;
  const py = dy - along * fy;
  return px * px + py * py <= radiusMm * radiusMm;
}

/**
 * Oriented rectangle: starts `startAheadMm` along yaw, extends `lengthMm` further,
 * half-width `halfWidthMm` perpendicular.
 */
export function pointInOrientedRect(
  origin: Point,
  yawDeg: number,
  startAheadMm: number,
  lengthMm: number,
  halfWidthMm: number,
  point: Point,
): boolean {
  const rad = (normalizeYawDeg(yawDeg) * Math.PI) / 180;
  const fx = Math.cos(rad);
  const fy = Math.sin(rad);
  const px = -fy;
  const py = fx;
  const dx = point.xMm - origin.xMm;
  const dy = point.yMm - origin.yMm;
  const along = dx * fx + dy * fy;
  const across = dx * px + dy * py;
  return along >= startAheadMm && along <= startAheadMm + lengthMm && Math.abs(across) <= halfWidthMm;
}
