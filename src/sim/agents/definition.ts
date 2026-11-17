import type { Provenance } from "../../rules/provenance.ts";
import type { CapabilityKind, ImplementationStatus, Role } from "../types.ts";

export type AbilitySlot = "basic" | "signature" | "ultimate";

export type AbilityDefinition = {
  id: string;
  name: string;
  slot: AbilitySlot;
  implementation: ImplementationStatus;
  capability: CapabilityKind | null;
  maxCharges: number | null;
  costCredits: number | null;
  durationMs: number | null;
  deployDelayMs: number | null;
  radiusMm: number | null;
  maxRangeMm: number | null;
  figures: Provenance;
  /** Ult point cost when kind is ultimate; null otherwise. */
  ultPointCost?: number | null;
  /** Signature cooldown in ms when applicable. */
  signatureCooldownMs?: number | null;
  /** Effects intentionally not modeled. */
  notModeled?: readonly string[];
  /** Numeric fields mirrored from agent-reference.json for drift tests. */
  referenceStats?: Record<string, number | boolean | null>;
};

export type AgentDefinition = {
  id: string;
  name: string;
  role: Role;
  roleProvenance: Provenance;
  abilities: readonly AbilityDefinition[];
};

export type Catalog = {
  version: string;
  agents: readonly AgentDefinition[];
};
