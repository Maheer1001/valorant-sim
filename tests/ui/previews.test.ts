import { describe, expect, it } from "vitest";
import {
  AFTERSHOCK_CYLINDER_LENGTH_MM,
  AFTERSHOCK_RADIUS_MM,
  FAULT_LINE_HALF_WIDTH_MM,
  FAULT_LINE_START_AHEAD_MM,
  FLASHPOINT_CORRIDOR_HALF_WIDTH_MM,
  FLASHPOINT_RANGE_MM,
  ROLLING_THUNDER_HALF_WIDTH_MM,
  ROLLING_THUNDER_LENGTH_MM,
  ROLLING_THUNDER_START_AHEAD_MM,
} from "../../src/sim/agents/abilities/geometry-constants.ts";
import { pointInCylinder, pointInOrientedRect } from "../../src/sim/effects/geometry-aoe.ts";
import { DRILL_HALL } from "../../src/sim/map/drill-hall.ts";
import { distanceMm } from "../../src/sim/map/geometry.ts";
import { resolveIncendiaryPath } from "../../src/sim/agents/abilities/brimstone-resolve.ts";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import {
  abilityPreview,
  clampFaultLengthM,
  etaLabelForTravelMs,
  formationDestinations,
  movementPreview,
  routeTravelMs,
} from "../../src/ui/board/previews.ts";

const origin = { xMm: 2000, yMm: 6000 };
const aim = { xMm: 8000, yMm: 6000 };

