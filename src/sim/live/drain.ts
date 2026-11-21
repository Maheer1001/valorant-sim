import type { Catalog } from "../agents/catalog.ts";
import type { EventQueue } from "../clock.ts";
import type { Rng } from "../rng.ts";
import type { Segment } from "../types.ts";
import type { Ruleset } from "../../rules/ruleset.ts";
import { applyJob, type Job, type SimEvent, type World } from "../run.ts";
import type { LiveRound } from "./types.ts";

export function enqueue(round: LiveRound, timeMs: number, agentId: string, payload: Job): void {
  round.queue.push({ timeMs, sequence: round.nextSequence, agentId, payload });
  round.nextSequence += 1;
}

/**
 * Pop and apply every queued job with `timeMs <= untilMs` at its exact time.
 * Mutates `world` and `events`; returns the next free sequence number.
 */
export function drainJobsUntil(
  queue: EventQueue<Job>,
  world: World,
  untilMs: number,
  catalog: Catalog,
  walls: readonly Segment[],
  combat: Rng,
  ruleset: Ruleset,
  sequence: number,
  events: SimEvent[],
): number {
  let nextSequence = sequence;
  for (;;) {
    const next = queue.peek();
    if (!next || next.timeMs > untilMs) break;
    const item = queue.pop();
    if (!item) break;
    const applied = applyJob(item.payload, item.timeMs, item.sequence, world, catalog, walls, combat, ruleset);
    world.timeMs = item.timeMs;
    events.push(applied.event);
    for (const followup of applied.followups) {
      queue.push({
        timeMs: followup.atMs,
        sequence: nextSequence,
        agentId: followup.agentId,
        payload: followup.job,
      });
      nextSequence += 1;
    }
  }
  return nextSequence;
}
