import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AFTERSHOCK_ID,
  FAULT_LINE_ID,
  FLASHPOINT_ID,
  ROLLING_THUNDER_ID,
} from "../../src/sim/agents/abilities/breach.ts";
import { SKY_SMOKE_ID } from "../../src/sim/agents/abilities/sky-smoke.ts";
import { SHIPPED_CATALOG, getAgent } from "../../src/sim/agents/catalog.ts";
import { createInstance } from "../../src/sim/agents/state.ts";
import { buyCharge } from "../../src/sim/economy/buy.ts";
import { STATUS_BLIND, STATUS_CONCUSS, hasStatus } from "../../src/sim/effects/status.ts";
import { DRILL_HALL, DRILL_HALL_DOORWAY } from "../../src/sim/map/drill-hall.ts";
import { truthLiveWorld, viewLive } from "../../src/sim/live-round.ts";
import { createDefaultDrill } from "../../src/sim/scenario/default-drill.ts";
import type { Scenario } from "../../src/sim/scenario/types.ts";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import {
  advance,
  agentIn,
  issueRejected,
  mustIssue,
  mustOpenLive,
  playAttack,
} from "./support/live-harness.ts";

type RefAbility = {
  name: string;
  costCredits: number | null;
  maxCharges: number | null;
  stats: Record<string, unknown>;
};

const reference = JSON.parse(readFileSync(path.resolve("agent-reference.json"), "utf8")) as {
  agents: { name: string; ultimatePoints: number | null; abilities: RefAbility[] }[];
};

