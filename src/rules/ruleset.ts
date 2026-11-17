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
  /** Starting credits for buyCharge tests / drills. */
  startingCredits: number;
  startingCreditsProvenance: Provenance;
  /** Concuss walk-speed multiplier while status is active. */
  concussWalkSpeedMultiplierBp: number;
  concussWalkSpeedMultiplierProvenance: Provenance;
  /** Concuss hit-chance penalty in basis points (subtracted from rifle chance). */
  concussHitChancePenaltyBp: number;
  concussHitChancePenaltyProvenance: Provenance;
  /** Flash looking-at half-angle in degrees. */
  flashLookHalfAngleDeg: number;
  flashLookHalfAngleProvenance: Provenance;
  /** Assumed Flashpoint flight duration after windup (travelSpeed unit unknown). */
  flashpointFlightMs: number;
  flashpointFlightMsProvenance: Provenance;
  /** Assumed horizontal knockback for Rolling Thunder blasts (vertical knockup withheld). */
  rollingThunderKnockbackMm: number;
  rollingThunderKnockbackProvenance: Provenance;
  /** Assumed spacing between Incendiary floor contacts on the flat map. */
  incendiaryFloorSpacingMm: number;
  incendiaryFloorSpacingProvenance: Provenance;
  /**
   * Design: Incendiary damage batching — 6 hp every 100 ms (= 60 DPS from 1×60 ticks/s).
   * Not a published batch size; keeps integer ms without inventing a different DPS.
   */
  incendiaryTickDamage: number;
  incendiaryTickIntervalMs: number;
  incendiaryTickProvenance: Provenance;
  /** Assumed Stim Beacon pulse interval for applying/refreshing buffs. */
  stimBeaconPulseMs: number;
  stimBeaconPulseProvenance: Provenance;
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

export const STARTING_CREDITS_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "stage-1",
  note: "Drill agents start with 800 credits for buyCharge stubs. Not a live buy phase.",
};

export const CONCUSS_WALK_SPEED_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "stage-1",
  note: "Concuss multiplies walk speed by 7000/10000 while active. Not a measured Valorant concuss slow.",
};

export const CONCUSS_HIT_CHANCE_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "stage-1",
  note: "Concuss subtracts 2000 basis points from Rifle A hit chance. Lab stand-in for accuracy loss.",
};

export const FLASH_LOOK_HALF_ANGLE_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "stage-1 design decision",
  note: "Looking-at flash uses ±90 degrees until a client-measured cone exists.",
};

export const FLASHPOINT_FLIGHT_MS_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "stage-1",
  note: "Flashpoint travelSpeed 2400 has no unit in the reference. Flight after windup is an assumed 400 ms stub; 2400 is not converted.",
};

export const ROLLING_THUNDER_KNOCKBACK_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "stage-1",
  note: "Horizontal displacement of 1500 mm per Rolling Thunder blast on the flat map. The 7 m vertical knockup is estimate-withheld and not modeled.",
};

export const INCENDIARY_FLOOR_SPACING_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "stage-1 part 2",
  note: "Flat-map stand-in: floor contacts every 4000 mm along the throw until two bounces then detonate. Not a measured bounce arc.",
};

export const INCENDIARY_TICK_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "stage-1 part 2 design",
  note: "Reference is 1 damage × 60 ticks/s. Engine batches to 6 damage every 100 ms (same 60 DPS) for integer milliseconds.",
};

export const STIM_BEACON_PULSE_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "stage-1 part 2",
  note: "Stim Beacon refreshes ally buffs on a 500 ms pulse while active. Lab cadence, not a client tick.",
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
  startingCredits: 800,
  startingCreditsProvenance: STARTING_CREDITS_PROVENANCE,
  concussWalkSpeedMultiplierBp: 7000,
  concussWalkSpeedMultiplierProvenance: CONCUSS_WALK_SPEED_PROVENANCE,
  concussHitChancePenaltyBp: 2000,
  concussHitChancePenaltyProvenance: CONCUSS_HIT_CHANCE_PROVENANCE,
  flashLookHalfAngleDeg: 90,
  flashLookHalfAngleProvenance: FLASH_LOOK_HALF_ANGLE_PROVENANCE,
  flashpointFlightMs: 400,
  flashpointFlightMsProvenance: FLASHPOINT_FLIGHT_MS_PROVENANCE,
  rollingThunderKnockbackMm: 1500,
  rollingThunderKnockbackProvenance: ROLLING_THUNDER_KNOCKBACK_PROVENANCE,
  incendiaryFloorSpacingMm: 4000,
  incendiaryFloorSpacingProvenance: INCENDIARY_FLOOR_SPACING_PROVENANCE,
  incendiaryTickDamage: 6,
  incendiaryTickIntervalMs: 100,
  incendiaryTickProvenance: INCENDIARY_TICK_PROVENANCE,
  stimBeaconPulseMs: 500,
  stimBeaconPulseProvenance: STIM_BEACON_PULSE_PROVENANCE,
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
