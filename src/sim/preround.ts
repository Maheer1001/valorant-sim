import { getAgent, SHIPPED_CATALOG, type Catalog } from "./agents/catalog.ts";
import { evaluateCast } from "./agents/cast.ts";
import type { AgentInstance } from "./agents/state.ts";
import { buyCharge } from "./economy/buy.ts";
import { distanceMm } from "./map/geometry.ts";
import type { PlanFailure } from "./round.ts";
import type { Scenario } from "./scenario/types.ts";
import type { Point, RejectionCode, Side } from "./types.ts";
import { STANDARD_RULESET, type Ruleset } from "../rules/ruleset.ts";
import type { AgentBody } from "./run.ts";
import {
  flushPendingBatches,
  isLiveRound,
  issueOrders,
  openLiveRound,
  type LiveRound,
  type OpenLiveOptions,
  type PlanStepState,
} from "./live-round.ts";

function memberAsBody(member: AgentInstance): AgentBody {
  return {
    instanceId: member.instanceId,
    definitionId: member.definitionId,
    side: member.side,
    xMm: member.xMm,
    yMm: member.yMm,
    hp: member.hp,
    alive: member.hp > 0,
    facingDeg: member.facingDeg,
    credits: member.credits,
    charges: { ...member.charges },
    cooldownReadyAtMs: { ...member.cooldownReadyAtMs },
    ultimatePoints: member.ultimatePoints,
    statuses: structuredClone(member.statuses),
  };
}

export type PlanTrigger =
  | { kind: "at-time"; timeMs: number }
  | { kind: "at-waypoint"; waypointIndex: number };

export type PlanAbility = {
  id: string;
  abilityId: string;
  trigger: PlanTrigger;
  target: Point;
  aimYawDeg?: number;
  chargeValue?: number;
  mapTarget?: Point;
};

export type AgentPlan = {
  instanceId: string;
  route: Point[];
  abilities: PlanAbility[];
};

export type BuyLine = {
  instanceId: string;
  abilityId: string;
};

/**
 * Pre-round plan. Pure data; no React.
 *
 * loadoutFuture: ROADMAP extension point for weapons and armor.
 * Stage (d) never reads it. Do not invent prices or ids here.
 * Later fields may include weaponId / armorTier with provenance tags.
 */
export type PreRoundPlan = {
  version: 1;
  side: "attack";
  buys: BuyLine[];
  agents: AgentPlan[];
  /** ROADMAP -- weapons and armor. Unread by stage (d). No prices. */
  loadoutFuture?: Record<string, never>;
};

export type ValidatePlanResult =
  | { ok: true }
  | { ok: false; code: RejectionCode; message: string };

