import type { AbilityDefinition, AgentDefinition } from "../../sim/agents/definition.ts";
import type { AgentBody } from "../../sim/run.ts";
import type { RejectionCode } from "../../sim/types.ts";

export type CastKind = "aimed" | "map-targeted" | "instant";

const AIMED = new Set([
  "aftershock",
  "flashpoint",
  "fault-line",
  "rolling-thunder",
  "incendiary",
  "stim-beacon",
]);
const MAP_TARGETED = new Set(["sky-smoke", "orbital-strike"]);

export function castKind(abilityId: string): CastKind {
  if (MAP_TARGETED.has(abilityId)) return "map-targeted";
  if (AIMED.has(abilityId)) return "aimed";
  return "instant";
}

export function completeAbilities(definition: AgentDefinition | null): AbilityDefinition[] {
  if (!definition) return [];
  return definition.abilities.filter((ability) => ability.implementation === "complete");
}

export type CastGate =
  | { ok: true }
  | { ok: false; code: RejectionCode; reason: string };

export function castGate(
  agent: AgentBody,
  ability: AbilityDefinition,
  timeMs: number,
): CastGate {
  if (ability.implementation !== "complete") {
    return { ok: false, code: "ability-not-executable", reason: "This ability is not playable yet." };
  }
  if (ability.maxCharges !== null) {
    const charges = agent.charges[ability.id] ?? 0;
    const onCd =
      ability.signatureCooldownMs != null && timeMs < (agent.cooldownReadyAtMs[ability.id] ?? 0);
    if (charges <= 0 && !onCd && ability.signatureCooldownMs == null) {
      return { ok: false, code: "insufficient-charges", reason: "No charges left." };
    }
    if (onCd) {
      const left = Math.max(0, (agent.cooldownReadyAtMs[ability.id] ?? 0) - timeMs);
      return {
        ok: false,
        code: "signature-on-cooldown",
        reason: `On cooldown for ${(left / 1000).toFixed(1)} s.`,
      };
    }
  }
  if (ability.ultPointCost != null && ability.ultPointCost > 0) {
    if (agent.ultimatePoints < ability.ultPointCost) {
      return {
        ok: false,
        code: "insufficient-ult-points",
        reason: `Need ${ability.ultPointCost} ult points (have ${agent.ultimatePoints}).`,
      };
    }
  }
  return { ok: true };
}

export function cooldownRemainingMs(agent: AgentBody, abilityId: string, timeMs: number): number {
  return Math.max(0, (agent.cooldownReadyAtMs[abilityId] ?? 0) - timeMs);
}
