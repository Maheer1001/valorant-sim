import type { Provenance } from "../../../rules/provenance.ts";
import type { AbilityDefinition } from "../definition.ts";
import { SKY_SMOKE_ABILITY } from "./sky-smoke.ts";

export const STIM_BEACON_ID = "stim-beacon";
export const INCENDIARY_ID = "incendiary";
export const ORBITAL_STRIKE_ID = "orbital-strike";

export const STIM_BEACON_FIGURES: Provenance = {
  kind: "verified",
  source: "agent-reference.json / Riot patch notes cited there",
  note: "Stim Beacon numbers copied from the reference file (verified).",
};

export const INCENDIARY_FIGURES: Provenance = {
  kind: "secondary",
  source: "agent-reference.json sheet row",
  note: "Incendiary numbers copied from the reference sheet tag. Ally damage fraction is unpublished and not applied.",
};

export const ORBITAL_STRIKE_FIGURES: Provenance = {
  kind: "secondary",
  source: "agent-reference.json sheet row",
  note: "Orbital Strike numbers copied from the reference sheet tag. Approximate DPS is ignored for tick math. Ally damage fraction unpublished.",
};

export const STIM_BEACON_ABILITY: AbilityDefinition = {
  id: STIM_BEACON_ID,
  name: "Stim Beacon",
  slot: "basic",
  implementation: "complete",
  capability: null,
  maxCharges: 1,
  costCredits: 200,
  durationMs: 12000,
  deployDelayMs: 0,
  radiusMm: 6000,
  maxRangeMm: null,
  figures: STIM_BEACON_FIGURES,
  referenceStats: {
    radiusM: 6,
    beaconSec: 12,
    lingerAfterLeavingSec: 4,
    unequipSec: 0.7,
    fireRate: 1.1,
    reloadTime: 0.9,
    drawTime: 0.9,
    spreadRecovery: 1.1,
    movementSpeed: 1.1,
    indestructible: true,
    enemiesSeeRadius: false,
  },
};

export const INCENDIARY_ABILITY: AbilityDefinition = {
  id: INCENDIARY_ID,
  name: "Incendiary",
  slot: "basic",
  implementation: "complete",
  capability: "area-denial",
  maxCharges: 1,
  costCredits: 250,
  durationMs: 8000,
  deployDelayMs: 1100,
  radiusMm: 4500,
  maxRangeMm: null,
  figures: INCENDIARY_FIGURES,
  referenceStats: {
    equipSec: 1.1,
    radiusM: 4.5,
    burstSec: 0.25,
    spreadSec: 0.75,
    fullSizeSec: 7,
    damagePerTick: 1,
    ticksPerSec: 60,
    dps: 60,
    damageTotalMin: 420,
    damageTotalMax: 465,
    objectDamageMultiplier: 0.5,
    floorBounces: 2,
  },
};

export const ORBITAL_STRIKE_ABILITY: AbilityDefinition = {
  id: ORBITAL_STRIKE_ID,
  name: "Orbital Strike",
  slot: "ultimate",
  implementation: "complete",
  capability: "area-denial",
  maxCharges: null,
  costCredits: null,
  durationMs: 3000,
  deployDelayMs: 2000,
  radiusMm: 9000,
  maxRangeMm: 60000,
  ultPointCost: 8,
  figures: ORBITAL_STRIKE_FIGURES,
  referenceStats: {
    ultPoints: 8,
    rangeM: 60,
    windupSec: 2,
    radiusM: 9,
    damageEverySec: 0.15,
    damagePerInterval: 20,
    activeSec: 3,
    shrinkSec: 0.75,
    damageTotalMin: 400,
    damageTotalMax: 500,
    blocksLineOfSight: true,
    blocksFlashesAndRecon: true,
    damagesObjects: true,
  },
};

export const BRIMSTONE_ABILITIES = [
  STIM_BEACON_ABILITY,
  INCENDIARY_ABILITY,
  SKY_SMOKE_ABILITY,
  ORBITAL_STRIKE_ABILITY,
] as const;
