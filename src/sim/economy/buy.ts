import type { Catalog } from "../agents/catalog.ts";
import { getAgent } from "../agents/catalog.ts";
import type { AgentBody } from "../run.ts";
import type { RejectionCode } from "../types.ts";

export type BuyResult =
  | { ok: true; agent: AgentBody }
  | { ok: false; code: RejectionCode; message: string };

/**
 * Minimal buy: spend credits for one charge of a bought ability if under max.
 * No shop UI.
 */
export function buyCharge(agent: AgentBody, abilityId: string, catalog: Catalog): BuyResult {
  const definition = getAgent(catalog, agent.definitionId);
  if (!definition) {
    return { ok: false, code: "unknown-definition", message: "Unknown agent definition." };
  }
  const ability = definition.abilities.find((item) => item.id === abilityId);
  if (!ability) {
    return { ok: false, code: "ability-not-owned", message: `Agent does not own ${abilityId}.` };
  }
  if (ability.maxCharges === null || ability.costCredits === null || ability.costCredits <= 0) {
    return { ok: false, code: "invalid-order", message: `${abilityId} is not a bought charge ability.` };
  }
  const current = agent.charges[abilityId] ?? 0;
  if (current >= ability.maxCharges) {
    return { ok: false, code: "charges-full", message: `${abilityId} is already at max charges.` };
  }
  if (agent.credits < ability.costCredits) {
    return { ok: false, code: "insufficient-credits", message: "Not enough credits." };
  }
  const next = structuredClone(agent);
  next.credits -= ability.costCredits;
  next.charges[abilityId] = current + 1;
  return { ok: true, agent: next };
}
