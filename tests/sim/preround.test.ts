import { describe, expect, it } from "vitest";
import { SHIPPED_CATALOG } from "../../src/sim/agents/catalog.ts";
import { isLiveRound, replayOrderLog, stepLive, type LiveRound } from "../../src/sim/live-round.ts";
import {
  startLiveFromPreRound,
  validatePlan,
  type PreRoundPlan,
} from "../../src/sim/preround.ts";
import { issueOrders } from "../../src/sim/live-round.ts";
import { createPlayableDrill } from "../../src/ui/scenario/playableDrill.ts";
import { parseReplay, REPLAY_FILE_VERSION, serializeReplay } from "../../src/ui/live/replayFile.ts";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";

function basePlan(overrides?: Partial<PreRoundPlan>): PreRoundPlan {
  return {
    version: 1,
    side: "attack",
    buys: [],
    agents: [],
    ...overrides,
  };
}

function mustStart(scenario: ReturnType<typeof createPlayableDrill>, plan: PreRoundPlan): LiveRound {
  const opened = startLiveFromPreRound(scenario, plan, SHIPPED_CATALOG, STANDARD_RULESET);
  expect(isLiveRound(opened)).toBe(true);
  if (!isLiveRound(opened)) throw new Error(opened.message);
  return opened;
}

