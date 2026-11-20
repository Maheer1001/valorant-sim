import { evaluateCast } from "./agents/cast.ts";
import { getAgent, SHIPPED_CATALOG, type Catalog } from "./agents/catalog.ts";
import { RIFLE_A } from "./combat/assumed-rifle.ts";
import { EventQueue } from "./clock.ts";
import { compositionViolation } from "./composition/team.ts";
import {
  hasStatus,
  STATUS_BLIND,
  STATUS_CONCUSS,
  STATUS_HASTE,
  statusModifier,
  yawToward,
} from "./effects/status.ts";
import { getMap } from "./map/drill-hall.ts";
import { clipSegment, distanceMm } from "./map/geometry.ts";
import { hasLineOfSight } from "./map/line-of-sight.ts";
import { forkSeed, resumeStream, type Rng } from "./rng.ts";
import { viewWorld } from "./fog.ts";
import type { Scenario } from "./scenario/types.ts";
import type { Point, RejectionCode, Segment, Side } from "./types.ts";
import { STANDARD_RULESET, type Ruleset } from "../rules/ruleset.ts";
import {
  applyJob,
  autoFireIntervalFor,
  createWorld,
  findAgent,
  lerpPoint,
  type AgentBody,
  type Job,
  type RoundResult,
  type SimEvent,
  type World,
} from "./run.ts";

export type { RoundResult } from "./run.ts";

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

export type AgentCommand =
  | { kind: "hold"; instanceId: string }
  | { kind: "move-route"; instanceId: string; waypoints: Point[] }
  | {
      kind: "cast";
      instanceId: string;
      abilityId: string;
      target: Point;
      aimYawDeg?: number;
      chargeValue?: number;
      mapTarget?: Point;
    }
  | { kind: "shoot"; instanceId: string; targetInstanceId: string };

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

export function isLiveRound(value: LiveRound | PlanFailure): value is LiveRound {
  return "phase" in value;
}

/** Validates scenario, catalog, map and composition; builds a live round at t=0 with every agent holding. */
export function openLiveRound(
  scenario: Scenario,
  catalog: Catalog = SHIPPED_CATALOG,
  ruleset: Ruleset = STANDARD_RULESET,
  options: OpenLiveOptions = {},
): LiveRound | PlanFailure {
  if (scenario.rulesetId !== ruleset.id) {
    return { ok: false, code: "ruleset-mismatch", message: "Scenario ruleset does not match the active ruleset." };
  }
  if (scenario.catalogVersion !== catalog.version) {
    return { ok: false, code: "catalog-mismatch", message: "Scenario catalog version does not match the loaded catalog." };
  }
  const map = getMap(scenario.mapId);
  if (!map) {
    return { ok: false, code: "unknown-map", message: "Scenario map is not loaded." };
  }
  for (const member of [...scenario.attack.members, ...scenario.defense.members]) {
    if (!getAgent(catalog, member.definitionId)) {
      return { ok: false, code: "unknown-definition", message: `Unknown agent ${member.definitionId}.` };
    }
  }
  const violation = compositionViolation(scenario.attack, scenario.defense, ruleset);
  if (violation) {
    return { ok: false, code: violation, message: "Team composition violates the ruleset." };
  }

  const world = createWorld(scenario, ruleset);
  const standing: Record<string, StandingOrder> = {};
  const lastAutoFireAtMs: Record<string, number> = {};
  for (const agent of world.agents) {
    standing[agent.instanceId] = { kind: "hold" };
    // First auto fire lands at t=0 (next = last + interval).
    lastAutoFireAtMs[agent.instanceId] = -ruleset.autoFireIntervalMs;
  }
  return {
    phase: "live",
    result: null,
    seed: scenario.seed,
    mapId: scenario.mapId,
    catalog,
    ruleset,
    scenario,
    world,
    queue: new EventQueue<Job>(),
    standing,
    pendingBatch: [],
    orderLog: [],
    events: [],
    nextSequence: 1,
    combatState: forkSeed(scenario.seed, "combat"),
    lastAutoFireAtMs,
    shootOverride: {},
    nextDecisionAtMs: ruleset.decisionIntervalMs,
    decide: options.decide,
    enableDecide: options.decide !== undefined,
    planSteps: [],
  };
}

