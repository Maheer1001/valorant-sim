import type { Provenance } from "./provenance.ts";

export type UniquenessScope = "per-team" | "per-match" | "none";

export type Ruleset = {
  id: string;
  label: string;
  teamSize: number;
  teamSizeProvenance: Provenance;
  uniqueness: UniquenessScope;
  uniquenessProvenance: Provenance;
};

const WIKI_GAMEPLAY = "https://wiki.playvalorant.com/en-us/VALORANT";

/**
 * Standard match shape used by the lab.
 * Team size and uniqueness are secondary: the Valorant wiki gameplay summary
 * was read for this build. They were not confirmed in the live client or in
 * a Riot patch note, so neither field is tagged verified.
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
