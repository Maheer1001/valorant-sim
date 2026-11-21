import type { RoundResult } from "../run.ts";
import type { LiveRound } from "./types.ts";

/** A round-end rule: returns a result, or null to let the next rule decide. */
export type ResultRule = (round: LiveRound, newTime: number) => RoundResult | null;

function hasLiving(round: LiveRound, side: "attack" | "defense"): boolean {
  for (const agent of round.world.agents) {
    if (agent.alive && agent.side === side) return true;
  }
  return false;
}

const defenseEliminated: ResultRule = (round) =>
  hasLiving(round, "defense") ? null : { kind: "defense-eliminated" };

const attackEliminated: ResultRule = (round) =>
  hasLiving(round, "attack") ? null : { kind: "attack-eliminated" };

const timeout: ResultRule = (round, newTime) =>
  newTime >= round.ruleset.roundDurationMs ? { kind: "timeout", winner: "defense" } : null;

/** Ordered: the first rule that returns a result wins (same order as before H0). */
export const RESULT_RULES: readonly ResultRule[] = [defenseEliminated, attackEliminated, timeout];

export function evaluateResult(round: LiveRound, newTime: number): RoundResult | null {
  for (const rule of RESULT_RULES) {
    const result = rule(round, newTime);
    if (result) return result;
  }
  return null;
}
