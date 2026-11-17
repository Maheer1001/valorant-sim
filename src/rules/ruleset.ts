import type { Provenance } from "./provenance.ts";

export type UniquenessScope = "per-team" | "per-match" | "none";

export type Ruleset = {
  id: string;
  label: string;
  teamSize: number;
  teamSizeProvenance: Provenance;
  uniqueness: UniquenessScope;
  uniquenessProvenance: Provenance;
  /** Planning window length in integer milliseconds. */
  windowMs: number;
  windowMsProvenance: Provenance;
  /** Straight-line walk speed for window move orders, millimeters per second. */
  walkSpeedMmPerSec: number;
  walkSpeedProvenance: Provenance;
  /** Auto-engage shot interval for agents without a shoot order. */
  autoFireIntervalMs: number;
  autoFireIntervalProvenance: Provenance;
};

const WIKI_GAMEPLAY = "https://wiki.playvalorant.com/en-us/VALORANT";

export const WINDOW_MS_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "milestone-2",
  note: "Interactive rounds plan in fixed 3000 ms windows. This is a lab turn length, not a Valorant timer.",
};

export const WALK_SPEED_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "milestone-2",
  note: "Window moves use 3500 mm/s straight-line walk speed. This matches the milestone-1 drill script and is not a measured Valorant walk speed.",
};

export const AUTO_FIRE_INTERVAL_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "milestone-2",
  note: "Agents without a shoot order auto-engage the nearest visible enemy every 1000 ms with Rifle A. The interval is a lab assumption, not a Valorant fire rate.",
};

/**
 * Standard match shape used by the lab.
 * Team size and uniqueness are secondary: the Valorant wiki gameplay summary
 * was read for this build. They were not confirmed in the live client or in
 * a Riot patch note, so neither field is tagged verified.
 *
 * Window length, walk speed, and auto-fire interval are assumed lab values.
 */
export const STANDARD_RULESET: Ruleset = {
  id: "standard-competitive",
  label: "Standard competitive",
  teamSize: 5,
  teamSizeProvenance: {
    kind: "secondary",
    source: WIKI_GAMEPLAY,
    note: "The wiki gameplay summary says ten players are divided into two teams. This build did not confirm that in the live client.",
  },
  uniqueness: "per-team",
  uniquenessProvenance: {
    kind: "secondary",
    source: WIKI_GAMEPLAY,
    note: "The same summary says only one of each agent can be selected on each team, and that the other team's locks stay hidden until the first buy phase. That is per-team uniqueness, not a ban on the same agent appearing on both teams. It is not tagged verified.",
  },
  windowMs: 3000,
  windowMsProvenance: WINDOW_MS_PROVENANCE,
  walkSpeedMmPerSec: 3500,
  walkSpeedProvenance: WALK_SPEED_PROVENANCE,
  autoFireIntervalMs: 1000,
  autoFireIntervalProvenance: AUTO_FIRE_INTERVAL_PROVENANCE,
};

export function rulesetWithUniqueness(
  base: Ruleset,
  uniqueness: UniquenessScope,
  provenance: Provenance,
): Ruleset {
  return {
    ...base,
    uniqueness,
    uniquenessProvenance: provenance,
  };
}
