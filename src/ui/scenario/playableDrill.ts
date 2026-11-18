import { SHIPPED_CATALOG, getAgent } from "../../sim/agents/catalog.ts";
import { createInstance, FULL_CHARGES_PROVENANCE } from "../../sim/agents/state.ts";
import { DRILL_HALL } from "../../sim/map/drill-hall.ts";
import type { Scenario } from "../../sim/scenario/types.ts";
import { STANDARD_RULESET } from "../../rules/ruleset.ts";

/** Default interactive drill: Breach + Brimstone vs two hold defenders. */
export function createPlayableDrill(
  seed: number,
  options?: { startingUltPoints?: number },
): Scenario {
  const breach = getAgent(SHIPPED_CATALOG, "breach");
  const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  const kayo = getAgent(SHIPPED_CATALOG, "kayo");
  if (!breach || !brimstone || !jett || !kayo) {
    throw new Error("Shipped catalog is missing playable drill agents.");
  }
  const ult = options?.startingUltPoints ?? 0;
  return {
    version: 1,
    id: "drill-hall-playable",
    seed,
    rulesetId: STANDARD_RULESET.id,
    catalogVersion: SHIPPED_CATALOG.version,
    mapId: DRILL_HALL.id,
    attack: {
      side: "attack",
      members: [
        createInstance(breach, "attack", { xMm: 3000, yMm: 5000 }, "breach-attack", null, {
          facingDeg: 0,
          ultimatePoints: ult,
        }),
        createInstance(brimstone, "attack", { xMm: 3000, yMm: 7000 }, "brimstone-attack", null, {
          facingDeg: 0,
          ultimatePoints: ult,
        }),
      ],
    },
    defense: {
      side: "defense",
      members: [
        // Deep right room, wall-blocked from both attack spawns (doorway y 4800-7200).
        createInstance(jett, "defense", { xMm: 16000, yMm: 1000 }, "jett-defense", "entry", {
          facingDeg: 180,
        }),
        createInstance(kayo, "defense", { xMm: 16000, yMm: 11000 }, "kayo-defense", null, {
          facingDeg: 180,
        }),
      ],
    },
    setup: FULL_CHARGES_PROVENANCE,
    orders: [],
  };
}
