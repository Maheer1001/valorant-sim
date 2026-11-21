import { describe, expect, it } from "vitest";
import { BREACH_JOB_HANDLERS } from "../../src/sim/agents/abilities/breach-resolve.ts";
import { BRIMSTONE_JOB_HANDLERS } from "../../src/sim/agents/abilities/brimstone-resolve.ts";
import { SHIPPED_CATALOG } from "../../src/sim/agents/catalog.ts";
import { createInstance } from "../../src/sim/agents/state.ts";
import { CAST_RESOLVERS } from "../../src/sim/jobs/cast-resolvers.ts";
import { CORE_JOB_HANDLERS } from "../../src/sim/jobs/core.ts";
import { JOB_HANDLERS } from "../../src/sim/jobs/handlers.ts";
import type { ApplyContext, JobOf } from "../../src/sim/jobs/types.ts";
import { COMMAND_SPECS } from "../../src/sim/live/commands.ts";
import { DRILL_HALL } from "../../src/sim/map/drill-hall.ts";
import { createStream } from "../../src/sim/rng.ts";
import { createWorld } from "../../src/sim/world.ts";
import { createPlayableDrill } from "../../src/ui/scenario/playableDrill.ts";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";

/** Every Job type at the end of stage H0.2. A new stage adds its types here. */
const EXPECTED_JOB_TYPES = [
  "aftershock-burst",
  "auto-engage",
  "cast",
  "device-expire",
  "engage",
  "fault-line-wave",
  "flashpoint-impact",
  "incendiary-detonate",
  "move",
  "move-resolve",
  "orbital-activate",
  "orbital-shrink",
  "rolling-thunder-blast",
  "smoke-active",
  "smoke-expire",
  "status-expire",
  "stim-beacon-pulse",
  "zone-expire",
  "zone-tick",
];

const EXPECTED_COMMAND_KINDS = ["cast", "hold", "move-route", "shoot"];

function completeAbilities() {
  return SHIPPED_CATALOG.agents.flatMap((agent) =>
    agent.abilities
      .filter((ability) => ability.implementation === "complete")
      .map((ability) => ({ agentId: agent.id, abilityId: ability.id })),
  );
}

/** A fresh world with one probe instance of `agentId` on attack (ult points topped up). */
function probeContext(agentId: string): { ctx: ApplyContext; instanceId: string } {
  const definition = SHIPPED_CATALOG.agents.find((agent) => agent.id === agentId)!;
  const scenario = createPlayableDrill(1);
  const instanceId = `${agentId}-probe`;
  scenario.attack.members = [
    createInstance(definition, "attack", { xMm: 3000, yMm: 5000 }, instanceId, null, { ultimatePoints: 8 }),
  ];
  return {
    instanceId,
    ctx: {
      timeMs: 0,
      sequence: 1,
      world: createWorld(scenario, STANDARD_RULESET),
      catalog: SHIPPED_CATALOG,
      walls: DRILL_HALL.walls,
      combat: createStream(1, "combat"),
      ruleset: STANDARD_RULESET,
    },
  };
}

function castJob(instanceId: string, abilityId: string): JobOf<"cast"> {
  return {
    type: "cast",
    instanceId,
    abilityId,
    target: { xMm: 4000, yMm: 5000 },
    aimYawDeg: 0,
    chargeValue: 16,
    mapTarget: { xMm: 4000, yMm: 5000 },
  };
}

describe("job handler registry", () => {
  it("has exactly one handler per Job type (explicit list)", () => {
    expect(Object.keys(JOB_HANDLERS).sort()).toEqual(EXPECTED_JOB_TYPES);
    for (const type of EXPECTED_JOB_TYPES) {
      expect(typeof JOB_HANDLERS[type as keyof typeof JOB_HANDLERS], type).toBe("function");
    }
  });

  it("builds the table from disjoint per-module tables (no key is overwritten)", () => {
    const parts = [Object.keys(CORE_JOB_HANDLERS), ["cast"], Object.keys(BREACH_JOB_HANDLERS), Object.keys(BRIMSTONE_JOB_HANDLERS)];
    const all = parts.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(EXPECTED_JOB_TYPES);
  });
});

describe("cast resolver registry", () => {
  it("claims every complete ability of every shipped agent exactly once, by its own agent", () => {
    for (const { agentId, abilityId } of completeAbilities()) {
      const claimers = CAST_RESOLVERS.filter((resolver) => resolver.abilityIds.includes(abilityId));
      expect(claimers.map((resolver) => resolver.agentId), `${agentId}/${abilityId}`).toEqual([agentId]);
    }
  });

  it("resolves a synthetic cast of every complete ability, and every other resolver declines it", () => {
    for (const { agentId, abilityId } of completeAbilities()) {
      for (const resolver of CAST_RESOLVERS) {
        const { ctx, instanceId } = probeContext(agentId);
        const result = resolver.resolve(castJob(instanceId, abilityId), ctx);
        if (resolver.agentId === agentId) {
          expect(result, `${resolver.agentId} should resolve ${abilityId}`).not.toBeNull();
        } else {
          expect(result, `${resolver.agentId} should decline ${abilityId}`).toBeNull();
        }
      }
    }
  });

  it("only claims abilities that exist in the catalog and are complete", () => {
    const complete = new Set(completeAbilities().map((entry) => `${entry.agentId}/${entry.abilityId}`));
    for (const resolver of CAST_RESOLVERS) {
      for (const abilityId of resolver.abilityIds) {
        expect(complete.has(`${resolver.agentId}/${abilityId}`), `${resolver.agentId}/${abilityId}`).toBe(true);
      }
    }
  });

  it("leaves placeholder and partial abilities unclaimed", () => {
    const claimed = new Set(CAST_RESOLVERS.flatMap((resolver) => resolver.abilityIds));
    for (const agent of SHIPPED_CATALOG.agents) {
      for (const ability of agent.abilities) {
        if (ability.implementation !== "complete") {
          expect(claimed.has(ability.id), `${agent.id}/${ability.id}`).toBe(false);
        }
      }
    }
  });
});

describe("command spec registry", () => {
  it("has a validate, apply and clone for every AgentCommand kind", () => {
    expect(Object.keys(COMMAND_SPECS).sort()).toEqual(EXPECTED_COMMAND_KINDS);
    for (const spec of Object.values(COMMAND_SPECS)) {
      expect(typeof spec.validate).toBe("function");
      expect(typeof spec.apply).toBe("function");
      expect(typeof spec.clone).toBe("function");
    }
  });
});
