export type Point = {
  xMm: number;
  yMm: number;
};

export type Segment = {
  a: Point;
  b: Point;
};

export type Side = "attack" | "defense";

export type Role = "duelist" | "initiator" | "controller" | "sentinel";

export type TacticalAssignment = "entry" | "lurk" | "anchor" | "flank-watch";

export type ImplementationStatus = "complete" | "partial" | "placeholder";

export type CapabilityKind =
  | "smoke"
  | "flash"
  | "entry"
  | "recon"
  | "flank-watch"
  | "area-denial";

export const TRACKED_CAPABILITIES: readonly CapabilityKind[] = [
  "smoke",
  "flash",
  "entry",
  "recon",
  "flank-watch",
  "area-denial",
];

export type RejectionCode =
  | "ability-not-owned"
  | "ability-not-executable"
  | "insufficient-charges"
  | "out-of-range"
  | "unknown-agent"
  | "team-full"
  | "duplicate-agent"
  | "unknown-definition"
  | "unknown-map"
  | "ruleset-mismatch"
  | "catalog-mismatch"
  | "invalid-order"
  | "wrong-side"
  | "agent-down"
  | "target-not-enemy"
  | "target-not-visible"
  | "signature-on-cooldown"
  | "insufficient-ult-points"
  | "insufficient-credits"
  | "charges-full";

export type StatusEffect = {
  id: string;
  sourceAbilityId: string;
  untilMs: number;
  /** Optional modifiers (Combat Stim stores reload/draw/spread even when unused by the sim). */
  modifiers?: Record<string, number>;
};

export type SmokeVolume = {
  id: string;
  ownerInstanceId: string;
  abilityId: string;
  xMm: number;
  yMm: number;
  radiusMm: number;
  activeFromMs: number;
  expiresAtMs: number;
};

/** Placeable device (Stim Beacon). */
export type Device = {
  id: string;
  kind: "stim-beacon";
  ownerInstanceId: string;
  abilityId: string;
  side: Side;
  xMm: number;
  yMm: number;
  radiusMm: number;
  activeFromMs: number;
  expiresAtMs: number;
  enemiesSeeRadius: boolean;
  indestructible: boolean;
};

/** Ground damage / vision zone (Incendiary, Orbital Strike). */
export type DamageZone = {
  id: string;
  abilityId: string;
  ownerInstanceId: string;
  side: Side;
  xMm: number;
  yMm: number;
  fullRadiusMm: number;
  activeFromMs: number;
  expiresAtMs: number;
  burstEndMs: number;
  spreadEndMs: number;
  fullEndMs: number;
  shrinkEndMs: number | null;
  damagesAllies: boolean;
  blocksVision: boolean;
  tickDamage: number;
  tickIntervalMs: number;
};
