import type { AgentCommand } from "../sim/live-round.ts";
import type { World } from "../sim/run.ts";
import type { Side } from "../sim/types.ts";

/**
 * Live-round defense stub (`LiveDecideFn`): hold every living defender that
 * appears in the fogged world. Only the fogged world is read.
 */
export function defenseHoldDecide(side: Side, fogged: World): AgentCommand[] {
  if (side !== "defense") return [];
  return fogged.agents
    .filter((agent) => agent.side === "defense" && agent.alive)
    .map((agent) => ({ kind: "hold" as const, instanceId: agent.instanceId }));
}
