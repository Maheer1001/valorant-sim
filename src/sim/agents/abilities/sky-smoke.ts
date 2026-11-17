import type { Provenance } from "../../../rules/provenance.ts";
import type { AbilityDefinition } from "../definition.ts";

/**
 * Figures below are taken from the Sky Smoke wiki page, which lists them as
 * current PC values with patch history. This build did not re-measure them
 * in the live client, so they stay secondary.
 *
 * Radius is stored as millimeters using the wiki's meter figure (4.15 m).
 */
export const SKY_SMOKE_ID = "sky-smoke";

export const SKY_SMOKE_FIGURES: Provenance = {
  kind: "secondary",
  source: "https://wiki.playvalorant.com/en-us/Sky_Smoke",
  note: "Wiki lists 3 charges, 100 credits, 19.25 s duration, 1 s deploy, 4.15 m radius, and 55 m cast range. Not confirmed in the live client for this build.",
};

export const SKY_SMOKE_CHARGES = 3;
export const SKY_SMOKE_COST_CREDITS = 100;
export const SKY_SMOKE_DURATION_MS = 19250;
export const SKY_SMOKE_DEPLOY_MS = 1000;
export const SKY_SMOKE_RADIUS_MM = 4150;
export const SKY_SMOKE_RANGE_MM = 55000;

/**
 * Patch 13.05 fixed Brimstone smokes that kept blocking line-of-sight
 * abilities while dissipating and after they had dissipated. Blocking in
 * this build ends at expiresAtMs. A fade during dissipation is not simulated.
 */
export const SMOKE_VISION_ENDS: Provenance = {
  kind: "verified",
  source: "https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-13-05/",
  note: "Patch 13.05 says Brimstone smokes were fixed so they stop blocking line-of-sight-dependent abilities once they dissipate. The instant cutoff at expiresAtMs is the milestone 1 model of that end state. A gradual fade is not simulated.",
};

export const INSTANT_SMOKE_CUTOFF: Provenance = {
  kind: "assumed",
  source: "milestone-1",
  note: "The smoke either blocks the whole sight segment or it does not. There is no partial fade, height, or one-way vision.",
};

export const SKY_SMOKE_ABILITY: AbilityDefinition = {
  id: SKY_SMOKE_ID,
  name: "Sky Smoke",
  slot: "signature",
  implementation: "complete",
  capability: "smoke",
  maxCharges: SKY_SMOKE_CHARGES,
  costCredits: SKY_SMOKE_COST_CREDITS,
  durationMs: SKY_SMOKE_DURATION_MS,
  deployDelayMs: SKY_SMOKE_DEPLOY_MS,
  radiusMm: SKY_SMOKE_RADIUS_MM,
  maxRangeMm: SKY_SMOKE_RANGE_MM,
  figures: SKY_SMOKE_FIGURES,
  referenceStats: {
    equipSec: 0.8,
    rangeM: 55,
    deploySec: 1,
    radiusM: 4.15,
    durationSec: 19.25,
    warningAtSec: 17.75,
    blocksVisionWhileActive: true,
  },
};
