import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type AbilityRow = {
  key: string;
  agentId: number;
  agent: string;
  slot: string;
  ability: string;
  primitives: string[];
};

type Mapping = {
  core: string[];
  primitives: Record<string, string>;
  abilities: AbilityRow[];
};

type Stages = {
  stages: {
    id: number;
    primitives: string[];
    agentsCompleted: string[];
  }[];
  agentRequirements: Record<string, { role: string; primitives: string[] }>;
};

type Reference = {
  agents: { id: number; name: string; abilities: { slot: string; name: string }[] }[];
};

const root = path.resolve(".");
const mapping = JSON.parse(readFileSync(path.join(root, "data/ability-primitives.json"), "utf8")) as Mapping;
const stages = JSON.parse(readFileSync(path.join(root, "data/primitive-stages.json"), "utf8")) as Stages;
const reference = JSON.parse(readFileSync(path.join(root, "agent-reference.json"), "utf8")) as Reference;

describe("ability-primitives mapping", () => {
  it("lists every agent-reference ability exactly once", () => {
    const expected = reference.agents.flatMap((agent) =>
      agent.abilities.map((ability) => `${agent.id}:${ability.slot}`),
    );
    expect(mapping.abilities).toHaveLength(130);
    expect(expected).toHaveLength(130);
    const keys = mapping.abilities.map((row) => row.key);
    expect(new Set(keys).size).toBe(130);
    expect(keys.sort()).toEqual(expected.sort());
  });

  it("only uses defined primitives and keeps core resources out of per-ability lists", () => {
    const defined = new Set(Object.keys(mapping.primitives));
    for (const row of mapping.abilities) {
      for (const primitive of row.primitives) {
        expect(defined.has(primitive), `${row.key} ${primitive}`).toBe(true);
        expect(mapping.core.includes(primitive), `${row.key} leaked core ${primitive}`).toBe(false);
      }
    }
  });

  it("applies the known audit corrections", () => {
    const byKey = Object.fromEntries(mapping.abilities.map((row) => [row.key, row]));
    expect(byKey["27:C"]?.primitives).toEqual(["vision.wallOrVolume"]);
    expect(byKey["27:Q"]?.primitives).not.toContain("placement.mapTargeted");
    expect(byKey["27:E"]?.primitives).not.toContain("placement.mapTargeted");
    expect(byKey["13:passive"]?.primitives).toEqual(["resource.passiveMeter"]);
    expect(byKey["2:E"]?.primitives).toEqual(["placement.mapTargeted", "vision.smoke"]);
    expect(byKey["3:E"]?.primitives).toContain("placement.mapTargeted");
    expect(byKey["4:E"]?.primitives).toContain("placement.mapTargeted");
    expect(byKey["5:E"]?.primitives).toContain("placement.mapTargeted");
    expect(byKey["6:E"]?.primitives).toContain("placement.mapTargeted");
    expect(byKey["1:E"]?.primitives).toContain("placement.mapTargeted");
    expect(byKey["2:Q"]?.primitives).toEqual([
      "damage.zoneOrHit",
      "projectile.bouncing",
      "projectile.generic",
    ]);
    expect(byKey["26:C"]?.primitives).toContain("projectile.generic");
    expect(byKey["2:X"]?.primitives).not.toContain("projectile.generic");
    expect(byKey["2:X"]?.primitives).toContain("placement.mapTargeted");
    expect(byKey["30:passive"]?.primitives).toEqual(["interact.pickup"]);
  });
});

describe("primitive stages", () => {
  it("places every used primitive in exactly one stage", () => {
    const used = new Set(mapping.abilities.flatMap((row) => row.primitives));
    const placed: string[] = [];
    for (const stage of stages.stages) placed.push(...stage.primitives);
    expect(new Set(placed).size).toBe(placed.length);
    expect([...used].sort()).toEqual([...placed].sort());
  });

  it("claims each agent complete only when cumulative primitives cover its needs", () => {
    const cumulative = new Set<string>();
    const claimedAt: Record<string, number> = {};
    for (const stage of stages.stages) {
      for (const primitive of stage.primitives) cumulative.add(primitive);
      for (const agent of stage.agentsCompleted) {
        const need = stages.agentRequirements[agent]?.primitives ?? [];
        expect(need.every((primitive) => cumulative.has(primitive)), agent).toBe(true);
        claimedAt[agent] = stage.id;
      }
    }
    expect(Object.keys(claimedAt).sort()).toEqual(Object.keys(stages.agentRequirements).sort());
  });

  it("does not claim any agent earlier than the first covering stage", () => {
    const firstPossible: Record<string, number> = {};
    const cumulative = new Set<string>();
    for (const stage of stages.stages) {
      for (const primitive of stage.primitives) cumulative.add(primitive);
      for (const [agent, req] of Object.entries(stages.agentRequirements)) {
        if (firstPossible[agent] != null) continue;
        if (req.primitives.every((primitive) => cumulative.has(primitive))) {
          firstPossible[agent] = stage.id;
        }
      }
    }
    for (const stage of stages.stages) {
      for (const agent of stage.agentsCompleted) {
        expect(stage.id, agent).toBe(firstPossible[agent]);
      }
    }
  });

  it("keeps Hush as the last newly completed agent", () => {
    const withAgents = stages.stages.filter((stage) => stage.agentsCompleted.length > 0);
    const last = withAgents[withAgents.length - 1];
    expect(last?.agentsCompleted).toContain("Hush");
    for (const stage of withAgents.slice(0, -1)) {
      expect(stage.agentsCompleted).not.toContain("Hush");
    }
  });
});
