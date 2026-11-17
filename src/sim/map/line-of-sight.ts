import { pointSegmentDistanceSq, segmentsIntersect } from "./geometry.ts";
import type { Point, Segment, SmokeVolume } from "../types.ts";

export function wallBlocksSegment(from: Point, to: Point, walls: readonly Segment[]): boolean {
  return walls.some((wall) => segmentsIntersect(from, to, wall.a, wall.b));
}

export function smokeBlocksSegment(
  from: Point,
  to: Point,
  smokes: readonly SmokeVolume[],
  timeMs: number,
): boolean {
  return smokes.some((smoke) => {
    if (timeMs < smoke.activeFromMs || timeMs >= smoke.expiresAtMs) return false;
    const distanceSq = pointSegmentDistanceSq(
      { xMm: smoke.xMm, yMm: smoke.yMm },
      from,
      to,
    );
    return distanceSq <= smoke.radiusMm * smoke.radiusMm;
  });
}

export function activeSmokes(smokes: readonly SmokeVolume[], timeMs: number): SmokeVolume[] {
  return smokes.filter((smoke) => timeMs >= smoke.activeFromMs && timeMs < smoke.expiresAtMs);
}

export function hasLineOfSight(
  from: Point,
  to: Point,
  walls: readonly Segment[],
  smokes: readonly SmokeVolume[],
  timeMs: number,
): boolean {
  if (wallBlocksSegment(from, to, walls)) return false;
  if (smokeBlocksSegment(from, to, smokes, timeMs)) return false;
  return true;
}
