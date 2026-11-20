import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AFTERSHOCK_ID,
  FAULT_LINE_ID,
  ROLLING_THUNDER_ID,
} from "../../src/sim/agents/abilities/breach.ts";
import {
  INCENDIARY_ID,
  ORBITAL_STRIKE_ID,
} from "../../src/sim/agents/abilities/brimstone.ts";
import { SHIPPED_CATALOG, getAgent } from "../../src/sim/agents/catalog.ts";
import { createInstance } from "../../src/sim/agents/state.ts";
import { STATUS_CONCUSS, STATUS_HASTE } from "../../src/sim/effects/status.ts";
import {
  isLiveRound,
  issueOrders,
  openLiveRound,
  replayOrderLog,
  stepLive,
  truthLiveWorld,
  viewLive,
  type AgentCommand,
  type LiveRound,
  type OrderLogEntry,
} from "../../src/sim/live-round.ts";
import { DRILL_HALL } from "../../src/sim/map/drill-hall.ts";
import type { SimEvent } from "../../src/sim/run.ts";
import { createDefaultDrill } from "../../src/sim/scenario/default-drill.ts";
import type { Scenario } from "../../src/sim/scenario/types.ts";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import { defenseHoldDecide } from "../../src/tactics/defense-stub.ts";

const ABILITY_PARITY_TYPES = new Set([
  "cast-accepted",
  "cast-rejected",
  "ability-damage",
  "status-wave",
  "status-expired",
  "flash-resolved",
  "incendiary-detonated",
  "orbital-activated",
  "orbital-shrink",
  "zone-damage",
  "zone-expired",
  "smoke-active",
  "smoke-expired",
  "stim-pulse",
  "device-expired",
]);

/**
 * Strip sequence and ephemeral ids (zoneId / smokeId / deviceId are sequence-derived
 * and differ when auto-fire jobs consume sequence numbers differently).
 * Keep type, timeMs, damage, hits, radii, status fields.
 */
function abilityParityEvents(events: readonly SimEvent[]): unknown[] {
  return events
    .filter((event) => ABILITY_PARITY_TYPES.has(event.type))
    .map((event) => {
      const { sequence: _sequence, ...rest } = event as SimEvent & Record<string, unknown>;
      const copy: Record<string, unknown> = { ...rest };
      for (const key of ["zoneId", "smokeId", "deviceId"] as const) {
        if (key in copy && typeof copy[key] === "string") {
          copy[key] = "<id>";
        }
      }
      return copy;
    });
}

describe("live round ruleset constants", () => {
  it("tags sim step, round duration, buy phase and decision interval", () => {
    expect(STANDARD_RULESET.simStepMs).toBe(50);
    expect(STANDARD_RULESET.simStepMsProvenance.kind).toBe("assumed");
    expect(STANDARD_RULESET.roundDurationMs).toBe(100_000);
    expect(STANDARD_RULESET.roundDurationMsProvenance.kind).toBe("owner");
    expect(STANDARD_RULESET.buyPhaseMs).toBe(30_000);
    expect(STANDARD_RULESET.buyPhaseMsProvenance.kind).toBe("assumed");
    expect(STANDARD_RULESET.decisionIntervalMs).toBe(500);
    expect(STANDARD_RULESET.decisionIntervalMsProvenance.kind).toBe("assumed");
  });
});

describe("live round determinism", () => {
  it("deep-equals for the same seed + scenario + order log; chunk size does not matter", () => {
    const scenario = sightlineScenario(7);
    const log = buildHoldLog(scenario, 40);
    const a = mustReplay(scenario, log, 2000);
    const b = mustReplay(scenario, log, 2000);
    expect(truthLiveWorld(a)).toEqual(truthLiveWorld(b));
    expect(a.events).toEqual(b.events);

    const by1 = runInChunks(scenario, log, 2000, 1);
    const by7 = runInChunks(scenario, log, 2000, 7);
    const by40 = runInChunks(scenario, log, 2000, 40);
    expect(truthLiveWorld(by1)).toEqual(truthLiveWorld(by7));
    expect(truthLiveWorld(by1)).toEqual(truthLiveWorld(by40));
    expect(by1.events).toEqual(by7.events);
    expect(by1.events).toEqual(by40.events);
  });

  it("records a paused-time order at t and matches stepping after issue", () => {
    const scenario = sightlineScenario(3);
    const paused = mustOpenLive(scenario);
    // "Paused": do not step; issue at t=0.
    const issued = issueOrders(paused, "attack", [
      { kind: "move-route", instanceId: "brimstone-attack", waypoints: [{ xMm: 4000, yMm: 6000 }] },
    ]);
    expect(issued.ok).toBe(true);
    expect(paused.orderLog[0]?.simTimeMs).toBe(0);
    stepLive(paused, 40);

    const running = mustOpenLive(scenario);
    issueOrders(running, "attack", [
      { kind: "move-route", instanceId: "brimstone-attack", waypoints: [{ xMm: 4000, yMm: 6000 }] },
    ]);
    stepLive(running, 40);
    expect(truthLiveWorld(paused)).toEqual(truthLiveWorld(running));
    expect(paused.events).toEqual(running.events);
  });
});

