/**
 * H0 golden "behaviour fingerprint" of the live engine, recorded from the code
 * before the H0 refactor. See tests/support/golden.ts for the regeneration rule.
 */
import { describe, expect, it } from "vitest";
import {
  AFTERSHOCK_ID,
  FAULT_LINE_ID,
  FLASHPOINT_ID,
  ROLLING_THUNDER_ID,
} from "../../src/sim/agents/abilities/breach.ts";
import {
  INCENDIARY_ID,
  ORBITAL_STRIKE_ID,
  STIM_BEACON_ID,
} from "../../src/sim/agents/abilities/brimstone.ts";
import { SKY_SMOKE_ID } from "../../src/sim/agents/abilities/sky-smoke.ts";
import { SHIPPED_CATALOG } from "../../src/sim/agents/catalog.ts";
import { describeEvent } from "../../src/sim/describe.ts";
import {
  isLiveRound,
  issueOrders,
  replayOrderLog,
  stepLive,
  truthLiveWorld,
  viewLive,
  type AgentCommand,
  type LiveRound,
} from "../../src/sim/live-round.ts";
import { startLiveFromPreRound, type PreRoundPlan } from "../../src/sim/preround.ts";
import type { RejectionCode, Side } from "../../src/sim/types.ts";
import { rejectionMessage } from "../../src/ui/orders/rejectionMessages.ts";
import { createPlayableDrill } from "../../src/ui/scenario/playableDrill.ts";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import { defenseHoldDecide } from "../../src/tactics/defense-stub.ts";
import { readGoldenJson, UPDATE_GOLDEN, writeGoldenJson } from "../support/golden.ts";

const SEEDS = [1, 2, 3, 4, 5] as const;
const SAMPLE_EVERY_MS = 1000;
const MAX_MS = STANDARD_RULESET.roundDurationMs;

/** All 20 rejection codes that exist at the H0 base commit. */
const ALL_REJECTION_CODES: readonly RejectionCode[] = [
  "ability-not-owned",
  "ability-not-executable",
  "insufficient-charges",
  "out-of-range",
  "unknown-agent",
  "team-full",
  "duplicate-agent",
  "unknown-definition",
  "unknown-map",
  "ruleset-mismatch",
  "catalog-mismatch",
  "invalid-order",
  "wrong-side",
  "agent-down",
  "target-not-enemy",
  "target-not-visible",
  "signature-on-cooldown",
  "insufficient-ult-points",
  "insufficient-credits",
  "charges-full",
];

type ScriptEntry = { atMs: number; side: Side; commands: AgentCommand[] };

/** Live orders issued during the round (accepted or rejected; both are recorded). */
const LIVE_SCRIPT: readonly ScriptEntry[] = [
  { atMs: 3000, side: "attack", commands: [{ kind: "shoot", instanceId: "breach-attack", targetInstanceId: "jett-defense" }] },
  {
    atMs: 4000,
    side: "attack",
    commands: [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 12000, yMm: 6000 },
        aimYawDeg: 0,
        chargeValue: 20,
      },
    ],
  },
  {
    atMs: 6000,
    side: "attack",
    commands: [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: INCENDIARY_ID,
        target: { xMm: 13000, yMm: 9000 },
        aimYawDeg: 20,
      },
    ],
  },
  {
    atMs: 7000,
    side: "attack",
    commands: [
      {
        kind: "move-route",
        instanceId: "brimstone-attack",
        waypoints: [
          { xMm: 12000, yMm: 8000 },
          { xMm: 15000, yMm: 10000 },
        ],
      },
    ],
  },
  {
    atMs: 9000,
    side: "attack",
    commands: [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: ROLLING_THUNDER_ID,
        target: { xMm: 14000, yMm: 4000 },
        aimYawDeg: 330,
      },
    ],
  },
  {
    atMs: 12000,
    side: "attack",
    commands: [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: ORBITAL_STRIKE_ID,
        target: { xMm: 16000, yMm: 1000 },
        mapTarget: { xMm: 16000, yMm: 1000 },
      },
    ],
  },
  { atMs: 15000, side: "attack", commands: [{ kind: "hold", instanceId: "breach-attack" }] },
  { atMs: 16000, side: "defense", commands: [{ kind: "hold", instanceId: "jett-defense" }] },
];

