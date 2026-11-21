import type { Catalog } from "../agents/catalog.ts";
import type { EventQueue } from "../clock.ts";
import type { Scenario } from "../scenario/types.ts";
import type { Point, RejectionCode, Side } from "../types.ts";
import type { Ruleset } from "../../rules/ruleset.ts";
import type { Job, RoundResult, SimEvent, World } from "../run.ts";
import type { AgentCommand } from "./commands.ts";

export type { RoundResult } from "../run.ts";

/** Typed rejection for opening a round or starting one from a pre-round plan. */
export type PlanFailure = {
  ok: false;
  code: RejectionCode;
  message: string;
  orderIndex?: number;
};

/**
 * Live (pauseable) round engine. Time advances only when the host calls
 * `stepLive`; pausing is simply not calling it. Frozen sim time freezes windups,
 * zone ticks, moves and the decision cadence alike, with no extra flag.
 *
 * Mutation model: `openLiveRound`, `issueOrders` and `stepLive` mutate the
 * `LiveRound` in place and return the same object. The hot path never clones
 * the world. Use `truthLiveWorld` / `viewLive` for snapshots.
 */

export type RoundPhase = "live" | "ended";

export type StandingOrder =
  | { kind: "hold" }
  | {
      kind: "move-route";
      waypoints: Point[];
      /** Waypoint currently being walked toward. */
      index: number;
      segmentFrom: Point;
      /** Wall-clipped end of the current segment. */
      segmentTo: Point;
      segmentStartMs: number;
      segmentArrivalMs: number;
      /** True when `segmentTo` was cut short by a wall. */
      blocked: boolean;
    };

/** Where an order batch came from. Missing on old logs; treat as "live". */
export type OrderOrigin = "plan" | "live";

export type OrderLogEntry = {
  simTimeMs: number;
  side: Side;
  commands: AgentCommand[];
  result: "accepted" | RejectionCode;
  message?: string;
  /** Omitted in version-1-era logs; replay defaults to "live". */
  origin?: OrderOrigin;
};

/** Opponent hook. Receives fogged data only (never truth). */
export type LiveDecideFn = (side: Side, foggedWorld: World) => AgentCommand[];

export type PendingBatch = {
  side: Side;
  commands: AgentCommand[];
  origin: OrderOrigin;
};

export type IssueOrdersOptions = {
  origin?: OrderOrigin;
  message?: string;
};

export type PlanStepStatus = "armed" | "fired" | "cancelled" | "not-reached" | "rejected";

export type PlanStepTrigger =
  | { kind: "at-time"; timeMs: number }
  | { kind: "at-waypoint"; waypointIndex: number };

/** Armed pre-round cast; fires only through `issueOrders` inside `stepLive`. */
export type PlanStepState = {
  id: string;
  instanceId: string;
  abilityId: string;
  trigger: PlanStepTrigger;
  target: Point;
  aimYawDeg?: number;
  chargeValue?: number;
  mapTarget?: Point;
  status: PlanStepStatus;
  /** Waypoint step ready to fire after arrival or blocked-early completion. */
  due: boolean;
  fireReason?: "arrived" | "blocked-early";
};

export type LiveRound = {
  phase: RoundPhase;
  result: RoundResult | null;
  seed: number;
  mapId: string;
  catalog: Catalog;
  ruleset: Ruleset;
  /** Kept for replay identity (teams, map, catalog, ruleset, seed). */
  scenario: Scenario;
  /** Mutable truth. Mutated in place by `stepLive`. */
  world: World;
  queue: EventQueue<Job>;
  standing: Record<string, StandingOrder>;
  /** Accepted batches applied at the start of the NEXT step. */
  pendingBatch: PendingBatch[];
  orderLog: OrderLogEntry[];
  /** Append-only. */
  events: SimEvent[];
  nextSequence: number;
  combatState: number;
  /** Time of the most recently scheduled auto/override fire per agent. */
  lastAutoFireAtMs: Record<string, number>;
  /** Explicit shoot target per shooter; overrides nearest-enemy auto-engage. */
  shootOverride: Record<string, string | undefined>;
  nextDecisionAtMs: number;
  decide?: LiveDecideFn;
  /** False during replay so logged decisions are not regenerated. */
  enableDecide: boolean;
  /** Pre-round plan casts. Empty during plain open / replay-from-log. */
  planSteps: PlanStepState[];
};

export type OpenLiveOptions = { decide?: LiveDecideFn };

export type IssueResult =
  | { ok: true; round: LiveRound }
  | { ok: false; round: LiveRound; code: RejectionCode; message: string; orderIndex?: number };
