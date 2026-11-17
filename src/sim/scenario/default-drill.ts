import { SHIPPED_CATALOG } from "../agents/catalog.ts";
import { getAgent } from "../agents/catalog.ts";
import { FULL_CHARGES_PROVENANCE, createInstance } from "../agents/state.ts";
import { STANDARD_RULESET } from "../../rules/ruleset.ts";
import { DRILL_HALL, DRILL_HALL_DOORWAY } from "../map/drill-hall.ts";
import { SKY_SMOKE_ID } from "../agents/abilities/sky-smoke.ts";
import { RIFLE_A } from "../combat/assumed-rifle.ts";
import type { Scenario } from "./types.ts";

/**
 * Brimstone walks to the doorway and drops Sky Smoke.
 * Jett holds the angle: the first shot is during the smoke, the second is after it expires.
 * Cast is scheduled after the move arrives so the same-millisecond queue order stays obvious.
 */
export function createDefaultDrill(seed: number): Scenario {
  const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  if (!brimstone || !jett) {
    throw new Error("Shipped catalog is missing Brimstone or Jett.");
  }
  return {
    version: 1,
    id: "drill-hall-smoke-deny",
    seed,
    rulesetId: STANDARD_RULESET.id,
    catalogVersion: SHIPPED_CATALOG.version,
    mapId: DRILL_HALL.id,
    attack: {
      side: "attack",
      members: [
        createInstance(brimstone, "attack", { xMm: 3000, yMm: 6000 }, "brimstone-attack", null),
      ],
    },
    defense: {
      side: "defense",
      members: [createInstance(jett, "defense", { xMm: 11000, yMm: 6000 }, "jett-defense", "entry")],
    },
    setup: FULL_CHARGES_PROVENANCE,
    orders: [
      {
        kind: "move",
        instanceId: "brimstone-attack",
        to: { xMm: 6500, yMm: 6000 },
        speedMmPerSec: 3500,
        startMs: 0,
      },
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: SKY_SMOKE_ID,
        target: DRILL_HALL_DOORWAY,
        atMs: 1500,
      },
      {
        kind: "engage",
        instanceId: "jett-defense",
        targetInstanceId: "brimstone-attack",
        weaponId: RIFLE_A.id,
        atMs: 4000,
      },
      {
        kind: "engage",
        instanceId: "jett-defense",
        targetInstanceId: "brimstone-attack",
        weaponId: RIFLE_A.id,
        atMs: 23000,
      },
    ],
  };
}