function goldenScenario(seed: number) {
  const scenario = createPlayableDrill(seed, { startingUltPoints: 8 });
  const breach = scenario.attack.members.find((m) => m.instanceId === "breach-attack")!;
  const brim = scenario.attack.members.find((m) => m.instanceId === "brimstone-attack")!;
  breach.charges[FLASHPOINT_ID] = 0;
  brim.charges[STIM_BEACON_ID] = 0;
  return scenario;
}

const GOLDEN_PLAN: PreRoundPlan = {
  version: 1,
  side: "attack",
  buys: [
    { instanceId: "breach-attack", abilityId: FLASHPOINT_ID },
    { instanceId: "brimstone-attack", abilityId: STIM_BEACON_ID },
  ],
  agents: [
    {
      instanceId: "breach-attack",
      route: [
        { xMm: 6000, yMm: 5200 },
        { xMm: 9000, yMm: 6000 },
        { xMm: 14000, yMm: 3000 },
      ],
      abilities: [
        {
          id: "g-flash",
          abilityId: FLASHPOINT_ID,
          trigger: { kind: "at-waypoint", waypointIndex: 1 },
          target: { xMm: 12000, yMm: 4800 },
          aimYawDeg: 329,
        },
      ],
    },
    {
      instanceId: "brimstone-attack",
      route: [
        { xMm: 6000, yMm: 6800 },
        { xMm: 9500, yMm: 7000 },
      ],
      abilities: [
        {
          id: "g-smoke",
          abilityId: SKY_SMOKE_ID,
          trigger: { kind: "at-time", timeMs: 1000 },
          target: { xMm: 8000, yMm: 6000 },
          mapTarget: { xMm: 8000, yMm: 6000 },
        },
        {
          id: "g-stim",
          abilityId: STIM_BEACON_ID,
          trigger: { kind: "at-time", timeMs: 1500 },
          target: { xMm: 3500, yMm: 7000 },
          mapTarget: { xMm: 3500, yMm: 7000 },
        },
      ],
    },
  ],
};

function startGolden(seed: number): LiveRound {
  const opened = startLiveFromPreRound(goldenScenario(seed), GOLDEN_PLAN, SHIPPED_CATALOG, STANDARD_RULESET, {
    decide: defenseHoldDecide,
  });
  if (!isLiveRound(opened)) throw new Error(`golden plan rejected: ${opened.code} ${opened.message}`);
  return opened;
}

type Sample = {
  timeMs: number;
  truth: unknown;
  attackView: unknown;
  defenseView: unknown;
  planSteps: unknown;
};

/** Step one at a time, issuing the live script at its times and sampling each second. */
function runGolden(seed: number) {
  return runScripted(seed, startGolden(seed), LIVE_SCRIPT, SAMPLE_EVERY_MS);
}