describe("Breach stage-1 kit", () => {
  it("keeps every Breach catalog number equal to agent-reference.json", () => {
    const breachRef = reference.agents.find((agent) => agent.name === "Breach");
    expect(breachRef).toBeDefined();
    const catalog = getAgent(SHIPPED_CATALOG, "breach");
    expect(catalog).toBeDefined();
    if (!breachRef || !catalog) return;

    const byName = Object.fromEntries(breachRef.abilities.map((ability) => [ability.name, ability]));
    for (const ability of catalog.abilities) {
      const ref = byName[ability.name];
      expect(ref, ability.name).toBeDefined();
      if (!ref || !ability.referenceStats) continue;
      expect(ability.costCredits).toBe(ref.costCredits);
      expect(ability.maxCharges).toBe(ref.maxCharges);
      if (ability.ultPointCost != null) {
        expect(ability.ultPointCost).toBe(breachRef.ultimatePoints);
        expect(ability.referenceStats.ultPoints).toBe(ref.stats.ultPoints);
      }
      for (const [key, value] of Object.entries(ability.referenceStats)) {
        if (key === "ultPoints" || key === "costCredits" || key === "maxCharges") continue;
        expect(ref.stats[key], `${ability.name}.${key}`).toBe(value);
      }
      if (ability.id === ROLLING_THUNDER_ID) {
        expect(ability.implementation).toBe("complete");
        expect(ability.notModeled).toEqual(["verticalKnockup (estimate withheld, flat map)"]);
      }
    }
  });

  it("rejects casts of Breach abilities by other agents (ownership)", () => {
    const round = mustOpenLive(breachScenario(1));
    const code = issueRejected(round, "defense", [
      {
        kind: "cast",
        instanceId: "jett-defense",
        abilityId: AFTERSHOCK_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    expect(code).toBe("ability-not-owned");
  });

  it("spends Flashpoint charges 2 → 1 → 0 and rejects the third", () => {
    const round = mustOpenLive(
      breachScenario(2, {
        flashCharges: 2,
        breachAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    const casts = [2, 1, 0] as const;
    for (let i = 0; i < 2; i += 1) {
      const resolved = playAttack(round, [
        {
          kind: "cast",
          instanceId: "breach-attack",
          abilityId: FLASHPOINT_ID,
          target: { xMm: 4000, yMm: 2000 },
          aimYawDeg: 0,
        },
      ]);
      const accepted = resolved.find((event) => event.type === "cast-accepted");
      expect(accepted?.type).toBe("cast-accepted");
      if (accepted?.type === "cast-accepted") {
        expect(accepted.chargesRemaining).toBe(casts[i]! - 1);
      }
    }
    const third = issueRejected(round, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    expect(third).toBe("insufficient-charges");
  });

  it("rejects Fault Line inside 50 s and accepts after the cooldown", () => {
    const hidden = {
      breachAt: { xMm: 3000, yMm: 2000 },
      enemyAt: { xMm: 11000, yMm: 2000 },
    };
    const round = mustOpenLive(breachScenario(3, hidden));
    const first = playAttack(round, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
        chargeValue: 20,
      },
    ]);
    expect(first.some((event) => event.type === "cast-accepted" && event.abilityId === FAULT_LINE_ID)).toBe(
      true,
    );

    const early = playAttack(round, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
        chargeValue: 20,
      },
    ]);
    expect(
      early.some(
        (event) =>
          event.type === "cast-rejected" &&
          event.abilityId === FAULT_LINE_ID &&
          event.code === "signature-on-cooldown",
      ),
    ).toBe(true);

    while (round.world.timeMs < 50000) {
      advance(round);
    }
    const later = playAttack(round, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
        chargeValue: 20,
      },
    ]);
    expect(later.some((event) => event.type === "cast-accepted" && event.abilityId === FAULT_LINE_ID)).toBe(
      true,
    );
  });

  it("gates Rolling Thunder on 8 ult points and spends them; kills grant +1 killer and +1 victim", () => {
    let round = mustOpenLive(
      breachScenario(4, {
        ultPoints: 0,
        enemyHp: 40,
        breachAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    const rejected = playAttack(round, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: ROLLING_THUNDER_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    expect(
      rejected.some(
        (event) =>
          event.type === "cast-rejected" &&
          event.abilityId === ROLLING_THUNDER_ID &&
          event.code === "insufficient-ult-points",
      ),
    ).toBe(true);

    // Sightline duel for the kill ledger (doorway y=6000).
    round = mustOpenLive(breachScenario(4, { ultPoints: 0, enemyHp: 40 }));
    let killed = false;
    mustIssue(round, "attack", [
      { kind: "shoot", instanceId: "breach-attack", targetInstanceId: "jett-defense" },
    ]);
    for (let i = 0; i < 20; i += 1) {
      advance(round);
      const victim = round.world.agents.find((agent) => agent.instanceId === "jett-defense");
      if (victim && !victim.alive) {
        const killer = round.world.agents.find((agent) => agent.instanceId === "breach-attack");
        expect(killer?.ultimatePoints).toBe(1);
        expect(victim.ultimatePoints).toBe(1);
        killed = true;
        break;
      }
    }
    expect(killed).toBe(true);

    const withUlt = mustOpenLive(breachScenario(5, { ultPoints: 8 }));
    const ultCast = playAttack(withUlt, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: ROLLING_THUNDER_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    expect(ultCast.some((event) => event.type === "cast-accepted" && event.abilityId === ROLLING_THUNDER_ID)).toBe(
      true,
    );
    expect(agentIn(withUlt, "breach-attack").ultimatePoints).toBe(0);
  });

  it("spaces Aftershock bursts 0.6 s apart and Rolling Thunder blasts 0.255 s apart", () => {
    const hidden = {
      breachAt: { xMm: 3000, yMm: 2000 },
      enemyAt: { xMm: 11000, yMm: 2000 },
    };
    const round = mustOpenLive(breachScenario(6, hidden));
    const aftershock = playAttack(round, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: AFTERSHOCK_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    const bursts = aftershock.filter((event) => event.type === "ability-damage");
    expect(bursts).toHaveLength(2);
    expect(bursts[1]!.timeMs - bursts[0]!.timeMs).toBe(600);

    const ultRound = mustOpenLive(breachScenario(7, { ...hidden, ultPoints: 8 }));
    const thunder = playAttack(ultRound, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: ROLLING_THUNDER_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    const blasts = thunder.filter(
      (event) => event.type === "status-wave" && event.abilityId === ROLLING_THUNDER_ID,
    );
    expect(blasts).toHaveLength(8);
    for (let i = 1; i < blasts.length; i += 1) {
      expect(blasts[i]!.timeMs - blasts[i - 1]!.timeMs).toBe(255);
    }
  });

  it("applies Aftershock and Fault Line through the Drill Hall divider", () => {
    const round = mustOpenLive(
      breachScenario(8, {
        breachAt: { xMm: 5000, yMm: 2000 },
        enemyAt: { xMm: 9500, yMm: 2000 },
        enemyHp: 200,
      }),
    );
    const shock = playAttack(round, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: AFTERSHOCK_ID,
        target: { xMm: 7000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    const hits = shock
      .filter((event) => event.type === "ability-damage")
      .flatMap((event) => (event.type === "ability-damage" ? event.hits : []));
    expect(hits.some((hit) => hit.targetInstanceId === "jett-defense" && hit.damage === 80)).toBe(true);

    const fault = mustOpenLive(
      breachScenario(9, {
        breachAt: { xMm: 5000, yMm: 2000 },
        enemyAt: { xMm: 14000, yMm: 2000 },
      }),
    );
    playAttack(fault, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 7000, yMm: 2000 },
        aimYawDeg: 0,
        chargeValue: 24,
      },
    ]);
    const concussed = fault.world.agents.find((agent) => agent.instanceId === "jett-defense");
    expect(concussed && hasStatus(concussed, STATUS_CONCUSS, fault.world.timeMs)).toBe(true);
  });

  it("applies concuss durations and assumed walk/hit effects", () => {
    const round = mustOpenLive(
      breachScenario(10, {
        breachAt: { xMm: 5000, yMm: 2000 },
        enemyAt: { xMm: 14000, yMm: 2000 },
      }),
    );
    const wave = playAttack(round, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
        chargeValue: 24,
      },
    ]);
    const statusEvent = wave.find(
      (event) => event.type === "status-wave" && event.abilityId === FAULT_LINE_ID,
    );
    expect(statusEvent?.type).toBe("status-wave");
    if (statusEvent?.type === "status-wave") {
      expect(statusEvent.durationMs).toBe(2500);
    }
    expect(STANDARD_RULESET.concussWalkSpeedMultiplierBp).toBe(7000);
    expect(STANDARD_RULESET.concussHitChancePenaltyBp).toBe(2000);
    expect(STANDARD_RULESET.concussWalkSpeedMultiplierProvenance.kind).toBe("assumed");
    expect(STANDARD_RULESET.concussHitChancePenaltyProvenance.kind).toBe("assumed");

    const thunder = mustOpenLive(
      breachScenario(11, {
        ultPoints: 8,
        breachAt: { xMm: 5000, yMm: 2000 },
        enemyAt: { xMm: 14000, yMm: 2000 },
      }),
    );
    const blasts = playAttack(thunder, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: ROLLING_THUNDER_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    const firstBlast = blasts.find(
      (event) => event.type === "status-wave" && event.abilityId === ROLLING_THUNDER_ID,
    );
    expect(firstBlast?.type).toBe("status-wave");
    if (firstBlast?.type === "status-wave") {
      expect(firstBlast.durationMs).toBe(4000);
    }
  });

  it("lets Flashpoint through a thin wall and blocks when wall span exceeds 10 m", async () => {
    const { applyFlashpointImpact } = await import("../../src/sim/agents/abilities/breach-resolve.ts");
    const { wallDepthMmAlongRay } = await import("../../src/sim/map/geometry.ts");
    const { createWorld } = await import("../../src/sim/run.ts");

    const round = mustOpenLive(
      breachScenario(30, {
        breachAt: { xMm: 6000, yMm: 2000 },
        enemyAt: { xMm: 9500, yMm: 2000 },
        enemyFacingDeg: 0,
      }),
    );
    const thinFlash = playAttack(round, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 7000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    const thinEvent = thinFlash.find((event) => event.type === "flash-resolved");
    expect(thinEvent?.type).toBe("flash-resolved");
    if (thinEvent?.type === "flash-resolved") {
      expect(thinEvent.blindedInstanceIds).toEqual(["jett-defense"]);
    }
    expect(wallDepthMmAlongRay({ xMm: 6000, yMm: 2000 }, { xMm: 9500, yMm: 2000 }, DRILL_HALL.walls)).toBe(0);

    // Parallel walls 12 m apart → span > verified wallDepth 10 m (corridor uses range 35 m).
    const thickWalls = [
      { a: { xMm: 7000, yMm: 0 }, b: { xMm: 7000, yMm: 12000 } },
      { a: { xMm: 19000, yMm: 0 }, b: { xMm: 19000, yMm: 12000 } },
    ];
    expect(
      wallDepthMmAlongRay({ xMm: 6000, yMm: 6000 }, { xMm: 19500, yMm: 6000 }, thickWalls),
    ).toBeGreaterThan(10000);

    const world = createWorld(
      breachScenario(31, {
        breachAt: { xMm: 6000, yMm: 6000 },
        enemyAt: { xMm: 19500, yMm: 6000 },
        enemyFacingDeg: 0,
      }),
    );
    const impact = applyFlashpointImpact(
      {
        type: "flashpoint-impact",
        instanceId: "breach-attack",
        impact: { xMm: 16000, yMm: 6000 },
        yawDeg: 0,
      },
      900,
      1,
      world,
      thickWalls,
      STANDARD_RULESET,
    );
    expect(impact.event.type).toBe("flash-resolved");
    if (impact.event.type === "flash-resolved") {
      expect(impact.event.blindedInstanceIds).toEqual([]);
      expect(impact.event.blockedInstanceIds).toContain("jett-defense");
    }
  });

  it("blinds only enemies looking toward the flash and lets smoke block Flashpoint", () => {
    const looking = mustOpenLive(
      breachScenario(12, {
        breachAt: { xMm: 6000, yMm: 6000 },
        enemyAt: { xMm: 9500, yMm: 6000 },
        enemyFacingDeg: 180,
      }),
    );
    const away = playAttack(looking, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    const flashAway = away.find((event) => event.type === "flash-resolved");
    expect(flashAway?.type).toBe("flash-resolved");
    if (flashAway?.type === "flash-resolved") {
      expect(flashAway.blindedInstanceIds).toEqual([]);
    }

    const toward = mustOpenLive(
      breachScenario(13, {
        breachAt: { xMm: 6000, yMm: 6000 },
        enemyAt: { xMm: 9500, yMm: 6000 },
        enemyFacingDeg: 180,
      }),
    );
    // Face the flash impact (west → east look = 0).
    toward.world.agents.find((agent) => agent.instanceId === "jett-defense")!.facingDeg = 0;
    const hit = playAttack(toward, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    const flashHit = hit.find((event) => event.type === "flash-resolved");
    expect(flashHit?.type).toBe("flash-resolved");
    if (flashHit?.type === "flash-resolved") {
      expect(flashHit.blindedInstanceIds).toEqual(["jett-defense"]);
    }
    expect(toward.world.agents.find((agent) => agent.instanceId === "jett-defense")?.statuses[0]?.id).toBe(
      STATUS_BLIND,
    );

    const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
    const breach = getAgent(SHIPPED_CATALOG, "breach");
    const jett = getAgent(SHIPPED_CATALOG, "jett");
    if (!brimstone || !breach || !jett) throw new Error("missing agents");
    const smoked = mustOpenLive({
      ...createDefaultDrill(14),
      attack: {
        side: "attack",
        members: [
          createInstance(breach, "attack", { xMm: 6000, yMm: 6000 }, "breach-attack", null, {
            facingDeg: 0,
          }),
          createInstance(brimstone, "attack", { xMm: 3000, yMm: 5000 }, "brimstone-attack", null),
        ],
      },
      defense: {
        side: "defense",
        members: [
          createInstance(jett, "defense", { xMm: 9500, yMm: 6000 }, "jett-defense", "entry", {
            facingDeg: 0,
          }),
        ],
      },
      orders: [],
    });
    // Advance until smoke is active, then flash in a later window once smoke is up.
    playAttack(smoked, [
      {
        kind: "cast",
        instanceId: "brimstone-attack",
        abilityId: SKY_SMOKE_ID,
        target: DRILL_HALL_DOORWAY,
      },
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    // Flash may resolve in the same window after flight; smoke deploy is 1s, flash impact at 0.9s.
    // Cast flash next window when smoke is already active.
    const blocked = playAttack(smoked, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    const flashBlocked = blocked.find((event) => event.type === "flash-resolved");
    expect(flashBlocked?.type).toBe("flash-resolved");
    if (flashBlocked?.type === "flash-resolved") {
      expect(flashBlocked.blindedInstanceIds).toEqual([]);
      expect(flashBlocked.blockedInstanceIds).toContain("jett-defense");
    }
  });

  it("deep-equals for the same seed and Breach plans", () => {
    const first = playBreach(20);
    const second = playBreach(20);
    expect(first.world).toEqual(second.world);
    expect(first.events).toEqual(second.events);
  });

  it("leaves viewLive(side) unchanged except flashed agents see nothing", () => {
    const round = mustOpenLive(
      breachScenario(21, {
        breachAt: { xMm: 3000, yMm: 6000 },
        enemyAt: { xMm: 11000, yMm: 6000 },
        enemyFacingDeg: 180,
      }),
    );
    const before = viewLive(round, "defense").agents.map((agent) => agent.instanceId).sort();
    expect(before).toEqual(["breach-attack", "jett-defense"]);

    round.world.agents.find((agent) => agent.instanceId === "jett-defense")!.facingDeg = 0;
    playAttack(round, [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    const defenseView = viewLive(round, "defense").agents.map((agent) => agent.instanceId);
    expect(defenseView).toEqual(["jett-defense"]);
  });

  it("buys a charge when credits and capacity allow", () => {
    const breach = getAgent(SHIPPED_CATALOG, "breach");
    if (!breach) throw new Error("missing breach");
    const agent = {
      ...createInstance(breach, "attack", { xMm: 3000, yMm: 6000 }, "breach-attack", null),
      alive: true,
      charges: { [AFTERSHOCK_ID]: 0, [FLASHPOINT_ID]: 2, [FAULT_LINE_ID]: 1 },
      credits: STANDARD_RULESET.startingCredits,
    };
    const bought = buyCharge(agent, AFTERSHOCK_ID, SHIPPED_CATALOG);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.agent.charges[AFTERSHOCK_ID]).toBe(1);
    expect(bought.agent.credits).toBe(STANDARD_RULESET.startingCredits - 200);
  });
});

function breachScenario(
  seed: number,
  options?: {
    ultPoints?: number;
    flashCharges?: number;
    enemyHp?: number;
    enemyFacingDeg?: number;
    breachAt?: { xMm: number; yMm: number };
    enemyAt?: { xMm: number; yMm: number };
  },
): Scenario {
  const breach = getAgent(SHIPPED_CATALOG, "breach");
  const jett = getAgent(SHIPPED_CATALOG, "jett");
  if (!breach || !jett) throw new Error("missing agents");
  const attackMember = createInstance(
    breach,
    "attack",
    options?.breachAt ?? { xMm: 6000, yMm: 6000 },
    "breach-attack",
    null,
    { facingDeg: 0, ultimatePoints: options?.ultPoints ?? 0 },
  );
  if (options?.flashCharges != null) {
    attackMember.charges[FLASHPOINT_ID] = options.flashCharges;
  }
  const defenseMember = createInstance(
    jett,
    "defense",
    options?.enemyAt ?? { xMm: 11000, yMm: 6000 },
    "jett-defense",
    "entry",
    { facingDeg: options?.enemyFacingDeg ?? 180 },
  );
  if (options?.enemyHp != null) {
    defenseMember.hp = options.enemyHp;
  }
  return {
    ...createDefaultDrill(seed),
    catalogVersion: SHIPPED_CATALOG.version,
    mapId: DRILL_HALL.id,
    attack: { side: "attack", members: [attackMember] },
    defense: { side: "defense", members: [defenseMember] },
    orders: [],
  };
}

function playBreach(seed: number) {
  const round = mustOpenLive(breachScenario(seed, { ultPoints: 8 }));
  const events = playAttack(round, [
    {
      kind: "cast",
      instanceId: "breach-attack",
      abilityId: AFTERSHOCK_ID,
      target: { xMm: 7000, yMm: 6000 },
      aimYawDeg: 0,
    },
  ]);
  return { world: truthLiveWorld(round), events };
}