/** Apply any pending `issueOrders` batches at the current sim time without advancing the clock. */
export function flushPendingBatches(round: LiveRound): void {
  const map = getMap(round.mapId);
  applyPendingBatch(round, map?.walls ?? []);
}

/**
 * Validate and log a batch for one side. The whole batch is rejected if any
 * command fails (nothing changes except the log). Accepted batches apply at the
 * next step boundary. Stamped with the current (possibly frozen) sim time.
 * `origin` defaults to "live" (player / decide hook). Plan fires pass "plan".
 */
export function issueOrders(
  round: LiveRound,
  side: Side,
  commands: readonly AgentCommand[],
  options: IssueOrdersOptions = {},
): IssueResult {
  const cloned = commands.map(cloneCommand);
  const simTimeMs = round.world.timeMs;
  const origin: OrderOrigin = options.origin ?? "live";
  if (round.phase === "ended") {
    const message = "The round has ended.";
    round.orderLog.push({
      simTimeMs,
      side,
      commands: cloned,
      result: "invalid-order",
      message,
      origin,
    });
    return { ok: false, round, code: "invalid-order", message };
  }
  for (let index = 0; index < cloned.length; index += 1) {
    const command = cloned[index]!;
    const verdict = validateCommand(round, side, command);
    if (!verdict.ok) {
      const entry: OrderLogEntry = {
        simTimeMs,
        side,
        commands: cloned,
        result: verdict.code,
        message: options.message ?? verdict.message,
        origin,
      };
      round.orderLog.push(entry);
      return { ok: false, round, code: verdict.code, message: verdict.message, orderIndex: index };
    }
  }
  const accepted: OrderLogEntry = {
    simTimeMs,
    side,
    commands: cloned,
    result: "accepted",
    origin,
  };
  if (options.message !== undefined) {
    accepted.message = options.message;
  }
  round.orderLog.push(accepted);
  round.pendingBatch.push({ side, commands: cloned.map(cloneCommand), origin });
  return { ok: true, round };
}

/** Advance the live round by `nSteps` fixed steps (stops early when the round ends). */
export function stepLive(round: LiveRound, nSteps: number): LiveRound {
  if (round.phase === "ended" || nSteps <= 0) return round;
  const map = getMap(round.mapId);
  const walls: readonly Segment[] = map?.walls ?? [];
  const combat = resumeStream(round.combatState);
  try {
    for (let step = 0; step < nSteps && round.phase === "live"; step += 1) {
      stepOnce(round, walls, combat);
    }
  } finally {
    round.combatState = combat.getState();
  }
  return round;
}

function stepOnce(round: LiveRound, walls: readonly Segment[], combat: Rng): void {
  const { world, ruleset } = round;
  const prevTime = world.timeMs;
  const eventStart = round.events.length;

  // Fire plan steps due at the current committed time (at-time 0 on first step).
  fireDuePlanSteps(round, prevTime);

  // a. Apply batches issued since the last step at the current time.
  const hadBatch = round.pendingBatch.length > 0;
  applyPendingBatch(round, walls);
  if (hadBatch) {
    // Run casts/engages issued "now" before bodies move, so they see committed positions.
    round.nextSequence = drainJobsUntil(
      round.queue,
      world,
      prevTime,
      round.catalog,
      walls,
      combat,
      ruleset,
      round.nextSequence,
      round.events,
    );
  }

  // b. Next boundary, capped at the round length.
  const newTime = Math.min(prevTime + ruleset.simStepMs, ruleset.roundDurationMs);

  // c. Standing move-routes.
  for (const agent of world.agents) {
    advanceStanding(round, agent, newTime, walls);
  }

  // Plan waypoint steps marked due during movement fire at the next step start.
  // Also flush any at-time steps that become due exactly at newTime after commit below
  // by leaving them for the following step (trigger.timeMs <= world.timeMs).

  // e. Auto-engage / shoot-override fire times in (prevTime, newTime], scheduled at exact times.
  scheduleFires(round, prevTime, newTime);

  // d. Drain every job due by newTime at its exact time.
  round.nextSequence = drainJobsUntil(
    round.queue,
    world,
    newTime,
    round.catalog,
    walls,
    combat,
    ruleset,
    round.nextSequence,
    round.events,
  );

  // Keep this step's events in time order (route events and job events interleave).
  if (round.events.length - eventStart > 1) {
    const slice = round.events.splice(eventStart);
    slice.sort((a, b) => a.timeMs - b.timeMs);
    for (const event of slice) round.events.push(event);
  }

  // g. Commit time.
  world.timeMs = newTime;

  // h. Round result.
  const result = evaluateResult(round, newTime);
  if (result) {
    round.phase = "ended";
    round.result = result;
    markUnfiredPlanSteps(round);
    round.events.push({
      type: "round-ended",
      timeMs: newTime,
      sequence: round.nextSequence,
      agentId: "",
      result,
    });
    round.nextSequence += 1;
    return;
  }

  // f. Opponent decision cadence (fogged view only; logged through issueOrders).
  if (round.enableDecide && round.decide && newTime >= round.nextDecisionAtMs) {
    runDecisions(round, round.decide);
    while (round.nextDecisionAtMs <= newTime) {
      round.nextDecisionAtMs += ruleset.decisionIntervalMs;
    }
  }
}

