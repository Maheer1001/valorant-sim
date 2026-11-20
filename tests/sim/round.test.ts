import { describe, expect, it } from "vitest";
import { SKY_SMOKE_ID } from "../../src/sim/agents/abilities/sky-smoke.ts";
import { SHIPPED_CATALOG, getAgent } from "../../src/sim/agents/catalog.ts";
import { createInstance } from "../../src/sim/agents/state.ts";
import { truthLiveWorld, viewLive } from "../../src/sim/live-round.ts";
import { DRILL_HALL, DRILL_HALL_DOORWAY } from "../../src/sim/map/drill-hall.ts";
import { createDefaultDrill } from "../../src/sim/scenario/default-drill.ts";
import type { Scenario } from "../../src/sim/scenario/types.ts";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import {
  advance,
  agentIn,
  issueRejected,
  mustIssue,
  mustOpenLive,
  playAttack,
} from "./support/live-harness.ts";

describe("interactive live round", () => {
  it("tags assumed movement and fire rules on the standard ruleset", () => {
    expect(STANDARD_RULESET.walkSpeedProvenance.kind).toBe("assumed");
    expect(STANDARD_RULESET.autoFireIntervalProvenance.kind).toBe("assumed");
    expect(STANDARD_RULESET.simStepMsProvenance.kind).toBe("assumed");
    expect("windowMs" in STANDARD_RULESET).toBe(false);
  });

  it("deep-equals for the same seed and orders, and changes draws across seeds", () => {
    const first = playSightline(1);
    const second = playSightline(1);
    expect(first.world).toEqual(second.world);
    expect(first.events).toEqual(second.events);

    const otherSeed = playSightline(2);
    const shotA = first.events.find((event) => event.type === "shot");
    const shotB = otherSeed.events.find((event) => event.type === "shot");
    expect(shotA?.type).toBe("shot");
    expect(shotB?.type).toBe("shot");
    if (shotA?.type !== "shot" || shotB?.type !== "shot") return;
    expect(shotA.hitProbabilityBp).toBe(shotB.hitProbabilityBp);
    expect(shotA.draw).not.toBe(shotB.draw);
  });

  it("applies same-instant batches in issue order, whichever side issued first", () => {
    const moves = (round: ReturnType<typeof mustOpenLive>, defenseFirst: boolean) => {
      const attack = () =>
        mustIssue(round, "attack", [
          { kind: "move-route", instanceId: "zeta-attack", waypoints: [{ xMm: 4000, yMm: 6000 }] },
        ]);
      const defense = () =>
        mustIssue(round, "defense", [
          { kind: "move-route", instanceId: "alpha-defense", waypoints: [{ xMm: 10000, yMm: 6000 }] },
        ]);
      if (defenseFirst) {
        defense();
        attack();
      } else {
        attack();
        defense();
      }
      return advance(round, 50)
        .filter((event) => event.type === "move-started")
        .map((event) => event.agentId);
    };
    expect(moves(mustOpenLive(duelScenario()), true)).toEqual(["alpha-defense", "zeta-attack"]);
    expect(moves(mustOpenLive(duelScenario()), false)).toEqual(["zeta-attack", "alpha-defense"]);
  });

  it("blocks movement on a wall", () => {
    const round = mustOpenLive(createDefaultDrill(3));
    const events = playAttack(round, [
      { kind: "move-route", instanceId: "brimstone-attack", waypoints: [{ xMm: 12000, yMm: 2000 }] },
    ]);
    expect(events.some((event) => event.type === "move-blocked")).toBe(true);
    expect(agentIn(round, "brimstone-attack").xMm).toBeLessThan(8000);
  });

  it("blocks auto-engage through smoke until the smoke expires", () => {
    const round = mustOpenLive(createDefaultDrill(3));
    const first = playAttack(round, [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: SKY_SMOKE_ID,
        target: DRILL_HALL_DOORWAY,
      },
    ]);
    const duringSmoke = first.filter(
      (event) =>
        (event.type === "shot" || event.type === "shot-withheld") &&
        event.timeMs >= 1000 &&
        event.timeMs < 3000,
    );
    expect(duringSmoke.length).toBeGreaterThan(0);
    expect(duringSmoke.every((event) => event.type === "shot-withheld")).toBe(true);

    let sawShot = false;
    for (let i = 0; i < 8 && round.phase === "live"; i += 1) {
      if (advance(round).some((event) => event.type === "shot")) {
        sawShot = true;
        break;
      }
    }
    expect(sawShot).toBe(true);
  });

  it("rejects an invalid batch with a typed reason and does not queue it", () => {
    const round = mustOpenLive(createDefaultDrill(1));
    const code = issueRejected(round, "defense", [
      {
        kind: "cast",
        instanceId: "jett-defense",
        abilityId: SKY_SMOKE_ID,
        target: DRILL_HALL_DOORWAY,
      },
    ]);
    expect(code).toBe("ability-not-owned");
    expect(round.pendingBatch).toEqual([]);
    expect(round.orderLog.at(-1)?.result).toBe("ability-not-owned");
  });

  it("hides an enemy behind a wall in viewLive(attack) and shows them with line of sight", () => {
    const hidden = mustOpenLive(duelScenario({ yMm: 2000 }, "brimstone-attack", "jett-defense"));
    expect(viewLive(hidden, "attack").agents.map((agent) => agent.instanceId)).toEqual(["brimstone-attack"]);

    const clear = mustOpenLive(duelScenario({ yMm: 6000 }, "brimstone-attack", "jett-defense"));
    expect(viewLive(clear, "attack").agents.map((agent) => agent.instanceId).sort()).toEqual([
      "brimstone-attack",
      "jett-defense",
    ]);
    expect(DRILL_HALL.id).toBe("drill-hall");
  });
});

/** Brimstone (x=3000) vs Jett (x=11000) on one horizontal line. y=6000 is the doorway sightline. */
function duelScenario(
  line: { yMm: number } = { yMm: 6000 },
  attackId = "zeta-attack",
  defenseId = "alpha-defense",
  seed = 1,
): Scenario {
  const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  if (!brimstone || !jett) throw new Error("missing agents");
  return {
    ...createDefaultDrill(seed),
    attack: {
      side: "attack",
      members: [createInstance(brimstone, "attack", { xMm: 3000, yMm: line.yMm }, attackId, null)],
    },
    defense: {
      side: "defense",
      members: [createInstance(jett, "defense", { xMm: 11000, yMm: line.yMm }, defenseId, "entry")],
    },
    orders: [],
  };
}

function playSightline(seed: number) {
  const round = mustOpenLive(duelScenario({ yMm: 6000 }, "brimstone-attack", "jett-defense", seed));
  const events = advance(round);
  return { world: truthLiveWorld(round), events };
}