describe("live standing orders", () => {
  it("follows waypoints, clips on walls, and ends in hold", () => {
    const scenario = sightlineScenario(4);
    const round = mustOpenLive(scenario);
    issueOrders(round, "attack", [
      {
        kind: "move-route",
        instanceId: "brimstone-attack",
        waypoints: [
          { xMm: 5000, yMm: 6000 },
          { xMm: 12000, yMm: 2000 },
        ],
      },
    ]);
    stepLive(round, 400);
    const agent = round.world.agents.find((item) => item.instanceId === "brimstone-attack");
    expect(agent).toBeDefined();
    expect(agent!.xMm).toBeLessThan(8000);
    expect(round.standing["brimstone-attack"]?.kind).toBe("hold");
    expect(round.events.some((event) => event.type === "move-blocked")).toBe(true);
  });

  it("applies concuss slow and haste speed from the ruleset", () => {
    const slow = mustOpenLive(sightlineScenario(5));
    const fast = mustOpenLive(sightlineScenario(5));
    const slowAgent = slow.world.agents.find((agent) => agent.instanceId === "brimstone-attack")!;
    const fastAgent = fast.world.agents.find((agent) => agent.instanceId === "brimstone-attack")!;
    slowAgent.statuses.push({
      id: STATUS_CONCUSS,
      sourceAbilityId: "test",
      untilMs: 60_000,
    });
    fastAgent.statuses.push({
      id: STATUS_HASTE,
      sourceAbilityId: "test",
      untilMs: 60_000,
      modifiers: { movementSpeed: 1.1 },
    });
    const route: AgentCommand = {
      kind: "move-route",
      instanceId: "brimstone-attack",
      waypoints: [{ xMm: 7000, yMm: 6000 }],
    };
    issueOrders(slow, "attack", [route]);
    issueOrders(fast, "attack", [route]);
    stepLive(slow, 16);
    stepLive(fast, 16);
    expect(fastAgent.xMm).toBeGreaterThan(slowAgent.xMm);
  });
});

describe("live pause freezes windups", () => {
  it("keeps Fault Line timings after a gap with no steps", () => {
    const scenario = breachScenario(12);
    const continuous = mustOpenLive(scenario);
    issueOrders(continuous, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 9000, yMm: 6000 },
        aimYawDeg: 0,
        chargeValue: 32,
      },
    ]);
    stepLive(continuous, 80);

    const paused = mustOpenLive(scenario);
    issueOrders(paused, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 9000, yMm: 6000 },
        aimYawDeg: 0,
        chargeValue: 32,
      },
    ]);
    // Host "pauses" — no stepLive for a long wall-clock gap (sim time frozen).
    stepLive(paused, 80);
    const waveA = continuous.events.find((event) => event.type === "status-wave");
    const waveB = paused.events.find((event) => event.type === "status-wave");
    expect(waveA?.timeMs).toBe(waveB?.timeMs);
    expect(truthLiveWorld(continuous)).toEqual(truthLiveWorld(paused));
  });
});

describe("live round result", () => {
  it("times out at exactly 100000 ms with defense win; further steps are no-ops", () => {
    // No LOS so auto-fire cannot eliminate either side before the timer.
    const scenario = noLosScenario(9);
    const round = mustOpenLive(scenario);
    const steps = STANDARD_RULESET.roundDurationMs / STANDARD_RULESET.simStepMs;
    stepLive(round, steps);
    expect(round.phase).toBe("ended");
    expect(round.result).toEqual({ kind: "timeout", winner: "defense" });
    expect(round.world.timeMs).toBe(100_000);
    expect(round.events.some((event) => event.type === "round-ended")).toBe(true);
    const eventsBefore = round.events.length;
    const timeBefore = round.world.timeMs;
    stepLive(round, 10);
    expect(round.events.length).toBe(eventsBefore);
    expect(round.world.timeMs).toBe(timeBefore);
  });

  it("ends on elimination", () => {
    const scenario = sightlineScenario(10);
    const round = mustOpenLive(scenario);
    for (const agent of round.world.agents) {
      if (agent.side === "defense") {
        agent.hp = 0;
        agent.alive = false;
      }
    }
    stepLive(round, 1);
    expect(round.result).toEqual({ kind: "defense-eliminated" });
    expect(round.phase).toBe("ended");
  });
});

