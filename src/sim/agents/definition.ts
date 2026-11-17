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
