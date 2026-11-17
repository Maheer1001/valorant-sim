import type { AgentInstance } from "../agents/state.ts";
import { getAgent, type Catalog } from "../agents/catalog.ts";
import type { Team } from "./team.ts";
import type {
  CapabilityKind,
  ImplementationStatus,
  Role,
  Side,
  TacticalAssignment,
} from "../types.ts";

export type AbilityProfile = {
  abilityId: string;
  name: string;
  implementation: ImplementationStatus;
  capability: CapabilityKind | null;
  durationMs: number | null;
  maxCharges: number | null;
  deployDelayMs: number | null;
  radiusMm: number | null;
};

export type MemberProfile = {
  instanceId: string;
  definitionId: string;
  displayName: string;
  role: Role | null;
  assignment: TacticalAssignment | null;
  abilities: readonly AbilityProfile[];
};

/**
 * Stable description of a draft. Later evaluators (map fit, synergies,
 * counters, supported plans) should consume this instead of UI state.
 */
export type CompositionProfile = {
  rulesetId: string;
  mapId: string;
  side: Side;
  members: readonly MemberProfile[];
};

export function buildProfile(
  team: Team,
  catalog: Catalog,
  mapId: string,
  rulesetId: string,
): CompositionProfile {
  const members: MemberProfile[] = [];
  for (const member of team.members) {
    members.push(memberProfile(member, catalog));
  }
  return { rulesetId, mapId, side: team.side, members };
}

function memberProfile(member: AgentInstance, catalog: Catalog): MemberProfile {
  const definition = getAgent(catalog, member.definitionId);
  return {
    instanceId: member.instanceId,
    definitionId: member.definitionId,
    displayName: definition?.name ?? member.definitionId,
    role: definition?.role ?? null,
    assignment: member.assignment,
    abilities: (definition?.abilities ?? []).map((ability) => ({
      abilityId: ability.id,
      name: ability.name,
      implementation: ability.implementation,
      capability: ability.capability,
      durationMs: ability.durationMs,
      maxCharges: ability.maxCharges,
      deployDelayMs: ability.deployDelayMs,
      radiusMm: ability.radiusMm,
    })),
  };
}