/** Issue casts for armed plan steps that are due; only path that spends plan casts. */
function fireDuePlanSteps(round: LiveRound, atTimeMs: number): void {
  if (round.planSteps.length === 0 || round.phase !== "live") return;
  for (const step of round.planSteps) {
    if (step.status !== "armed") continue;
    let shouldFire = false;
    if (step.trigger.kind === "at-time") {
      if (step.trigger.timeMs <= atTimeMs) shouldFire = true;
    } else if (step.due) {
      shouldFire = true;
    }
    if (!shouldFire) continue;

    const command: AgentCommand = {
      kind: "cast",
      instanceId: step.instanceId,
      abilityId: step.abilityId,
      target: { ...step.target },
    };
    if (step.aimYawDeg !== undefined) command.aimYawDeg = step.aimYawDeg;
    if (step.chargeValue !== undefined) command.chargeValue = step.chargeValue;
    if (step.mapTarget !== undefined) command.mapTarget = { ...step.mapTarget };

    const issued = issueOrders(round, "attack", [command], {
      origin: "plan",
      message:
        step.fireReason === "blocked-early"
          ? "Plan cast fired after route blocked by wall."
          : undefined,
    });
    step.due = false;
    if (issued.ok) {
      step.status = "fired";
    } else {
      step.status = "rejected";
    }
  }
}

function markUnfiredPlanSteps(round: LiveRound): void {
  for (const step of round.planSteps) {
    if (step.status === "armed") {
      step.status = "not-reached";
      step.due = false;
    }
  }
}

function cancelWaypointPlans(round: LiveRound, instanceId: string): void {
  for (const step of round.planSteps) {
    if (step.status !== "armed") continue;
    if (step.instanceId !== instanceId) continue;
    if (step.trigger.kind === "at-waypoint") {
      step.status = "cancelled";
      step.due = false;
    }
  }
}

function cancelAbilityPlans(round: LiveRound, instanceId: string, abilityId: string): void {
  for (const step of round.planSteps) {
    if (step.status !== "armed") continue;
    if (step.instanceId !== instanceId) continue;
    if (step.abilityId === abilityId) {
      step.status = "cancelled";
      step.due = false;
    }
  }
}

function markWaypointReached(
  round: LiveRound,
  instanceId: string,
  waypointIndex: number,
  reason: "arrived" | "blocked-early",
): void {
  for (const step of round.planSteps) {
    if (step.status !== "armed") continue;
    if (step.instanceId !== instanceId) continue;
    if (step.trigger.kind !== "at-waypoint") continue;
    if (reason === "blocked-early") {
      if (step.trigger.waypointIndex >= waypointIndex) {
        step.due = true;
        step.fireReason = "blocked-early";
      }
    } else if (step.trigger.waypointIndex === waypointIndex) {
      step.due = true;
      step.fireReason = "arrived";
    }
  }
}

function runDecisions(round: LiveRound, decide: LiveDecideFn): void {
  // Defense is the only decided side for now.
  const side: Side = "defense";
  const fogged = viewWorld(round.mapId, round.world, side);
  // viewWorld shares agent objects with truth; hand the bot a copy.
  const safe: World = { ...fogged, agents: structuredClone(fogged.agents) };
  const commands = decide(side, safe).filter((command) => {
    if (command.kind !== "hold") return true;
    const standing = round.standing[command.instanceId];
    return standing != null && standing.kind !== "hold";
  });
  if (commands.length === 0) return;
  issueOrders(round, side, commands);
}