describe("live ability timings", () => {
  it("keeps Rolling Thunder blasts 255 ms apart", () => {
    const thunder = mustOpenLive(breachScenario(15, 8, 10_000));
    issueOrders(thunder, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: ROLLING_THUNDER_ID,
        target: { xMm: 9000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    stepLive(thunder, 200);
    const blasts = thunder.events.filter(
      (event) => event.type === "status-wave" && event.abilityId === ROLLING_THUNDER_ID,
    );
    expect(blasts.length).toBeGreaterThan(1);
    for (let i = 1; i < blasts.length; i += 1) {
      expect(blasts[i]!.timeMs - blasts[i - 1]!.timeMs).toBe(255);
    }
  });

  it("keeps Aftershock bursts 600 ms apart", () => {
    const shock = mustOpenLive(breachScenario(16, 0, 10_000));
    for (const agent of shock.world.agents) {
      agent.hp = 10_000;
      agent.alive = true;
    }
    issueOrders(shock, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: AFTERSHOCK_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    stepLive(shock, 120);
    expect(shock.phase).toBe("live");
    const bursts = shock.events.filter((event) => event.type === "ability-damage");
    expect(bursts.length).toBe(2);
    expect(bursts[1]!.timeMs - bursts[0]!.timeMs).toBe(600);
  });
});

/**
 * Ability events recorded from the retired `resolveWindow` shim (one cast window
 * plus N hold windows of 3000 ms) just before Stage (e) deleted it.
 */
const PARITY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/window-parity");
const WINDOW_MS = 3000;

function windowParity(id: string): { holdWindows: number; events: unknown[] } {
  return JSON.parse(readFileSync(path.join(PARITY_DIR, `${id}.json`), "utf8")) as {
    holdWindows: number;
    events: unknown[];
  };
}

describe("live vs retired window shim ability parity", () => {
  it("matches Aftershock ability events exactly (no LOS, no combat noise)", () => {
    // Defender behind the wall — no auto-fire draws; ability geometry still resolves.
    const scenario = parityBreachScenario(11);
    const cast = {
      kind: "cast" as const,
      instanceId: "breach-attack",
      abilityId: AFTERSHOCK_ID,
      target: { xMm: 7000, yMm: 6000 },
      aimYawDeg: 0,
    };
    const recorded = windowParity("aftershock");
    const liveEvents = runLiveCast(scenario, cast, WINDOW_MS * recorded.holdWindows);
    expect(abilityParityEvents(liveEvents)).toEqual(recorded.events);
  });

  it("matches Orbital Strike ability events exactly (target empty, defender out of range/LOS)", () => {
    const scenario = parityBrimScenario(21, 8);
    // 9 m radius; jett is at 17000,10500 — well outside.
    const cast = {
      kind: "cast" as const,
      instanceId: "brimstone-attack",
      abilityId: ORBITAL_STRIKE_ID,
      target: { xMm: 4500, yMm: 2000 },
      mapTarget: { xMm: 4500, yMm: 2000 },
    };
    const recorded = windowParity("orbital");
    const liveEvents = runLiveCast(scenario, cast, WINDOW_MS * recorded.holdWindows);
    expect(abilityParityEvents(liveEvents)).toEqual(recorded.events);
  });

  it("matches Incendiary ability events exactly (defender out of LOS and out of molly)", () => {
    const scenario = parityBrimScenario(22, 0);
    const cast = {
      kind: "cast" as const,
      instanceId: "brimstone-attack",
      abilityId: INCENDIARY_ID,
      target: { xMm: 4500, yMm: 2000 },
      aimYawDeg: 0,
    };
    const recorded = windowParity("incendiary");
    const liveEvents = runLiveCast(scenario, cast, WINDOW_MS * recorded.holdWindows);
    expect(abilityParityEvents(liveEvents)).toEqual(recorded.events);
  });
});

describe("live opponent cadence", () => {
  it("gives the bot only fogged data and logs its commands", () => {
    const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
    const jett = getAgent(SHIPPED_CATALOG, "jett");
    if (!brimstone || !jett) throw new Error("missing agents");
    // Jett behind the wall at y=2000 — no doorway LOS to brimstone on attack.
    const scenario: Scenario = {
      ...createDefaultDrill(8),
      attack: {
        side: "attack",
        members: [
          createInstance(brimstone, "attack", { xMm: 3000, yMm: 2000 }, "brimstone-attack", null),
        ],
      },
      defense: {
        side: "defense",
        members: [
          createInstance(jett, "defense", { xMm: 11000, yMm: 2000 }, "jett-defense", "entry"),
        ],
      },
      orders: [],
    };
    let botSawBrimstone = false;
    const opened = openLiveRound(scenario, SHIPPED_CATALOG, STANDARD_RULESET, {
      decide: (side, fogged) => {
        expect(side).toBe("defense");
        botSawBrimstone = fogged.agents.some((agent) => agent.instanceId === "brimstone-attack");
        return defenseHoldDecide(side, fogged);
      },
    });
    expect(isLiveRound(opened)).toBe(true);
    if (!isLiveRound(opened)) return;
    const fog = viewLive(opened, "defense");
    expect(fog.agents.some((agent) => agent.instanceId === "brimstone-attack")).toBe(false);
    // Put defender on a move so hold decide actually logs (runner skips hold-when-already-holding).
    issueOrders(opened, "defense", [
      { kind: "move-route", instanceId: "jett-defense", waypoints: [{ xMm: 10500, yMm: 2000 }] },
    ]);
    stepLive(opened, STANDARD_RULESET.decisionIntervalMs / STANDARD_RULESET.simStepMs + 4);
    expect(botSawBrimstone).toBe(false);
    expect(opened.orderLog.some((entry) => entry.side === "defense" && entry.result === "accepted")).toBe(
      true,
    );
  });
});

function sightlineScenario(seed: number): Scenario {
  const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  if (!brimstone || !jett) throw new Error("missing agents");
  return {
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
}

function breachScenario(seed: number, ultPoints = 0, enemyHp = 100): Scenario {
  const breach = getAgent(SHIPPED_CATALOG, "breach");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  if (!breach || !jett) throw new Error("missing agents");
  const defenseMember = createInstance(
    jett,
    "defense",
    { xMm: 11000, yMm: 6000 },
    "jett-defense",
    "entry",
    { facingDeg: 180 },
  );
  defenseMember.hp = enemyHp;
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
      members: [defenseMember],
    },
    orders: [],
  };
}

function noLosScenario(seed: number): Scenario {
  const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  if (!brimstone || !jett) throw new Error("missing agents");
  return {
    ...createDefaultDrill(seed),
    attack: {
      side: "attack",
      members: [
        createInstance(brimstone, "attack", { xMm: 3000, yMm: 2000 }, "brimstone-attack", null),
      ],
    },
    defense: {
      side: "defense",
      members: [
        createInstance(jett, "defense", { xMm: 11000, yMm: 2000 }, "jett-defense", "entry"),
      ],
    },
    orders: [],
  };
}

/** Breach on doorway line; Jett behind the wall — no rifle LOS. */
function parityBreachScenario(seed: number): Scenario {
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
        createInstance(breach, "attack", { xMm: 6000, yMm: 6000 }, "breach-attack", null, {
          facingDeg: 0,
        }),
      ],
    },
    defense: {
      side: "defense",
      members: [
        createInstance(jett, "defense", { xMm: 11000, yMm: 2000 }, "jett-defense", "entry", {
          facingDeg: 180,
        }),
      ],
    },
    orders: [],
  };
}