function runScripted(seed: number, round: LiveRound, script: readonly ScriptEntry[], sampleEveryMs: number) {
  const samples: Sample[] = [];
  const issues: { atMs: number; ok: boolean; code?: string }[] = [];
  let scriptIndex = 0;
  let nextSample = 0;
  while (round.phase === "live" && round.world.timeMs < MAX_MS) {
    while (scriptIndex < script.length && script[scriptIndex]!.atMs <= round.world.timeMs) {
      const entry = script[scriptIndex]!;
      const result = issueOrders(round, entry.side, entry.commands);
      issues.push(result.ok ? { atMs: round.world.timeMs, ok: true } : { atMs: round.world.timeMs, ok: false, code: result.code });
      scriptIndex += 1;
    }
    if (round.world.timeMs >= nextSample) {
      samples.push({
        timeMs: round.world.timeMs,
        truth: truthLiveWorld(round),
        attackView: viewLive(round, "attack"),
        defenseView: viewLive(round, "defense"),
        planSteps: structuredClone(round.planSteps),
      });
      nextSample += sampleEveryMs;
    }
    stepLive(round, 1);
  }
  return {
    seed,
    phase: round.phase,
    result: round.result,
    endTimeMs: round.world.timeMs,
    combatState: round.combatState,
    nextSequence: round.nextSequence,
    issues,
    finalTruth: truthLiveWorld(round),
    finalPlanSteps: structuredClone(round.planSteps),
    orderLog: structuredClone(round.orderLog),
    events: structuredClone(round.events),
    eventText: round.events.map((event) => describeEvent(event)),
    samples,
  };
}

type GoldenRun = ReturnType<typeof runGolden>;

/**
 * Ability tour: attackers stay in the left room (the x = 8000 wall blocks every
 * sightline to the deep defenders), so there is no combat and the round runs to
 * the 100 s timeout. Covers ability damage, statuses and their expiry, smoke,
 * zone, device and orbital lifecycles, a wall-blocked move and a cooldown
 * rejection at resolve time.
 */
const TOUR_SCRIPT: readonly ScriptEntry[] = [
  { atMs: 0, side: "attack", commands: [{ kind: "cast", instanceId: "breach-attack", abilityId: AFTERSHOCK_ID, target: { xMm: 3000, yMm: 2000 }, aimYawDeg: 270 }] },
  { atMs: 500, side: "attack", commands: [{ kind: "cast", instanceId: "brimstone-attack", abilityId: SKY_SMOKE_ID, target: { xMm: 5000, yMm: 9000 }, mapTarget: { xMm: 5000, yMm: 9000 } }] },
  { atMs: 3000, side: "attack", commands: [{ kind: "cast", instanceId: "breach-attack", abilityId: FAULT_LINE_ID, target: { xMm: 7000, yMm: 3000 }, aimYawDeg: 0, chargeValue: 16 }] },
  { atMs: 3500, side: "attack", commands: [{ kind: "cast", instanceId: "brimstone-attack", abilityId: STIM_BEACON_ID, target: { xMm: 3500, yMm: 6000 }, mapTarget: { xMm: 3500, yMm: 6000 } }] },
  { atMs: 6000, side: "attack", commands: [{ kind: "cast", instanceId: "breach-attack", abilityId: FAULT_LINE_ID, target: { xMm: 7000, yMm: 3000 }, aimYawDeg: 0, chargeValue: 16 }] },
  { atMs: 8000, side: "attack", commands: [{ kind: "cast", instanceId: "brimstone-attack", abilityId: INCENDIARY_ID, target: { xMm: 5000, yMm: 10000 }, aimYawDeg: 90 }] },
  { atMs: 9000, side: "attack", commands: [{ kind: "cast", instanceId: "breach-attack", abilityId: FLASHPOINT_ID, target: { xMm: 5000, yMm: 2000 }, aimYawDeg: 270 }] },
  { atMs: 12000, side: "attack", commands: [{ kind: "cast", instanceId: "breach-attack", abilityId: ROLLING_THUNDER_ID, target: { xMm: 7000, yMm: 2000 }, aimYawDeg: 0 }] },
  { atMs: 16000, side: "attack", commands: [{ kind: "cast", instanceId: "brimstone-attack", abilityId: ORBITAL_STRIKE_ID, target: { xMm: 4000, yMm: 10500 }, mapTarget: { xMm: 4000, yMm: 10500 } }] },
  { atMs: 20000, side: "attack", commands: [{ kind: "move-route", instanceId: "breach-attack", waypoints: [{ xMm: 12000, yMm: 2000 }] }] },
  { atMs: 25000, side: "attack", commands: [{ kind: "move-route", instanceId: "breach-attack", waypoints: [{ xMm: 4000, yMm: 3000 }, { xMm: 4000, yMm: 1500 }] }] },
  { atMs: 27000, side: "attack", commands: [{ kind: "cast", instanceId: "breach-attack", abilityId: AFTERSHOCK_ID, target: { xMm: 3000, yMm: 2000 }, aimYawDeg: 270 }] },
];