/** Whole-plan validation (buys, routes, casts, soft reserve). */
export function validatePlan(
  scenario: Scenario,
  plan: PreRoundPlan,
  catalog: Catalog = SHIPPED_CATALOG,
  ruleset: Ruleset = STANDARD_RULESET,
): ValidatePlanResult {
  if (plan.version !== 1) {
    return { ok: false, code: "invalid-order", message: "Unsupported pre-round plan version." };
  }
  if (plan.side !== "attack") {
    return { ok: false, code: "wrong-side", message: "That agent is not on your side." };
  }

  const working = structuredClone(scenario);
  for (const buy of plan.buys) {
    const member = working.attack.members.find((item) => item.instanceId === buy.instanceId);
    if (!member) {
      return { ok: false, code: "unknown-agent", message: `Unknown agent ${buy.instanceId}.` };
    }
    if (member.side !== "attack") {
      return { ok: false, code: "wrong-side", message: "That agent is not on your side." };
    }
    const bought = buyCharge(memberAsBody(member), buy.abilityId, catalog);
    if (!bought.ok) {
      return { ok: false, code: bought.code, message: rejectionText(bought.code, bought.message) };
    }
    member.credits = bought.agent.credits;
    member.charges = { ...bought.agent.charges };
  }

  const seenAgents = new Set<string>();
  for (const agentPlan of plan.agents) {
    if (seenAgents.has(agentPlan.instanceId)) {
      return { ok: false, code: "invalid-order", message: "Duplicate agent plan entry." };
    }
    seenAgents.add(agentPlan.instanceId);
    const member = working.attack.members.find((item) => item.instanceId === agentPlan.instanceId);
    if (!member) {
      return { ok: false, code: "unknown-agent", message: `Unknown agent ${agentPlan.instanceId}.` };
    }
    for (const point of agentPlan.route) {
      if (!Number.isInteger(point.xMm) || !Number.isInteger(point.yMm)) {
        return {
          ok: false,
          code: "invalid-order",
          message: "Route waypoints must be integer millimeters.",
        };
      }
    }

    const definition = getAgent(catalog, member.definitionId);
    if (!definition) {
      return { ok: false, code: "unknown-definition", message: "Unknown agent definition." };
    }

    // Soft reserve: planned spends against post-buy pools.
    const reservedCharges: Record<string, number> = { ...member.charges };
    let reservedUlt = member.ultimatePoints;

    for (const ability of agentPlan.abilities) {
      if (ability.trigger.kind === "at-time") {
        if (
          !Number.isInteger(ability.trigger.timeMs) ||
          ability.trigger.timeMs < 0 ||
          ability.trigger.timeMs > ruleset.roundDurationMs
        ) {
          return {
            ok: false,
            code: "invalid-order",
            message: "Cast time must be within the round.",
          };
        }
      } else {
        const index = ability.trigger.waypointIndex;
        if (!Number.isInteger(index) || index < 0 || index >= agentPlan.route.length) {
          return {
            ok: false,
            code: "invalid-order",
            message: "Waypoint index is not on this agent's route.",
          };
        }
      }

      const origin =
        ability.trigger.kind === "at-waypoint"
          ? agentPlan.route[ability.trigger.waypointIndex]!
          : { xMm: member.xMm, yMm: member.yMm };
      const place = ability.mapTarget ?? ability.target;
      if (!Number.isInteger(place.xMm) || !Number.isInteger(place.yMm)) {
        return { ok: false, code: "invalid-order", message: "That order is not valid (check numbers and fields)." };
      }
      if (ability.aimYawDeg != null) {
        if (!Number.isInteger(ability.aimYawDeg) || ability.aimYawDeg < 0 || ability.aimYawDeg > 359) {
          return { ok: false, code: "invalid-order", message: "aimYawDeg must be an integer in 0..359." };
        }
      }

      const verdict = evaluateCast(definition, member, ability.abilityId, origin, place);
      if (!verdict.ok) {
        return { ok: false, code: verdict.code, message: rejectionText(verdict.code) };
      }
      const def = verdict.ability;
      if (def.maxCharges !== null) {
        const have = reservedCharges[def.id] ?? 0;
        if (have <= 0) {
          return {
            ok: false,
            code: "insufficient-charges",
            message: rejectionText("insufficient-charges"),
          };
        }
        reservedCharges[def.id] = have - 1;
      }
      if (def.ultPointCost != null && def.ultPointCost > 0) {
        if (reservedUlt < def.ultPointCost) {
          return {
            ok: false,
            code: "insufficient-ult-points",
            message: rejectionText("insufficient-ult-points"),
          };
        }
        reservedUlt -= def.ultPointCost;
      }
      if (def.maxRangeMm != null && distanceMm(origin, place) > def.maxRangeMm) {
        return { ok: false, code: "out-of-range", message: rejectionText("out-of-range") };
      }
    }
  }

  return { ok: true };
}

/**
 * Apply buys to a cloned scenario, open a live round, issue t=0 routes, install plan steps.
 * At return: timeMs === 0, plan steps armed, nothing fired yet.
 */
