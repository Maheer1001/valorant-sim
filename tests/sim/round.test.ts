import { describe, expect, it } from "vitest";
import { SKY_SMOKE_ID } from "../../src/sim/agents/abilities/sky-smoke.ts";
import { SHIPPED_CATALOG, getAgent } from "../../src/sim/agents/catalog.ts";
import { createInstance } from "../../src/sim/agents/state.ts";
import { DRILL_HALL, DRILL_HALL_DOORWAY } from "../../src/sim/map/drill-hall.ts";
import {
  isRound,
  openRound,
  resolveWindow,
  submitPlan,
  view,
  type Round,
  type WindowOrder,
} from "../../src/sim/round.ts";
import { createDefaultDrill } from "../../src/sim/scenario/default-drill.ts";
import type { Scenario } from "../../src/sim/scenario/types.ts";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import { defenseHoldPlan } from "../../src/tactics/defense-stub.ts";

describe("interactive round window", () => {
  it("tags assumed window rules on the standard ruleset", () => {
    expect(STANDARD_RULESET.windowMs).toBe(3000);
    expect(STANDARD_RULESET.windowMsProvenance.kind).toBe("assumed");
    expect(STANDARD_RULESET.walkSpeedProvenance.kind).toBe("assumed");
    expect(STANDARD_RULESET.autoFireIntervalProvenance.kind).toBe("assumed");
  });

  it("deep-equals for the same seed and plans, and changes draws across seeds", () => {
    const first = playSightlineWindows(1, 1);
    const second = playSightlineWindows(1, 1);
    expect(first.state).toEqual(second.state);
    expect(first.events).toEqual(second.events);

    const otherSeed = playSightlineWindows(2, 1);
    const shotA = first.events.find((event) => event.type === "shot");
    const shotB = otherSeed.events.find((event) => event.type === "shot");
    expect(shotA?.type).toBe("shot");
    expect(shotB?.type).toBe("shot");
    if (shotA?.type !== "shot" || shotB?.type !== "shot") return;
    expect(shotA.hitProbabilityBp).toBe(shotB.hitProbabilityBp);
    expect(shotA.draw).not.toBe(shotB.draw);
  });

  it("resolves both sides in queue order, not attacker-first", () => {
    const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
    const jett = getAgent(SHIPPED_CATALOG, "jett");
    if (!brimstone || !jett) throw new Error("missing agents");
    const scenario: Scenario = {
      ...createDefaultDrill(1),
      attack: {
        side: "attack",
        members: [createInstance(brimstone, "attack", { xMm: 3000, yMm: 6000 }, "zeta-attack", null)],
      },
      defense: {
        side: "defense",
        members: [createInstance(jett, "defense", { xMm: 11000, yMm: 6000 }, "alpha-defense", "entry")],
      },
      orders: [],
    };
    let round = mustOpen(scenario);
    round = mustSubmit(
      round,
      "attack",
      [{ kind: "move", instanceId: "zeta-attack", to: { xMm: 4000, yMm: 6000 } }],
    );
    round = mustSubmit(
      round,
      "defense",
      [{ kind: "move", instanceId: "alpha-defense", to: { xMm: 10000, yMm: 6000 } }],
    );
    const resolved = resolveWindow(round);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const starts = resolved.events.filter((event) => event.type === "move-started");
    expect(starts.map((event) => event.agentId)).toEqual(["alpha-defense", "zeta-attack"]);
  });

  it("blocks movement on a wall", () => {
    let round = mustOpen(createDefaultDrill(3));
    round = mustSubmit(round, "attack", [
      { kind: "move", instanceId: "brimstone-attack", to: { xMm: 12000, yMm: 2000 } },
    ]);
    round = mustSubmit(round, "defense", defenseHoldPlan(round));
    const first = resolveWindow(round);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.events.some((event) => event.type === "move-blocked")).toBe(true);
    const blockedX = first.state.agents.find((agent) => agent.instanceId === "brimstone-attack")?.xMm;
    expect(blockedX).toBeDefined();
    expect(blockedX!).toBeLessThan(8000);
  });

  it("blocks auto-engage through smoke until the smoke expires", () => {
    let round = mustOpen(createDefaultDrill(3));
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: SKY_SMOKE_ID,
        target: DRILL_HALL_DOORWAY,
      },
    ]);
    round = mustSubmit(round, "defense", defenseHoldPlan(round));
    const first = resolveWindow(round);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const duringSmoke = first.events.filter(
      (event) =>
        (event.type === "shot" || event.type === "shot-withheld") &&
        event.timeMs >= 1000 &&
        event.timeMs < 3000,
    );
    expect(duringSmoke.length).toBeGreaterThan(0);
    expect(duringSmoke.every((event) => event.type === "shot-withheld")).toBe(true);

    round = first.round;
    let sawShot = false;
    for (let i = 0; i < 8; i += 1) {
      round = mustSubmit(
        round,
        "attack",
        round.state.agents
          .filter((agent) => agent.side === "attack" && agent.alive)
          .map((agent) => ({ kind: "hold" as const, instanceId: agent.instanceId })),
      );
      round = mustSubmit(round, "defense", defenseHoldPlan(round));
      const step = resolveWindow(round);
      expect(step.ok).toBe(true);
      if (!step.ok) return;
      if (step.events.some((event) => event.type === "shot")) {
        sawShot = true;
        break;
      }
      round = step.round;
    }
    expect(sawShot).toBe(true);
  });

  it("rejects an invalid plan with a typed reason and does not store it", () => {
    const round = mustOpen(createDefaultDrill(1));
    const failed = submitPlan(round, "defense", [
      {
        kind: "cast",
        instanceId: "jett-defense",
        abilityId: SKY_SMOKE_ID,
        target: DRILL_HALL_DOORWAY,
      },
    ]);
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.code).toBe("ability-not-owned");
    expect(round.pending.defense).toBeNull();
  });

  it("hides an enemy behind a wall in view(attack) and shows them with line of sight", () => {
    const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
    const jett = getAgent(SHIPPED_CATALOG, "jett");
    if (!brimstone || !jett) throw new Error("missing agents");
    const hiddenRound = mustOpen({
      ...createDefaultDrill(1),
      attack: {
        side: "attack",
        members: [createInstance(brimstone, "attack", { xMm: 3000, yMm: 2000 }, "brimstone-attack", null)],
      },
      defense: {
        side: "defense",
        members: [createInstance(jett, "defense", { xMm: 11000, yMm: 2000 }, "jett-defense", "entry")],
      },
      orders: [],
    });
    expect(view(hiddenRound, "attack").agents.map((agent) => agent.instanceId)).toEqual(["brimstone-attack"]);

    const clear = mustOpen({
      ...createDefaultDrill(1),
      attack: {
        side: "attack",
        members: [createInstance(brimstone, "attack", { xMm: 3000, yMm: 6000 }, "brimstone-attack", null)],
      },
      defense: {
        side: "defense",
        members: [createInstance(jett, "defense", { xMm: 11000, yMm: 6000 }, "jett-defense", "entry")],
      },
      orders: [],
    });
    expect(view(clear, "attack").agents.map((agent) => agent.instanceId).sort()).toEqual([
      "brimstone-attack",
      "jett-defense",
    ]);
    expect(DRILL_HALL.id).toBe("drill-hall");
  });
});