function evaluateResult(round: LiveRound, newTime: number): RoundResult | null {
  let attackAlive = false;
  let defenseAlive = false;
  for (const agent of round.world.agents) {
    if (!agent.alive) continue;
    if (agent.side === "attack") attackAlive = true;
    else defenseAlive = true;
  }
  if (!defenseAlive) return { kind: "defense-eliminated" };
  if (!attackAlive) return { kind: "attack-eliminated" };
  if (newTime >= round.ruleset.roundDurationMs) return { kind: "timeout", winner: "defense" };
  return null;
}

function applyPendingBatch(round: LiveRound, walls: readonly Segment[]): void {
  if (round.pendingBatch.length === 0) return;
  const batches = round.pendingBatch;
  round.pendingBatch = [];
  const now = round.world.timeMs;
  for (const batch of batches) {
    for (const command of batch.commands) {
      const agent = findAgent(round.world, command.instanceId);
      if (!agent) continue;
      if (command.kind === "hold") {
        if (agent.alive) {
          round.standing[agent.instanceId] = { kind: "hold" };
          round.shootOverride[agent.instanceId] = undefined;
          if (batch.origin === "live") {
            cancelWaypointPlans(round, agent.instanceId);
          }
        }
        continue;
      }
      if (command.kind === "move-route") {
        if (!agent.alive) continue;
        if (batch.origin === "live") {
          cancelWaypointPlans(round, agent.instanceId);
        }
        round.standing[agent.instanceId] = startSegment(
          round,
          agent,
          command.waypoints.map((point) => ({ ...point })),
          0,
          now,
          walls,
        );
        continue;
      }
      if (command.kind === "cast") {
        // D4: only live (player / decide) casts cancel untriggered plan steps.
        if (batch.origin === "live") {
          cancelAbilityPlans(round, agent.instanceId, command.abilityId);
        }
        enqueue(round, now, agent.instanceId, {
          type: "cast",
          instanceId: agent.instanceId,
          abilityId: command.abilityId,
          target: command.target,
          aimYawDeg: command.aimYawDeg,
          chargeValue: command.chargeValue,
          mapTarget: command.mapTarget,
        });
        continue;
      }
      round.shootOverride[agent.instanceId] = command.targetInstanceId;
      // Next cadence fire follows this shot.
      round.lastAutoFireAtMs[agent.instanceId] = now;
      enqueue(round, now, agent.instanceId, {
        type: "engage",
        instanceId: agent.instanceId,
        targetInstanceId: command.targetInstanceId,
        weaponId: RIFLE_A.id,
      });
    }
  }
}

function enqueue(round: LiveRound, timeMs: number, agentId: string, payload: Job): void {
  round.queue.push({ timeMs, sequence: round.nextSequence, agentId, payload });
  round.nextSequence += 1;
}

function moveSpeedFor(agent: AgentBody, timeMs: number, ruleset: Ruleset): number {
  let speed = ruleset.walkSpeedMmPerSec;
  const haste = statusModifier(agent, STATUS_HASTE, "movementSpeed", timeMs);
  if (haste != null) {
    speed = Math.round(speed * haste);
  }
  if (hasStatus(agent, STATUS_CONCUSS, timeMs)) {
    speed = Math.round((speed * ruleset.concussWalkSpeedMultiplierBp) / 10000);
  }
  return Math.max(1, speed);
}

/** Begin walking toward `waypoints[index]` from the agent's current position. Speed is fixed for the segment. */
function startSegment(
  round: LiveRound,
  agent: AgentBody,
  waypoints: Point[],
  index: number,
  startMs: number,
  walls: readonly Segment[],
): StandingOrder {
  const from = { xMm: agent.xMm, yMm: agent.yMm };
  const target = waypoints[index]!;
  if (from.xMm !== target.xMm || from.yMm !== target.yMm) {
    agent.facingDeg = yawToward(from, target);
  }
  const clip = clipSegment(from, target, walls);
  const speed = moveSpeedFor(agent, startMs, round.ruleset);
  const travelMs = Math.round((distanceMm(from, clip.point) * 1000) / speed);
  round.events.push({
    type: "move-started",
    timeMs: startMs,
    sequence: round.nextSequence,
    agentId: agent.instanceId,
    from,
    to: { ...target },
  });
  round.nextSequence += 1;
  return {
    kind: "move-route",
    waypoints,
    index,
    segmentFrom: from,
    segmentTo: clip.point,
    segmentStartMs: startMs,
    segmentArrivalMs: startMs + travelMs,
    blocked: clip.blocked,
  };
}