describe("board previews", () => {
  it("clamps Fault Line length to reference bounds", () => {
    expect(clampFaultLengthM(2)).toBe(8);
    expect(clampFaultLengthM(80)).toBe(56);
    expect(clampFaultLengthM(20.4)).toBe(20);
  });

  it("omits ETA labels when travel distance is zero", () => {
    expect(etaLabelForTravelMs(0)).toBeNull();
    expect(etaLabelForTravelMs(-1)).toBeNull();
    expect(etaLabelForTravelMs(1500)).toBe("ETA 1.5s");
    const idle = movementPreview({
      from: origin,
      waypoints: [origin],
      walls: DRILL_HALL.walls,
      walkSpeedMmPerSec: 3500,
    });
    expect(idle.some((item) => item.kind === "label")).toBe(false);
    const moving = movementPreview({
      from: origin,
      waypoints: [aim],
      walls: DRILL_HALL.walls,
      walkSpeedMmPerSec: 3500,
    });
    expect(moving.some((item) => item.kind === "label" && item.text.startsWith("ETA "))).toBe(true);
  });

  it("formation destinations keep offsets from the centroid", () => {
    const dests = formationDestinations(
      [
        { instanceId: "a", xMm: 1000, yMm: 1000 },
        { instanceId: "b", xMm: 3000, yMm: 1000 },
      ],
      { xMm: 10000, yMm: 5000 },
    );
    expect(dests).toEqual([
      { instanceId: "a", destination: { xMm: 9000, yMm: 5000 } },
      { instanceId: "b", destination: { xMm: 11000, yMm: 5000 } },
    ]);
  });

  it("route ETA uses the same wall clipping as the sim", () => {
    const from = { xMm: 2000, yMm: 2000 };
    const to = { xMm: 15000, yMm: 2000 };
    const { travelMs, points } = routeTravelMs(from, [to], DRILL_HALL.walls, 3500);
    expect(points.length).toBeGreaterThan(1);
    expect(travelMs).toBeGreaterThan(0);
  });

  it("Aftershock preview matches pointInCylinder", () => {
    const preview = abilityPreview({
      abilityId: "aftershock",
      origin,
      aim,
      walls: DRILL_HALL.walls,
      incendiarySpacingMm: STANDARD_RULESET.incendiaryFloorSpacingMm,
    });
    const inside = { xMm: 5000, yMm: 6000 };
    const outside = { xMm: 5000, yMm: 9500 };
    expect(preview.contains(inside)).toBe(
      pointInCylinder(origin, 0, AFTERSHOCK_CYLINDER_LENGTH_MM, AFTERSHOCK_RADIUS_MM, inside),
    );
    expect(preview.contains(outside)).toBe(
      pointInCylinder(origin, 0, AFTERSHOCK_CYLINDER_LENGTH_MM, AFTERSHOCK_RADIUS_MM, outside),
    );
    expect(preview.contains(inside)).toBe(true);
    expect(preview.contains(outside)).toBe(false);
  });

  it("Flashpoint preview matches corridor geometry", () => {
    const preview = abilityPreview({
      abilityId: "flashpoint",
      origin,
      aim,
      walls: DRILL_HALL.walls,
      incendiarySpacingMm: STANDARD_RULESET.incendiaryFloorSpacingMm,
    });
    const inside = { xMm: 10000, yMm: 6500 };
    const outside = { xMm: 10000, yMm: 11000 };
    expect(preview.contains(inside)).toBe(
      pointInOrientedRect(origin, 0, 0, FLASHPOINT_RANGE_MM, FLASHPOINT_CORRIDOR_HALF_WIDTH_MM, inside),
    );
    expect(preview.contains(outside)).toBe(false);
    expect(preview.contains(inside)).toBe(true);
  });

  it("Fault Line preview matches charge length rectangle", () => {
    const preview = abilityPreview({
      abilityId: "fault-line",
      origin,
      aim,
      walls: DRILL_HALL.walls,
      chargeLengthM: 20,
      incendiarySpacingMm: STANDARD_RULESET.incendiaryFloorSpacingMm,
    });
    const inside = { xMm: 2000 + 8000 + 5000, yMm: 6000 };
    const outside = { xMm: 2000 + 8000 + 5000, yMm: 11000 };
    expect(preview.contains(inside)).toBe(
      pointInOrientedRect(origin, 0, FAULT_LINE_START_AHEAD_MM, 20000, FAULT_LINE_HALF_WIDTH_MM, inside),
    );
    expect(preview.contains(inside)).toBe(true);
    expect(preview.contains(outside)).toBe(false);
  });

  it("Rolling Thunder preview matches blast rectangle", () => {
    const preview = abilityPreview({
      abilityId: "rolling-thunder",
      origin,
      aim,
      walls: DRILL_HALL.walls,
      incendiarySpacingMm: STANDARD_RULESET.incendiaryFloorSpacingMm,
    });
    const inside = { xMm: 2000 + 8000 + 4000, yMm: 6000 };
    const outside = { xMm: 2000 + 8000 + 4000, yMm: 16000 };
    expect(preview.contains(inside)).toBe(
      pointInOrientedRect(
        origin,
        0,
        ROLLING_THUNDER_START_AHEAD_MM,
        ROLLING_THUNDER_LENGTH_MM,
        ROLLING_THUNDER_HALF_WIDTH_MM,
        inside,
      ),
    );
    expect(preview.contains(inside)).toBe(true);
    expect(preview.contains(outside)).toBe(false);
  });

  it("Incendiary preview uses resolveIncendiaryPath landing", () => {
    const preview = abilityPreview({
      abilityId: "incendiary",
      origin,
      aim,
      walls: DRILL_HALL.walls,
      radiusMm: 4500,
      incendiarySpacingMm: STANDARD_RULESET.incendiaryFloorSpacingMm,
    });
    const path = resolveIncendiaryPath(
      origin,
      0,
      DRILL_HALL.walls,
      STANDARD_RULESET.incendiaryFloorSpacingMm,
    );
    expect(preview.contains(path.point)).toBe(true);
    expect(preview.contains({ xMm: path.point.xMm + 8000, yMm: path.point.yMm })).toBe(false);
    expect(distanceMm(path.point, path.point)).toBe(0);
  });

  it("Stim Beacon / Sky Smoke / Orbital preview radii", () => {
    const stim = abilityPreview({
      abilityId: "stim-beacon",
      origin,
      aim,
      walls: DRILL_HALL.walls,
      radiusMm: 6000,
      incendiarySpacingMm: STANDARD_RULESET.incendiaryFloorSpacingMm,
    });
    expect(stim.contains(aim)).toBe(true);
    expect(stim.contains({ xMm: aim.xMm + 7000, yMm: aim.yMm })).toBe(false);

    const smoke = abilityPreview({
      abilityId: "sky-smoke",
      origin,
      aim,
      walls: DRILL_HALL.walls,
      radiusMm: 4150,
      maxRangeMm: 55000,
      incendiarySpacingMm: STANDARD_RULESET.incendiaryFloorSpacingMm,
    });
    expect(smoke.contains(aim)).toBe(true);
    expect(smoke.contains({ xMm: aim.xMm + 6000, yMm: aim.yMm })).toBe(false);

    const orbital = abilityPreview({
      abilityId: "orbital-strike",
      origin,
      aim,
      walls: DRILL_HALL.walls,
      radiusMm: 9000,
      maxRangeMm: 60000,
      incendiarySpacingMm: STANDARD_RULESET.incendiaryFloorSpacingMm,
    });
    expect(orbital.contains(aim)).toBe(true);
    expect(orbital.contains({ xMm: aim.xMm + 10000, yMm: aim.yMm })).toBe(false);
  });
});
