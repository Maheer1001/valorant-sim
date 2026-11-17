import { describe, expect, it } from "vitest";
import { SHIPPED_CATALOG } from "../../src/sim/agents/catalog.ts";
import type { AbilityDefinition, AgentDefinition, Catalog } from "../../src/sim/agents/definition.ts";
import { createInstance } from "../../src/sim/agents/state.ts";
import { buildProfile } from "../../src/sim/composition/profile.ts";
import { evaluateCoverage } from "../../src/sim/composition/coverage.ts";
import { addMember, emptyTeam, type Team } from "../../src/sim/composition/team.ts";
import { DRILL_HALL } from "../../src/sim/map/drill-hall.ts";
import { rulesetWithUniqueness, STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import type { Provenance } from "../../src/rules/provenance.ts";

const assumed: Provenance = {
  kind: "assumed",
  source: "test fixture",
  note: "Fixture agent. Not part of the shipped catalog.",
};

function entryAbility(id: string, implementation: AbilityDefinition["implementation"]): AbilityDefinition {
  return {
    id,
    name: "Entry tool",
    slot: "signature",
    implementation,
    capability: "entry",
    maxCharges: 1,
    costCredits: null,
    durationMs: null,
    deployDelayMs: null,
    radiusMm: null,
    maxRangeMm: null,
    figures: assumed,
  };
}

function duelist(id: string): AgentDefinition {
  return {
    id,
    name: id,
    role: "duelist",
    roleProvenance: assumed,
    abilities: [entryAbility(`${id}-entry`, "complete")],
  };
}

describe("team composition", () => {
  it("uses per-team uniqueness and rejects a sixth member", () => {
    expect(STANDARD_RULESET.uniqueness).toBe("per-team");
    expect(STANDARD_RULESET.uniquenessProvenance.kind).toBe("secondary");
    expect(STANDARD_RULESET.teamSize).toBe(5);

    const mirrored = addMember({
      attack: emptyTeam("attack"),
      defense: emptyTeam("defense"),
      side: "attack",
      definitionId: "brimstone",
      catalog: SHIPPED_CATALOG,
      ruleset: STANDARD_RULESET,
      map: DRILL_HALL,
      assignment: null,
    });
    expect(mirrored.ok).toBe(true);
    if (!mirrored.ok) return;
    const bothTeams = addMember({
      attack: mirrored.attack,
      defense: mirrored.defense,
      side: "defense",
      definitionId: "brimstone",
      catalog: SHIPPED_CATALOG,
      ruleset: STANDARD_RULESET,
      map: DRILL_HALL,
      assignment: null,
    });
    expect(bothTeams.ok).toBe(true);

    const perMatch = rulesetWithUniqueness(STANDARD_RULESET, "per-match", assumed);
    const bannedMirror = addMember({
      attack: mirrored.attack,
      defense: mirrored.defense,
      side: "defense",
      definitionId: "brimstone",
      catalog: SHIPPED_CATALOG,
      ruleset: perMatch,
      map: DRILL_HALL,
      assignment: null,
    });
    expect(bannedMirror.ok).toBe(false);
    if (!bannedMirror.ok) expect(bannedMirror.code).toBe("duplicate-agent");

    const duplicate = addMember({
      attack: mirrored.attack,
      defense: mirrored.defense,
      side: "attack",
      definitionId: "brimstone",
      catalog: SHIPPED_CATALOG,
      ruleset: STANDARD_RULESET,
      map: DRILL_HALL,
      assignment: null,
    });
    expect(duplicate.ok).toBe(false);

    const catalog = fixtureDuelists(6);
    let attack = emptyTeam("attack");
    let defense = emptyTeam("defense");
    for (let index = 0; index < 5; index += 1) {
      const added = addMember({
        attack,
        defense,
        side: "attack",
        definitionId: `duelist-${index + 1}`,
        catalog,
        ruleset: STANDARD_RULESET,
        map: DRILL_HALL,
        assignment: null,
      });
      expect(added.ok).toBe(true);
      if (!added.ok) return;
      attack = added.attack;
      defense = added.defense;
    }
    const sixth = addMember({
      attack,
      defense,
      side: "attack",
      definitionId: "duelist-6",
      catalog,
      ruleset: STANDARD_RULESET,
      map: DRILL_HALL,
      assignment: null,
    });
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) expect(sixth.code).toBe("team-full");
  });

  it("reports an entry cluster and a smoke gap for five duelists", () => {
    const catalog = fixtureDuelists(5);
    const team = teamOf(catalog.agents);
    const report = evaluateCoverage(buildProfile(team, catalog, DRILL_HALL.id, STANDARD_RULESET.id), {
      mapId: DRILL_HALL.id,
      opposingProfile: null,
    });
    expect(report.overlaps).toEqual([
      expect.objectContaining({ kind: "entry", count: 5 }),
    ]);
    expect(report.gaps).toContain("smoke");
  });

  it("does not treat Jett or a controller label as smoke coverage", () => {
    const jett = teamOf([SHIPPED_CATALOG.agents.find((agent) => agent.id === "jett")!]);
    const jettReport = evaluateCoverage(buildProfile(jett, SHIPPED_CATALOG, DRILL_HALL.id, STANDARD_RULESET.id), {
      mapId: DRILL_HALL.id,
      opposingProfile: null,
    });
    expect(jettReport.offers.some((offer) => offer.kind === "smoke")).toBe(false);
    expect(jettReport.gaps).toContain("smoke");

    const shell: AgentDefinition = {
      id: "controller-shell",
      name: "Controller shell",
      role: "controller",
      roleProvenance: assumed,
      abilities: [
        {
          ...entryAbility("shell-smoke", "placeholder"),
          name: "Unbuilt smoke",
          capability: "smoke",
        },
      ],
    };
    const catalog: Catalog = { version: "fixture-shell", agents: [shell] };
    const report = evaluateCoverage(buildProfile(teamOf([shell]), catalog, DRILL_HALL.id, "rules"), {
      mapId: DRILL_HALL.id,
      opposingProfile: buildProfile(emptyTeam("defense"), catalog, DRILL_HALL.id, "rules"),
    });
    expect(report.offers).toHaveLength(0);
    expect(report.gaps).toContain("smoke");
    const same = evaluateCoverage(buildProfile(teamOf([shell]), catalog, DRILL_HALL.id, "rules"), {
      mapId: "other-map",
      opposingProfile: null,
    });
    expect(same).toEqual(report);
  });

  it("ships full Brimstone and Breach kits as executable", () => {
    const complete = SHIPPED_CATALOG.agents.flatMap((agent) =>
      agent.abilities.filter((ability) => ability.implementation === "complete").map((ability) => ability.id),
    );
    expect(complete).toEqual([
      "stim-beacon",
      "incendiary",
      "sky-smoke",
      "orbital-strike",
      "aftershock",
      "flashpoint",
      "fault-line",
      "rolling-thunder",
    ]);
    const flash = SHIPPED_CATALOG.agents
      .find((agent) => agent.id === "kayo")
      ?.abilities.find((ability) => ability.id === "flash-drive");
    expect(flash?.slot).toBe("basic");
    expect(flash?.implementation).toBe("placeholder");
  });
});

function fixtureDuelists(count: number): Catalog {
  return {
    version: "fixture-duelists",
    agents: Array.from({ length: count }, (_, index) => duelist(`duelist-${index + 1}`)),
  };
}

function teamOf(agents: readonly AgentDefinition[]): Team {
  return {
    side: "attack",
    members: agents.map((agent, index) =>
      createInstance(agent, "attack", { xMm: 1000, yMm: 1000 + index }, `${agent.id}-attack`, null),
    ),
  };
}
