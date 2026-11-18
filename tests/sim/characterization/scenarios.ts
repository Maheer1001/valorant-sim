/**
 * Fixed seeded scenarios for windowed-API characterization fixtures.
 * Run through openRound / submitPlan / resolveWindow only.
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
import { DRILL_HALL } from "../../../src/sim/map/drill-hall.ts";
import {
  isRound,
  openRound,
  resolveWindow,
  submitPlan,
  type Round,
  type RoundState,
  type WindowOrder,
} from "../../../src/sim/round.ts";
import type { SimEvent } from "../../../src/sim/run.ts";
import { createDefaultDrill } from "../../../src/sim/scenario/default-drill.ts";
import type { Scenario } from "../../../src/sim/scenario/types.ts";
import { defenseHoldPlan } from "../../../src/tactics/defense-stub.ts";

export type CharacterizationCapture = {
  id: string;
  events: SimEvent[];
  finalState: RoundState;
};

function mustOpen(scenario: Scenario): Round {
  const opened = openRound(scenario);
  if (!isRound(opened)) throw new Error(opened.message);
  return opened;
}

function mustSubmit(round: Round, side: "attack" | "defense", orders: WindowOrder[]): Round {
  const result = submitPlan(round, side, orders);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.round;
}

function mustResolve(round: Round): { round: Round; events: SimEvent[] } {
  const resolved = resolveWindow(round);
  if (!resolved.ok) throw new Error(resolved.message);
  return { round: resolved.round, events: resolved.events };
}

function holdDefense(round: Round): WindowOrder[] {
  return defenseHoldPlan(round);
}

function holdAttack(round: Round): WindowOrder[] {
  return round.state.agents
    .filter((agent) => agent.side === "attack" && agent.alive)
    .map((agent) => ({ kind: "hold" as const, instanceId: agent.instanceId }));
}

function advanceHold(round: Round): { round: Round; events: SimEvent[] } {
  let next = mustSubmit(round, "attack", holdAttack(round));
  next = mustSubmit(next, "defense", holdDefense(next));
  return mustResolve(next);
}

export function captureWallMove(): CharacterizationCapture {
  let round = mustOpen(createDefaultDrill(3));
  round = mustSubmit(round, "attack", [
    { kind: "move", instanceId: "brimstone-attack", to: { xMm: 12000, yMm: 2000 } },
  ]);
  round = mustSubmit(round, "defense", holdDefense(round));
  const { round: resolved, events } = mustResolve(round);
  return { id: "wall-move", events, finalState: structuredClone(resolved.state) };
}

export function captureAutoFire(seed: number, windows: number): CharacterizationCapture {
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
  let round = mustOpen(scenario);
  const events: SimEvent[] = [];
  for (let i = 0; i < windows; i += 1) {
    round = mustSubmit(round, "attack", holdAttack(round));
    round = mustSubmit(round, "defense", holdDefense(round));
    const step = mustResolve(round);
    events.push(...step.events);
    round = step.round;
  }
  return {
    id: `auto-fire-seed-${seed}-windows-${windows}`,
    events,
    finalState: structuredClone(round.state),
  };
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
  let round = mustOpen(breachScenario(11));
  round = mustSubmit(round, "attack", [
    {
      kind: "cast",
      instanceId: "breach-attack",
      abilityId: AFTERSHOCK_ID,
      target: { xMm: 7000, yMm: 6000 },
      aimYawDeg: 0,
    },
  ]);
  round = mustSubmit(round, "defense", holdDefense(round));
  const first = mustResolve(round);
  const events = [...first.events];
  round = first.round;
  // Aftershock windup 2.2s + bursts — hold a few windows so damage lands.
  for (let i = 0; i < 2; i += 1) {
    const step = advanceHold(round);
    events.push(...step.events);
    round = step.round;
  }
  return { id: "breach-aftershock", events, finalState: structuredClone(round.state) };
}

export function captureFaultLine(): CharacterizationCapture {
  let round = mustOpen(breachScenario(12));
  round = mustSubmit(round, "attack", [
    {
      kind: "cast",
      instanceId: "breach-attack",
      abilityId: FAULT_LINE_ID,
      target: { xMm: 9000, yMm: 6000 },
      aimYawDeg: 0,
      chargeValue: 32,
    },
  ]);
  round = mustSubmit(round, "defense", holdDefense(round));
  const first = mustResolve(round);
  const events = [...first.events];
  round = first.round;
  for (let i = 0; i < 2; i += 1) {
    const step = advanceHold(round);
    events.push(...step.events);
    round = step.round;
  }
  return { id: "breach-fault-line", events, finalState: structuredClone(round.state) };
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
        createInstance(
          jett,
          "defense",
          { xMm: 8000, yMm: 2000 },
          "jett-defense",
          "entry",
          { facingDeg: 180, /* stays in orbital / molly */ },
        ),
      ],
    },
    orders: [],
  };
}

export function captureOrbital(): CharacterizationCapture {
  let round = mustOpen(brimScenario(21, 8));
  round = mustSubmit(round, "attack", [
    {
      kind: "cast",
      instanceId: "brimstone-attack",
      abilityId: ORBITAL_STRIKE_ID,
      target: { xMm: 8000, yMm: 2000 },
      mapTarget: { xMm: 8000, yMm: 2000 },
    },
  ]);
  round = mustSubmit(round, "defense", holdDefense(round));
  const first = mustResolve(round);
  const events = [...first.events];
  round = first.round;
  for (let i = 0; i < 3; i += 1) {
    const step = advanceHold(round);
    events.push(...step.events);
    round = step.round;
  }
  return { id: "brimstone-orbital", events, finalState: structuredClone(round.state) };
}

export function captureIncendiary(): CharacterizationCapture {
  let round = mustOpen(brimScenario(22));
  round = mustSubmit(round, "attack", [
    {
      kind: "cast",
      instanceId: "brimstone-attack",
      abilityId: INCENDIARY_ID,
      target: { xMm: 8000, yMm: 2000 },
      aimYawDeg: 0,
    },
  ]);
  round = mustSubmit(round, "defense", holdDefense(round));
  const first = mustResolve(round);
  const events = [...first.events];
  round = first.round;
  for (let i = 0; i < 4; i += 1) {
    const step = advanceHold(round);
    events.push(...step.events);
    round = step.round;
  }
  return { id: "brimstone-incendiary", events, finalState: structuredClone(round.state) };
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
