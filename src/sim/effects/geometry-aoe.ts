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

/** Four corners of an oriented rect (clockwise from near-left). */
export function orientedRectCorners(
  origin: Point,
  yawDeg: number,
  startAheadMm: number,
  lengthMm: number,
  halfWidthMm: number,
): Point[] {
  const rad = (normalizeYawDeg(yawDeg) * Math.PI) / 180;
  const fx = Math.cos(rad);
  const fy = Math.sin(rad);
  const px = -fy;
  const py = fx;
  const near = startAheadMm;
  const far = startAheadMm + lengthMm;
  const corner = (along: number, across: number): Point => ({
    xMm: Math.round(origin.xMm + fx * along + px * across),
    yMm: Math.round(origin.yMm + fy * along + py * across),
  });
  return [
    corner(near, -halfWidthMm),
    corner(near, halfWidthMm),
    corner(far, halfWidthMm),
    corner(far, -halfWidthMm),
  ];
}

/**
 * Outline matching `pointInCylinder`: an oriented rectangle of length × 2·radius
 * (axial projection in [0, length], perpendicular distance ≤ radius).
 */
export function cylinderOutline(
  origin: Point,
  yawDeg: number,
  lengthMm: number,
  radiusMm: number,
): Point[] {
  return orientedRectCorners(origin, yawDeg, 0, lengthMm, radiusMm);
}
