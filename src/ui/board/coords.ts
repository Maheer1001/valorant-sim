import type { Point } from "../../sim/types.ts";

/** Convert an SVG client click into integer map millimeters. */
export function clientToMm(
  clientX: number,
  clientY: number,
  svgRect: { left: number; top: number; width: number; height: number },
  mapWidthMm: number,
  mapHeightMm: number,
): Point {
  if (svgRect.width <= 0 || svgRect.height <= 0) {
    return { xMm: 0, yMm: 0 };
  }
  return {
    xMm: Math.round(((clientX - svgRect.left) / svgRect.width) * mapWidthMm),
    yMm: Math.round(((clientY - svgRect.top) / svgRect.height) * mapHeightMm),
  };
}

/** Identity for this SVG viewBox (coords are already mm). Kept for tests and future scale. */
export function mmToSvg(point: Point): Point {
  return { xMm: point.xMm, yMm: point.yMm };
}

/** Integer yaw degrees 0–359 from `from` toward `to` (atan2, y-down SVG). */
export function yawDegFromPoints(from: Point, to: Point): number {
  const rad = Math.atan2(to.yMm - from.yMm, to.xMm - from.xMm);
  const deg = Math.round((rad * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

/** True when `point` is within `rangeMm` of `origin` (integer hypot rounded). */
export function pointInRange(origin: Point, point: Point, rangeMm: number): boolean {
  const distance = Math.round(Math.hypot(point.xMm - origin.xMm, point.yMm - origin.yMm));
  return distance <= rangeMm;
}

/** Integer distance in millimeters. */
export function distanceMm(a: Point, b: Point): number {
  return Math.round(Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm));
}

/** Point at `distanceMm` along `yawDeg` from origin (integer mm). */
export function pointFromYawPreview(origin: Point, yawDeg: number, distance: number): Point {
  const normalized = ((Math.round(yawDeg) % 360) + 360) % 360;
  const rad = (normalized * Math.PI) / 180;
  return {
    xMm: Math.round(origin.xMm + Math.cos(rad) * distance),
    yMm: Math.round(origin.yMm + Math.sin(rad) * distance),
  };
}
