import type { AbilityDefinition, AgentDefinition } from "../../sim/agents/definition.ts";
import { completeAbilities } from "./abilityUi.ts";

export type AbilityHotkey = "C" | "Q" | "E" | "X";

/**
 * Map Valorant-like hotkeys to catalog slots:
 * C / Q = the two basic abilities in catalog order, E = signature, X = ultimate.
 */
export function abilityHotkeyMap(
  definition: AgentDefinition | null,
): Partial<Record<AbilityHotkey, AbilityDefinition>> {
  const abilities = completeAbilities(definition);
  const basics = abilities.filter((ability) => ability.slot === "basic");
  const signature = abilities.find((ability) => ability.slot === "signature");
  const ultimate = abilities.find((ability) => ability.slot === "ultimate");
  const map: Partial<Record<AbilityHotkey, AbilityDefinition>> = {};
  if (basics[0]) map.C = basics[0];
  if (basics[1]) map.Q = basics[1];
  if (signature) map.E = signature;
  if (ultimate) map.X = ultimate;
  return map;
}

export function hotkeyForAbility(
  definition: AgentDefinition | null,
  abilityId: string,
): AbilityHotkey | null {
  const map = abilityHotkeyMap(definition);
  for (const key of ["C", "Q", "E", "X"] as const) {
    if (map[key]?.id === abilityId) return key;
  }
  return null;
}
