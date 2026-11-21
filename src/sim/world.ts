import type { Scenario } from "./scenario/types.ts";
import type { DamageZone, Device, Point, SmokeVolume, StatusEffect } from "./types.ts";
import { STANDARD_RULESET, type Ruleset } from "../rules/ruleset.ts";

/*
 * World state shared by the engine and every kit. A leaf for kits: they import
 * from here (and from jobs/types.ts), never from run.ts, so no import cycle runs
 * through the job dispatcher. Moved verbatim from run.ts in stage H0.
 */

export type AgentBody = {
  instanceId: string;
  definitionId: string;
  side: "attack" | "defense";
  xMm: number;
  yMm: number;
  hp: number;
  alive: boolean;
  facingDeg: number;
  credits: number;
  charges: Record<string, number>;
  cooldownReadyAtMs: Record<string, number>;
  ultimatePoints: number;
  statuses: StatusEffect[];
};

export type World = {
  timeMs: number;
  agents: AgentBody[];
  smokes: SmokeVolume[];
  devices: Device[];
  zones: DamageZone[];
};

/** Outcome of a live round (defined here so `SimEvent` needs no import cycle; re-exported by live-round.ts). */
export type RoundResult =
  | { kind: "attack-eliminated" }
  | { kind: "defense-eliminated" }
  | { kind: "timeout"; winner: "defense" };

export function findAgent(world: World, instanceId: string): AgentBody | null {
  return world.agents.find((agent) => agent.instanceId === instanceId) ?? null;
}

export function createWorld(scenario: Scenario, ruleset: Ruleset = STANDARD_RULESET): World {
  const agents = [...scenario.attack.members, ...scenario.defense.members].map((member) => ({
    instanceId: member.instanceId,
    definitionId: member.definitionId,
    side: member.side,
    xMm: member.xMm,
    yMm: member.yMm,
    hp: member.hp,
    alive: member.hp > 0,
    facingDeg: member.facingDeg ?? 0,
    credits: member.credits ?? ruleset.startingCredits,
    charges: { ...member.charges },
    cooldownReadyAtMs: { ...member.cooldownReadyAtMs },
    ultimatePoints: member.ultimatePoints ?? 0,
    statuses: structuredClone(member.statuses ?? []),
  }));
  return { timeMs: 0, agents, smokes: [], devices: [], zones: [] };
}

/** Linear interpolate integer mm positions. */
export function lerpPoint(from: Point, to: Point, t: number): Point {
  return {
    xMm: Math.round(from.xMm + (to.xMm - from.xMm) * t),
    yMm: Math.round(from.yMm + (to.yMm - from.yMm) * t),
  };
}
