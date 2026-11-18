import { describe, expect, it } from "vitest";
import {
  clientToMm,
  distanceMm,
  mmToSvg,
  pointInRange,
  yawDegFromPoints,
} from "../../src/ui/board/coords.ts";

describe("board coords", () => {
  it("maps client clicks to integer millimeters", () => {
    expect(
      clientToMm(50, 25, { left: 0, top: 0, width: 100, height: 50 }, 20000, 12000),
    ).toEqual({ xMm: 10000, yMm: 6000 });
  });

  it("keeps mm identity for the SVG viewBox", () => {
    expect(mmToSvg({ xMm: 8000, yMm: 4000 })).toEqual({ xMm: 8000, yMm: 4000 });
  });

  it("computes yaw from two points", () => {
    expect(yawDegFromPoints({ xMm: 0, yMm: 0 }, { xMm: 1000, yMm: 0 })).toBe(0);
    expect(yawDegFromPoints({ xMm: 0, yMm: 0 }, { xMm: 0, yMm: 1000 })).toBe(90);
    expect(yawDegFromPoints({ xMm: 0, yMm: 0 }, { xMm: -1000, yMm: 0 })).toBe(180);
  });

  it("checks range and distance", () => {
    expect(pointInRange({ xMm: 0, yMm: 0 }, { xMm: 3000, yMm: 4000 }, 5000)).toBe(true);
    expect(pointInRange({ xMm: 0, yMm: 0 }, { xMm: 3000, yMm: 4000 }, 4999)).toBe(false);
    expect(distanceMm({ xMm: 0, yMm: 0 }, { xMm: 3000, yMm: 4000 })).toBe(5000);
  });
});
