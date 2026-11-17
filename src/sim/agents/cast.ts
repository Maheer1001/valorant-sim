import type { AgentDefinition, AbilityDefinition } from "./definition.ts";
import type { AgentInstance } from "./state.ts";
import type { Point, RejectionCode } from "../types.ts";
import { distanceMm } from "../map/geometry.ts";

export type CastRejection = {
  ok: false;
  code: RejectionCode;
};

export type CastAcceptance = {
  ok: true;
  ability: AbilityDefinition;
};

export function evaluateCast(
  definition: AgentDefinition | null,
  instance: AgentInstance | null,
  abilityId: string,
  origin: Point,
  target: Point,
): CastAcceptance | CastRejection {
  if (!definition || !instance) {
    return { ok: false, code: "unknown-agent" };
  }
  const ability = definition.abilities.find((item) => item.id === abilityId);
  if (!ability) {
    return { ok: false, code: "ability-not-owned" };
  }
  if (ability.implementation !== "complete") {
    return { ok: false, code: "ability-not-executable" };
  }
  const charges = instance.charges[ability.id] ?? 0;
  if (ability.maxCharges !== null && charges <= 0) {
    return { ok: false, code: "insufficient-charges" };
  }
  if (ability.maxRangeMm !== null && distanceMm(origin, target) > ability.maxRangeMm) {
    return { ok: false, code: "out-of-range" };
  }
  return { ok: true, ability };
}
