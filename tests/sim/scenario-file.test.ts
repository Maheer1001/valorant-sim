import { describe, expect, it } from "vitest";
import { CATALOG_VERSION } from "../../src/sim/agents/catalog.ts";
import { createDefaultDrill } from "../../src/sim/scenario/default-drill.ts";
import { parseScenario, ScenarioFileError, serializeScenario } from "../../src/persistence/scenario-file.ts";

describe("scenario file", () => {
  it("round-trips teams, assignments, charges, seed, and catalog version", () => {
    const scenario = createDefaultDrill(7);
    scenario.attack.members[0].assignment = "lurk";
    const loaded = parseScenario(serializeScenario(scenario));
    expect(loaded).toEqual(scenario);
    expect(loaded.seed).toBe(7);
    expect(loaded.catalogVersion).toBe(CATALOG_VERSION);
    expect(loaded.attack.members[0]?.assignment).toBe("lurk");
    expect(loaded.attack.members[0]?.charges["sky-smoke"]).toBe(3);
  });

  it("rejects an unknown version", () => {
    expect(() => parseScenario(JSON.stringify({ version: 2 }))).toThrow(ScenarioFileError);
    try {
      parseScenario(JSON.stringify({ version: 2 }));
    } catch (error) {
      expect(error).toBeInstanceOf(ScenarioFileError);
      if (error instanceof ScenarioFileError) expect(error.code).toBe("unknown-version");
    }
  });
});