describe("validatePlan", () => {
  it("rejects buy when charges are full", () => {
    const scenario = createPlayableDrill(1);
    const result = validatePlan(
      scenario,
      basePlan({ buys: [{ instanceId: "breach-attack", abilityId: "aftershock" }] }),
    );
    expect(result).toEqual({
      ok: false,
      code: "charges-full",
      message: "That ability is already at max charges.",
    });
  });

  it("rejects buy when credits are insufficient", () => {
    const scenario = createPlayableDrill(1);
    const breach = scenario.attack.members.find((m) => m.instanceId === "breach-attack")!;
    breach.charges.aftershock = 0;
    breach.credits = 50;
    const result = validatePlan(
      scenario,
      basePlan({ buys: [{ instanceId: "breach-attack", abilityId: "aftershock" }] }),
    );
    expect(result).toEqual({
      ok: false,
      code: "insufficient-credits",
      message: "Not enough credits to buy that charge.",
    });
  });

  it("rejects unknown ability on buy", () => {
    const scenario = createPlayableDrill(1);
    const result = validatePlan(
      scenario,
      basePlan({ buys: [{ instanceId: "breach-attack", abilityId: "sky-smoke" }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ability-not-owned");
  });

  it("rejects a bad waypoint index", () => {
    const scenario = createPlayableDrill(1);
    const result = validatePlan(
      scenario,
      basePlan({
        agents: [
          {
            instanceId: "breach-attack",
            route: [{ xMm: 4000, yMm: 5000 }],
            abilities: [
              {
                id: "a1",
                abilityId: "aftershock",
                trigger: { kind: "at-waypoint", waypointIndex: 3 },
                target: { xMm: 5000, yMm: 5000 },
                aimYawDeg: 0,
              },
            ],
          },
        ],
      }),
    );
    expect(result).toEqual({
      ok: false,
      code: "invalid-order",
      message: "Waypoint index is not on this agent's route.",
    });
  });

  it("rejects an out-of-range map cast", () => {
    const scenario = createPlayableDrill(1);
    const result = validatePlan(
      scenario,
      basePlan({
        agents: [
          {
            instanceId: "brimstone-attack",
            route: [],
            abilities: [
              {
                id: "smoke1",
                abilityId: "sky-smoke",
                trigger: { kind: "at-time", timeMs: 0 },
                target: { xMm: 90000, yMm: 7000 },
                mapTarget: { xMm: 90000, yMm: 7000 },
              },
            ],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("out-of-range");
  });

  it("rejects over-subscribed charges at queue time", () => {
    const scenario = createPlayableDrill(1);
    const result = validatePlan(
      scenario,
      basePlan({
        agents: [
          {
            instanceId: "breach-attack",
            route: [],
            abilities: [
              {
                id: "a1",
                abilityId: "aftershock",
                trigger: { kind: "at-time", timeMs: 0 },
                target: { xMm: 5000, yMm: 5000 },
                aimYawDeg: 0,
              },
              {
                id: "a2",
                abilityId: "aftershock",
                trigger: { kind: "at-time", timeMs: 1000 },
                target: { xMm: 5000, yMm: 5000 },
                aimYawDeg: 0,
              },
            ],
          },
        ],
      }),
    );
    expect(result).toEqual({
      ok: false,
      code: "insufficient-charges",
      message: "No charges left for this ability.",
    });
  });
});

describe("startLiveFromPreRound", () => {
  it("logs t=0 routes, reflects buys, and leaves empty plans holding", () => {
    const scenario = createPlayableDrill(2);
    const brim = scenario.attack.members.find((m) => m.instanceId === "brimstone-attack")!;
    brim.charges["stim-beacon"] = 0;

    const withBuy = mustStart(
      scenario,
      basePlan({
        buys: [{ instanceId: "brimstone-attack", abilityId: "stim-beacon" }],
        agents: [
          {
            instanceId: "breach-attack",
            route: [{ xMm: 4500, yMm: 5000 }],
            abilities: [],
          },
        ],
      }),
    );
    expect(withBuy.world.timeMs).toBe(0);
    expect(withBuy.orderLog).toEqual([
      {
        simTimeMs: 0,
        side: "attack",
        commands: [
          {
            kind: "move-route",
            instanceId: "breach-attack",
            waypoints: [{ xMm: 4500, yMm: 5000 }],
          },
        ],
        result: "accepted",
        origin: "live",
      },
    ]);
    const liveBrim = withBuy.world.agents.find((a) => a.instanceId === "brimstone-attack")!;
    expect(liveBrim.charges["stim-beacon"]).toBe(1);
    expect(liveBrim.credits).toBe(STANDARD_RULESET.startingCredits - 200);

    const empty = mustStart(createPlayableDrill(3), basePlan());
    expect(empty.orderLog).toEqual([]);
    expect(Object.values(empty.standing).every((order) => order.kind === "hold")).toBe(true);
    expect(empty.planSteps).toEqual([]);
  });

  it("fires a timed cast at the right sim time and spends charges at fire not at Go", () => {
    const scenario = createPlayableDrill(4);
    const round = mustStart(
      scenario,
      basePlan({
        agents: [
          {
            instanceId: "breach-attack",
            route: [],
            abilities: [
              {
                id: "flash-t",
                abilityId: "flashpoint",
                trigger: { kind: "at-time", timeMs: 0 },
                target: { xMm: 6000, yMm: 5000 },
                aimYawDeg: 0,
              },
            ],
          },
        ],
      }),
    );
    const before = round.world.agents.find((a) => a.instanceId === "breach-attack")!;
    expect(before.charges.flashpoint).toBe(2);
    expect(round.planSteps[0]?.status).toBe("armed");

    stepLive(round, 1);
    expect(round.world.timeMs).toBe(STANDARD_RULESET.simStepMs);
    const after = round.world.agents.find((a) => a.instanceId === "breach-attack")!;
    expect(after.charges.flashpoint).toBe(1);
    expect(round.planSteps[0]?.status).toBe("fired");
    expect(round.orderLog.some((e) => e.commands[0]?.kind === "cast" && e.result === "accepted")).toBe(
      true,
    );
  });

  it("fires a waypoint cast once when the waypoint is reached", () => {
    const scenario = createPlayableDrill(5);
    const round = mustStart(
      scenario,
      basePlan({
        agents: [
          {
            instanceId: "breach-attack",
            route: [{ xMm: 4000, yMm: 5000 }],
            abilities: [
              {
                id: "wp0",
                abilityId: "flashpoint",
                trigger: { kind: "at-waypoint", waypointIndex: 0 },
                target: { xMm: 5000, yMm: 5000 },
                aimYawDeg: 0,
              },
            ],
          },
        ],
      }),
    );
    const stepsNeeded = Math.ceil(2000 / (STANDARD_RULESET.walkSpeedMmPerSec / 20)) + 5;
    stepLive(round, stepsNeeded);
    const casts = round.orderLog.filter((e) => e.commands[0]?.kind === "cast");
    expect(casts).toHaveLength(1);
    expect(casts[0]?.result).toBe("accepted");
    expect(round.planSteps[0]?.status).toBe("fired");
    expect(round.planSteps[0]?.fireReason).toBe("arrived");
  });

  it("fires at-waypoint steps when a wall blocks the route early (D2)", () => {
    const scenario = createPlayableDrill(6);
    const round = mustStart(
      scenario,
      basePlan({
        agents: [
          {
            instanceId: "breach-attack",
            // Through the solid wall north of the doorway.
            route: [
              { xMm: 12000, yMm: 2000 },
              { xMm: 15000, yMm: 2000 },
            ],
            abilities: [
              {
                id: "blocked0",
                abilityId: "flashpoint",
                trigger: { kind: "at-waypoint", waypointIndex: 0 },
                target: { xMm: 5000, yMm: 2000 },
                aimYawDeg: 0,
              },
              {
                id: "blocked1",
                abilityId: "aftershock",
                trigger: { kind: "at-waypoint", waypointIndex: 1 },
                target: { xMm: 5000, yMm: 2000 },
                aimYawDeg: 0,
              },
            ],
          },
        ],
      }),
    );
    stepLive(round, 80);
    expect(round.planSteps.every((s) => s.status === "fired")).toBe(true);
    expect(round.planSteps.every((s) => s.fireReason === "blocked-early")).toBe(true);
    const castLogs = round.orderLog.filter((e) => e.commands[0]?.kind === "cast" && e.result === "accepted");
    expect(castLogs.length).toBe(2);
    expect(castLogs.every((e) => e.message === "Plan cast fired after route blocked by wall.")).toBe(
      true,
    );
  });

  it("marks unfired steps not-reached at round end (D2)", () => {
    const scenario = createPlayableDrill(7);
    const round = mustStart(
      scenario,
      basePlan({
        agents: [
          {
            instanceId: "breach-attack",
            route: [],
            abilities: [
              {
                id: "late",
                abilityId: "flashpoint",
                trigger: { kind: "at-time", timeMs: 90_000 },
                target: { xMm: 5000, yMm: 5000 },
                aimYawDeg: 0,
              },
            ],
          },
        ],
      }),
    );
    for (const agent of round.world.agents) {
      if (agent.side === "defense") {
        agent.hp = 0;
        agent.alive = false;
      }
    }
    stepLive(round, 1);
    expect(round.phase).toBe("ended");
    expect(round.planSteps[0]?.status).toBe("not-reached");
  });

  it("cancels at-waypoint steps on live move and ability steps on live cast (D4)", () => {
    const scenario = createPlayableDrill(8);
    const round = mustStart(
      scenario,
      basePlan({
        agents: [
          {
            instanceId: "breach-attack",
            route: [{ xMm: 5000, yMm: 5000 }],
            abilities: [
              {
                id: "wp",
                abilityId: "flashpoint",
                trigger: { kind: "at-waypoint", waypointIndex: 0 },
                target: { xMm: 6000, yMm: 5000 },
                aimYawDeg: 0,
              },
              {
                id: "timed-as",
                abilityId: "aftershock",
                trigger: { kind: "at-time", timeMs: 5000 },
                target: { xMm: 6000, yMm: 5000 },
                aimYawDeg: 0,
              },
              {
                id: "timed-flash",
                abilityId: "flashpoint",
                trigger: { kind: "at-time", timeMs: 8000 },
                target: { xMm: 6000, yMm: 5000 },
                aimYawDeg: 0,
              },
            ],
          },
          {
            instanceId: "brimstone-attack",
            route: [],
            abilities: [
              {
                id: "brim-smoke",
                abilityId: "sky-smoke",
                trigger: { kind: "at-time", timeMs: 9000 },
                target: { xMm: 7000, yMm: 7000 },
                mapTarget: { xMm: 7000, yMm: 7000 },
              },
            ],
          },
        ],
      }),
    );
    expect(issueOrders(round, "attack", [
      { kind: "move-route", instanceId: "breach-attack", waypoints: [{ xMm: 3500, yMm: 5000 }] },
    ]).ok).toBe(true);
    stepLive(round, 1);
    expect(round.planSteps.find((s) => s.id === "wp")?.status).toBe("cancelled");
    expect(round.planSteps.find((s) => s.id === "timed-as")?.status).toBe("armed");
    expect(round.planSteps.find((s) => s.id === "timed-flash")?.status).toBe("armed");
    expect(round.planSteps.find((s) => s.id === "brim-smoke")?.status).toBe("armed");

    expect(issueOrders(round, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: "aftershock",
        target: { xMm: 6000, yMm: 5000 },
        aimYawDeg: 0,
      },
    ]).ok).toBe(true);
    stepLive(round, 1);
    expect(round.planSteps.find((s) => s.id === "timed-as")?.status).toBe("cancelled");
    expect(round.planSteps.find((s) => s.id === "timed-flash")?.status).toBe("armed");
    expect(round.planSteps.find((s) => s.id === "brim-smoke")?.status).toBe("armed");
  });

  it("fires two at-time steps of the same ability when charges allow", () => {
    const scenario = createPlayableDrill(12);
    const round = mustStart(
      scenario,
      basePlan({
        agents: [
          {
            instanceId: "breach-attack",
            route: [],
            abilities: [
              {
                id: "f1",
                abilityId: "flashpoint",
                trigger: { kind: "at-time", timeMs: 500 },
                target: { xMm: 6000, yMm: 5000 },
                aimYawDeg: 0,
              },
              {
                id: "f2",
                abilityId: "flashpoint",
                trigger: { kind: "at-time", timeMs: 5000 },
                target: { xMm: 6000, yMm: 5000 },
                aimYawDeg: 0,
              },
            ],
          },
        ],
      }),
    );
    stepLive(round, 120);
    expect(round.planSteps.map((s) => s.status)).toEqual(["fired", "fired"]);
    expect(round.orderLog.filter((e) => e.origin === "plan" && e.result === "accepted")).toHaveLength(2);
  });

  it("rejects over-subscribed charges at queue time and rejects a third cast at fire after live charge loss", () => {
    const scenario = createPlayableDrill(13);
    expect(
      validatePlan(
        scenario,
        basePlan({
          agents: [
            {
              instanceId: "breach-attack",
              route: [],
              abilities: [
                {
                  id: "a1",
                  abilityId: "flashpoint",
                  trigger: { kind: "at-time", timeMs: 0 },
                  target: { xMm: 5000, yMm: 5000 },
                  aimYawDeg: 0,
                },
                {
                  id: "a2",
                  abilityId: "flashpoint",
                  trigger: { kind: "at-time", timeMs: 1000 },
                  target: { xMm: 5000, yMm: 5000 },
                  aimYawDeg: 0,
                },
                {
                  id: "a3",
                  abilityId: "flashpoint",
                  trigger: { kind: "at-time", timeMs: 2000 },
                  target: { xMm: 5000, yMm: 5000 },
                  aimYawDeg: 0,
                },
              ],
            },
          ],
        }),
      ),
    ).toEqual({
      ok: false,
      code: "insufficient-charges",
      message: "No charges left for this ability.",
    });

    const round = mustStart(
      scenario,
      basePlan({
        agents: [
          {
            instanceId: "brimstone-attack",
            route: [],
            abilities: [
              {
                id: "s1",
                abilityId: "sky-smoke",
                trigger: { kind: "at-time", timeMs: 500 },
                target: { xMm: 7000, yMm: 7000 },
                mapTarget: { xMm: 7000, yMm: 7000 },
              },
              {
                id: "s2",
                abilityId: "sky-smoke",
                trigger: { kind: "at-time", timeMs: 1500 },
                target: { xMm: 7200, yMm: 7000 },
                mapTarget: { xMm: 7200, yMm: 7000 },
              },
              {
                id: "s3",
                abilityId: "sky-smoke",
                trigger: { kind: "at-time", timeMs: 2500 },
                target: { xMm: 7400, yMm: 7000 },
                mapTarget: { xMm: 7400, yMm: 7000 },
              },
            ],
          },
        ],
      }),
    );
    // Force the over-subscribed live state: lose one charge without a live cast cancel.
    const brim = round.world.agents.find((a) => a.instanceId === "brimstone-attack")!;
    expect(brim.charges["sky-smoke"]).toBe(3);
    brim.charges["sky-smoke"] = 2;

    stepLive(round, 60);
    expect(round.planSteps.map((s) => s.status)).toEqual(["fired", "fired", "rejected"]);
    const rejected = round.orderLog.filter(
      (e) => e.origin === "plan" && e.result === "insufficient-charges",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.commands[0]).toMatchObject({ kind: "cast", abilityId: "sky-smoke" });
  });

  it("live cast of ability A at t>0 cancels remaining armed A steps only (D4)", () => {
    const scenario = createPlayableDrill(14);
    const round = mustStart(
      scenario,
      basePlan({
        agents: [
          {
            instanceId: "breach-attack",
            route: [],
            abilities: [
              {
                id: "flash-late",
                abilityId: "flashpoint",
                trigger: { kind: "at-time", timeMs: 5000 },
                target: { xMm: 6000, yMm: 5000 },
                aimYawDeg: 0,
              },
              {
                id: "as-late",
                abilityId: "aftershock",
                trigger: { kind: "at-time", timeMs: 5000 },
                target: { xMm: 6000, yMm: 5000 },
                aimYawDeg: 0,
              },
            ],
          },
          {
            instanceId: "brimstone-attack",
            route: [],
            abilities: [
              {
                id: "brim-late",
                abilityId: "sky-smoke",
                trigger: { kind: "at-time", timeMs: 5000 },
                target: { xMm: 7000, yMm: 7000 },
                mapTarget: { xMm: 7000, yMm: 7000 },
              },
            ],
          },
        ],
      }),
    );
    stepLive(round, 2);
    expect(round.world.timeMs).toBeGreaterThan(0);
    expect(
      issueOrders(round, "attack", [
        {
          kind: "cast",
          instanceId: "breach-attack",
          abilityId: "flashpoint",
          target: { xMm: 6000, yMm: 5000 },
          aimYawDeg: 0,
        },
      ]).ok,
    ).toBe(true);
    stepLive(round, 1);
    expect(round.planSteps.find((s) => s.id === "flash-late")?.status).toBe("cancelled");
    expect(round.planSteps.find((s) => s.id === "as-late")?.status).toBe("armed");
    expect(round.planSteps.find((s) => s.id === "brim-late")?.status).toBe("armed");
  });

  it("is deterministic for the same plan and seed", () => {
    const plan = basePlan({
      agents: [
        {
          instanceId: "breach-attack",
          route: [{ xMm: 4200, yMm: 5000 }],
          abilities: [
            {
              id: "t0",
              abilityId: "flashpoint",
              trigger: { kind: "at-time", timeMs: 0 },
              target: { xMm: 6000, yMm: 5000 },
              aimYawDeg: 0,
            },
          ],
        },
      ],
    });
    const a = mustStart(createPlayableDrill(9), plan);
    const b = mustStart(createPlayableDrill(9), structuredClone(plan));
    stepLive(a, 40);
    stepLive(b, 40);
    expect(a.events).toEqual(b.events);
    expect(a.orderLog).toEqual(b.orderLog);
    expect(a.world.agents.map((agent) => ({ id: agent.instanceId, x: agent.xMm, y: agent.yMm, hp: agent.hp }))).toEqual(
      b.world.agents.map((agent) => ({ id: agent.instanceId, x: agent.xMm, y: agent.yMm, hp: agent.hp })),
    );
  });
});

describe("replay v2 round trip (D1)", () => {
  it("replays plan-origin casts without re-running plan steps", () => {
    const scenario = createPlayableDrill(15);
    const plan = basePlan({
      agents: [
        {
          instanceId: "breach-attack",
          route: [],
          abilities: [
            {
              id: "p1",
              abilityId: "flashpoint",
              trigger: { kind: "at-time", timeMs: 500 },
              target: { xMm: 6000, yMm: 5000 },
              aimYawDeg: 0,
            },
            {
              id: "p2",
              abilityId: "flashpoint",
              trigger: { kind: "at-time", timeMs: 5000 },
              target: { xMm: 6000, yMm: 5000 },
              aimYawDeg: 0,
            },
          ],
        },
      ],
    });
    const live = mustStart(scenario, plan);
    stepLive(live, 120);
    expect(live.planSteps.map((s) => s.status)).toEqual(["fired", "fired"]);
    expect(live.orderLog.some((e) => e.origin === "plan")).toBe(true);

    const parsed = parseReplay(
      serializeReplay({
        version: REPLAY_FILE_VERSION,
        scenario: live.scenario,
        seed: live.seed,
        orderLog: structuredClone(live.orderLog),
        simTimeMs: live.world.timeMs,
        preRoundPlan: plan,
      }),
    );
    const replayed = replayOrderLog(parsed.scenario, parsed.orderLog, parsed.simTimeMs);
    expect(isLiveRound(replayed)).toBe(true);
    if (!isLiveRound(replayed)) return;
    expect(replayed.planSteps).toEqual([]);
    expect(replayed.orderLog).toEqual(live.orderLog);
    expect(
      replayed.world.agents.map((a) => ({
        id: a.instanceId,
        x: a.xMm,
        y: a.yMm,
        hp: a.hp,
        charges: a.charges,
      })),
    ).toEqual(
      live.world.agents.map((a) => ({
        id: a.instanceId,
        x: a.xMm,
        y: a.yMm,
        hp: a.hp,
        charges: a.charges,
      })),
    );
    expect(replayed.orderLog.filter((e) => e.origin === "plan").map((e) => e.result)).toEqual(
      live.orderLog.filter((e) => e.origin === "plan").map((e) => e.result),
    );
  });

  it("replays orderLog only and deep-equals world state", () => {
    const scenario = createPlayableDrill(10);
    const brim = scenario.attack.members.find((m) => m.instanceId === "brimstone-attack")!;
    brim.charges["stim-beacon"] = 0;
    const plan: PreRoundPlan = {
      version: 1,
      side: "attack",
      buys: [{ instanceId: "brimstone-attack", abilityId: "stim-beacon" }],
      agents: [
        {
          instanceId: "breach-attack",
          route: [{ xMm: 4000, yMm: 5000 }],
          abilities: [
            {
              id: "timed",
              abilityId: "flashpoint",
              trigger: { kind: "at-time", timeMs: 0 },
              target: { xMm: 5500, yMm: 5000 },
              aimYawDeg: 0,
            },
            {
              id: "wp",
              abilityId: "aftershock",
              trigger: { kind: "at-waypoint", waypointIndex: 0 },
              target: { xMm: 5500, yMm: 5000 },
              aimYawDeg: 0,
            },
          ],
        },
      ],
      loadoutFuture: {},
    };
    const live = mustStart(scenario, plan);
    stepLive(live, 60);

    const json = serializeReplay({
      version: REPLAY_FILE_VERSION,
      scenario: live.scenario,
      seed: live.seed,
      orderLog: structuredClone(live.orderLog),
      simTimeMs: live.world.timeMs,
      preRoundPlan: plan,
    });
    expect(json).toContain('"version": 2');
    const parsed = parseReplay(json);
    expect(parsed.preRoundPlan).toEqual(plan);

    const replayed = replayOrderLog(parsed.scenario, parsed.orderLog, parsed.simTimeMs);
    expect(isLiveRound(replayed)).toBe(true);
    if (!isLiveRound(replayed)) return;
    expect(replayed.planSteps).toEqual([]);
    expect(replayed.world.timeMs).toBe(live.world.timeMs);
    expect(replayed.orderLog).toEqual(live.orderLog);
    expect(replayed.events).toEqual(live.events);
    expect(
      replayed.world.agents.map((a) => ({
        id: a.instanceId,
        x: a.xMm,
        y: a.yMm,
        hp: a.hp,
        credits: a.credits,
        charges: a.charges,
      })),
    ).toEqual(
      live.world.agents.map((a) => ({
        id: a.instanceId,
        x: a.xMm,
        y: a.yMm,
        hp: a.hp,
        credits: a.credits,
        charges: a.charges,
      })),
    );
  });

  it("still reads version 1 replay files", () => {
    const scenario = createPlayableDrill(11);
    const text = serializeReplay({
      version: 1,
      scenario,
      seed: scenario.seed,
      orderLog: [],
      simTimeMs: 0,
    });
    // Force version 1 payload.
    const v1 = text.replace('"version": 2', '"version": 1');
    const parsed = parseReplay(v1);
    expect(parsed.version).toBe(1);
  });
});
