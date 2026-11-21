import type { Catalog } from "../agents/catalog.ts";
import type { Rng } from "../rng.ts";
import type { Segment } from "../types.ts";
import type { World } from "../world.ts";
import { STANDARD_RULESET, type Ruleset } from "../../rules/ruleset.ts";
import { JOB_HANDLERS } from "./handlers.ts";
import type { ApplyResult, Job, JobHandler } from "./types.ts";

/** Apply one job at its time. Same signature and first statement as before stage H0. */
export function applyJob(
  job: Job,
  timeMs: number,
  sequence: number,
  world: World,
  catalog: Catalog,
  walls: readonly Segment[],
  combat: Rng,
  ruleset: Ruleset = STANDARD_RULESET,
): ApplyResult {
  const next = world;
  next.timeMs = timeMs;
  const handler = JOB_HANDLERS[job.type] as JobHandler<Job>;
  return handler(job, { timeMs, sequence, world: next, catalog, walls, combat, ruleset });
}
