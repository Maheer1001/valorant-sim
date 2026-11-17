import type { Ruleset } from "../../rules/ruleset.ts";
import type { MapDefinition } from "../map/drill-hall.ts";
import type { Side, TacticalAssignment } from "../types.ts";
import { getAgent, type Catalog } from "../agents/catalog.ts";
import { createInstance, type AgentInstance } from "../agents/state.ts";

export type Team = {
  side: Side;
  members: AgentInstance[];
};

export function emptyTeam(side: Side): Team {
  return { side, members: [] };
}

export type CompositionCode = "team-full" | "duplicate-agent" | "unknown-definition";

/**
 * Uniqueness follows the ruleset scope.
 * per-team rejects a repeated definition on one team and allows it on the other.
 * per-match also rejects the same definition across both teams.
 * none only enforces team size.
 */
export function compositionViolation(
  attack: Team,
  defense: Team,
  ruleset: Ruleset,
): "team-full" | "duplicate-agent" | null {
  if (attack.members.length > ruleset.teamSize || defense.members.length > ruleset.teamSize) {
    return "team-full";
  }
  if (ruleset.uniqueness === "none") return null;

  for (const team of [attack, defense]) {
    const ids = team.members.map((member) => member.definitionId);
    if (new Set(ids).size !== ids.length) return "duplicate-agent";
  }

  if (ruleset.uniqueness === "per-match") {
    const ids = [...attack.members, ...defense.members].map((member) => member.definitionId);
    if (new Set(ids).size !== ids.length) return "duplicate-agent";
  }

  return null;
}

export function addMember(input: {
  attack: Team;
  defense: Team;
  side: Side;
  definitionId: string;
  catalog: Catalog;
  ruleset: Ruleset;
  map: MapDefinition;
  assignment: TacticalAssignment | null;
}): { ok: true; attack: Team; defense: Team } | { ok: false; code: CompositionCode } {
  const definition = getAgent(input.catalog, input.definitionId);
  if (!definition) return { ok: false, code: "unknown-definition" };

  const team = input.side === "attack" ? input.attack : input.defense;
  const spawns = input.side === "attack" ? input.map.attackSpawns : input.map.defenseSpawns;
  const spawn = spawns[team.members.length] ?? spawns[spawns.length - 1] ?? { xMm: 1000, yMm: 1000 };
  const instance = createInstance(
    definition,
    input.side,
    spawn,
    `${definition.id}-${input.side}-${team.members.length + 1}`,
    input.assignment,
  );
  const attack =
    input.side === "attack" ? { ...input.attack, members: [...input.attack.members, instance] } : input.attack;
  const defense =
    input.side === "defense"
      ? { ...input.defense, members: [...input.defense.members, instance] }
      : input.defense;
  const violation = compositionViolation(attack, defense, input.ruleset);
  if (violation) return { ok: false, code: violation };
  return { ok: true, attack, defense };
}

export function removeMember(team: Team, instanceId: string): Team {
  return { ...team, members: team.members.filter((member) => member.instanceId !== instanceId) };
}

export function setAssignment(team: Team, instanceId: string, assignment: TacticalAssignment | null): Team {
  return {
    ...team,
    members: team.members.map((member) =>
      member.instanceId === instanceId ? { ...member, assignment } : member,
    ),
  };
}