function advanceStanding(round: LiveRound, agent: AgentBody, newTime: number, walls: readonly Segment[]): void {
  let order = round.standing[agent.instanceId];
  if (!order || order.kind !== "move-route") return;
  if (!agent.alive) {
    round.standing[agent.instanceId] = { kind: "hold" };
    return;
  }
  while (order.kind === "move-route" && newTime >= order.segmentArrivalMs) {
    agent.xMm = order.segmentTo.xMm;
    agent.yMm = order.segmentTo.yMm;
    if (order.segmentFrom.xMm !== order.segmentTo.xMm || order.segmentFrom.yMm !== order.segmentTo.yMm) {
      agent.facingDeg = yawToward(order.segmentFrom, order.segmentTo);
    }
    round.events.push({
      type: order.blocked ? "move-blocked" : "move-arrived",
      timeMs: order.segmentArrivalMs,
      sequence: round.nextSequence,
      agentId: agent.instanceId,
      at: { ...order.segmentTo },
    });
    round.nextSequence += 1;
    const reachedIndex = order.index;
    if (order.blocked) {
      markWaypointReached(round, agent.instanceId, reachedIndex, "blocked-early");
      order = { kind: "hold" };
      break;
    }
    markWaypointReached(round, agent.instanceId, reachedIndex, "arrived");
    if (order.index + 1 >= order.waypoints.length) {
      order = { kind: "hold" };
      break;
    }
    order = startSegment(round, agent, order.waypoints, order.index + 1, order.segmentArrivalMs, walls);
  }
  round.standing[agent.instanceId] = order;
  if (order.kind === "move-route") {
    const at = standingPositionAt(order, newTime, { xMm: agent.xMm, yMm: agent.yMm });
    agent.xMm = at.xMm;
    agent.yMm = at.yMm;
  }
}

/**
 * Pure position for a standing order at `atMs`. `holdAt` is the position
 * used when the order is `hold`. Mid-segment positions use `lerpPoint`.
 */
export function standingPositionAt(order: StandingOrder, atMs: number, holdAt: Point): Point {
  if (order.kind === "hold") return { xMm: holdAt.xMm, yMm: holdAt.yMm };
  const span = order.segmentArrivalMs - order.segmentStartMs;
  if (span <= 0 || atMs >= order.segmentArrivalMs) return { ...order.segmentTo };
  if (atMs <= order.segmentStartMs) return { ...order.segmentFrom };
  const t = (atMs - order.segmentStartMs) / span;
  return lerpPoint(order.segmentFrom, order.segmentTo, t);
}

/**
 * Schedule `auto-engage` (or `engage` at the override target) at exact fire
 * times in (prevTime, newTime]. Next fire = last scheduled fire + interval.
 */
function scheduleFires(round: LiveRound, prevTime: number, newTime: number): void {
  const { world, ruleset } = round;
  const pending: { timeMs: number; agentId: string; job: Job }[] = [];

  for (const agent of world.agents) {
    if (!agent.alive) {
      round.shootOverride[agent.instanceId] = undefined;
      continue;
    }
    let targetId = round.shootOverride[agent.instanceId];
    if (targetId !== undefined) {
      const target = findAgent(world, targetId);
      if (!target || !target.alive || target.side === agent.side) {
        round.shootOverride[agent.instanceId] = undefined;
        targetId = undefined;
      }
    }
    const interval = autoFireIntervalFor(agent, newTime, ruleset);
    let last = round.lastAutoFireAtMs[agent.instanceId] ?? -ruleset.autoFireIntervalMs;
    for (;;) {
      // Never schedule into the past if the interval shrank (Combat Stim).
      const next = Math.max(last + interval, prevTime);
      if (next > newTime) break;
      pending.push({
        timeMs: next,
        agentId: agent.instanceId,
        job:
          targetId !== undefined
            ? { type: "engage", instanceId: agent.instanceId, targetInstanceId: targetId, weaponId: RIFLE_A.id }
            : { type: "auto-engage", instanceId: agent.instanceId, weaponId: RIFLE_A.id },
      });
      last = next;
    }
    round.lastAutoFireAtMs[agent.instanceId] = last;
  }

  pending.sort((a, b) => {
    if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
    if (a.agentId < b.agentId) return -1;
    if (a.agentId > b.agentId) return 1;
    return 0;
  });
  for (const item of pending) {
    enqueue(round, item.timeMs, item.agentId, item.job);
  }
}

