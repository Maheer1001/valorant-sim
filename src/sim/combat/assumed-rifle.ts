import type { Provenance } from "../../rules/provenance.ts";

/**
 * Original rifle used by the drill. These numbers are not taken from a
 * Valorant weapon. There is no headshot multiplier, armor, spray pattern,
 * movement penalty, or reload.
 */
export const RIFLE_A = {
  id: "rifle_a",
  name: "Rifle A",
  bodyDamage: 40,
  hitChanceNearBp: 7500,
  hitChanceFarBp: 2500,
  farRangeMm: 15000,
  provenance: {
    kind: "assumed",
    source: "milestone-1",
    note: "Original profile. Hit chance falls linearly from 7500 to 2500 basis points across 15 m. A draw below the chance is a hit. This is not a Valorant rifle.",
  } satisfies Provenance,
};

export function getWeapon(weaponId: string): typeof RIFLE_A | null {
  return weaponId === RIFLE_A.id ? RIFLE_A : null;
}

export function hitProbabilityBp(distanceMm: number): number {
  if (distanceMm <= 0) return RIFLE_A.hitChanceNearBp;
  if (distanceMm >= RIFLE_A.farRangeMm) return RIFLE_A.hitChanceFarBp;
  const span = RIFLE_A.hitChanceNearBp - RIFLE_A.hitChanceFarBp;
  const drop = Math.round((span * distanceMm) / RIFLE_A.farRangeMm);
  return RIFLE_A.hitChanceNearBp - drop;
}
