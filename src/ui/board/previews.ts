import {
  AFTERSHOCK_ID,
  FAULT_LINE_ID,
  FLASHPOINT_ID,
  ROLLING_THUNDER_ID,
} from "../../sim/agents/abilities/breach.ts";
import {
  AFTERSHOCK_CYLINDER_LENGTH_MM,
  AFTERSHOCK_RADIUS_MM,
  FAULT_LINE_HALF_WIDTH_MM,
  FAULT_LINE_LENGTH_MAX_M,
  FAULT_LINE_LENGTH_MIN_M,
  FAULT_LINE_START_AHEAD_MM,
  FLASHPOINT_CORRIDOR_HALF_WIDTH_MM,
  FLASHPOINT_RANGE_MM,
  ROLLING_THUNDER_HALF_WIDTH_MM,
  ROLLING_THUNDER_LENGTH_MM,
  ROLLING_THUNDER_START_AHEAD_MM,
} from "../../sim/agents/abilities/geometry-constants.ts";
import {
  INCENDIARY_ID,
  ORBITAL_STRIKE_ID,
  STIM_BEACON_ID,
} from "../../sim/agents/abilities/brimstone.ts";
import { resolveIncendiaryPath } from "../../sim/agents/abilities/brimstone-resolve.ts";
import { SKY_SMOKE_ID } from "../../sim/agents/abilities/sky-smoke.ts";
import {
  cylinderOutline,
  orientedRectCorners,
  pointInCylinder,
  pointInOrientedRect,
} from "../../sim/effects/geometry-aoe.ts";
import { clipSegment, distanceMm } from "../../sim/map/geometry.ts";
import type { Point, Segment } from "../../sim/types.ts";
import { yawDegFromPoints } from "./coords.ts";

export type PreviewPrimitive =
  | { kind: "polyline"; points: Point[]; faint?: boolean; stroke?: string }
  | { kind: "polygon"; points: Point[]; fill?: string }
  | { kind: "circle"; center: Point; radiusMm: number; dashed?: boolean; fill?: boolean }
  | { kind: "line"; from: Point; to: Point }
  | { kind: "dots"; points: Point[] }
  | { kind: "label"; at: Point; text: string };

export type AbilityPreview = {
  primitives: PreviewPrimitive[];
  /** Hit-test matching the sim resolve geometry (no wall/smoke extras except as noted). */
  contains: (point: Point) => boolean;
};

export function clampFaultLengthM(meters: number): number {
  return Math.max(FAULT_LINE_LENGTH_MIN_M, Math.min(FAULT_LINE_LENGTH_MAX_M, Math.round(meters)));
}

/** Travel time along clipped waypoints at constant walk speed (same clip as the live runner). */
export function routeTravelMs(
  from: Point,
  waypoints: readonly Point[],
  walls: readonly Segment[],
  walkSpeedMmPerSec: number,
): { points: Point[]; travelMs: number } {
  const points: Point[] = [{ ...from }];
  let cursor = from;
  let travelMs = 0;
  const speed = Math.max(1, walkSpeedMmPerSec);
  for (const waypoint of waypoints) {
    const clip = clipSegment(cursor, waypoint, walls);
    points.push({ ...clip.point });
    travelMs += Math.round((distanceMm(cursor, clip.point) * 1000) / speed);
    cursor = clip.point;
    if (clip.blocked) break;
  }
  return { points, travelMs };
}

export function movementPreview(input: {
  from: Point;
  waypoints: readonly Point[];
  walls: readonly Segment[];
  walkSpeedMmPerSec: number;
  faint?: boolean;
  label?: string;
}): PreviewPrimitive[] {
  const { points, travelMs } = routeTravelMs(
    input.from,
    input.waypoints,
    input.walls,
    input.walkSpeedMmPerSec,
  );
  const primitives: PreviewPrimitive[] = [
    { kind: "polyline", points, faint: input.faint ?? false },
  ];
  if (!input.faint) {
    const tip = points[points.length - 1]!;
    const text = input.label ?? `ETA ${(travelMs / 1000).toFixed(1)}s`;
    primitives.push({ kind: "label", at: { xMm: tip.xMm + 200, yMm: tip.yMm - 200 }, text });
  }
  return primitives;
}