/**
 * Pop and apply every queued job with `timeMs <= untilMs` at its exact time.
 * Mutates `world` and `events`; returns the next free sequence number.
 */
export function drainJobsUntil(
  queue: EventQueue<Job>,
  world: World,
  untilMs: number,
  catalog: Catalog,
  walls: readonly Segment[],
  combat: Rng,
  ruleset: Ruleset,
  sequence: number,
  events: SimEvent[],
): number {
  let nextSequence = sequence;
  for (;;) {
    const next = queue.peek();
    if (!next || next.timeMs > untilMs) break;
    const item = queue.pop();
    if (!item) break;
    const applied = applyJob(item.payload, item.timeMs, item.sequence, world, catalog, walls, combat, ruleset);
    world.timeMs = item.timeMs;
    events.push(applied.event);
    for (const followup of applied.followups) {
      queue.push({
        timeMs: followup.atMs,
        sequence: nextSequence,
        agentId: followup.agentId,
        payload: followup.job,
      });
      nextSequence += 1;
    }
  }
  return nextSequence;
}

/**
 * Rebuild a round from the scenario and its order log (decisions are not re-run;
 * logged bot batches are replayed like any other order).
 */
export function replayOrderLog(
  scenario: Scenario,
  log: readonly OrderLogEntry[],
  untilMs: number,
  catalog: Catalog = SHIPPED_CATALOG,
  ruleset: Ruleset = STANDARD_RULESET,
): LiveRound | PlanFailure {
  const opened = openLiveRound(scenario, catalog, ruleset);
  if (!isLiveRound(opened)) return opened;
  const round = opened;
  round.enableDecide = false;
  for (let index = 0; index < log.length; index += 1) {
    const entry = log[index]!;
    while (round.phase === "live" && round.world.timeMs < entry.simTimeMs) {
      stepLive(round, 1);
    }
    const issued = issueOrders(round, entry.side, entry.commands, {
      origin: entry.origin ?? "live",
      message: entry.message,
    });
    const result = issued.ok ? "accepted" : issued.code;
    if (result !== entry.result) {
      return {
        ok: false,
        code: "invalid-order",
        message: `Replay diverged at log entry ${index}: expected ${entry.result}, got ${result}.`,
        orderIndex: index,
      };
    }
  }
  while (round.phase === "live" && round.world.timeMs < untilMs) {
    const remaining = Math.ceil((untilMs - round.world.timeMs) / ruleset.simStepMs);
    stepLive(round, remaining);
  }
  return round;
}

/** Fog-of-war view for one side (copy; safe for hosts and bots to mutate). */
export function viewLive(round: LiveRound, side: Side): World {
  const view = viewWorld(round.mapId, round.world, side);
  return { ...view, agents: structuredClone(view.agents) };
}

/** Deep copy of current truth (tests, debug overlays). */
export function truthLiveWorld(round: LiveRound): World {
  return structuredClone(round.world);
}

