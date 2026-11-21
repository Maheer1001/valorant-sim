import { BREACH_CAST_RESOLVER } from "../agents/abilities/breach-resolve.ts";
import { BRIMSTONE_CAST_RESOLVER } from "../agents/abilities/brimstone-resolve.ts";
import type { CastResolver } from "./types.ts";

export type { CastResolver } from "./types.ts";

/**
 * Explicit, ordered list (no self-registration). The order is the one the cast
 * job used before stage H0 (Breach, then Brimstone); tests/sim/registry.test.ts
 * proves every complete ability is claimed by exactly one resolver, so the
 * order cannot change which resolver runs.
 */
export const CAST_RESOLVERS: readonly CastResolver[] = [BREACH_CAST_RESOLVER, BRIMSTONE_CAST_RESOLVER];