export function startLiveFromPreRound(
  scenario: Scenario,
  plan: PreRoundPlan,
  catalog: Catalog = SHIPPED_CATALOG,
  ruleset: Ruleset = STANDARD_RULESET,
  options: OpenLiveOptions = {},
): LiveRound | PlanFailure {
  const validated = validatePlan(scenario, plan, catalog, ruleset);
  if (!validated.ok) {
    return { ok: false, code: validated.code, message: validated.message };
  }

  const postBuy = structuredClone(scenario);
  for (const buy of plan.buys) {
    const member = postBuy.attack.members.find((item) => item.instanceId === buy.instanceId);
    if (!member) {
      return { ok: false, code: "unknown-agent", message: `Unknown agent ${buy.instanceId}.` };
    }
    const bought = buyCharge(memberAsBody(member), buy.abilityId, catalog);
    if (!bought.ok) {
      return { ok: false, code: bought.code, message: rejectionText(bought.code, bought.message) };
    }
    member.credits = bought.agent.credits;
    member.charges = { ...bought.agent.charges };
  }

  const opened = openLiveRound(postBuy, catalog, ruleset, options);
  if (!isLiveRound(opened)) return opened;
  const round = opened;

  const routeCommands = plan.agents
    .filter((agent) => agent.route.length > 0)
    .map((agent) => ({
      kind: "move-route" as const,
      instanceId: agent.instanceId,
      waypoints: agent.route.map((point) => ({ ...point })),
    }));
  if (routeCommands.length > 0) {
    const issued = issueOrders(round, plan.side as Side, routeCommands);
    if (!issued.ok) {
      return { ok: false, code: issued.code, message: issued.message };
    }
    flushPendingBatches(round);
  }

  const steps: PlanStepState[] = [];
  for (const agentPlan of plan.agents) {
    for (const ability of agentPlan.abilities) {
      steps.push({
        id: ability.id,
        instanceId: agentPlan.instanceId,
        abilityId: ability.abilityId,
        trigger: { ...ability.trigger },
        target: { ...ability.target },
        aimYawDeg: ability.aimYawDeg,
        chargeValue: ability.chargeValue,
        mapTarget: ability.mapTarget ? { ...ability.mapTarget } : undefined,
        status: "armed",
        due: false,
        fireReason: undefined,
      });
    }
  }
  round.planSteps = steps;
  return round;
}

/** Apply buys only; returns post-buy scenario clone or failure. */
export function applyBuysToScenario(
  scenario: Scenario,
  buys: readonly BuyLine[],
  catalog: Catalog = SHIPPED_CATALOG,
): Scenario | PlanFailure {
  const next = structuredClone(scenario);
  for (const buy of buys) {
    const member = next.attack.members.find((item) => item.instanceId === buy.instanceId);
    if (!member) {
      return { ok: false, code: "unknown-agent", message: `Unknown agent ${buy.instanceId}.` };
    }
    const bought = buyCharge(memberAsBody(member), buy.abilityId, catalog);
    if (!bought.ok) {
      return { ok: false, code: bought.code, message: rejectionText(bought.code, bought.message) };
    }
    member.credits = bought.agent.credits;
    member.charges = { ...bought.agent.charges };
  }
  return next;
}

function rejectionText(code: RejectionCode, fallback?: string): string {
  const messages: Partial<Record<RejectionCode, string>> = {
    "ability-not-owned": "That agent does not own this ability.",
    "ability-not-executable": "This ability is not playable yet (placeholder).",
    "insufficient-charges": "No charges left for this ability.",
    "out-of-range": "That point is outside the ability's cast range.",
    "unknown-agent": "That agent is not in the round.",
    "wrong-side": "That agent is not on your side.",
    "charges-full": "That ability is already at max charges.",
    "insufficient-credits": "Not enough credits to buy that charge.",
    "insufficient-ult-points": "Not enough ultimate points (need 8).",
    "invalid-order": "That order is not valid (check numbers and fields).",
    "unknown-definition": "Unknown agent in the catalog.",
  };
  return messages[code] ?? fallback ?? `Order rejected (${code}).`;
}
