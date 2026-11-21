import { getAgent, SHIPPED_CATALOG, type Catalog } from "../agents/catalog.ts";
import { EventQueue } from "../clock.ts";
import { compositionViolation } from "../composition/team.ts";
import { getMap } from "../map/drill-hall.ts";
import { forkSeed } from "../rng.ts";
import type { Scenario } from "../scenario/types.ts";
import { STANDARD_RULESET, type Ruleset } from "../../rules/ruleset.ts";
import type { Job } from "../jobs/types.ts";
import { createWorld } from "../world.ts";
import type { LiveRound, OpenLiveOptions, PlanFailure, StandingOrder } from "./types.ts";

export function isLiveRound(value: LiveRound | PlanFailure): value is LiveRound {
  return "phase" in value;
}

/** Validates scenario, catalog, map and composition; builds a live round at t=0 with every agent holding. */
export function openLiveRound(
  scenario: Scenario,
  catalog: Catalog = SHIPPED_CATALOG,
  ruleset: Ruleset = STANDARD_RULESET,
  options: OpenLiveOptions = {},
): LiveRound | PlanFailure {
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

  const world = createWorld(scenario, ruleset);
  const standing: Record<string, StandingOrder> = {};
  const lastAutoFireAtMs: Record<string, number> = {};
  for (const agent of world.agents) {
    standing[agent.instanceId] = { kind: "hold" };
    // First auto fire lands at t=0 (next = last + interval).
    lastAutoFireAtMs[agent.instanceId] = -ruleset.autoFireIntervalMs;
  }
  return {
    phase: "live",
    result: null,
    seed: scenario.seed,
    mapId: scenario.mapId,
    catalog,
    ruleset,
    scenario,
    world,
    queue: new EventQueue<Job>(),
    standing,
    pendingBatch: [],
    orderLog: [],
    events: [],
    nextSequence: 1,
    combatState: forkSeed(scenario.seed, "combat"),
    lastAutoFireAtMs,
    shootOverride: {},
    nextDecisionAtMs: ruleset.decisionIntervalMs,
    decide: options.decide,
    enableDecide: options.decide !== undefined,
    planSteps: [],
  };
}