function startTour(): LiveRound {
  const scenario = createPlayableDrill(9, { startingUltPoints: 8 });
  const opened = startLiveFromPreRound(scenario, { version: 1, side: "attack", buys: [], agents: [] }, SHIPPED_CATALOG, STANDARD_RULESET, {
    decide: defenseHoldDecide,
  });
  if (!isLiveRound(opened)) throw new Error(`tour plan rejected: ${opened.code} ${opened.message}`);
  return opened;
}

function runTour() {
  return runScripted(9, startTour(), TOUR_SCRIPT, 2000);
}

/** Probe batches issued at t=0 on a fresh golden round; every result is recorded. */
function runRejectionProbes() {
  const probes: { label: string; side: Side; commands: AgentCommand[] }[] = [
    { label: "unknown agent", side: "attack", commands: [{ kind: "hold", instanceId: "nobody" }] },
    { label: "wrong side", side: "attack", commands: [{ kind: "hold", instanceId: "jett-defense" }] },
    { label: "empty route", side: "attack", commands: [{ kind: "move-route", instanceId: "breach-attack", waypoints: [] }] },
    {
      label: "non-integer waypoint",
      side: "attack",
      commands: [{ kind: "move-route", instanceId: "breach-attack", waypoints: [{ xMm: 1.5, yMm: 2 }] }],
    },
    {
      label: "not owned",
      side: "attack",
      commands: [{ kind: "cast", instanceId: "breach-attack", abilityId: INCENDIARY_ID, target: { xMm: 5000, yMm: 5000 } }],
    },
    {
      label: "placeholder ability",
      side: "defense",
      commands: [{ kind: "cast", instanceId: "jett-defense", abilityId: "cloudburst", target: { xMm: 15000, yMm: 2000 } }],
    },
    {
      label: "bad yaw",
      side: "attack",
      commands: [
        { kind: "cast", instanceId: "breach-attack", abilityId: FLASHPOINT_ID, target: { xMm: 5000, yMm: 5000 }, aimYawDeg: 400 },
      ],
    },
    {
      label: "bad charge value",
      side: "attack",
      commands: [
        { kind: "cast", instanceId: "breach-attack", abilityId: FAULT_LINE_ID, target: { xMm: 5000, yMm: 5000 }, chargeValue: 1.5 },
      ],
    },
    { label: "shoot ally", side: "attack", commands: [{ kind: "shoot", instanceId: "breach-attack", targetInstanceId: "brimstone-attack" }] },
    { label: "shoot unseen", side: "attack", commands: [{ kind: "shoot", instanceId: "breach-attack", targetInstanceId: "jett-defense" }] },
    { label: "shoot unknown", side: "attack", commands: [{ kind: "shoot", instanceId: "breach-attack", targetInstanceId: "nobody" }] },
    {
      label: "second batch member fails",
      side: "attack",
      commands: [
        { kind: "hold", instanceId: "breach-attack" },
        { kind: "hold", instanceId: "kayo-defense" },
      ],
    },
  ];
  const round = startGolden(1);
  const results = probes.map((probe) => {
    const result = issueOrders(round, probe.side, probe.commands);
    return result.ok
      ? { label: probe.label, ok: true }
      : { label: probe.label, ok: false, code: result.code, message: result.message, orderIndex: result.orderIndex ?? null };
  });
  return { results, orderLog: structuredClone(round.orderLog), pendingBatch: structuredClone(round.pendingBatch) };
}

function allRejectionMessages() {
  return ALL_REJECTION_CODES.map((code) => ({ code, message: rejectionMessage(code) }));
}

