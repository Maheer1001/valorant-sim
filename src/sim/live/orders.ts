import { getMap } from "../map/drill-hall.ts";
import type { Segment, Side } from "../types.ts";
import { findAgent } from "../world.ts";
import { cloneCommand, COMMAND_SPECS, type AgentCommand, type CommandSpec } from "./commands.ts";
import type { IssueOrdersOptions, IssueResult, LiveRound, OrderLogEntry, OrderOrigin } from "./types.ts";
import { validateCommand } from "./validate.ts";

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

/**
 * Apply accepted batches at the current sim time. Per-kind behaviour lives in
 * COMMAND_SPECS[kind].apply (moved verbatim from the former if-chain).
 */
export function applyPendingBatch(round: LiveRound, walls: readonly Segment[]): void {
  if (round.pendingBatch.length === 0) return;
  const batches = round.pendingBatch;
  round.pendingBatch = [];
  const now = round.world.timeMs;
  for (const batch of batches) {
    for (const command of batch.commands) {
      const agent = findAgent(round.world, command.instanceId);
      if (!agent) continue;
      (COMMAND_SPECS[command.kind] as CommandSpec<AgentCommand>).apply(round, agent, command, batch.origin, now, walls);
    }
  }
}
