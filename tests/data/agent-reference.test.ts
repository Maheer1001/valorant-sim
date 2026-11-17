import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Ability = {
  slot: string;
  name: string;
  kind: string;
  costCredits: number | null;
  maxCharges: number | null;
  durationSec: number | null;
  windupSec: number | null;
  stats?: Record<string, unknown>;
  source?: string;
};

type Agent = {
  id: number;
  name: string;
  role: string;
  live: boolean;
  keys: Record<string, string>;
  signature: string;
  signatureSlot: string;
  ultimatePoints: number | null;
  abilities: Ability[];
  knownGaps?: string[];
};

type Reference = {
  patch: string;
  recorded: string;
  source: Record<string, string>;
  agents: Agent[];
};

const ALLOWED_SOURCES = new Set(["verified", "secondary", "sheet", "estimate", "aggregator"]);

const reference = JSON.parse(
  readFileSync(path.resolve("agent-reference.json"), "utf8"),
) as Reference;

function hasNumericValue(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (Array.isArray(value)) return value.some(hasNumericValue);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasNumericValue);
  }
  return false;
}

function abilityHasNumeric(ability: Ability): boolean {
  if (typeof ability.costCredits === "number") return true;
  if (typeof ability.maxCharges === "number") return true;
  if (typeof ability.durationSec === "number") return true;
  if (typeof ability.windupSec === "number") return true;
  return hasNumericValue(ability.stats ?? {});
}

function rawValue(entry: unknown): number {
  if (typeof entry === "number") return entry;
  if (entry && typeof entry === "object" && "value" in entry) {
    return (entry as { value: number }).value;
  }
  throw new Error(`Expected raw numeric entry, got ${JSON.stringify(entry)}`);
}

describe("agent-reference.json patch 13.10", () => {
  it("is patch 13.10 with exactly 30 uniquely named and uniquely id'd agents", () => {
    expect(reference.patch).toBe("13.10");
    expect(reference.agents).toHaveLength(30);
    const names = reference.agents.map((agent) => agent.name);
    const ids = reference.agents.map((agent) => agent.id);
    expect(new Set(names).size).toBe(30);
    expect(new Set(ids).size).toBe(30);
    expect(reference.source.aggregator).toMatch(/third-party site that says it reads game files/i);
  });

  it("gives every agent exactly one signature and unique C/Q/E/X slots", () => {
    for (const agent of reference.agents) {
      expect(agent.signature, agent.name).toBeTruthy();
      expect(["C", "Q", "E"], agent.name).toContain(agent.signatureSlot);
      const matching = agent.abilities.filter(
        (ability) =>
          ability.kind === "signature" &&
          (ability.name === agent.signature ||
            agent.signature.split(" / ").includes(ability.name) ||
            ability.slot === agent.signatureSlot),
      );
      expect(matching.length, agent.name).toBeGreaterThanOrEqual(1);
      const combatSlots = agent.abilities
        .map((ability) => ability.slot)
        .filter((slot) => slot === "C" || slot === "Q" || slot === "E" || slot === "X");
      expect(new Set(combatSlots).size, agent.name).toBe(combatSlots.length);
      expect(combatSlots.sort(), agent.name).toEqual(["C", "E", "Q", "X"]);
    }
  });

  it("tags every ability that carries a numeric value with an allowed source", () => {
    for (const agent of reference.agents) {
      for (const ability of agent.abilities) {
        if (!abilityHasNumeric(ability)) continue;
        expect(ALLOWED_SOURCES.has(ability.source ?? ""), `${agent.name} ${ability.name}`).toBe(true);
      }
    }
  });

  it("does not tag any Hush ability as verified", () => {
    const hush = reference.agents.find((agent) => agent.name === "Hush");
    expect(hush).toBeDefined();
    if (!hush) return;
    for (const ability of hush.abilities) {
      expect(ability.source, ability.name).not.toBe("verified");
    }
  });

  it("records Clove Pick-me-up at 10% and sentinel destroy cooldowns at 45s", () => {
    const clove = reference.agents.find((agent) => agent.name === "Clove");
    const pick = clove?.abilities.find((ability) => ability.name === "Pick-me-up");
    expect(pick?.stats?.moveSpeed).toBe(0.1);
    expect(Math.round(Number(pick?.stats?.moveSpeed) * 100)).toBe(10);

    const destroyed = (agentName: string, abilityName: string) => {
      const agent = reference.agents.find((item) => item.name === agentName);
      const ability = agent?.abilities.find((item) => item.name === abilityName);
      return ability?.stats?.destroyedCooldownSec;
    };
    expect(destroyed("Cypher", "Spycam")).toBe(45);
    expect(destroyed("Killjoy", "Turret")).toBe(45);
    expect(destroyed("Vyse", "Arc Rose")).toBe(45);
  });

  it("keeps Hush aggregator raw values unconverted", () => {
    const hush = reference.agents.find((agent) => agent.name === "Hush");
    expect(hush?.live).toBe(true);
    expect(hush?.id).toBe(30);
    expect(hush?.ultimatePoints).toBe(8);

    const byName = Object.fromEntries((hush?.abilities ?? []).map((ability) => [ability.name, ability]));
    const flow = byName.Flow?.stats ?? {};
    expect(rawValue(flow.baseSpeed)).toBe(2250);
    expect(rawValue(flow.traceLength)).toBe(1500);
    expect(rawValue(flow.forceDuration)).toBe(0.4);
    expect(rawValue(flow.fallGraceDistance)).toBe(1000);
    expect(rawValue(flow.maxUpwardsSpeed)).toBe(500);
    expect(flow.levitateDurationSec).toBeNull();

    const flash = byName.Flashbulb?.stats ?? {};
    expect(rawValue(flash.flashDuration)).toBe(0.4);
    expect(rawValue(flash.maxTargetingDistance)).toBe(6500);
    expect(rawValue(flash.minTargetingDistance)).toBe(3250);
    expect(flash.equipDelaySec).toBe(0.8);

    const displace = byName.Displacement?.stats ?? {};
    expect(displace.concussSec).toBe(1.5);
    expect(displace.pullDurationSec).toBe(0.5);
    expect(displace.windupSec).toBe(0.5);
    expect(displace.equipDelaySec).toBe(0.8);
    expect(rawValue(displace.radiusRaw)).toBe(575);
    expect(rawValue(displace.maxTargetingDistance)).toBe(6500);
    expect(rawValue(displace.minTargetingDistance)).toBe(5000);

    const suspension = byName.Suspension?.stats ?? {};
    expect(suspension.ultDurationSec).toBe(4);
    expect(suspension.ultTargetingDurationSec).toBe(6);
    expect(suspension.ultFlightDurationSec).toBe(2);
    expect(rawValue(suspension.projectileSpeedRaw)).toBe(2500);
    expect(rawValue(suspension.playerHitRadiusRaw)).toBe(700);
    expect(rawValue(suspension.itemHitRadiusRaw)).toBe(900);
    expect(suspension.fizzleTimerSec).toBe(6);
    expect(suspension.movementSpeedMultiplierWhileAffected).toBe(0.167);
    expect(suspension.levitateDurationSec).toBeNull();
  });
});