export function abilityPreview(input: {
  abilityId: string;
  origin: Point;
  aim: Point;
  walls: readonly Segment[];
  chargeLengthM?: number;
  radiusMm?: number | null;
  maxRangeMm?: number | null;
  incendiarySpacingMm: number;
}): AbilityPreview {
  const yaw = yawDegFromPoints(input.origin, input.aim);
  const aimLine: PreviewPrimitive = { kind: "line", from: input.origin, to: input.aim };

  switch (input.abilityId) {
    case AFTERSHOCK_ID: {
      const polygon = cylinderOutline(
        input.origin,
        yaw,
        AFTERSHOCK_CYLINDER_LENGTH_MM,
        AFTERSHOCK_RADIUS_MM,
      );
      return {
        primitives: [aimLine, { kind: "polygon", points: polygon }],
        contains: (point) =>
          pointInCylinder(
            input.origin,
            yaw,
            AFTERSHOCK_CYLINDER_LENGTH_MM,
            AFTERSHOCK_RADIUS_MM,
            point,
          ),
      };
    }
    case FLASHPOINT_ID: {
      const polygon = orientedRectCorners(
        input.origin,
        yaw,
        0,
        FLASHPOINT_RANGE_MM,
        FLASHPOINT_CORRIDOR_HALF_WIDTH_MM,
      );
      return {
        primitives: [aimLine, { kind: "polygon", points: polygon }],
        contains: (point) =>
          pointInOrientedRect(
            input.origin,
            yaw,
            0,
            FLASHPOINT_RANGE_MM,
            FLASHPOINT_CORRIDOR_HALF_WIDTH_MM,
            point,
          ),
      };
    }
    case FAULT_LINE_ID: {
      const lengthM = clampFaultLengthM(input.chargeLengthM ?? 20);
      const lengthMm = lengthM * 1000;
      const polygon = orientedRectCorners(
        input.origin,
        yaw,
        FAULT_LINE_START_AHEAD_MM,
        lengthMm,
        FAULT_LINE_HALF_WIDTH_MM,
      );
      return {
        primitives: [
          aimLine,
          { kind: "polygon", points: polygon },
          {
            kind: "label",
            at: { xMm: input.aim.xMm + 200, yMm: input.aim.yMm - 200 },
            text: `${lengthM} m`,
          },
        ],
        contains: (point) =>
          pointInOrientedRect(
            input.origin,
            yaw,
            FAULT_LINE_START_AHEAD_MM,
            lengthMm,
            FAULT_LINE_HALF_WIDTH_MM,
            point,
          ),
      };
    }
    case ROLLING_THUNDER_ID: {
      const polygon = orientedRectCorners(
        input.origin,
        yaw,
        ROLLING_THUNDER_START_AHEAD_MM,
        ROLLING_THUNDER_LENGTH_MM,
        ROLLING_THUNDER_HALF_WIDTH_MM,
      );
      return {
        primitives: [aimLine, { kind: "polygon", points: polygon }],
        contains: (point) =>
          pointInOrientedRect(
            input.origin,
            yaw,
            ROLLING_THUNDER_START_AHEAD_MM,
            ROLLING_THUNDER_LENGTH_MM,
            ROLLING_THUNDER_HALF_WIDTH_MM,
            point,
          ),
      };
    }
    case INCENDIARY_ID: {
      const path = resolveIncendiaryPath(
        input.origin,
        yaw,
        input.walls,
        input.incendiarySpacingMm,
      );
      const radius = input.radiusMm ?? 4500;
      return {
        primitives: [
          aimLine,
          { kind: "dots", points: path.contacts },
          { kind: "circle", center: path.point, radiusMm: radius, fill: true },
        ],
        contains: (point) => distanceMm(point, path.point) <= radius,
      };
    }
    case STIM_BEACON_ID: {
      const radius = input.radiusMm ?? 6000;
      return {
        primitives: [aimLine, { kind: "circle", center: input.aim, radiusMm: radius, fill: true }],
        contains: (point) => distanceMm(point, input.aim) <= radius,
      };
    }
    case SKY_SMOKE_ID:
    case ORBITAL_STRIKE_ID: {
      const radius = input.radiusMm ?? (input.abilityId === ORBITAL_STRIKE_ID ? 9000 : 4150);
      const range = input.maxRangeMm ?? (input.abilityId === ORBITAL_STRIKE_ID ? 60000 : 55000);
      return {
        primitives: [
          { kind: "circle", center: input.origin, radiusMm: range, dashed: true },
          { kind: "circle", center: input.aim, radiusMm: radius, fill: true },
        ],
        contains: (point) => distanceMm(point, input.aim) <= radius,
      };
    }
    default:
      return {
        primitives: [aimLine],
        contains: () => false,
      };
  }
}

/** Formation-preserving destinations: each agent keeps offset from group centroid. */
export function formationDestinations(
  agents: readonly { instanceId: string; xMm: number; yMm: number }[],
  click: Point,
): { instanceId: string; destination: Point }[] {
  if (agents.length === 0) return [];
  const cx = Math.round(agents.reduce((sum, agent) => sum + agent.xMm, 0) / agents.length);
  const cy = Math.round(agents.reduce((sum, agent) => sum + agent.yMm, 0) / agents.length);
  return agents.map((agent) => ({
    instanceId: agent.instanceId,
    destination: {
      xMm: click.xMm + (agent.xMm - cx),
      yMm: click.yMm + (agent.yMm - cy),
    },
  }));
}
