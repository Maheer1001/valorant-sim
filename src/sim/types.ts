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
  | "missing-plan"
  | "plan-already-submitted"
  | "signature-on-cooldown"
  | "insufficient-ult-points"
  | "insufficient-credits"
  | "charges-full";

export type StatusEffect = {
  id: string;
  sourceAbilityId: string;
  untilMs: number;
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
