import type { AgentBody } from "../world.ts";

/**
 * Ult point ledger for kills.
 * TODO(ult-sources): orbs, plant, and defuse also grant points in live rules
 * (globals.ultPointSources). Those sources are out of scope for stage-1 part 1
 * and must not be invented here — only kill/death +1 each and ult spend.
 */
export function grantKillUltPoints(killer: AgentBody, victim: AgentBody): void {
  killer.ultimatePoints += 1;
  victim.ultimatePoints += 1;
}

export function spendUltPoints(agent: AgentBody, cost: number): boolean {
  if (agent.ultimatePoints < cost) return false;
  agent.ultimatePoints -= cost;
  return true;
}
