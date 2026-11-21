import { viewWorld } from "../fog.ts";
import type { Side } from "../types.ts";
import type { World } from "../run.ts";
import type { LiveRound } from "./types.ts";

/** Fog-of-war view for one side (copy; safe for hosts and bots to mutate). */
export function viewLive(round: LiveRound, side: Side): World {
  const view = viewWorld(round.mapId, round.world, side);
  return { ...view, agents: structuredClone(view.agents) };
}

/** Deep copy of current truth (tests, debug overlays). */
export function truthLiveWorld(round: LiveRound): World {
  return structuredClone(round.world);
}
