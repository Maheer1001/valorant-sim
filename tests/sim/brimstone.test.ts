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
  applyOrbitalActivate,
  applyOrbitalShrink,
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
import { truthLiveWorld, viewLive } from "../../src/sim/live-round.ts";
import { autoFireIntervalFor, createWorld, runScenario } from "../../src/sim/run.ts";
import { createDefaultDrill } from "../../src/sim/scenario/default-drill.ts";
import type { Scenario } from "../../src/sim/scenario/types.ts";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import { advance, issueRejected, mustOpenLive, playAttack } from "./support/live-harness.ts";

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
    const round = mustOpenLive(brimScenario(1));
    const code = issueRejected(round, "defense", [
      {
        kind: "cast",
        instanceId: "jett-defense",
        abilityId: STIM_BEACON_ID,
        target: { xMm: 10000, yMm: 6000 },
      },
    ]);
    expect(code).toBe("ability-not-owned");
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

    const round = mustOpenLive(
      brimScenario(2, {
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    round.world.agents[0]!.charges[STIM_BEACON_ID] = 1;
    const stimCast = playAttack(round, [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: STIM_BEACON_ID,
        target: { xMm: 4000, yMm: 2000 },
        mapTarget: { xMm: 4000, yMm: 2000 },
      },
    ]);
    expect(
      stimCast.some((event) => event.type === "cast-accepted" && event.abilityId === STIM_BEACON_ID),
    ).toBe(true);
    expect(round.world.agents[0]!.charges[STIM_BEACON_ID]).toBe(0);
  });

  it("gates Orbital Strike on 8 ult points and spends them", () => {
    const round = mustOpenLive(
      brimScenario(3, {
        ultPoints: 0,
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    const rejected = playAttack(round, [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: ORBITAL_STRIKE_ID,
        target: { xMm: 5000, yMm: 2000 },
        mapTarget: { xMm: 5000, yMm: 2000 },
      },
    ]);
    expect(
      rejected.some(
        (event) =>
          event.type === "cast-rejected" &&
          event.abilityId === ORBITAL_STRIKE_ID &&
          event.code === "insufficient-ult-points",
      ),
    ).toBe(true);

    const armed = mustOpenLive(
      brimScenario(4, {
        ultPoints: 8,
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    const accepted = playAttack(armed, [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: ORBITAL_STRIKE_ID,
        target: { xMm: 5000, yMm: 2000 },
        mapTarget: { xMm: 5000, yMm: 2000 },
      },
    ]);
    expect(
      accepted.some((event) => event.type === "cast-accepted" && event.abilityId === ORBITAL_STRIKE_ID),
    ).toBe(true);
    expect(armed.world.agents[0]!.ultimatePoints).toBe(0);
  });

  it("applies Stim Beacon buffs in radius with 4 s linger, Haste walk, Combat Stim fire rate", () => {
    const round = mustOpenLive(
      brimScenario(5, {
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
        allyAt: { xMm: 3500, yMm: 2000 },
      }),
    );
    playAttack(round, [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: STIM_BEACON_ID,
        target: { xMm: 3200, yMm: 2000 },
        mapTarget: { xMm: 3200, yMm: 2000 },
      },
    ]);
    expect(round.world.devices.some((device) => device.kind === "stim-beacon")).toBe(true);
    const ally = round.world.agents.find((agent) => agent.instanceId === "kayo-attack");
    expect(ally && hasStatus(ally, STATUS_COMBAT_STIM, round.world.timeMs)).toBe(true);
    expect(ally && hasStatus(ally, STATUS_HASTE, round.world.timeMs)).toBe(true);
    expect(ally?.statuses.find((status) => status.id === STATUS_COMBAT_STIM)?.modifiers?.reloadTime).toBe(0.9);
    expect(autoFireIntervalFor(ally!, round.world.timeMs, STANDARD_RULESET)).toBe(
      Math.round(STANDARD_RULESET.autoFireIntervalMs / 1.1),
    );

    // Enemy fog hides beacon radius.
    expect(viewLive(round, "defense").devices).toEqual([]);
    expect(viewLive(round, "attack").devices.length).toBe(1);

    // Leave radius: move ally far, then hold until linger would still apply briefly.
    playAttack(round, [
      { kind: "move-route", instanceId: "kayo-attack", waypoints: [{ xMm: 3000, yMm: 10500 }] },
      { kind: "hold", instanceId: "brimstone-attack" },
    ]);
    const moved = round.world.agents.find((agent) => agent.instanceId === "kayo-attack");
    expect(moved && hasStatus(moved, STATUS_HASTE, round.world.timeMs)).toBe(true);
    // After linger window (4s) from last pulse while inside — advance holds past linger.
    for (let i = 0; i < 3; i += 1) {
      advance(round);
    }
    const cooled = round.world.agents.find((agent) => agent.instanceId === "kayo-attack");
    expect(cooled && hasStatus(cooled, STATUS_HASTE, round.world.timeMs)).toBe(false);
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

    const round = mustOpenLive(
      brimScenario(66, {
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    const first = playAttack(round, [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: INCENDIARY_ID,
        target: { xMm: 5000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    let detonated = first.find((event) => event.type === "incendiary-detonated");
    for (let i = 0; i < 4 && !detonated; i += 1) {
      detonated = advance(round).find((event) => event.type === "incendiary-detonated");
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
    // Pure orbital damage for a defender who stays inside through active + shrink jobs.
    const burn = createWorld(
      brimScenario(70, {
        ultPoints: 8,
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 8000, yMm: 2000 },
        enemyHp: 500,
        allyAt: { xMm: 8200, yMm: 2000 },
      }),
    );
    const activated = applyOrbitalActivate(
      { type: "orbital-activate", instanceId: "brimstone-attack", at: { xMm: 8000, yMm: 2000 } },
      0,
      1,
      burn,
    );
    expect(activated.event.type).toBe("orbital-activated");
    let world = activated.world;
    const enemyStart = world.agents.find((agent) => agent.instanceId === "jett-defense")!.hp;
    const allyStart = world.agents.find((agent) => agent.instanceId === "kayo-attack")!.hp;
    let tickCount = 0;
    let sawShrink = false;
    for (const followup of activated.followups) {
      const job = followup.job;
      if (job.type === "zone-tick") {
        const tick = applyZoneTick(job, followup.atMs, 2, world);
        world = tick.world;
        if (tick.event.type === "zone-damage") tickCount += 1;
      } else if (job.type === "orbital-shrink") {
        sawShrink = true;
        world = applyOrbitalShrink(job, followup.atMs, 3, world).world;
      } else if (job.type === "zone-expire") {
        world = applyZoneExpire(job, followup.atMs, 4, world).world;
      }
    }
    expect(sawShrink).toBe(true);
    expect(tickCount).toBe(20);
    const dealt =
      enemyStart - world.agents.find((agent) => agent.instanceId === "jett-defense")!.hp;
    // Reference damageTotalMin/Max 400–500. Engine: 20 × 20 during activeSec; shrink has no damage ticks.
    expect(dealt).toBeGreaterThanOrEqual(400);
    expect(dealt).toBeLessThanOrEqual(500);
    expect(dealt).toBe(400);
    expect(world.agents.find((agent) => agent.instanceId === "kayo-attack")!.hp).toBe(allyStart);

    const round = mustOpenLive(
      brimScenario(7, {
        ultPoints: 8,
        brimAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
        enemyHp: 500,
        allyAt: { xMm: 3200, yMm: 2000 },
      }),
    );
    const castWindow = playAttack(round, [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: ORBITAL_STRIKE_ID,
        target: { xMm: 5000, yMm: 2000 },
        mapTarget: { xMm: 5000, yMm: 2000 },
      },
    ]);
    let sawActivate = castWindow.some((event) => event.type === "orbital-activated");
    if (!sawActivate) {
      sawActivate = advance(round).some((event) => event.type === "orbital-activated");
    }
    expect(sawActivate).toBe(true);
    expect(round.world.smokes.some((item) => item.abilityId === ORBITAL_STRIKE_ID)).toBe(true);
  });

  it("keeps Sky Smoke scripted scenarios working via mapTarget routing", () => {
    const result = runScenario(createDefaultDrill(9));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((event) => event.type === "cast-accepted" && event.abilityId === SKY_SMOKE_ID)).toBe(
      true,
    );
    expect(result.events.some((event) => event.type === "smoke-active")).toBe(true);

    const round = mustOpenLive(createDefaultDrill(10));
    const smoked = playAttack(round, [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: SKY_SMOKE_ID,
        target: { xMm: 0, yMm: 0 },
        mapTarget: DRILL_HALL_DOORWAY,
      },
    ]);
    const accepted = smoked.find((event) => event.type === "cast-accepted");
    expect(accepted?.type).toBe("cast-accepted");
    if (accepted?.type === "cast-accepted") {
      expect(accepted.target).toEqual(DRILL_HALL_DOORWAY);
    }
  });

  it("deep-equals for the same seed and Brimstone plans", () => {
    const first = playBrim(11);
    const second = playBrim(11);
    expect(first.world).toEqual(second.world);
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

function playBrim(seed: number) {
  const round = mustOpenLive(
    brimScenario(seed, {
      brimAt: { xMm: 3000, yMm: 2000 },
      enemyAt: { xMm: 11000, yMm: 2000 },
    }),
  );
  const resolved = playAttack(round, [
    {
      kind: "cast",
      instanceId: "brimstone-attack",
      abilityId: STIM_BEACON_ID,
      target: { xMm: 3500, yMm: 2000 },
      mapTarget: { xMm: 3500, yMm: 2000 },
    },
  ]);
  return { world: truthLiveWorld(round), events: resolved };
}
