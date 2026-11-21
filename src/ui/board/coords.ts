import type { Point } from "../../sim/types.ts";

export type ClientRect = { left: number; top: number; width: number; height: number };

/** The six terms of a 2D affine matrix (DOMMatrix order): x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type AffineMatrix = { a: number; b: number; c: number; d: number; e: number; f: number };

/** What `svgClientToMm` needs from the board SVG. A real `SVGSVGElement` satisfies it. */
export type BoardSvgLike = {
  getScreenCTM?: () => { inverse(): AffineMatrix } | null;
  getBoundingClientRect(): ClientRect;
};

/** Integer mm without negative zero. */
function toIntMm(value: number): number {
  return Math.round(value) + 0;
}

/**
 * Convert a client point to integer map millimeters for an SVG whose viewBox is
 * `0 0 mapWidthMm mapHeightMm` with `preserveAspectRatio="xMidYMid meet"`.
 * The map is scaled uniformly to fit and centred, so a board wider or taller
 * than the map aspect has empty bars on two sides. Points in a bar map outside
 * the map (negative or past the far edge), not onto it.
 */
export function clientToMm(
  clientX: number,
  clientY: number,
  svgRect: ClientRect,
  mapWidthMm: number,
  mapHeightMm: number,
): Point {
  if (svgRect.width <= 0 || svgRect.height <= 0 || mapWidthMm <= 0 || mapHeightMm <= 0) {
    return { xMm: 0, yMm: 0 };
  }
  const scale = Math.min(svgRect.width / mapWidthMm, svgRect.height / mapHeightMm);
  const offsetX = (svgRect.width - mapWidthMm * scale) / 2;
  const offsetY = (svgRect.height - mapHeightMm * scale) / 2;
  return {
    xMm: toIntMm((clientX - svgRect.left - offsetX) / scale),
    yMm: toIntMm((clientY - svgRect.top - offsetY) / scale),
  };
}

/** Apply an inverse screen matrix (client px -> SVG user units, which are mm here). */
export function clientToMmWithMatrix(clientX: number, clientY: number, inverse: AffineMatrix): Point {
  return {
    xMm: toIntMm(inverse.a * clientX + inverse.c * clientY + inverse.e),
    yMm: toIntMm(inverse.b * clientX + inverse.d * clientY + inverse.f),
  };
}

function isFiniteMatrix(m: AffineMatrix): boolean {
  return [m.a, m.b, m.c, m.d, m.e, m.f].every((value) => Number.isFinite(value));
}

/**
 * Board click -> mm. Prefers the SVG's real transform (`getScreenCTM().inverse()`),
 * which accounts for letterboxing, CSS transforms and scrolling. Falls back to the
 * letterbox math on the bounding rect when no screen matrix is available (for
 * example jsdom, which has no layout).
 */
export function svgClientToMm(
  svg: BoardSvgLike | null,
  clientX: number,
  clientY: number,
  mapWidthMm: number,
  mapHeightMm: number,
): Point {
  if (!svg) return { xMm: 0, yMm: 0 };
  const ctm = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
  if (ctm) {
    const inverse = ctm.inverse();
    if (isFiniteMatrix(inverse)) {
      return clientToMmWithMatrix(clientX, clientY, inverse);
    }
  }
  return clientToMm(clientX, clientY, svg.getBoundingClientRect(), mapWidthMm, mapHeightMm);
}

/** Identity for this SVG viewBox (coords are already mm). Kept for tests and future scale. */
export function mmToSvg(point: Point): Point {
  return { xMm: point.xMm, yMm: point.yMm };
}

/** Integer yaw degrees 0-359 from `from` toward `to` (atan2, y-down SVG). */
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
