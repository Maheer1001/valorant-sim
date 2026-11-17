import { describe, expect, it } from "vitest";
import { clipSegment } from "../../src/sim/map/geometry.ts";
import { DRILL_HALL } from "../../src/sim/map/drill-hall.ts";
import { hasLineOfSight } from "../../src/sim/map/line-of-sight.ts";
import { runScenario } from "../../src/sim/run.ts";
import { createDefaultDrill } from "../../src/sim/scenario/default-drill.ts";

describe("Drill Hall geometry", () => {
  it("lets a ray through the doorway and stops a ray on the divider", () => {
    const throughDoor = { xMm: 3000, yMm: 6000 };
    const acrossDoor = { xMm: 11000, yMm: 6000 };
    const intoWall = { xMm: 3000, yMm: 2000 };
    const beyondWall = { xMm: 11000, yMm: 2000 };

    expect(hasLineOfSight(throughDoor, acrossDoor, DRILL_HALL.walls, [], 0)).toBe(true);
    expect(hasLineOfSight(intoWall, beyondWall, DRILL_HALL.walls, [], 0)).toBe(false);

    const open = clipSegment(throughDoor, { xMm: 12000, yMm: 6000 }, DRILL_HALL.walls);
    expect(open.blocked).toBe(false);
    expect(open.point).toEqual({ xMm: 12000, yMm: 6000 });

    const closed = clipSegment(intoWall, beyondWall, DRILL_HALL.walls);
    expect(closed.blocked).toBe(true);
    expect(closed.point.xMm).toBeLessThan(8000);
    expect(closed.point.xMm).toBeGreaterThan(7000);
  });

  it("stops a scripted move on the divider", () => {
    const scenario = createDefaultDrill(1);
    scenario.orders = [
      {
        kind: "move",
        instanceId: "brimstone-attack",
        to: { xMm: 12000, yMm: 2000 },
        speedMmPerSec: 4000,
        startMs: 0,
      },
    ];
    const result = runScenario(scenario);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((event) => event.type === "move-blocked")).toBe(true);
    const brimstone = result.final.agents.find((agent) => agent.instanceId === "brimstone-attack");
    expect(brimstone && brimstone.xMm < 8000).toBe(true);
  });
});
