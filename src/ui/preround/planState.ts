import type { AgentInstance } from "../../sim/agents/state.ts";
import type {
  AgentPlan,
  BuyLine,
  PlanAbility,
  PlanTrigger,
  PreRoundPlan,
} from "../../sim/preround.ts";
import type { AgentBody } from "../../sim/run.ts";
import type { Point } from "../../sim/types.ts";

export type AgentPlanDraft = {
  route: Point[];
  abilities: PlanAbility[];
};

export type PlanDraftMap = Record<string, AgentPlanDraft>;

export function emptyDraft(): AgentPlanDraft {
  return { route: [], abilities: [] };
}

export function getDraft(map: PlanDraftMap, instanceId: string): AgentPlanDraft {
  return map[instanceId] ?? emptyDraft();
}

export function instanceToBody(member: AgentInstance): AgentBody {
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

export function buildPreRoundPlan(
  buys: readonly BuyLine[],
  drafts: PlanDraftMap,
  attackMembers: readonly AgentInstance[],
): PreRoundPlan {
  const agents: AgentPlan[] = [];
  for (const member of attackMembers) {
    const draft = getDraft(drafts, member.instanceId);
    if (draft.route.length === 0 && draft.abilities.length === 0) continue;
    agents.push({
      instanceId: member.instanceId,
      route: draft.route.map((point) => ({ ...point })),
      abilities: draft.abilities.map(cloneAbility),
    });
  }
  return {
    version: 1,
    side: "attack",
    buys: buys.map((line) => ({ ...line })),
    agents,
  };
}

export function cloneAbility(ability: PlanAbility): PlanAbility {
  return {
    id: ability.id,
    abilityId: ability.abilityId,
    trigger: { ...ability.trigger },
    target: { ...ability.target },
    aimYawDeg: ability.aimYawDeg,
    chargeValue: ability.chargeValue,
    mapTarget: ability.mapTarget ? { ...ability.mapTarget } : undefined,
  };
}

export function defaultTrigger(route: readonly Point[]): PlanTrigger {
  if (route.length > 0) {
    return { kind: "at-waypoint", waypointIndex: route.length - 1 };
  }
  return { kind: "at-time", timeMs: 0 };
}

export function triggerLabel(trigger: PlanTrigger): string {
  if (trigger.kind === "at-time") {
    return `at ${(trigger.timeMs / 1000).toFixed(1)} s`;
  }
  return `at waypoint ${trigger.waypointIndex}`;
}

/** Count planned casts of an ability for one agent. */
export function plannedCount(draft: AgentPlanDraft, abilityId: string): number {
  return draft.abilities.filter((item) => item.abilityId === abilityId).length;
}

/**
 * Soft-reserve walk matching validatePlan: step ids that push past available charges.
 */
export function flaggedStepIds(
  agent: AgentBody,
  draft: AgentPlanDraft,
): Set<string> {
  const reserved: Record<string, number> = { ...agent.charges };
  const flagged = new Set<string>();
  for (const ability of draft.abilities) {
    const have = reserved[ability.abilityId] ?? 0;
    if (have <= 0) {
      flagged.add(ability.id);
      continue;
    }
    reserved[ability.abilityId] = have - 1;
  }
  return flagged;
}

/** Drop at-waypoint steps whose index is no longer on the route. Returns removed names. */
export function dropInvalidWaypointSteps(
  draft: AgentPlanDraft,
  abilityName: (abilityId: string) => string,
): { draft: AgentPlanDraft; removedLabels: string[] } {
  const removedLabels: string[] = [];
  const abilities = draft.abilities.filter((ability) => {
    if (ability.trigger.kind !== "at-waypoint") return true;
    if (ability.trigger.waypointIndex < draft.route.length) return true;
    removedLabels.push(`${abilityName(ability.abilityId)} (${ability.id})`);
    return false;
  });
  return { draft: { route: draft.route, abilities }, removedLabels };
}

export function setAgentRoute(
  map: PlanDraftMap,
  instanceId: string,
  route: Point[],
  abilityName: (abilityId: string) => string,
): { map: PlanDraftMap; notice: string } {
  const prior = getDraft(map, instanceId);
  const nextDraft = { route: route.map((p) => ({ ...p })), abilities: prior.abilities };
  const trimmed = dropInvalidWaypointSteps(nextDraft, abilityName);
  const notice =
    trimmed.removedLabels.length > 0
      ? `Dropped plan steps: ${trimmed.removedLabels.join(", ")}.`
      : "";
  return {
    map: { ...map, [instanceId]: trimmed.draft },
    notice,
  };
}

export function appendAgentWaypoint(
  map: PlanDraftMap,
  instanceId: string,
  point: Point,
): PlanDraftMap {
  const prior = getDraft(map, instanceId);
  return {
    ...map,
    [instanceId]: {
      route: [...prior.route, { ...point }],
      abilities: prior.abilities,
    },
  };
}

export function addPlanAbility(
  map: PlanDraftMap,
  instanceId: string,
  ability: PlanAbility,
): PlanDraftMap {
  const prior = getDraft(map, instanceId);
  return {
    ...map,
    [instanceId]: {
      route: prior.route,
      abilities: [...prior.abilities, cloneAbility(ability)],
    },
  };
}

export function updatePlanAbility(
  map: PlanDraftMap,
  instanceId: string,
  abilityId: string,
  patch: Partial<Pick<PlanAbility, "trigger" | "target" | "aimYawDeg" | "chargeValue" | "mapTarget">>,
): PlanDraftMap {
  const prior = getDraft(map, instanceId);
  return {
    ...map,
    [instanceId]: {
      route: prior.route,
      abilities: prior.abilities.map((item) =>
        item.id === abilityId
          ? {
              ...item,
              ...patch,
              trigger: patch.trigger ? { ...patch.trigger } : item.trigger,
              target: patch.target ? { ...patch.target } : item.target,
              mapTarget:
                patch.mapTarget !== undefined
                  ? patch.mapTarget
                    ? { ...patch.mapTarget }
                    : undefined
                  : item.mapTarget,
            }
          : item,
      ),
    },
  };
}

export function removePlanAbility(
  map: PlanDraftMap,
  instanceId: string,
  abilityStepId: string,
): PlanDraftMap {
  const prior = getDraft(map, instanceId);
  return {
    ...map,
    [instanceId]: {
      route: prior.route,
      abilities: prior.abilities.filter((item) => item.id !== abilityStepId),
    },
  };
}

export function clearAgentRoute(
  map: PlanDraftMap,
  instanceId: string,
  abilityName: (abilityId: string) => string,
): { map: PlanDraftMap; notice: string } {
  return setAgentRoute(map, instanceId, [], abilityName);
}
