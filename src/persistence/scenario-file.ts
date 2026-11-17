import { SCENARIO_VERSION, type Order, type Scenario } from "../sim/scenario/types.ts";
import type { TacticalAssignment } from "../sim/types.ts";

export class ScenarioFileError extends Error {
  readonly code: "unknown-version" | "invalid-shape";

  constructor(code: "unknown-version" | "invalid-shape", message: string) {
    super(message);
    this.name = "ScenarioFileError";
    this.code = code;
  }
}

export function serializeScenario(scenario: Scenario): string {
  return JSON.stringify(scenario);
}

export function parseScenario(text: string): Scenario {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ScenarioFileError("invalid-shape", "Scenario text is not JSON.");
  }
  if (!isRecord(raw) || !("version" in raw)) {
    throw new ScenarioFileError("invalid-shape", "Scenario is missing a version.");
  }
  if (raw.version !== SCENARIO_VERSION) {
    throw new ScenarioFileError("unknown-version", "Unsupported scenario version.");
  }
  assertScenario(raw);
  return raw;
}

function assertScenario(value: Record<string, unknown>): asserts value is Scenario {
  if (typeof value.id !== "string" || !Number.isInteger(value.seed)) {
    throw new ScenarioFileError("invalid-shape", "Scenario id or seed is invalid.");
  }
  if (typeof value.rulesetId !== "string" || typeof value.catalogVersion !== "string" || typeof value.mapId !== "string") {
    throw new ScenarioFileError("invalid-shape", "Scenario is missing ruleset, catalog, or map.");
  }
  assertProvenance(value.setup);
  assertTeam(value.attack, "attack");
  assertTeam(value.defense, "defense");
  if (!Array.isArray(value.orders)) {
    throw new ScenarioFileError("invalid-shape", "Orders are missing.");
  }
  for (const order of value.orders) assertOrder(order);
}

function assertTeam(value: unknown, side: "attack" | "defense"): void {
  if (!isRecord(value) || value.side !== side || !Array.isArray(value.members)) {
    throw new ScenarioFileError("invalid-shape", "Team shape is invalid.");
  }
  for (const member of value.members) {
    if (!isRecord(member)) throw new ScenarioFileError("invalid-shape", "Agent shape is invalid.");
    if (typeof member.instanceId !== "string" || typeof member.definitionId !== "string" || member.side !== side) {
      throw new ScenarioFileError("invalid-shape", "Agent identity is invalid.");
    }
    if (!isAssignment(member.assignment)) {
      throw new ScenarioFileError("invalid-shape", "Assignment is invalid.");
    }
    if (!Number.isInteger(member.xMm) || !Number.isInteger(member.yMm) || !Number.isInteger(member.hp)) {
      throw new ScenarioFileError("invalid-shape", "Agent position or health is invalid.");
    }
    if (
      typeof member.facingDeg !== "number" ||
      !Number.isInteger(member.facingDeg) ||
      member.facingDeg < 0 ||
      member.facingDeg > 359
    ) {
      throw new ScenarioFileError("invalid-shape", "Agent facing is invalid.");
    }
    if (typeof member.credits !== "number" || !Number.isInteger(member.credits)) {
      throw new ScenarioFileError("invalid-shape", "Agent credits are invalid.");
    }
    if (!isNumberRecord(member.charges) || !isNumberRecord(member.cooldownReadyAtMs)) {
      throw new ScenarioFileError("invalid-shape", "Agent resources are invalid.");
    }
    if (!Number.isInteger(member.ultimatePoints) || !Array.isArray(member.statuses)) {
      throw new ScenarioFileError("invalid-shape", "Agent status is invalid.");
    }
  }
}

function assertOrder(value: unknown): asserts value is Order {
  if (!isRecord(value)) throw new ScenarioFileError("invalid-shape", "Order is invalid.");
  if (value.kind === "move") {
    if (typeof value.instanceId !== "string" || !isPoint(value.to) || !Number.isInteger(value.speedMmPerSec) || !Number.isInteger(value.startMs)) {
      throw new ScenarioFileError("invalid-shape", "Move order is invalid.");
    }
    return;
  }
  if (value.kind === "cast") {
    if (typeof value.instanceId !== "string" || typeof value.abilityId !== "string" || !isPoint(value.target) || !Number.isInteger(value.atMs)) {
      throw new ScenarioFileError("invalid-shape", "Cast order is invalid.");
    }
    return;
  }
  if (value.kind === "engage") {
    if (
      typeof value.instanceId !== "string" ||
      typeof value.targetInstanceId !== "string" ||
      typeof value.weaponId !== "string" ||
      !Number.isInteger(value.atMs)
    ) {
      throw new ScenarioFileError("invalid-shape", "Engage order is invalid.");
    }
    return;
  }
  throw new ScenarioFileError("invalid-shape", "Order kind is invalid.");
}

function assertProvenance(value: unknown): void {
  if (!isRecord(value) || (value.kind !== "verified" && value.kind !== "secondary" && value.kind !== "assumed")) {
    throw new ScenarioFileError("invalid-shape", "Provenance is invalid.");
  }
  if (typeof value.source !== "string" || typeof value.note !== "string") {
    throw new ScenarioFileError("invalid-shape", "Provenance is invalid.");
  }
}

function isAssignment(value: unknown): value is TacticalAssignment | null {
  return value === null || value === "entry" || value === "lurk" || value === "anchor" || value === "flank-watch";
}

function isPoint(value: unknown): boolean {
  return isRecord(value) && Number.isInteger(value.xMm) && Number.isInteger(value.yMm);
}

function isNumberRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === "number");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
