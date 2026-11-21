import { SHIPPED_CATALOG, type Catalog } from "../agents/catalog.ts";
import type { Scenario } from "../scenario/types.ts";
import { STANDARD_RULESET, type Ruleset } from "../../rules/ruleset.ts";
import { isLiveRound, openLiveRound } from "./open.ts";
import { issueOrders } from "./orders.ts";
import { stepLive } from "./step.ts";
import type { LiveRound, OrderLogEntry, PlanFailure } from "./types.ts";

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
