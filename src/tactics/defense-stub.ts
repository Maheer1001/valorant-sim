import type { Round, WindowOrder } from "../sim/round.ts";

/**
 * Milestone-2 defense stub: every living defender holds position.
 * No decision context is consulted.
 */
export function defenseHoldPlan(round: Round): WindowOrder[] {
  return round.state.agents
    .filter((agent) => agent.side === "defense" && agent.alive)
    .map((agent) => ({ kind: "hold" as const, instanceId: agent.instanceId }));
}
