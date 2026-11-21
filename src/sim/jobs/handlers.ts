import { BREACH_JOB_HANDLERS } from "../agents/abilities/breach-resolve.ts";
import { BRIMSTONE_JOB_HANDLERS } from "../agents/abilities/brimstone-resolve.ts";
import { applyCast } from "./cast.ts";
import { CORE_JOB_HANDLERS } from "./core.ts";
import type { JobHandlerTable } from "./types.ts";

/**
 * Explicit, central table: one handler per Job type. Every contributing module
 * is imported by name here (nothing registers itself), so a forgotten kit is a
 * compile error (missing key) rather than a silently dropped job.
 */
export const JOB_HANDLERS: JobHandlerTable = {
  ...CORE_JOB_HANDLERS,
  cast: applyCast,
  ...BREACH_JOB_HANDLERS,
  ...BRIMSTONE_JOB_HANDLERS,
};
