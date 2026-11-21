import type { Side } from "../types.ts";
import { findAgent } from "../world.ts";
import { COMMAND_SPECS, type AgentCommand, type CommandSpec, type CommandValidation } from "./commands.ts";
import type { LiveRound } from "./types.ts";

/**
 * Common checks first, in the original order (unknown agent, wrong side, agent
 * down), then the kind-specific checks from COMMAND_SPECS.
 */
export function validateCommand(round: LiveRound, side: Side, command: AgentCommand): CommandValidation {
  const world = round.world;
  const agent = findAgent(world, command.instanceId);
  if (!agent) {
    return { ok: false, code: "unknown-agent", message: `Unknown agent ${command.instanceId}.` };
  }
  if (agent.side !== side) {
    return { ok: false, code: "wrong-side", message: `Agent ${command.instanceId} is not on ${side}.` };
  }
  if (!agent.alive) {
    return { ok: false, code: "agent-down", message: `Agent ${command.instanceId} is down.` };
  }
  return (COMMAND_SPECS[command.kind] as CommandSpec<AgentCommand>).validate(round, side, agent, command);
}
