import { RIFLE_A } from "../combat/assumed-rifle.ts";
import { autoFireIntervalFor } from "../combat/fire-interval.ts";
import type { Job } from "../jobs/types.ts";
import { findAgent } from "../world.ts";
import { enqueue } from "./drain.ts";
import type { LiveRound } from "./types.ts";

/**
 * Schedule `auto-engage` (or `engage` at the override target) at exact fire
 * times in (prevTime, newTime]. Next fire = last scheduled fire + interval.
 */
export function scheduleFires(round: LiveRound, prevTime: number, newTime: number): void {
  const { world, ruleset } = round;
  const pending: { timeMs: number; agentId: string; job: Job }[] = [];

  for (const agent of world.agents) {
    if (!agent.alive) {
      round.shootOverride[agent.instanceId] = undefined;
      continue;
    }
    let targetId = round.shootOverride[agent.instanceId];
    if (targetId !== undefined) {
      const target = findAgent(world, targetId);
      if (!target || !target.alive || target.side === agent.side) {
        round.shootOverride[agent.instanceId] = undefined;
        targetId = undefined;
      }
    }
    const interval = autoFireIntervalFor(agent, newTime, ruleset);
    let last = round.lastAutoFireAtMs[agent.instanceId] ?? -ruleset.autoFireIntervalMs;
    for (;;) {
      // Never schedule into the past if the interval shrank (Combat Stim).
      const next = Math.max(last + interval, prevTime);
      if (next > newTime) break;
      pending.push({
        timeMs: next,
        agentId: agent.instanceId,
        job:
          targetId !== undefined
            ? { type: "engage", instanceId: agent.instanceId, targetInstanceId: targetId, weaponId: RIFLE_A.id }
            : { type: "auto-engage", instanceId: agent.instanceId, weaponId: RIFLE_A.id },
      });
      last = next;
    }
    round.lastAutoFireAtMs[agent.instanceId] = last;
  }

  pending.sort((a, b) => {
    if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
    if (a.agentId < b.agentId) return -1;
    if (a.agentId > b.agentId) return 1;
    return 0;
  });
  for (const item of pending) {
    enqueue(round, item.timeMs, item.agentId, item.job);
  }
}
