import type { Provenance } from "../../rules/provenance.ts";
import type { Point } from "../types.ts";
import type { Team } from "../composition/team.ts";

export const SCENARIO_VERSION = 1;

export type MoveOrder = {
  kind: "move";
  instanceId: string;
  to: Point;
  speedMmPerSec: number;
  startMs: number;
};

export type CastOrder = {
  kind: "cast";
  instanceId: string;
  abilityId: string;
  target: Point;
  atMs: number;
};

export type EngageOrder = {
  kind: "engage";
  instanceId: string;
  targetInstanceId: string;
  weaponId: string;
  atMs: number;
};

export type Order = MoveOrder | CastOrder | EngageOrder;

export type Scenario = {
  version: typeof SCENARIO_VERSION;
  id: string;
  seed: number;
  rulesetId: string;
  catalogVersion: string;
  mapId: string;
  attack: Team;
  defense: Team;
  setup: Provenance;
  orders: Order[];
};
