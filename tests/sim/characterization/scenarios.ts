/**
 * Fixed seeded scenarios for live-engine characterization fixtures.
 *
 * Each capture opens a live round, issues the same orders the retired
 * windowed captures used at t=0, then steps for the same total sim time
 * (3000 ms per former window). Fixtures guard against silent behaviour
 * changes in the live engine; regenerate them deliberately with
 * `VALSIM_UPDATE_FIXTURES=1 npx vitest run tests/sim/characterization.test.ts`.
 */
import {
  AFTERSHOCK_ID,
  FAULT_LINE_ID,
} from "../../../src/sim/agents/abilities/breach.ts";
import {
  INCENDIARY_ID,
  ORBITAL_STRIKE_ID,
} from "../../../src/sim/agents/abilities/brimstone.ts";
import { SHIPPED_CATALOG, getAgent } from "../../../src/sim/agents/catalog.ts";
import { createInstance } from "../../../src/sim/agents/state.ts";
import {
  isLiveRound,
  issueOrders,
  openLiveRound,
  stepLive,
  truthLiveWorld,
  type AgentCommand,
  type RoundResult,
} from "../../../src/sim/live-round.ts";
import { DRILL_HALL } from "../../../src/sim/map/drill-hall.ts";
import type { SimEvent, World } from "../../../src/sim/run.ts";
import { createDefaultDrill } from "../../../src/sim/scenario/default-drill.ts";
import type { Scenario } from "../../../src/sim/scenario/types.ts";

export type CharacterizationCapture = {
  id: string;
  events: SimEvent[];
  finalWorld: World;
  result: RoundResult | null;
};

/** Former window length; captures keep the same total sim time. */
const SLICE_MS = 3000;

function capture(
  id: string,
  scenario: Scenario,
  attack: AgentCommand[],
  slices: number,
): CharacterizationCapture {
  const round = openLiveRound(scenario);
  if (!isLiveRound(round)) throw new Error(round.message);
  if (attack.length > 0) {
    const issued = issueOrders(round, "attack", attack);
    if (!issued.ok) throw new Error(`${issued.code}: ${issued.message}`);
  }
  stepLive(round, (slices * SLICE_MS) / round.ruleset.simStepMs);
  return {
    id,
    events: structuredClone(round.events),
    finalWorld: truthLiveWorld(round),
    result: round.result,
  };
}

export function captureWallMove(): CharacterizationCapture {
  return capture(
    "wall-move",
    createDefaultDrill(3),
    [{ kind: "move-route", instanceId: "brimstone-attack", waypoints: [{ xMm: 12000, yMm: 2000 }] }],
    1,
  );
}

export function captureAutoFire(seed: number, slices: number): CharacterizationCapture {
  const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  if (!brimstone || !jett) throw new Error("missing agents");
  const scenario: Scenario = {
    ...createDefaultDrill(seed),
    attack: {
      side: "attack",
      members: [
        createInstance(brimstone, "attack", { xMm: 3000, yMm: 6000 }, "brimstone-attack", null),
      ],
    },
    defense: {
      side: "defense",
      members: [
        createInstance(jett, "defense", { xMm: 11000, yMm: 6000 }, "jett-defense", "entry"),
      ],
    },
    orders: [],
  };
  return capture(`auto-fire-seed-${seed}-${slices * SLICE_MS}ms`, scenario, [], slices);
}

function breachScenario(seed: number, ultPoints = 0): Scenario {
  const breach = getAgent(SHIPPED_CATALOG, "breach");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  if (!breach || !jett) throw new Error("missing agents");
  return {
    ...createDefaultDrill(seed),
    catalogVersion: SHIPPED_CATALOG.version,
    mapId: DRILL_HALL.id,
    attack: {
      side: "attack",
      members: [
        createInstance(
          breach,
          "attack",
          { xMm: 6000, yMm: 6000 },
          "breach-attack",
          null,
          { facingDeg: 0, ultimatePoints: ultPoints },
        ),
      ],
    },
    defense: {
      side: "defense",
      members: [
        createInstance(
          jett,
          "defense",
          { xMm: 11000, yMm: 6000 },
          "jett-defense",
          "entry",
          { facingDeg: 180 },
        ),
      ],
    },
    orders: [],
  };
}

export function captureAftershock(): CharacterizationCapture {
  // Aftershock windup 2.2 s + bursts; 9 s total so damage lands.
  return capture(
    "breach-aftershock",
    breachScenario(11),
    [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: AFTERSHOCK_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ],
    3,
  );
}

export function captureFaultLine(): CharacterizationCapture {
  return capture(
    "breach-fault-line",
    breachScenario(12),
    [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 9000, yMm: 6000 },
        aimYawDeg: 0,
        chargeValue: 32,
      },
    ],
    3,
  );
}

function brimScenario(seed: number, ultPoints = 0): Scenario {
  const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  if (!brimstone || !jett) throw new Error("missing agents");
  return {
    ...createDefaultDrill(seed),
    catalogVersion: SHIPPED_CATALOG.version,
    mapId: DRILL_HALL.id,
    attack: {
      side: "attack",
      members: [
        createInstance(
          brimstone,
          "attack",
          { xMm: 3000, yMm: 2000 },
          "brimstone-attack",
          null,
          { facingDeg: 0, ultimatePoints: ultPoints },
        ),
      ],
    },
    defense: {
      side: "defense",
      members: [
        // Stays inside the orbital / molly.
        createInstance(jett, "defense", { xMm: 8000, yMm: 2000 }, "jett-defense", "entry", {
          facingDeg: 180,
        }),
      ],
    },
    orders: [],
  };
}

export function captureOrbital(): CharacterizationCapture {
  return capture(
    "brimstone-orbital",
    brimScenario(21, 8),
    [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: ORBITAL_STRIKE_ID,
        target: { xMm: 8000, yMm: 2000 },
        mapTarget: { xMm: 8000, yMm: 2000 },
      },
    ],
    4,
  );
}

export function captureIncendiary(): CharacterizationCapture {
  return capture(
    "brimstone-incendiary",
    brimScenario(22),
    [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: INCENDIARY_ID,
        target: { xMm: 8000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ],
    5,
  );
}

export function allCharacterizationCaptures(): CharacterizationCapture[] {
  return [
    captureWallMove(),
    captureAutoFire(1, 3),
    captureAutoFire(2, 3),
    captureAftershock(),
    captureFaultLine(),
    captureOrbital(),
    captureIncendiary(),
  ];
}