describe("H0 golden engine fingerprint", () => {
  if (UPDATE_GOLDEN) {
    it("records golden fixtures (VALSIM_UPDATE_FIXTURES=1)", () => {
      for (const seed of SEEDS) writeGoldenJson(`engine-seed-${seed}.json`, runGolden(seed));
      writeGoldenJson("engine-ability-tour.json", runTour());
      writeGoldenJson("rejections.json", { probes: runRejectionProbes(), messages: allRejectionMessages() });
    });
    return;
  }

  for (const seed of SEEDS) {
    it(`seed ${seed}: per-second truth, both fogged views, plan steps, events, order log and RNG state match`, () => {
      const golden = readGoldenJson<GoldenRun>(`engine-seed-${seed}.json`);
      const run = runGolden(seed);
      expect(run.samples.length).toBe(golden.samples.length);
      for (let i = 0; i < golden.samples.length; i += 1) {
        expect(run.samples[i], `sample at ${golden.samples[i]!.timeMs} ms`).toEqual(golden.samples[i]);
      }
      expect(run.events).toEqual(golden.events);
      expect(run.eventText).toEqual(golden.eventText);
      expect(run.orderLog).toEqual(golden.orderLog);
      expect(run).toEqual(golden);
    });
  }

  it("ability tour (no combat, runs to timeout) matches", () => {
    const golden = readGoldenJson<GoldenRun>("engine-ability-tour.json");
    const run = runTour();
    for (let i = 0; i < golden.samples.length; i += 1) {
      expect(run.samples[i], `tour sample at ${golden.samples[i]!.timeMs} ms`).toEqual(golden.samples[i]);
    }
    expect(run.events).toEqual(golden.events);
    expect(run).toEqual(golden);
  });

  it("rejection probes and every rejection message match", () => {
    const golden = readGoldenJson<{ probes: unknown; messages: unknown }>("rejections.json");
    expect(runRejectionProbes()).toEqual(golden.probes);
    expect(allRejectionMessages()).toEqual(golden.messages);
  });

  it("replayOrderLog of the seed 1 golden round reproduces it exactly", () => {
    const original = startGolden(1);
    let scriptIndex = 0;
    while (original.phase === "live" && original.world.timeMs < MAX_MS) {
      while (scriptIndex < LIVE_SCRIPT.length && LIVE_SCRIPT[scriptIndex]!.atMs <= original.world.timeMs) {
        const entry = LIVE_SCRIPT[scriptIndex]!;
        issueOrders(original, entry.side, entry.commands);
        scriptIndex += 1;
      }
      stepLive(original, 1);
    }
    // Replay starts from the post-buy scenario that the live round holds, with the plan's
    // t=0 orders and plan-fired casts already in the order log.
    const replayed = replayOrderLog(original.scenario, original.orderLog, original.world.timeMs);
    expect(isLiveRound(replayed)).toBe(true);
    if (!isLiveRound(replayed)) return;
    expect(replayed.events).toEqual(original.events);
    expect(truthLiveWorld(replayed)).toEqual(truthLiveWorld(original));
  });

  it("stepping in chunks of 1, 7 and 40 gives identical rounds (no live script)", () => {
    const outcomes = [1, 7, 40].map((chunk) => {
      const round = startGolden(2);
      while (round.phase === "live" && round.world.timeMs < 30000) stepLive(round, chunk);
      return { events: round.events, truth: truthLiveWorld(round) };
    });
    // Chunks can overshoot 30000 ms by up to one chunk; compare the shared prefix of time.
    const until = Math.min(...outcomes.map((o) => o.truth.timeMs));
    const cut = (events: typeof outcomes[number]["events"]) => events.filter((e) => e.timeMs <= until);
    expect(cut(outcomes[1]!.events)).toEqual(cut(outcomes[0]!.events));
    expect(cut(outcomes[2]!.events)).toEqual(cut(outcomes[0]!.events));
  });
});