function validateCommand(
  round: LiveRound,
  side: Side,
  command: AgentCommand,
): { ok: true } | { ok: false; code: RejectionCode; message: string } {
  const world = round.world;
  const agent = findAgent(world, command.instanceId);
  if (!agent) {
    return { ok: false, code: "unknown-agent", message: `Unknown agent ${command.instanceId}.` };
  }
  if (agent.side !== side) {
    return { ok: false, code: "wrong-side", message: `Agent ${command.instanceId} is not on ${side}.` };
  }
  if (!agent.alive) {
    return { ok: false, code: "agent-down", message: `Agent ${command.instanceId} is down.` };
  }
  if (command.kind === "hold") {
    return { ok: true };
  }
  if (command.kind === "move-route") {
    if (command.waypoints.length === 0) {
      return { ok: false, code: "invalid-order", message: "Move route needs at least one waypoint." };
    }
    for (const point of command.waypoints) {
      if (!Number.isInteger(point.xMm) || !Number.isInteger(point.yMm)) {
        return { ok: false, code: "invalid-order", message: "Route waypoints must be integer millimeters." };
      }
    }
    return { ok: true };
  }
  if (command.kind === "cast") {
    if (command.aimYawDeg != null) {
      if (!Number.isInteger(command.aimYawDeg) || command.aimYawDeg < 0 || command.aimYawDeg > 359) {
        return { ok: false, code: "invalid-order", message: "aimYawDeg must be an integer in 0..359." };
      }
    }
    if (command.chargeValue != null && !Number.isInteger(command.chargeValue)) {
      return { ok: false, code: "invalid-order", message: "chargeValue must be an integer." };
    }
    if (command.mapTarget != null) {
      if (!Number.isInteger(command.mapTarget.xMm) || !Number.isInteger(command.mapTarget.yMm)) {
        return { ok: false, code: "invalid-order", message: "mapTarget must be integer millimeters." };
      }
    }
    const definition = getAgent(round.catalog, agent.definitionId);
    const origin = { xMm: agent.xMm, yMm: agent.yMm };
    const place = command.mapTarget ?? command.target;
    const verdict = evaluateCast(definition, toInstance(agent), command.abilityId, origin, place);
    if (!verdict.ok) {
      return { ok: false, code: verdict.code, message: `Cast rejected: ${verdict.code}.` };
    }
    return { ok: true };
  }
  const target = findAgent(world, command.targetInstanceId);
  if (!target) {
    return { ok: false, code: "unknown-agent", message: `Unknown target ${command.targetInstanceId}.` };
  }
  if (target.side === side) {
    return { ok: false, code: "target-not-enemy", message: "Shoot target must be an enemy." };
  }
  if (!target.alive) {
    return { ok: false, code: "agent-down", message: `Target ${command.targetInstanceId} is down.` };
  }
  if (hasStatus(agent, STATUS_BLIND, world.timeMs)) {
    return { ok: false, code: "target-not-visible", message: "Shooter is blinded." };
  }
  const map = getMap(round.mapId);
  if (!map) {
    return { ok: false, code: "unknown-map", message: "Scenario map is not loaded." };
  }
  if (
    !hasLineOfSight(
      { xMm: agent.xMm, yMm: agent.yMm },
      { xMm: target.xMm, yMm: target.yMm },
      map.walls,
      world.smokes,
      world.timeMs,
    )
  ) {
    return { ok: false, code: "target-not-visible", message: "Shoot target is not in line of sight." };
  }
  return { ok: true };
}

function cloneCommand(command: AgentCommand): AgentCommand {
  if (command.kind === "move-route") {
    return {
      kind: "move-route",
      instanceId: command.instanceId,
      waypoints: command.waypoints.map((point) => ({ ...point })),
    };
  }
  if (command.kind === "cast") {
    const cloned: AgentCommand = {
      kind: "cast",
      instanceId: command.instanceId,
      abilityId: command.abilityId,
      target: { ...command.target },
    };
    if (command.aimYawDeg !== undefined) cloned.aimYawDeg = command.aimYawDeg;
    if (command.chargeValue !== undefined) cloned.chargeValue = command.chargeValue;
    if (command.mapTarget !== undefined) cloned.mapTarget = { ...command.mapTarget };
    return cloned;
  }
  if (command.kind === "shoot") {
    return { kind: "shoot", instanceId: command.instanceId, targetInstanceId: command.targetInstanceId };
  }
  return { kind: "hold", instanceId: command.instanceId };
}

function toInstance(agent: AgentBody) {
  return {
    instanceId: agent.instanceId,
    definitionId: agent.definitionId,
    side: agent.side,
    assignment: null,
    xMm: agent.xMm,
    yMm: agent.yMm,
    hp: agent.hp,
    facingDeg: agent.facingDeg,
    credits: agent.credits,
    charges: agent.charges,
    cooldownReadyAtMs: { ...agent.cooldownReadyAtMs },
    ultimatePoints: agent.ultimatePoints,
    statuses: structuredClone(agent.statuses),
  };
}
