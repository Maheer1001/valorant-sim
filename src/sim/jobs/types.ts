import type { Catalog } from "../agents/catalog.ts";
import type { BreachJob } from "../agents/abilities/breach-jobs.ts";
import type { BrimstoneJob } from "../agents/abilities/brimstone-jobs.ts";
import type { Rng } from "../rng.ts";
import type { Segment } from "../types.ts";
import type { World } from "../world.ts";
import type { Ruleset } from "../../rules/ruleset.ts";
import type { CoreEvent, CoreJob } from "./core-types.ts";

/**
 * Composed unions. A stage adds its members in its own file and one line here.
 * Every Job member must have a handler in jobs/handlers.ts (JobHandlerTable).
 */
export type Job = CoreJob | BreachJob | BrimstoneJob;

export type SimEvent = {
  timeMs: number;
  sequence: number;
  agentId: string;
} & CoreEvent;

export type ApplyResult = {
  world: World;
  event: SimEvent;
  followups: { atMs: number; agentId: string; job: Job }[];
};

/** Everything a job handler receives besides the job itself. */
export type ApplyContext = {
  timeMs: number;
  sequence: number;
  world: World;
  catalog: Catalog;
  walls: readonly Segment[];
  combat: Rng;
  ruleset: Ruleset;
};

export type JobOf<K extends Job["type"]> = Extract<Job, { type: K }>;

export type JobHandler<T extends Job> = (job: T, ctx: ApplyContext) => ApplyResult;

/** One handler per Job type; a missing or extra key fails to compile. */
export type JobHandlerTable = { [K in Job["type"]]: JobHandler<JobOf<K>> };

/** A kit's cast entry point. `abilityIds` lists every ability it claims. */
export type CastResolver = {
  /** Catalog definition id of the agent that owns these abilities. */
  agentId: string;
  abilityIds: readonly string[];
  /** Returns null when the job is not for one of `abilityIds`. */
  resolve(job: JobOf<"cast">, ctx: ApplyContext): ApplyResult | null;
};
