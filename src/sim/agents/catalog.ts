import type { Provenance } from "../../rules/provenance.ts";
import type { AbilityDefinition, AbilitySlot, AgentDefinition, Catalog } from "./definition.ts";

export type { AgentDefinition, Catalog };
import type { CapabilityKind } from "../types.ts";
import { SKY_SMOKE_ABILITY } from "./abilities/sky-smoke.ts";
import { BREACH_ABILITIES } from "./abilities/breach.ts";

export const CATALOG_VERSION = "m2-stage1-breach-2026-11-17";

const ABILITY_TABLE = "https://wiki.playvalorant.com/en-us/Abilities";

const BRIMSTONE_ROLE: Provenance = {
  kind: "secondary",
  source: "https://wiki.playvalorant.com/en-us/Brimstone",
  note: "Wiki agent page lists the role as Controller. Coverage does not grant capabilities from this label.",
};

const KAYO_ROLE: Provenance = {
  kind: "secondary",
  source: "https://wiki.playvalorant.com/en-us/KAYO",
  note: "Wiki agent page lists the role as Initiator. Coverage does not grant capabilities from this label.",
};

const JETT_ROLE: Provenance = {
  kind: "secondary",
  source: "https://wiki.playvalorant.com/en-us/Jett",
  note: "Public roster lists Jett as a Duelist. Coverage does not grant capabilities from this label.",
};

const CYPHER_ROLE: Provenance = {
  kind: "secondary",
  source: "https://wiki.playvalorant.com/en-us/Cypher",
  note: "Public roster lists Cypher as a Sentinel. Coverage does not grant capabilities from this label.",
};

const BREACH_ROLE: Provenance = {
  kind: "secondary",
  source: "https://wiki.playvalorant.com/en-us/Breach",
  note: "Public roster lists Breach as an Initiator. Coverage does not grant capabilities from this label.",
};

function listed(input: {
  id: string;
  name: string;
  slot: AbilitySlot;
  capability: CapabilityKind | null;
  note: string;
}): AbilityDefinition {
  return {
    id: input.id,
    name: input.name,
    slot: input.slot,
    implementation: "placeholder",
    capability: input.capability,
    maxCharges: null,
    costCredits: null,
    durationMs: null,
    deployDelayMs: null,
    radiusMm: null,
    maxRangeMm: null,
    figures: {
      kind: "secondary",
      source: ABILITY_TABLE,
      note: input.note,
    },
  };
}

const BRIMSTONE: AgentDefinition = {
  id: "brimstone",
  name: "Brimstone",
  role: "controller",
  roleProvenance: BRIMSTONE_ROLE,
  abilities: [
    listed({
      id: "stim-beacon",
      name: "Stim Beacon",
      slot: "basic",
      capability: null,
      note: "Name and basic slot only. Not castable. No charges or duration are stored.",
    }),
    listed({
      id: "incendiary",
      name: "Incendiary",
      slot: "basic",
      capability: null,
      note: "Name and basic slot only. Not classified as area denial until the ability is implemented.",
    }),
    SKY_SMOKE_ABILITY,
    listed({
      id: "orbital-strike",
      name: "Orbital Strike",
      slot: "ultimate",
      capability: null,
      note: "Ultimate name only. Point cost and effect are not stored. Not castable.",
    }),
  ],
};

const KAYO: AgentDefinition = {
  id: "kayo",
  name: "KAY/O",
  role: "initiator",
  roleProvenance: KAYO_ROLE,
  abilities: [
    listed({
      id: "frag-ment",
      name: "FRAG/ment",
      slot: "basic",
      capability: null,
      note: "Name and basic slot only. Not castable.",
    }),
    listed({
      id: "flash-drive",
      name: "FLASH/DRIVE",
      slot: "basic",
      capability: "flash",
      note: "Wiki abilities table lists FLASH/DRIVE as a basic flash. ZERO/point is the signature. Stats are omitted. Not castable.",
    }),
    listed({
      id: "zero-point",
      name: "ZERO/point",
      slot: "signature",
      capability: null,
      note: "Wiki abilities table lists ZERO/point as KAY/O's signature. Not classified as recon. Not castable.",
    }),
    listed({
      id: "null-cmd",
      name: "NULL/cmd",
      slot: "ultimate",
      capability: null,
      note: "Ultimate name only. Not castable.",
    }),
  ],
};

const JETT: AgentDefinition = {
  id: "jett",
  name: "Jett",
  role: "duelist",
  roleProvenance: JETT_ROLE,
  abilities: [
    listed({
      id: "cloudburst",
      name: "Cloudburst",
      slot: "basic",
      capability: "smoke",
      note: "Wiki abilities table lists Cloudburst as a basic smoke. It does not grant smoke coverage while it remains a placeholder.",
    }),
    listed({
      id: "updraft",
      name: "Updraft",
      slot: "basic",
      capability: null,
      note: "The abilities table function column says Dash. This build does not treat Updraft as an entry capability. Not castable.",
    }),
    listed({
      id: "tailwind",
      name: "Tailwind",
      slot: "signature",
      capability: "entry",
      note: "Wiki abilities table lists Tailwind as the signature dash. It does not grant entry coverage while it remains a placeholder.",
    }),
    listed({
      id: "blade-storm",
      name: "Blade Storm",
      slot: "ultimate",
      capability: null,
      note: "Ultimate name only. Not castable.",
    }),
  ],
};

const CYPHER: AgentDefinition = {
  id: "cypher",
  name: "Cypher",
  role: "sentinel",
  roleProvenance: CYPHER_ROLE,
  abilities: [
    listed({
      id: "trapwire",
      name: "Trapwire",
      slot: "basic",
      capability: "flank-watch",
      note: "Wiki abilities table lists Trapwire as a basic autonomous deployable. Spycam is the signature. Not castable, so it does not fill flank-watch coverage.",
    }),
    listed({
      id: "cyber-cage",
      name: "Cyber Cage",
      slot: "basic",
      capability: null,
      note: "Name and basic slot only. Not classified as smoke until the cage is implemented.",
    }),
    listed({
      id: "spycam",
      name: "Spycam",
      slot: "signature",
      capability: null,
      note: "Wiki abilities table lists Spycam as Cypher's signature. Not classified as recon until it is implemented.",
    }),
    listed({
      id: "neural-theft",
      name: "Neural Theft",
      slot: "ultimate",
      capability: null,
      note: "Ultimate name only. Not castable.",
    }),
  ],
};

const BREACH: AgentDefinition = {
  id: "breach",
  name: "Breach",
  role: "initiator",
  roleProvenance: BREACH_ROLE,
  abilities: [...BREACH_ABILITIES],
};

export const SHIPPED_CATALOG: Catalog = {
  version: CATALOG_VERSION,
  agents: [BRIMSTONE, KAYO, JETT, CYPHER, BREACH],
};

export function getAgent(catalog: Catalog, definitionId: string): AgentDefinition | null {
  return catalog.agents.find((agent) => agent.id === definitionId) ?? null;
}
