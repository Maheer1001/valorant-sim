import { evaluateCast } from "../agents/cast.ts";
import { getAgent } from "../agents/catalog.ts";
import { RIFLE_A } from "../combat/assumed-rifle.ts";
import { hasStatus, STATUS_BLIND } from "../effects/status.ts";
import { getMap } from "../map/drill-hall.ts";
import { hasLineOfSight } from "../map/line-of-sight.ts";
import type { Segment, Side } from "../types.ts";
import { findAgent, type AgentBody } from "../world.ts";
import { enqueue } from "./drain.ts";
import { cancelAbilityPlans, cancelWaypointPlans } from "./plan-steps.ts";
import { startSegment } from "./standing.ts";
import type { AgentCommand, CommandValidation } from "./command-types.ts";
import type { LiveRound, OrderOrigin } from "./types.ts";

export type { AgentCommand, CommandValidation } from "./command-types.ts";

/**
 * Per-kind behaviour of a command. `validate` runs after the common checks in
 * `validateCommand` (unknown agent, wrong side, agent down). `apply` runs from
 * `applyPendingBatch` for an existing agent. `clone` is the exact copy used for
 * the order log and pending batches.
 */
export type CommandSpec<C extends AgentCommand> = {
  validate(round: LiveRound, side: Side, agent: AgentBody, command: C): CommandValidation;
  apply(round: LiveRound, agent: AgentBody, command: C, origin: OrderOrigin, now: number, walls: readonly Segment[]): void;
  clone(command: C): C;
};

type CommandOf<K extends AgentCommand["kind"]> = Extract<AgentCommand, { kind: K }>;

export type CommandSpecTable = { [K in AgentCommand["kind"]]: CommandSpec<CommandOf<K>> };

const HOLD_SPEC: CommandSpec<CommandOf<"hold">> = {
  validate() {
    return { ok: true };
  },
  apply(round, agent, _command, origin) {
    if (agent.alive) {
      round.standing[agent.instanceId] = { kind: "hold" };
      round.shootOverride[agent.instanceId] = undefined;
      if (origin === "live") {
        cancelWaypointPlans(round, agent.instanceId);
      }
    }
  },
  clone(command) {
    return { kind: "hold", instanceId: command.instanceId };
  },
};

const MOVE_ROUTE_SPEC: CommandSpec<CommandOf<"move-route">> = {
  validate(_round, _side, _agent, command) {
    if (command.waypoints.length === 0) {
      return { ok: false, code: "invalid-order", message: "Move route needs at least one waypoint." };
    }
    for (const point of command.waypoints) {
      if (!Number.isInteger(point.xMm) || !Number.isInteger(point.yMm)) {
        return { ok: false, code: "invalid-order", message: "Route waypoints must be integer millimeters." };
      }
    }
    return { ok: true };
  },
  apply(round, agent, command, origin, now, walls) {
    if (!agent.alive) return;
    if (origin === "live") {
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
  },
  clone(command) {
    return {
      kind: "move-route",
      instanceId: command.instanceId,
      waypoints: command.waypoints.map((point) => ({ ...point })),
    };
  },
};

const CAST_SPEC: CommandSpec<CommandOf<"cast">> = {
  validate(round, _side, agent, command) {
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
  },
  apply(round, agent, command, origin, now) {
    // D4: only live (player / decide) casts cancel untriggered plan steps.
    if (origin === "live") {
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
  },
  clone(command) {
    const cloned: CommandOf<"cast"> = {
      kind: "cast",
      instanceId: command.instanceId,
      abilityId: command.abilityId,
      target: { ...command.target },
    };
    if (command.aimYawDeg !== undefined) cloned.aimYawDeg = command.aimYawDeg;
    if (command.chargeValue !== undefined) cloned.chargeValue = command.chargeValue;
    if (command.mapTarget !== undefined) cloned.mapTarget = { ...command.mapTarget };
    return cloned;
  },
};

const SHOOT_SPEC: CommandSpec<CommandOf<"shoot">> = {
  validate(round, side, agent, command) {
    const world = round.world;
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
  },
  apply(round, agent, command, _origin, now) {
    round.shootOverride[agent.instanceId] = command.targetInstanceId;
    // Next cadence fire follows this shot.
    round.lastAutoFireAtMs[agent.instanceId] = now;
    enqueue(round, now, agent.instanceId, {
      type: "engage",
      instanceId: agent.instanceId,
      targetInstanceId: command.targetInstanceId,
      weaponId: RIFLE_A.id,
    });
  },
  clone(command) {
    return { kind: "shoot", instanceId: command.instanceId, targetInstanceId: command.targetInstanceId };
  },
};

/** Explicit, central table: every AgentCommand kind must have a spec (compile-time). */
export const COMMAND_SPECS: CommandSpecTable = {
  hold: HOLD_SPEC,
  "move-route": MOVE_ROUTE_SPEC,
  cast: CAST_SPEC,
  shoot: SHOOT_SPEC,
};

export function cloneCommand(command: AgentCommand): AgentCommand {
  return (COMMAND_SPECS[command.kind] as CommandSpec<AgentCommand>).clone(command);
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
