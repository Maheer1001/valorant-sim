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
import {
  isRound,
  openRound,
  resolveWindow,
  submitPlan,
  view,
  type Round,
  type WindowOrder,
} from "../../src/sim/round.ts";
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
    const round = mustOpen(breachScenario(1));
    const failed = submitPlan(round, "defense", [
      {
        kind: "cast",
        instanceId: "jett-defense",
        abilityId: AFTERSHOCK_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.code).toBe("ability-not-owned");
  });

  it("spends Flashpoint charges 2 → 1 → 0 and rejects the third", () => {
    let round = mustOpen(
      breachScenario(2, {
        flashCharges: 2,
        breachAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    const casts = [2, 1, 0] as const;
    for (let i = 0; i < 2; i += 1) {
      round = mustSubmit(round, "attack", [
        {
          kind: "cast",
          instanceId: "breach-attack",
          abilityId: FLASHPOINT_ID,
          target: { xMm: 4000, yMm: 2000 },
          aimYawDeg: 0,
        },
      ]);
      round = mustSubmit(round, "defense", holdDefense(round));
      const resolved = resolveWindow(round);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      const accepted = resolved.events.find((event) => event.type === "cast-accepted");
      expect(accepted?.type).toBe("cast-accepted");
      if (accepted?.type === "cast-accepted") {
        expect(accepted.chargesRemaining).toBe(casts[i]! - 1);
      }
      round = resolved.round;
    }
    const third = submitPlan(round, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    expect(third.ok).toBe(false);
    if (third.ok) return;
    expect(third.code).toBe("insufficient-charges");
  });

  it("rejects Fault Line inside 50 s and accepts after the cooldown", () => {
    const hidden = {
      breachAt: { xMm: 3000, yMm: 2000 },
      enemyAt: { xMm: 11000, yMm: 2000 },
    };
    let round = mustOpen(breachScenario(3, hidden));
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
        chargeValue: 20,
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const first = resolveWindow(round);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.events.some((event) => event.type === "cast-accepted" && event.abilityId === FAULT_LINE_ID)).toBe(
      true,
    );
    round = first.round;

    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
        chargeValue: 20,
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const early = resolveWindow(round);
    expect(early.ok).toBe(true);
    if (!early.ok) return;
    expect(
      early.events.some(
        (event) =>
          event.type === "cast-rejected" &&
          event.abilityId === FAULT_LINE_ID &&
          event.code === "signature-on-cooldown",
      ),
    ).toBe(true);
    round = early.round;

    while (round.state.timeMs < 50000) {
      round = advanceHoldWindow(round);
    }
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
        chargeValue: 20,
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const later = resolveWindow(round);
    expect(later.ok).toBe(true);
    if (!later.ok) return;
    expect(later.events.some((event) => event.type === "cast-accepted" && event.abilityId === FAULT_LINE_ID)).toBe(
      true,
    );
  });

  it("gates Rolling Thunder on 8 ult points and spends them; kills grant +1 killer and +1 victim", () => {
    let round = mustOpen(
      breachScenario(4, {
        ultPoints: 0,
        enemyHp: 40,
        breachAt: { xMm: 3000, yMm: 2000 },
        enemyAt: { xMm: 11000, yMm: 2000 },
      }),
    );
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: ROLLING_THUNDER_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
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
          event.abilityId === ROLLING_THUNDER_ID &&
          event.code === "insufficient-ult-points",
      ),
    ).toBe(true);

    // Sightline duel for the kill ledger (doorway y=6000).
    round = mustOpen(breachScenario(4, { ultPoints: 0, enemyHp: 40 }));
    let killed = false;
    for (let i = 0; i < 20; i += 1) {
      round = mustSubmit(round, "attack", [
        { kind: "shoot", instanceId: "breach-attack", targetInstanceId: "jett-defense" },
      ]);
      round = mustSubmit(round, "defense", holdDefense(round));
      const killWindow = resolveWindow(round);
      expect(killWindow.ok).toBe(true);
      if (!killWindow.ok) return;
      round = killWindow.round;
      const victim = round.state.agents.find((agent) => agent.instanceId === "jett-defense");
      if (victim && !victim.alive) {
        const killer = round.state.agents.find((agent) => agent.instanceId === "breach-attack");
        expect(killer?.ultimatePoints).toBe(1);
        expect(victim.ultimatePoints).toBe(1);
        killed = true;
        break;
      }
    }
    expect(killed).toBe(true);

    const withUlt = mustOpen(breachScenario(5, { ultPoints: 8 }));
    let armed = mustSubmit(withUlt, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: ROLLING_THUNDER_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    armed = mustSubmit(armed, "defense", holdDefense(armed));
    const ultCast = resolveWindow(armed);
    expect(ultCast.ok).toBe(true);
    if (!ultCast.ok) return;
    expect(ultCast.events.some((event) => event.type === "cast-accepted" && event.abilityId === ROLLING_THUNDER_ID)).toBe(
      true,
    );
    expect(ultCast.state.agents.find((agent) => agent.instanceId === "breach-attack")?.ultimatePoints).toBe(0);
  });

  it("spaces Aftershock bursts 0.6 s apart and Rolling Thunder blasts 0.255 s apart", () => {
    const hidden = {
      breachAt: { xMm: 3000, yMm: 2000 },
      enemyAt: { xMm: 11000, yMm: 2000 },
    };
    let round = mustOpen(breachScenario(6, hidden));
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: AFTERSHOCK_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const aftershock = resolveWindow(round);
    expect(aftershock.ok).toBe(true);
    if (!aftershock.ok) return;
    const bursts = aftershock.events.filter((event) => event.type === "ability-damage");
    expect(bursts).toHaveLength(2);
    expect(bursts[1]!.timeMs - bursts[0]!.timeMs).toBe(600);

    let ultRound = mustOpen(breachScenario(7, { ...hidden, ultPoints: 8 }));
    ultRound = mustSubmit(ultRound, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: ROLLING_THUNDER_ID,
        target: { xMm: 4000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    ultRound = mustSubmit(ultRound, "defense", holdDefense(ultRound));
    const thunder = resolveWindow(ultRound);
    expect(thunder.ok).toBe(true);
    if (!thunder.ok) return;
    const blasts = thunder.events.filter(
      (event) => event.type === "status-wave" && event.abilityId === ROLLING_THUNDER_ID,
    );
    expect(blasts).toHaveLength(8);
    for (let i = 1; i < blasts.length; i += 1) {
      expect(blasts[i]!.timeMs - blasts[i - 1]!.timeMs).toBe(255);
    }
  });

  it("applies Aftershock and Fault Line through the Drill Hall divider", () => {
    let round = mustOpen(
      breachScenario(8, {
        breachAt: { xMm: 5000, yMm: 2000 },
        enemyAt: { xMm: 9500, yMm: 2000 },
        enemyHp: 200,
      }),
    );
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: AFTERSHOCK_ID,
        target: { xMm: 7000, yMm: 2000 },
        aimYawDeg: 0,
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const shock = resolveWindow(round);
    expect(shock.ok).toBe(true);
    if (!shock.ok) return;
    const hits = shock.events
      .filter((event) => event.type === "ability-damage")
      .flatMap((event) => (event.type === "ability-damage" ? event.hits : []));
    expect(hits.some((hit) => hit.targetInstanceId === "jett-defense" && hit.damage === 80)).toBe(true);

    let fault = mustOpen(
      breachScenario(9, {
        breachAt: { xMm: 5000, yMm: 2000 },
        enemyAt: { xMm: 14000, yMm: 2000 },
      }),
    );
    fault = mustSubmit(fault, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 7000, yMm: 2000 },
        aimYawDeg: 0,
        chargeValue: 24,
      },
    ]);
    fault = mustSubmit(fault, "defense", holdDefense(fault));
    const wave = resolveWindow(fault);
    expect(wave.ok).toBe(true);
    if (!wave.ok) return;
    const concussed = wave.state.agents.find((agent) => agent.instanceId === "jett-defense");
    expect(concussed && hasStatus(concussed, STATUS_CONCUSS, wave.state.timeMs)).toBe(true);
  });

  it("applies concuss durations and assumed walk/hit effects", () => {
    let round = mustOpen(
      breachScenario(10, {
        breachAt: { xMm: 5000, yMm: 2000 },
        enemyAt: { xMm: 14000, yMm: 2000 },
      }),
    );
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FAULT_LINE_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
        chargeValue: 24,
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const wave = resolveWindow(round);
    expect(wave.ok).toBe(true);
    if (!wave.ok) return;
    const statusEvent = wave.events.find(
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

    let thunder = mustOpen(
      breachScenario(11, {
        ultPoints: 8,
        breachAt: { xMm: 5000, yMm: 2000 },
        enemyAt: { xMm: 14000, yMm: 2000 },
      }),
    );
    thunder = mustSubmit(thunder, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: ROLLING_THUNDER_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    thunder = mustSubmit(thunder, "defense", holdDefense(thunder));
    const blasts = resolveWindow(thunder);
    expect(blasts.ok).toBe(true);
    if (!blasts.ok) return;
    const firstBlast = blasts.events.find(
      (event) => event.type === "status-wave" && event.abilityId === ROLLING_THUNDER_ID,
    );
    expect(firstBlast?.type).toBe("status-wave");
    if (firstBlast?.type === "status-wave") {
      expect(firstBlast.durationMs).toBe(4000);
    }
  });

  it("blinds only enemies looking toward the flash and lets smoke block Flashpoint", () => {
    let looking = mustOpen(
      breachScenario(12, {
        breachAt: { xMm: 6000, yMm: 6000 },
        enemyAt: { xMm: 9500, yMm: 6000 },
        enemyFacingDeg: 180,
      }),
    );
    looking = mustSubmit(looking, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    looking = mustSubmit(looking, "defense", holdDefense(looking));
    const away = resolveWindow(looking);
    expect(away.ok).toBe(true);
    if (!away.ok) return;
    const flashAway = away.events.find((event) => event.type === "flash-resolved");
    expect(flashAway?.type).toBe("flash-resolved");
    if (flashAway?.type === "flash-resolved") {
      expect(flashAway.blindedInstanceIds).toEqual([]);
    }

    let toward = mustOpen(
      breachScenario(13, {
        breachAt: { xMm: 6000, yMm: 6000 },
        enemyAt: { xMm: 9500, yMm: 6000 },
        enemyFacingDeg: 180,
      }),
    );
    // Face the flash impact (west → east look = 0).
    toward.state.agents.find((agent) => agent.instanceId === "jett-defense")!.facingDeg = 0;
    toward = mustSubmit(toward, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    toward = mustSubmit(toward, "defense", holdDefense(toward));
    const hit = resolveWindow(toward);
    expect(hit.ok).toBe(true);
    if (!hit.ok) return;
    const flashHit = hit.events.find((event) => event.type === "flash-resolved");
    expect(flashHit?.type).toBe("flash-resolved");
    if (flashHit?.type === "flash-resolved") {
      expect(flashHit.blindedInstanceIds).toEqual(["jett-defense"]);
    }
    expect(hit.state.agents.find((agent) => agent.instanceId === "jett-defense")?.statuses[0]?.id).toBe(
      STATUS_BLIND,
    );

    const brimstone = getAgent(SHIPPED_CATALOG, "brimstone");
    const breach = getAgent(SHIPPED_CATALOG, "breach");
    const jett = getAgent(SHIPPED_CATALOG, "jett");
    if (!brimstone || !breach || !jett) throw new Error("missing agents");
    let smoked = mustOpen({
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
    smoked = mustSubmit(smoked, "attack", [
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
    smoked = mustSubmit(smoked, "defense", holdDefense(smoked));
    // Advance until smoke is active, then flash in a later window once smoke is up.
    const smokeWindow = resolveWindow(smoked);
    expect(smokeWindow.ok).toBe(true);
    if (!smokeWindow.ok) return;
    // Flash may resolve in the same window after flight; smoke deploy is 1s, flash impact at 0.9s.
    // Cast flash next window when smoke is already active.
    let next = smokeWindow.round;
    next = mustSubmit(next, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    next = mustSubmit(next, "defense", holdDefense(next));
    const blocked = resolveWindow(next);
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    const flashBlocked = blocked.events.find((event) => event.type === "flash-resolved");
    expect(flashBlocked?.type).toBe("flash-resolved");
    if (flashBlocked?.type === "flash-resolved") {
      expect(flashBlocked.blindedInstanceIds).toEqual([]);
      expect(flashBlocked.blockedInstanceIds).toContain("jett-defense");
    }
  });

  it("deep-equals for the same seed and Breach plans", () => {
    const first = playBreachWindows(20);
    const second = playBreachWindows(20);
    expect(first.state).toEqual(second.state);
    expect(first.events).toEqual(second.events);
  });

  it("leaves view(side) unchanged except flashed agents see nothing", () => {
    let round = mustOpen(
      breachScenario(21, {
        breachAt: { xMm: 3000, yMm: 6000 },
        enemyAt: { xMm: 11000, yMm: 6000 },
        enemyFacingDeg: 180,
      }),
    );
    const before = view(round, "defense").agents.map((agent) => agent.instanceId).sort();
    expect(before).toEqual(["breach-attack", "jett-defense"]);

    round.state.agents.find((agent) => agent.instanceId === "jett-defense")!.facingDeg = 0;
    round = mustSubmit(round, "attack", [
      {
        kind: "cast",
        instanceId: "breach-attack",
        abilityId: FLASHPOINT_ID,
        target: { xMm: 7000, yMm: 6000 },
        aimYawDeg: 0,
      },
    ]);
    round = mustSubmit(round, "defense", holdDefense(round));
    const flashed = resolveWindow(round);
    expect(flashed.ok).toBe(true);
    if (!flashed.ok) return;
    const defenseView = view(flashed.round, "defense").agents.map((agent) => agent.instanceId);
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

function advanceHoldWindow(round: Round): Round {
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

function playBreachWindows(seed: number) {
  let round = mustOpen(breachScenario(seed, { ultPoints: 8 }));
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
  const resolved = resolveWindow(round);
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error(resolved.message);
  return { state: resolved.state, events: resolved.events };
}
