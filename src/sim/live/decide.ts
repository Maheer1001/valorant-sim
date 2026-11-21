import { viewWorld } from "../fog.ts";
import type { Side } from "../types.ts";
import type { World } from "../run.ts";
import { issueOrders } from "./orders.ts";
import type { LiveDecideFn, LiveRound } from "./types.ts";

export function runDecisions(round: LiveRound, decide: LiveDecideFn): void {
  // Defense is the only decided side for now.
  const side: Side = "defense";
  const fogged = viewWorld(round.mapId, round.world, side);
  // viewWorld shares agent objects with truth; hand the bot a copy.
  const safe: World = { ...fogged, agents: structuredClone(fogged.agents) };
  const commands = decide(side, safe).filter((command) => {
    if (command.kind !== "hold") return true;
    const standing = round.standing[command.instanceId];
    return standing != null && standing.kind !== "hold";
  });
  if (commands.length === 0) return;
  issueOrders(round, side, commands);
}
