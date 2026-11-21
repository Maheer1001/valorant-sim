import { STATUS_COMBAT_STIM, statusModifier } from "../effects/status.ts";
import type { Ruleset } from "../../rules/ruleset.ts";
import type { AgentBody } from "../world.ts";

/* Moved verbatim from run.ts in stage H0 (re-exported from run.ts). */

/** Auto-fire interval, shortened by Combat Stim fireRate when present. */
export function autoFireIntervalFor(agent: AgentBody, timeMs: number, ruleset: Ruleset): number {
  const rate = statusModifier(agent, STATUS_COMBAT_STIM, "fireRate", timeMs);
  if (rate == null || rate <= 0) return ruleset.autoFireIntervalMs;
  return Math.max(1, Math.round(ruleset.autoFireIntervalMs / rate));
}
