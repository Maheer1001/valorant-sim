import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  INCENDIARY_ID,
  ORBITAL_STRIKE_ID,
  STIM_BEACON_ID,
} from "../../src/sim/agents/abilities/brimstone.ts";
import {
  applyIncendiaryDetonate,
  applyZoneExpire,
  applyZoneTick,
  resolveIncendiaryPath,
  zoneRadiusMm,
} from "../../src/sim/agents/abilities/brimstone-resolve.ts";
import { SKY_SMOKE_ID } from "../../src/sim/agents/abilities/sky-smoke.ts";
import { SHIPPED_CATALOG, getAgent } from "../../src/sim/agents/catalog.ts";
import { createInstance } from "../../src/sim/agents/state.ts";
import { buyCharge } from "../../src/sim/economy/buy.ts";
import { STATUS_COMBAT_STIM, STATUS_HASTE, hasStatus } from "../../src/sim/effects/status.ts";
import { DRILL_HALL, DRILL_HALL_DOORWAY } from "../../src/sim/map/drill-hall.ts";
import {
  isRound,
  openRound,
  resolveWindow,
  submitPlan,
  view,
  type Round,
  type WindowOrder,
} from "../../src/sim/round.ts";
import { autoFireIntervalFor, createWorld, runScenario } from "../../src/sim/run.ts";
import { createDefaultDrill } from "../../src/sim/scenario/default-drill.ts";
import type { Scenario } from "../../src/sim/scenario/types.ts";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import { defenseHoldPlan } from "../../src/tactics/defense-stub.ts";

type RefAbility = {
  name: string;
  costCredits: number | null;
  maxCharges: number | null;
  stats: Record<string, unknown>;
};

const reference = JSON.parse(readFileSync(path.resolve("agent-reference.json"), "utf8")) as {
  agents: { name: string; ultimatePoints: number | null; abilities: RefAbility[] }[];
};

