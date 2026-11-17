import type { Provenance } from "../../rules/provenance.ts";
import { STANDARD_RULESET } from "../../rules/ruleset.ts";
import type { Side, StatusEffect, TacticalAssignment } from "../types.ts";
import type { AgentDefinition } from "./definition.ts";

export const ASSUMED_STARTING_HP = 100;

export const STARTING_HP_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "milestone-1 scenario",
  note: "Drill agents start at 100 health. Armor, healing, and overheal are not modeled.",
};

export const FULL_CHARGES_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "milestone-1 scenario",
  note: "The drill starts with each recorded charge pool already filled. This is not a buy phase.",
};

export type AgentInstance = {
  instanceId: string;
  definitionId: string;
  side: Side;
  assignment: TacticalAssignment | null;
  xMm: number;
  yMm: number;
  hp: number;
  facingDeg: number;
  credits: number;
  charges: Record<string, number>;
  cooldownReadyAtMs: Record<string, number>;
  ultimatePoints: number;
  statuses: StatusEffect[];
};

export function createInstance(
  definition: AgentDefinition,
  side: Side,
  point: { xMm: number; yMm: number },
  instanceId: string,
  assignment: TacticalAssignment | null,
  options?: { facingDeg?: number; credits?: number; ultimatePoints?: number },
): AgentInstance {
  const charges: Record<string, number> = {};
  for (const ability of definition.abilities) {
    if (ability.maxCharges !== null) {
      charges[ability.id] = ability.maxCharges;
    }
  }
  return {
    instanceId,
    definitionId: definition.id,
    side,
    assignment,
    xMm: point.xMm,
    yMm: point.yMm,
    hp: ASSUMED_STARTING_HP,
    facingDeg: options?.facingDeg ?? 0,
    credits: options?.credits ?? STANDARD_RULESET.startingCredits,
    charges,
    cooldownReadyAtMs: {},
    ultimatePoints: options?.ultimatePoints ?? 0,
    statuses: [],
  };
}
