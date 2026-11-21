import { getAgent, SHIPPED_CATALOG, type Catalog } from "./agents/catalog.ts";
import { EventQueue } from "./clock.ts";
import { compositionViolation } from "./composition/team.ts";
import { getMap } from "./map/drill-hall.ts";
import { createStream } from "./rng.ts";
import type { Order, Scenario } from "./scenario/types.ts";
import type { RejectionCode } from "./types.ts";
import { STANDARD_RULESET, type Ruleset } from "../rules/ruleset.ts";
import { applyJob } from "./jobs/apply.ts";
import type { Job, SimEvent } from "./jobs/types.ts";
import { createWorld, type World } from "./world.ts";

/*
 * Since stage H0 this module holds the scripted runner only. World state lives
 * in world.ts, job types and dispatch in jobs/. Every name run.ts exported before
 * H0 is still exported from here, so importers are unchanged.
 */
export type { AgentBody, RoundResult, World } from "./world.ts";
export { createWorld, findAgent, lerpPoint } from "./world.ts";
export { autoFireIntervalFor } from "./combat/fire-interval.ts";
export type { ApplyResult, Job, SimEvent } from "./jobs/types.ts";
export { applyJob } from "./jobs/apply.ts";

export type RunSuccess = {
  ok: true;
  events: SimEvent[];
  initial: World;
  frames: World[];
  final: World;
};

export type RunFailure = {
  ok: false;
  code: RejectionCode;
  message: string;
};

export type RunResult = RunSuccess | RunFailure;

/**
 * Scripted orders only. Opponent decision code is not called.
 * Withheld shots do not draw from the combat stream.
 */
export function runScenario(
  scenario: Scenario,
  catalog: Catalog = SHIPPED_CATALOG,
  ruleset: Ruleset = STANDARD_RULESET,
): RunResult {
  if (scenario.rulesetId !== ruleset.id) {
    return { ok: false, code: "ruleset-mismatch", message: "Scenario ruleset does not match the active ruleset." };
  }
  if (scenario.catalogVersion !== catalog.version) {
    return { ok: false, code: "catalog-mismatch", message: "Scenario catalog version does not match the loaded catalog." };
  }
  const map = getMap(scenario.mapId);
  if (!map) {
    return { ok: false, code: "unknown-map", message: "Scenario map is not loaded." };
  }
  for (const member of [...scenario.attack.members, ...scenario.defense.members]) {
    if (!getAgent(catalog, member.definitionId)) {
      return { ok: false, code: "unknown-definition", message: `Unknown agent ${member.definitionId}.` };
    }
  }
  const violation = compositionViolation(scenario.attack, scenario.defense, ruleset);
  if (violation) {
    return { ok: false, code: violation, message: "Team composition violates the ruleset." };
  }

  const initial = createWorld(scenario, ruleset);
  let world = structuredClone(initial);
  const frames: World[] = [];
  const events: SimEvent[] = [];
  const queue = new EventQueue<Job>();
  let sequence = 1;
  const combat = createStream(scenario.seed, "combat");

  for (const order of scenario.orders) {
    queue.push({
      timeMs: orderTime(order),
      sequence: sequence,
      agentId: order.instanceId,
      payload: orderToJob(order),
    });
    sequence += 1;
  }

  while (queue.length > 0) {
    const item = queue.pop();
    if (!item) break;
    const applied = applyJob(item.payload, item.timeMs, item.sequence, world, catalog, map.walls, combat, ruleset);
    world = applied.world;
    events.push(applied.event);
    frames.push(structuredClone(world));
    for (const followup of applied.followups) {
      queue.push({
        timeMs: followup.atMs,
        sequence,
        agentId: followup.agentId,
        payload: followup.job,
      });
      sequence += 1;
    }
  }

  return { ok: true, events, initial, frames, final: world };
}

function orderTime(order: Order): number {
  return order.kind === "move" ? order.startMs : order.atMs;
}

function orderToJob(order: Order): Job {
  if (order.kind === "move") {
    return {
      type: "move",
      instanceId: order.instanceId,
      to: order.to,
      speedMmPerSec: order.speedMmPerSec,
    };
  }
  if (order.kind === "cast") {
    return {
      type: "cast",
      instanceId: order.instanceId,
      abilityId: order.abilityId,
      target: order.target,
    };
  }
  return {
    type: "engage",
    instanceId: order.instanceId,
    targetInstanceId: order.targetInstanceId,
    weaponId: order.weaponId,
  };
}