function mustOpen(scenario: Scenario): Round {
  const opened = openRound(scenario);
  expect(isRound(opened)).toBe(true);
  if (!isRound(opened)) throw new Error(opened.message);
  return opened;
}

function mustSubmit(round: Round, side: "attack" | "defense", orders: WindowOrder[]): Round {
  const result = submitPlan(round, side, orders);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.round;
}

function playSightlineWindows(seed: number, windows: number) {
  const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  if (!brimstone || !jett) throw new Error("missing agents");
  const scenario: Scenario = {
    ...createDefaultDrill(seed),
    attack: {
      side: "attack",
      members: [createInstance(brimstone, "attack", { xMm: 3000, yMm: 6000 }, "brimstone-attack", null)],
    },
    defense: {
      side: "defense",
      members: [createInstance(jett, "defense", { xMm: 11000, yMm: 6000 }, "jett-defense", "entry")],
    },
    orders: [],
  };
  let round = mustOpen(scenario);
  let events = round.lastWindowEvents;
  let state = round.state;
  for (let i = 0; i < windows; i += 1) {
    round = mustSubmit(
      round,
      "attack",
      round.state.agents
        .filter((agent) => agent.side === "attack" && agent.alive)
        .map((agent) => ({ kind: "hold" as const, instanceId: agent.instanceId })),
    );
    round = mustSubmit(round, "defense", defenseHoldPlan(round));
    const resolved = resolveWindow(round);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error(resolved.message);
    round = resolved.round;
    events = resolved.events;
    state = resolved.state;
  }
  return { state, events };
}
