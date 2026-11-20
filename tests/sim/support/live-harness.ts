/**
 * Live-engine test helpers. These replaced the old windowed
 * `openRound` / `submitPlan` / `resolveWindow` harness in Stage (e).
 *
 * `LiveRound` is mutable: `issueOrders` and `stepLive` change it in place, so
 * helpers return events, not new rounds.
 */
import { expect } from "vitest";
import {
  isLiveRound,
  issueOrders,
  openLiveRound,
  stepLive,
  type AgentCommand,
  type LiveRound,
  type OpenLiveOptions,
} from "../../../src/sim/live-round.ts";
import type { AgentBody, SimEvent } from "../../../src/sim/run.ts";
import type { Scenario } from "../../../src/sim/scenario/types.ts";
import type { RejectionCode, Side } from "../../../src/sim/types.ts";

/**
 * Test slice length. It matches the retired 3000 ms planning window so the
 * migrated assertions keep their time spans. It is not a game rule.
 */
export const SLICE_MS = 3000;

export function mustOpenLive(scenario: Scenario, options?: OpenLiveOptions): LiveRound {
  const opened = openLiveRound(scenario, undefined, undefined, options);
  expect(isLiveRound(opened)).toBe(true);
  if (!isLiveRound(opened)) throw new Error(opened.message);
  return opened;
}

/** Issue a batch that must be accepted. */
export function mustIssue(round: LiveRound, side: Side, commands: readonly AgentCommand[]): void {
  const result = issueOrders(round, side, commands);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
}

/** Issue a batch that must be rejected; returns the rejection code. */
export function issueRejected(
  round: LiveRound,
  side: Side,
  commands: readonly AgentCommand[],
): RejectionCode {
  const result = issueOrders(round, side, commands);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected the batch to be rejected");
  return result.code;
}

/** Step for `ms` of sim time (rounded up to whole steps). Returns only the new events. */
export function advance(round: LiveRound, ms: number = SLICE_MS): SimEvent[] {
  const start = round.events.length;
  stepLive(round, Math.ceil(ms / round.ruleset.simStepMs));
  return round.events.slice(start);
}

/** Issue attack commands now, then advance. Returns the events of that span. */
export function playAttack(
  round: LiveRound,
  commands: readonly AgentCommand[],
  ms: number = SLICE_MS,
): SimEvent[] {
  mustIssue(round, "attack", commands);
  return advance(round, ms);
}

export function agentIn(round: LiveRound, instanceId: string): AgentBody {
  const agent = round.world.agents.find((candidate) => candidate.instanceId === instanceId);
  if (!agent) throw new Error(`missing agent ${instanceId}`);
  return agent;
}
