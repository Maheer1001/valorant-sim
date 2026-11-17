import { describe, expect, it } from "vitest";
import { SKY_SMOKE_DEPLOY_MS, SKY_SMOKE_DURATION_MS, SKY_SMOKE_FIGURES, SKY_SMOKE_ID } from "../../src/sim/agents/abilities/sky-smoke.ts";
import { SMOKE_VISION_ENDS } from "../../src/sim/agents/abilities/sky-smoke.ts";
import { DRILL_HALL } from "../../src/sim/map/drill-hall.ts";
import { hasLineOfSight } from "../../src/sim/map/line-of-sight.ts";
import { runScenario } from "../../src/sim/run.ts";
import { createDefaultDrill } from "../../src/sim/scenario/default-drill.ts";
import type { Scenario } from "../../src/sim/scenario/types.ts";

function requireOk(scenario: Scenario) {
  const result = runScenario(scenario);
  expect(result.ok, result.ok ? "" : result.message).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result;
}

describe("Sky Smoke", () => {
  it("spends a charge, blocks sight, then clears it when the smoke expires", () => {
    expect(SKY_SMOKE_FIGURES.kind).toBe("secondary");
    expect(SMOKE_VISION_ENDS.kind).toBe("verified");
    const result = requireOk(createDefaultDrill(1));
    const cast = result.events.find((event) => event.type === "cast-accepted");
    const active = result.events.find((event) => event.type === "smoke-active");
    const expired = result.events.find((event) => event.type === "smoke-expired");
    expect(cast?.type).toBe("cast-accepted");
    expect(active?.type).toBe("smoke-active");
    expect(expired?.type).toBe("smoke-expired");
    if (cast?.type !== "cast-accepted" || active?.type !== "smoke-active" || expired?.type !== "smoke-expired") {
      return;
    }
    expect(cast.chargesRemaining).toBe(2);
    expect(active.timeMs - cast.timeMs).toBe(SKY_SMOKE_DEPLOY_MS);
    expect(expired.timeMs - active.timeMs).toBe(SKY_SMOKE_DURATION_MS);

    const during = result.frames[result.events.indexOf(active)];
    const after = result.frames[result.events.indexOf(expired)];
    const from = pointOf(during, "brimstone-attack");
    const to = pointOf(during, "jett-defense");
    expect(from && to).toBeTruthy();
    if (!from || !to) return;
    expect(hasLineOfSight(from, to, DRILL_HALL.walls, during.smokes, during.timeMs)).toBe(false);
    expect(hasLineOfSight(from, to, DRILL_HALL.walls, after.smokes, after.timeMs)).toBe(true);
    expect(result.final.agents.find((agent) => agent.instanceId === "brimstone-attack")?.charges[SKY_SMOKE_ID]).toBe(2);
  });

  it("rejects an empty charge pool, another agent's cast, and a placeholder", () => {
    const empty = createDefaultDrill(1);
    empty.attack.members[0].charges[SKY_SMOKE_ID] = 0;
    const emptyResult = requireOk(empty);
    expect(emptyResult.events.some((event) => event.type === "cast-rejected" && event.code === "insufficient-charges")).toBe(true);
    expect(emptyResult.events.some((event) => event.type === "smoke-active")).toBe(false);

    const stolen = createDefaultDrill(1);
    stolen.orders = [
      {
        kind: "cast",
        instanceId: "jett-defense",
        abilityId: SKY_SMOKE_ID,
        target: { xMm: 8000, yMm: 6000 },
        atMs: 0,
      },
    ];
    const stolenResult = requireOk(stolen);
    expect(stolenResult.events.some((event) => event.type === "cast-rejected" && event.code === "ability-not-owned")).toBe(true);
    expect(stolenResult.final.smokes).toHaveLength(0);

    const placeholder = createDefaultDrill(1);
    placeholder.orders = [
      {
        kind: "cast",
        instanceId: "jett-defense",
        abilityId: "cloudburst",
        target: { xMm: 8000, yMm: 6000 },
        atMs: 0,
      },
    ];
    const placeholderResult = requireOk(placeholder);
    expect(placeholderResult.events.some((event) => event.type === "cast-rejected" && event.code === "ability-not-executable")).toBe(true);
    expect(placeholderResult.final.smokes).toHaveLength(0);
  });

  it("rejects a target beyond the recorded cast range", () => {
    const scenario = createDefaultDrill(1);
    scenario.orders = [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: SKY_SMOKE_ID,
        target: { xMm: 59000, yMm: 6000 },
        atMs: 0,
      },
    ];
    const result = requireOk(scenario);
    expect(result.events.some((event) => event.type === "cast-rejected" && event.code === "out-of-range")).toBe(true);
    expect(result.final.smokes).toHaveLength(0);
  });
});

function pointOf(world: { agents: { instanceId: string; xMm: number; yMm: number }[] }, instanceId: string) {
  const agent = world.agents.find((item) => item.instanceId === instanceId);
  return agent ? { xMm: agent.xMm, yMm: agent.yMm } : null;
}
