import type { Provenance } from "../../../rules/provenance.ts";
import type { AbilityDefinition } from "../definition.ts";

/** Verified Breach kit figures from agent-reference.json patch 13.10. */
export const BREACH_FIGURES: Provenance = {
  kind: "verified",
  source: "agent-reference.json / Riot patch notes cited there",
  note: "Breach Aftershock, Flashpoint, Fault Line, and Rolling Thunder numbers copied from the reference file. Knockup height is estimate and not modeled.",
};

export const AFTERSHOCK_ID = "aftershock";
export const FLASHPOINT_ID = "flashpoint";
export const FAULT_LINE_ID = "fault-line";
export const ROLLING_THUNDER_ID = "rolling-thunder";

export const AFTERSHOCK_ABILITY: AbilityDefinition = {
  id: AFTERSHOCK_ID,
  name: "Aftershock",
  slot: "basic",
  implementation: "complete",
  capability: "area-denial",
  maxCharges: 1,
  costCredits: 200,
  durationMs: null,
  deployDelayMs: 2200,
  radiusMm: 3000,
  maxRangeMm: 35000,
  figures: BREACH_FIGURES,
  referenceStats: {
    costCredits: 200,
    maxCharges: 1,
    equipSec: 0.9,
    rangeM: 35,
    cylinderLengthM: 10,
    radiusM: 3,
    windupSec: 2.2,
    bursts: 2,
    damagePerBurst: 80,
    burstIntervalSec: 0.6,
    damageTotal: 160,
    falloff: false,
    damagesObjects: true,
    throughWalls: true,
  },
};

export const FLASHPOINT_ABILITY: AbilityDefinition = {
  id: FLASHPOINT_ID,
  name: "Flashpoint",
  slot: "basic",
  implementation: "complete",
  capability: "flash",
  maxCharges: 2,
  costCredits: 250,
  durationMs: 2250,
  deployDelayMs: 500,
  radiusMm: null,
  maxRangeMm: 35000,
  figures: BREACH_FIGURES,
  referenceStats: {
    costCredits: 250,
    maxCharges: 2,
    equipSec: 1.1,
    rangeM: 35,
    wallDepthM: 10,
    windupSec: 0.5,
    blindSec: 2.25,
    travelSpeed: 2400,
    requiresLooking: true,
  },
};

export const FAULT_LINE_ABILITY: AbilityDefinition = {
  id: FAULT_LINE_ID,
  name: "Fault Line",
  slot: "signature",
  implementation: "complete",
  capability: null,
  maxCharges: 1,
  costCredits: 0,
  durationMs: 2500,
  deployDelayMs: 1100,
  radiusMm: null,
  maxRangeMm: 56000,
  signatureCooldownMs: 50000,
  figures: BREACH_FIGURES,
  referenceStats: {
    costCredits: 0,
    maxCharges: 1,
    equipSec: 0.8,
    chargeSec: 1,
    lengthMinM: 8,
    lengthMaxM: 56,
    widthM: 8,
    startsAheadM: 8,
    windupSec: 1.1,
    concussSec: 2.5,
    cooldownSec: 50,
    throughWalls: true,
  },
};

export const ROLLING_THUNDER_ABILITY: AbilityDefinition = {
  id: ROLLING_THUNDER_ID,
  name: "Rolling Thunder",
  slot: "ultimate",
  implementation: "complete",
  capability: null,
  maxCharges: null,
  costCredits: null,
  durationMs: 4000,
  deployDelayMs: 600,
  radiusMm: null,
  maxRangeMm: 32000,
  ultPointCost: 8,
  notModeled: ["verticalKnockup (estimate withheld, flat map)"],
  figures: BREACH_FIGURES,
  referenceStats: {
    ultPoints: 8,
    equipSec: 1.1,
    channelSec: 0.6,
    lengthM: 32,
    widthM: 18,
    startsAheadM: 8,
    blasts: 8,
    blastIntervalSec: 0.255,
    concussSec: 4,
    throughWalls: true,
  },
};

export const BREACH_ABILITIES = [
  AFTERSHOCK_ABILITY,
  FLASHPOINT_ABILITY,
  FAULT_LINE_ABILITY,
  ROLLING_THUNDER_ABILITY,
] as const;
