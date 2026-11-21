import { findAgent, type World } from "../world.ts";
import type { ApplyResult, Job } from "./types.ts";

/* Status expiry is generic (statuses from any kit). Moved verbatim from breach-resolve.ts in stage H0. */

export function applyStatusExpire(
  job: Extract<Job, { type: "status-expire" }>,
  timeMs: number,
  sequence: number,
  world: World,
): ApplyResult {
  const agent = findAgent(world, job.instanceId);
  if (!agent) {
    return {
      world,
      followups: [],
      event: {
        type: "order-rejected",
        timeMs,
        sequence,
        agentId: job.instanceId,
        orderType: "status-expire",
        code: "unknown-agent",
      },
    };
  }
  // Only drop the status when its untilMs has actually elapsed (refresh-safe).
  const before = agent.statuses.length;
  agent.statuses = agent.statuses.filter((status) => {
    if (status.id !== job.statusId || status.sourceAbilityId !== job.sourceAbilityId) return true;
    return status.untilMs > timeMs;
  });
  return {
    world,
    followups: [],
    event: {
      type: "status-expired",
      timeMs,
      sequence,
      agentId: agent.instanceId,
      statusId: job.statusId,
      sourceAbilityId: job.sourceAbilityId,
      removed: agent.statuses.length < before,
    },
  };
}