describe("Brimstone stage-1 kit", () => {
  it("keeps every Brimstone catalog number equal to agent-reference.json", () => {
    const brimRef = reference.agents.find((agent) => agent.name === "Brimstone");
    const catalog = getAgent(SHIPPED_CATALOG, "brimstone");
    expect(brimRef).toBeDefined();
    expect(catalog).toBeDefined();
    if (!brimRef || !catalog) return;
    const byName = Object.fromEntries(brimRef.abilities.map((ability) => [ability.name, ability]));
    for (const ability of catalog.abilities) {
      const ref = byName[ability.name];
      expect(ref, ability.name).toBeDefined();
      if (!ref || !ability.referenceStats) continue;
      expect(ability.costCredits).toBe(ref.costCredits);
      expect(ability.maxCharges).toBe(ref.maxCharges);
      if (ability.ultPointCost != null) {
        expect(ability.ultPointCost).toBe(brimRef.ultimatePoints);
      }
      for (const [key, value] of Object.entries(ability.referenceStats)) {
        if (key === "ultPoints") {
          expect(ref.stats.ultPoints).toBe(value);
          continue;
        }
        expect(ref.stats[key], `${ability.name}.${key}`).toBe(value);
      }
    }
  });

  it("rejects Stim Beacon owned only by Brimstone", () => {
    const round = mustOpen(brimScenario(1));
    const failed = submitPlan(round, "defense", [
      {
        kind: "cast",
        instanceId: "jett-defense",
        abilityId: STIM_BEACON_ID,
        target: { xMm: 10000, yMm: 6000 },
      },
    ]);
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.code).toBe("ability-not-owned");
  });

  it("buys Stim Beacon and Incendiary charges and spends them", () => {
    const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
    if (!brimstone) throw new Error("missing brimstone");
    const agent = {
      ...createInstance(brimstone, "attack", { xMm: 3000, yMm: 2000 }, "brimstone-attack", null),
      alive: true,
      charges: { [STIM_BEACON_ID]: 0, [INCENDIARY_ID]: 0, [SKY_SMOKE_ID]: 3 },
      credits: 800,
    };
    const stim = buyCharge(agent, STIM_BEACON_ID, SHIPPED_CATALOG);
    expect(stim.ok).toBe(true);
    if (!stim.ok) return;
    expect(stim.agent.charges[STIM_BEACON_ID]).toBe(1);
    expect(stim.agent.credits).toBe(600);
    const molt = buyCharge(stim.agent, INCENDIARY_ID, SHIPPED_CATALOG);
    expect(molt.ok).toBe(true);
    if (!molt.ok) return;
    expect(molt.agent.charges[INCENDIARY_ID]).toBe(1);
    expect(molt.agent.credits).toBe(350);

    let round = mustOpen(
      brimScenario(2, {
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    round.state.agents[0]!.charges[STIM_BEACON_ID] = 1;
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: STIM_BEACON_ID,
        target: { xMm: 4000, yMm: 2000 },
        mapTarget: { xMm: 4000, yMm: 2000 },
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const stimCast = resolveWindow(round);
    expect(stimCast.ok).toBe(true);
    if (!stimCast.ok) return;
    expect(
      stimCast.events.some((event) => event.type === "cast-accepted" && event.abilityId === STIM_BEACON_ID),
    ).toBe(true);
    expect(stimCast.state.agents[0]!.charges[STIM_BEACON_ID]).toBe(0);
  });

  it("gates Orbital Strike on 8 ult points and spends them", () => {
    let round = mustOpen(
      brimScenario(3, {
        ultPoints: 0,
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: ORBITAL_STRIKE_ID,
        target: { xMm: 5000, yMm: 2000 },
        mapTarget: { xMm: 5000, yMm: 2000 },
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const rejected = resolveWindow(round);
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(
      rejected.events.some(
        (event) =>
          event.type === "cast-rejected" &&
          event.abilityId === ORBITAL_STRIKE_ID &&
          event.code === "insufficient-ult-points",
      ),
    ).toBe(true);

    let armed = mustOpen(
      brimScenario(4, {
        ultPoints: 8,
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    armed = mustSubmit(armed, "attack", [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: ORBITAL_STRIKE_ID,
        target: { xMm: 5000, yMm: 2000 },
        mapTarget: { xMm: 5000, yMm: 2000 },
      },
    ]);
    armed = mustSubmit(armed, "defense", holdDefense(armed));
    const accepted = resolveWindow(armed);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(
      accepted.events.some((event) => event.type === "cast-accepted" && event.abilityId === ORBITAL_STRIKE_ID),
    ).toBe(true);
    expect(accepted.state.agents[0]!.ultimatePoints).toBe(0);
  });

  it("applies Stim Beacon buffs in radius with 4 s linger, Haste walk, Combat Stim fire rate", () => {
    let round = mustOpen(
      brimScenario(5, {
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
        allyAt: { xMm: 3500, yMm: 2000 },
      }),
    );
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: STIM_BEACON_ID,
        target: { xMm: 3200, yMm: 2000 },
        mapTarget: { xMm: 3200, yMm: 2000 },
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const placed = resolveWindow(round);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.state.devices.some((device) => device.kind === "stim-beacon")).toBe(true);
    const ally = placed.state.agents.find((agent) => agent.instanceId === "kayo-attack");
    expect(ally && hasStatus(ally, STATUS_COMBAT_STIM, placed.state.timeMs)).toBe(true);
    expect(ally && hasStatus(ally, STATUS_HASTE, placed.state.timeMs)).toBe(true);
    expect(ally?.statuses.find((status) => status.id === STATUS_COMBAT_STIM)?.modifiers?.reloadTime).toBe(0.9);
    expect(autoFireIntervalFor(ally!, placed.state.timeMs, STANDARD_RULESET)).toBe(
      Math.round(STANDARD_RULESET.autoFireIntervalMs / 1.1),
    );

    // Enemy fog hides beacon radius.
    expect(view(placed.round, "defense").devices).toEqual([]);
    expect(view(placed.round, "attack").devices.length).toBe(1);

    // Leave radius: move ally far, then hold until linger would still apply briefly.
    round = placed.round;
    round = mustSubmit(round, "attack", [
      { kind: "move", instanceId: "kayo-attack", to: { xMm: 3000, yMm: 10500 } },
      { kind: "hold", instanceId: "brimstone-attack" },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const left = resolveWindow(round);
    expect(left.ok).toBe(true);
    if (!left.ok) return;
    const moved = left.state.agents.find((agent) => agent.instanceId === "kayo-attack");
    expect(moved && hasStatus(moved, STATUS_HASTE, left.state.timeMs)).toBe(true);
    // After linger window (4s) from last pulse while inside — advance holds past linger.
    round = left.round;
    for (let i = 0; i < 3; i += 1) {
      round = advanceHold(round);
    }
    const cooled = round.state.agents.find((agent) => agent.instanceId === "kayo-attack");
    expect(cooled && hasStatus(cooled, STATUS_HASTE, round.state.timeMs)).toBe(false);
  });

  it("resolves Incendiary bounces, wall clip, ticks, and no allied damage", () => {
    const open = resolveIncendiaryPath({ xMm: 3000, yMm: 2000 }, 0, DRILL_HALL.walls, 4000);
    expect(open.bounces).toBe(2);
    expect(open.point.xMm).toBeGreaterThan(3000);

    const intoWall = resolveIncendiaryPath({ xMm: 7500, yMm: 2000 }, 0, DRILL_HALL.walls, 4000);
    expect(intoWall.point.xMm).toBeLessThan(8000);

    const burnWorld = createWorld(
      brimScenario(6, {
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 5000, yMm: 2000 },
        enemyHp: 500,
        allyAt: { xMm: 5000, yMm: 2000 },
      }),
    );
    const detonate = applyIncendiaryDetonate(
      {
        type: "incendiary-detonate",
        instanceId: "brimstone-attack",
        at: { xMm: 5000, yMm: 2000 },
        bounces: 2,
      },
      0,
      1,
      burnWorld,
      STANDARD_RULESET,
    );
    expect(detonate.event.type).toBe("incendiary-detonated");
    let world = detonate.world;
    const allyStart = world.agents.find((agent) => agent.instanceId === "kayo-attack")!.hp;
    const enemyStart = world.agents.find((agent) => agent.instanceId === "jett-defense")!.hp;
    let fullTicks = 0;
    for (const followup of detonate.followups) {
      const job = followup.job;
      if (job.type === "zone-tick") {
        const zone = world.zones.find((item) => item.id === job.zoneId);
        if (zone && zoneRadiusMm(zone, followup.atMs) >= zone.fullRadiusMm) {
          fullTicks += 1;
        }
        const tick = applyZoneTick(job, followup.atMs, 2, world);
        world = tick.world;
      } else if (job.type === "zone-expire") {
        world = applyZoneExpire(job, followup.atMs, 3, world).world;
      }
    }
    const enemy = world.agents.find((agent) => agent.instanceId === "jett-defense")!;
    const ally = world.agents.find((agent) => agent.instanceId === "kayo-attack")!;
    const dealt = enemyStart - enemy.hp;
    const fullSizeDamage = fullTicks * STANDARD_RULESET.incendiaryTickDamage;
    expect(fullSizeDamage).toBeGreaterThanOrEqual(420);
    expect(fullSizeDamage).toBeLessThanOrEqual(465);
    expect(dealt).toBeGreaterThanOrEqual(fullSizeDamage);
    expect(ally.hp).toBe(allyStart);

    let round = mustOpen(
      brimScenario(66, {
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: INCENDIARY_ID,
        target: { xMm: 5000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const first = resolveWindow(round);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    round = first.round;
    let detonated = first.events.find((event) => event.type === "incendiary-detonated");
    for (let i = 0; i < 4 && !detonated; i += 1) {
      round = advanceHold(round);
      detonated = round.lastWindowEvents.find((event) => event.type === "incendiary-detonated");
    }
    expect(detonated?.type).toBe("incendiary-detonated");

    // Radius growth during spread (design).
    const zone = {
      id: "z",
      abilityId: INCENDIARY_ID,
      ownerInstanceId: "x",
      side: "attack" as const,
      xMm: 0,
      yMm: 0,
      fullRadiusMm: 4500,
      activeFromMs: 0,
      expiresAtMs: 8000,
      burstEndMs: 250,
      spreadEndMs: 1000,
      fullEndMs: 8000,
      shrinkEndMs: null,
      damagesAllies: false,
      blocksVision: false,
      tickDamage: 6,
      tickIntervalMs: 100,
    };
    expect(zoneRadiusMm(zone, 100)).toBe(0);
    expect(zoneRadiusMm(zone, 625)).toBe(Math.round(4500 * 0.5));
    expect(zoneRadiusMm(zone, 2000)).toBe(4500);
  });

  it("runs Orbital windup, ticks, shrink, LOS block, and no allied damage", () => {
    let round = mustOpen(
      brimScenario(7, {
        ultPoints: 8,
        brimAt: { xMm: 3000, yMm: 6000 },
        enemyAt: { xMm: 8000, yMm: 6000 },
        enemyHp: 500,
        allyAt: { xMm: 8200, yMm: 6000 },
      }),
    );
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: ORBITAL_STRIKE_ID,
        target: DRILL_HALL_DOORWAY,
        mapTarget: DRILL_HALL_DOORWAY,
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const castWindow = resolveWindow(round);
    expect(castWindow.ok).toBe(true);
    if (!castWindow.ok) return;
    // Windup 2 s — may activate in the first 3 s window or the next.
    round = castWindow.round;
    let activated = castWindow.events.some((event) => event.type === "orbital-activated");
    if (!activated) {
      round = advanceHold(round);
      activated = round.lastWindowEvents.some((event) => event.type === "orbital-activated");
    }
    expect(activated).toBe(true);
    const allyHp = round.state.agents.find((agent) => agent.instanceId === "kayo-attack")!.hp;
    const ticks = round.lastWindowEvents.filter((event) => event.type === "zone-damage");
    expect(ticks.length).toBeGreaterThan(0);
    // LOS blocked by orbital vision volume at doorway.
    const smoke = round.state.smokes.find((item) => item.abilityId === ORBITAL_STRIKE_ID);
    expect(smoke).toBeDefined();
    // Advance through active + shrink; shrink jobs may land in any later window.
    let sawShrink = round.lastWindowEvents.some((event) => event.type === "orbital-shrink");
    for (let i = 0; i < 4; i += 1) {
      round = advanceHold(round);
      if (round.lastWindowEvents.some((event) => event.type === "orbital-shrink")) sawShrink = true;
    }
    expect(sawShrink).toBe(true);
    expect(round.state.agents.find((agent) => agent.instanceId === "kayo-attack")!.hp).toBe(allyHp);
    // 20 ticks × 20 = 400 during activeSec if enemy stays in — may span windows.
    const enemy = round.state.agents.find((agent) => agent.instanceId === "jett-defense")!;
    expect(enemy.hp).toBeLessThan(500);
  });

  it("keeps Sky Smoke scripted scenarios working via mapTarget routing", () => {
    const result = runScenario(createDefaultDrill(9));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((event) => event.type === "cast-accepted" && event.abilityId === SKY_SMOKE_ID)).toBe(
      true,
    );
    expect(result.events.some((event) => event.type === "smoke-active")).toBe(true);

    let round = mustOpen(createDefaultDrill(10));
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: SKY_SMOKE_ID,
        target: { xMm: 0, yMm: 0 },
        mapTarget: DRILL_HALL_DOORWAY,
      },
    ]);
    round = mustSubmit(round, "defense", defenseHoldPlan(round));
    const smoked = resolveWindow(round);
    expect(smoked.ok).toBe(true);
    if (!smoked.ok) return;
    const accepted = smoked.events.find((event) => event.type === "cast-accepted");
    expect(accepted?.type).toBe("cast-accepted");
    if (accepted?.type === "cast-accepted") {
      expect(accepted.target).toEqual(DRILL_HALL_DOORWAY);
    }
  });

  it("deep-equals for the same seed and Brimstone plans", () => {
    const first = playBrim(11);
    const second = playBrim(11);
    expect(first.state).toEqual(second.state);
    expect(first.events).toEqual(second.events);
  });
});

function brimScenario(
  seed: number,
  options?: {
    ultPoints?: number;
    brimAt?: { xMm: number; yMm: number };
    enemyAt?: { xMm: number; yMm: number };
    allyAt?: { xMm: number; yMm: number };
    enemyHp?: number;
  },
): Scenario {
  const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  const kayo = getAgent(SHIPPED_CATALOG, "kayo");
  if (!brimstone || !jett || !kayo) throw new Error("missing agents");
  const members = [
    createInstance(
      brimstone,
      "attack",
      options?.brimAt ?? { xMm: 3000, yMm: 6000 },
      "brimstone-attack",
      null,
      { facingDeg: 0, ultimatePoints: options?.ultPoints ?? 0 },
    ),
  ];
  if (options?.allyAt) {
    members.push(createInstance(kayo, "attack", options.allyAt, "kayo-attack", null, { facingDeg: 0 }));
  }
  const defense = createInstance(
    jett,
    "defense",
    options?.enemyAt ?? { xMm: 11000, yMm: 6000 },
    "jett-defense",
    "entry",
    { facingDeg: 180 },
  );
  if (options?.enemyHp != null) defense.hp = options.enemyHp;
  return {
    ...createDefaultDrill(seed),
    catalogVersion: SHIPPED_CATALOG.version,
    mapId: DRILL_HALL.id,
    attack: { side: "attack", members },
    defense: { side: "defense", members: [defense] },
    orders: [],
  };
}

function mustOpen(scenario: Scenario): Round {
  const opened = openRound(scenario);
  expect(isRound(opened)).toBe(true);
  if (!isRound(opened)) throw new Error(opened.message);
  return opened;
}

function mustSubmit(round: Round, side: "attack" | "defense", orders: WindowOrder[]): Round {
  const result = submitPlan(round, side, orders);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.round;
}

function holdDefense(round: Round): WindowOrder[] {
  return defenseHoldPlan(round);
}

function advanceHold(round: Round): Round {
  let next = mustSubmit(
    round,
    "attack",
    round.state.agents
      .filter((agent) => agent.side === "attack" && agent.alive)
      .map((agent) => ({ kind: "hold" as const, instanceId: agent.instanceId })),
  );
  next = mustSubmit(next, "defense", holdDefense(next));
  const resolved = resolveWindow(next);
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error(resolved.message);
  return resolved.round;
}

function playBrim(seed: number) {
  let round = mustOpen(
    brimScenario(seed, {
      brimAt: { xMm: 3000, yMm: 2000 },
      enemyAt: { xMm: 11000, yMm: 2000 },
    }),
  );
  round = mustSubmit(round, "attack", [
    {
      kind: "cast",
      instanceId: "brimstone-attack",
      abilityId: STIM_BEACON_ID,
      target: { xMm: 3500, yMm: 2000 },
      mapTarget: { xMm: 3500, yMm: 2000 },
    },
  ]);
  round = mustSubmit(round, "defense", holdDefense(round));
  const resolved = resolveWindow(round);
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error(resolved.message);
  return { state: resolved.state, events: resolved.events };
}
