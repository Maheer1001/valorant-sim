import type { Point, Segment } from "../types.ts";

export type MapDefinition = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  walls: readonly Segment[];
  sites: readonly {
    id: string;
    name: string;
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
  }[];
  attackSpawns: readonly Point[];
  defenseSpawns: readonly Point[];
  notes: string;
};

function wall(x1: number, y1: number, x2: number, y2: number): Segment {
  return { a: { xMm: x1, yMm: y1 }, b: { xMm: x2, yMm: y2 } };
}

/**
 * Original two-room schematic. Coordinates are millimeters and y grows
 * downward so the SVG view matches the data. This is not a Valorant map.
 *
 * A vertical wall at x=8000 has a doorway from y=4800 to y=7200.
 */
export const DRILL_HALL: MapDefinition = {
  id: "drill-hall",
  name: "Drill Hall",
  widthMm: 20000,
  heightMm: 12000,
  walls: [
    wall(0, 0, 20000, 0),
    wall(20000, 0, 20000, 12000),
    wall(20000, 12000, 0, 12000),
    wall(0, 12000, 0, 0),
    wall(8000, 0, 8000, 4800),
    wall(8000, 7200, 8000, 12000),
  ],
  sites: [
    { id: "site-a", name: "Site A", xMm: 15000, yMm: 3500, widthMm: 3500, heightMm: 5000 },
  ],
  attackSpawns: [2500, 4500, 6500, 8500, 10500].map((yMm) => ({ xMm: 2500, yMm })),
  defenseSpawns: [2500, 4500, 6500, 8500, 10500].map((yMm) => ({ xMm: 17000, yMm })),
  notes: "Original schematic for the milestone 1 drill. Not a Valorant map.",
};

export const DRILL_HALL_DOORWAY: Point = { xMm: 8000, yMm: 6000 };

const MAPS: Record<string, MapDefinition> = {
  [DRILL_HALL.id]: DRILL_HALL,
};

export function getMap(mapId: string): MapDefinition | null {
  return MAPS[mapId] ?? null;
}
