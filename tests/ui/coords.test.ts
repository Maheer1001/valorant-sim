import { describe, expect, it } from "vitest";
import {
  clientToMm,
  clientToMmWithMatrix,
  distanceMm,
  mmToSvg,
  pointInRange,
  svgClientToMm,
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

/**
 * Drill Hall is 20000 x 12000 mm (5:3). Site A is x 15000-18500, y 3500-8500, so its
 * drawn centre is (16750, 6000). Each rect below is drawn with preserveAspectRatio
 * "xMidYMid meet": scale = min(w / 20000, h / 12000), map centred in the box.
 */
const MAP_W = 20000;
const MAP_H = 12000;
const SITE_A_CENTRE = { xMm: 16750, yMm: 6000 };

describe("board coords with letterboxing (meet)", () => {
  it("exact fit 500 x 300 at (5, 7): scale 0.025, no bars", () => {
    const rect = { left: 5, top: 7, width: 500, height: 300 };
    expect(clientToMm(5, 7, rect, MAP_W, MAP_H)).toEqual({ xMm: 0, yMm: 0 });
    expect(clientToMm(505, 307, rect, MAP_W, MAP_H)).toEqual({ xMm: 20000, yMm: 12000 });
    expect(clientToMm(255, 157, rect, MAP_W, MAP_H)).toEqual({ xMm: 10000, yMm: 6000 });
    expect(clientToMm(423.75, 157, rect, MAP_W, MAP_H)).toEqual(SITE_A_CENTRE);
  });

  it("wide 1000 x 300 at (10, 20): scale 0.025, map 500 px wide, 250 px bars left and right", () => {
    const rect = { left: 10, top: 20, width: 1000, height: 300 };
    expect(clientToMm(260, 20, rect, MAP_W, MAP_H)).toEqual({ xMm: 0, yMm: 0 });
    expect(clientToMm(760, 320, rect, MAP_W, MAP_H)).toEqual({ xMm: 20000, yMm: 12000 });
    expect(clientToMm(510, 170, rect, MAP_W, MAP_H)).toEqual({ xMm: 10000, yMm: 6000 });
    expect(clientToMm(678.75, 170, rect, MAP_W, MAP_H)).toEqual(SITE_A_CENTRE);
    // The old rect-fraction mapping put this click at x = 13375 (the reported bug).
    expect(clientToMm(678.75, 170, rect, MAP_W, MAP_H).xMm).not.toBe(13375);
    // A click in the left bar is off the map, not on its left edge.
    expect(clientToMm(100, 170, rect, MAP_W, MAP_H)).toEqual({ xMm: -6400, yMm: 6000 });
  });

  it("tall 500 x 900 at (0, 0): scale 0.025, map 300 px tall, 300 px bars top and bottom", () => {
    const rect = { left: 0, top: 0, width: 500, height: 900 };
    expect(clientToMm(0, 300, rect, MAP_W, MAP_H)).toEqual({ xMm: 0, yMm: 0 });
    expect(clientToMm(500, 600, rect, MAP_W, MAP_H)).toEqual({ xMm: 20000, yMm: 12000 });
    expect(clientToMm(250, 450, rect, MAP_W, MAP_H)).toEqual({ xMm: 10000, yMm: 6000 });
    expect(clientToMm(418.75, 450, rect, MAP_W, MAP_H)).toEqual(SITE_A_CENTRE);
  });

  it("returns the origin for a zero-size rect", () => {
    expect(clientToMm(5, 5, { left: 0, top: 0, width: 0, height: 300 }, MAP_W, MAP_H)).toEqual({ xMm: 0, yMm: 0 });
  });

  it("applies an inverse screen matrix (the wide case written as a matrix)", () => {
    // Screen = 0.025 * mm + (260, 20), so mm = 40 * screen - (10400, 800).
    const inverse = { a: 40, b: 0, c: 0, d: 40, e: -10400, f: -800 };
    expect(clientToMmWithMatrix(678.75, 170, inverse)).toEqual(SITE_A_CENTRE);
    expect(clientToMmWithMatrix(260, 20, inverse)).toEqual({ xMm: 0, yMm: 0 });
    expect(clientToMmWithMatrix(760, 320, inverse)).toEqual({ xMm: 20000, yMm: 12000 });
  });

  it("prefers getScreenCTM and falls back to rect math when it is missing, null or singular", () => {
    const wideRect = { left: 10, top: 20, width: 1000, height: 300 };
    const viaMatrix = {
      getScreenCTM: () => ({ inverse: () => ({ a: 40, b: 0, c: 0, d: 40, e: -10400, f: -800 }) }),
      // A deliberately wrong rect: if the matrix were ignored, the answer would differ.
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
    };
    expect(svgClientToMm(viaMatrix, 678.75, 170, MAP_W, MAP_H)).toEqual(SITE_A_CENTRE);

    const noCtm = { getBoundingClientRect: () => wideRect };
    expect(svgClientToMm(noCtm, 678.75, 170, MAP_W, MAP_H)).toEqual(SITE_A_CENTRE);

    const nullCtm = { getScreenCTM: () => null, getBoundingClientRect: () => wideRect };
    expect(svgClientToMm(nullCtm, 678.75, 170, MAP_W, MAP_H)).toEqual(SITE_A_CENTRE);

    const singular = {
      getScreenCTM: () => ({ inverse: () => ({ a: NaN, b: NaN, c: NaN, d: NaN, e: NaN, f: NaN }) }),
      getBoundingClientRect: () => wideRect,
    };
    expect(svgClientToMm(singular, 678.75, 170, MAP_W, MAP_H)).toEqual(SITE_A_CENTRE);

    expect(svgClientToMm(null, 5, 5, MAP_W, MAP_H)).toEqual({ xMm: 0, yMm: 0 });
  });
});
