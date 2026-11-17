import type { Point, Segment } from "../types.ts";

export function distanceMm(a: Point, b: Point): number {
  return Math.round(Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm));
}

function orient(a: Point, b: Point, c: Point): number {
  return (b.xMm - a.xMm) * (c.yMm - a.yMm) - (b.yMm - a.yMm) * (c.xMm - a.xMm);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    p.xMm <= Math.max(a.xMm, b.xMm) &&
    p.xMm >= Math.min(a.xMm, b.xMm) &&
    p.yMm <= Math.max(a.yMm, b.yMm) &&
    p.yMm >= Math.min(a.yMm, b.yMm)
  );
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
    return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
  }
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {
    return true;
  }
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

export type ClipResult = {
  point: Point;
  blocked: boolean;
};

/**
 * Stop 1 mm before the first wall crossing. Axis-aligned integer walls on
 * Drill Hall land on integer coordinates.
 */
export function clipSegment(from: Point, to: Point, walls: readonly Segment[]): ClipResult {
  const dx = to.xMm - from.xMm;
  const dy = to.yMm - from.yMm;
  const length = Math.hypot(dx, dy);
  let bestT = Number.POSITIVE_INFINITY;

  for (const wall of walls) {
    const rx = dx;
    const ry = dy;
    const sx = wall.b.xMm - wall.a.xMm;
    const sy = wall.b.yMm - wall.a.yMm;
    const denom = rx * sy - ry * sx;
    if (denom === 0) {
      if (orient(from, to, wall.a) === 0 && segmentsIntersect(from, to, wall.a, wall.b)) {
        bestT = Math.min(bestT, 0);
      }
      continue;
    }
    const qpx = wall.a.xMm - from.xMm;
    const qpy = wall.a.yMm - from.yMm;
    const t = (qpx * sy - qpy * sx) / denom;
    const u = (qpx * ry - qpy * rx) / denom;
    if (t > 0 && t <= 1 && u >= 0 && u <= 1 && t < bestT) {
      bestT = t;
    }
  }

  if (!Number.isFinite(bestT)) {
    return { point: { xMm: to.xMm, yMm: to.yMm }, blocked: false };
  }

  const tStop = length === 0 ? 0 : Math.max(0, bestT - 1 / length);
  return {
    point: {
      xMm: Math.round(from.xMm + dx * tStop),
      yMm: Math.round(from.yMm + dy * tStop),
    },
    blocked: true,
  };
}

export function pointSegmentDistanceSq(point: Point, a: Point, b: Point): number {
  const dx = b.xMm - a.xMm;
  const dy = b.yMm - a.yMm;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = point.xMm - a.xMm;
    const ey = point.yMm - a.yMm;
    return ex * ex + ey * ey;
  }
  const raw = ((point.xMm - a.xMm) * dx + (point.yMm - a.yMm) * dy) / lenSq;
  const t = Math.max(0, Math.min(1, raw));
  const cx = a.xMm + t * dx;
  const cy = a.yMm + t * dy;
  const ex = point.xMm - cx;
  const ey = point.yMm - cy;
  return ex * ex + ey * ey;
}
