import { evaluateCast } from "../agents/cast.ts";
import { getAgent } from "../agents/catalog.ts";
import { findAgent, type AgentBody } from "../world.ts";
import { CAST_RESOLVERS } from "./cast-resolvers.ts";
import type { JobHandler, JobOf } from "./types.ts";

/**
 * The `cast` job: every resolver in CAST_RESOLVERS order (formerly Breach then
 * Brimstone, hard-coded here), then the original cast-rejected fallback.
 */
export const applyCast: JobHandler<JobOf<"cast">> = (job, ctx) => {
  const { timeMs, sequence, catalog } = ctx;
  const next = ctx.world;
  for (const resolver of CAST_RESOLVERS) {
    const resolved = resolver.resolve(job, ctx);
    if (resolved) return resolved;
  }

  const agent = findAgent(next, job.instanceId);
  const definition = agent ? getAgent(catalog, agent.definitionId) : null;
  const place = job.mapTarget ?? job.target;
  const origin = agent ? { xMm: agent.xMm, yMm: agent.yMm } : { xMm: 0, yMm: 0 };
  const verdict = evaluateCast(definition, agent ? toInstance(agent) : null, job.abilityId, origin, place);
  return {
    world: next,
    followups: [],
    event: {
      type: "cast-rejected",
      timeMs,
      sequence,
      agentId: job.instanceId,
      abilityId: job.abilityId,
      code: !agent ? "unknown-agent" : verdict.ok ? "ability-not-executable" : verdict.code,
    },
  };
};

function toInstance(agent: AgentBody) {
  return {
    instanceId: agent.instanceId,
    definitionId: agent.definitionId,
    side: agent.side,
    assignment: null,
    xMm: agent.xMm,
    yMm: agent.yMm,
    hp: agent.hp,
    facingDeg: agent.facingDeg,
    credits: agent.credits,
    charges: agent.charges,
    cooldownReadyAtMs: { ...agent.cooldownReadyAtMs },
    ultimatePoints: agent.ultimatePoints,
    statuses: structuredClone(agent.statuses),
  };
}
