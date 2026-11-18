import { hasStatus, STATUS_BLIND } from "./effects/status.ts";
import { getMap } from "./map/drill-hall.ts";
import { hasLineOfSight } from "./map/line-of-sight.ts";
import type { Side } from "./types.ts";
import type { World } from "./run.ts";

/** Fog-of-war filter over an arbitrary world snapshot. */
export function viewWorld(mapId: string, world: World, side: Side): World {
  const map = getMap(mapId);
  const walls = map?.walls ?? [];
  const own = world.agents.filter((agent) => agent.side === side);
  const enemies = world.agents.filter((agent) => agent.side !== side);
  const visibleEnemies = enemies.filter((enemy) =>
    own.some((ally) => {
      if (!ally.alive || !enemy.alive) return false;
      if (hasStatus(ally, STATUS_BLIND, world.timeMs)) return false;
      return hasLineOfSight(
        { xMm: ally.xMm, yMm: ally.yMm },
        { xMm: enemy.xMm, yMm: enemy.yMm },
        walls,
        world.smokes,
        world.timeMs,
      );
    }),
  );
  const devices = world.devices.filter((device) => {
    if (device.side === side) return true;
    return device.enemiesSeeRadius;
  });
  return {
    timeMs: world.timeMs,
    agents: [...own, ...visibleEnemies],
    smokes: structuredClone(world.smokes),
    devices: structuredClone(devices),
    zones: structuredClone(world.zones.filter((zone) => zone.side === side || zone.blocksVision)),
  };
}