/** Brimstone at y=2000; Jett far behind the wall — no LOS and outside Orbital/Incendiary radii. */
function parityBrimScenario(seed: number, ultPoints: number): Scenario {
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
        createInstance(jett, "defense", { xMm: 17000, yMm: 10500 }, "jett-defense", "entry", {
          facingDeg: 180,
        }),
      ],
    },
    orders: [],
  };
}

function runLiveCast(
  scenario: Scenario,
  cast: Extract<AgentCommand, { kind: "cast" }>,
  untilMs: number,
): SimEvent[] {
  const live = mustOpenLive(scenario);
  issueOrders(live, "attack", [cast]);
  const steps = Math.ceil(untilMs / STANDARD_RULESET.simStepMs);
  stepLive(live, steps);
  return live.events;
}

function mustOpenLive(scenario: Scenario): LiveRound {
  const opened = openLiveRound(scenario);
  expect(isLiveRound(opened)).toBe(true);
  if (!isLiveRound(opened)) throw new Error(opened.message);
  return opened;
}

function mustReplay(scenario: Scenario, log: OrderLogEntry[], untilMs: number): LiveRound {
  const replayed = replayOrderLog(scenario, log, untilMs);
  expect(isLiveRound(replayed)).toBe(true);
  if (!isLiveRound(replayed)) throw new Error(replayed.message);
  return replayed;
}

function buildHoldLog(scenario: Scenario, steps: number): OrderLogEntry[] {
  const round = mustOpenLive(scenario);
  stepLive(round, steps);
  return structuredClone(round.orderLog);
}

function runInChunks(scenario: Scenario, log: OrderLogEntry[], untilMs: number, chunk: number): LiveRound {
  const round = mustOpenLive(scenario);
  round.enableDecide = false;
  let logIndex = 0;
  while (round.phase === "live" && round.world.timeMs < untilMs) {
    while (
      logIndex < log.length &&
      log[logIndex]!.simTimeMs <= round.world.timeMs
    ) {
      const entry = log[logIndex]!;
      issueOrders(round, entry.side, entry.commands);
      logIndex += 1;
    }
    stepLive(round, chunk);
  }
  return round;
}
