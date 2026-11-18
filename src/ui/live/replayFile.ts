import type { OrderLogEntry } from "../../sim/live-round.ts";
import type { PreRoundPlan } from "../../sim/preround.ts";
import type { Scenario } from "../../sim/scenario/types.ts";

/** Current write version. Parsers also accept version 1. */
export const REPLAY_FILE_VERSION = 2;

export type ReplayFile = {
  version: 1 | 2;
  scenario: Scenario;
  seed: number;
  orderLog: OrderLogEntry[];
  simTimeMs: number;
  /**
   * Optional audit copy of the pre-round plan. Never used to drive replay
   * (D1): loading always replays orderLog only against the stored scenario.
   */
  preRoundPlan?: PreRoundPlan;
};

export function serializeReplay(file: ReplayFile): string {
  const out: ReplayFile = {
    version: REPLAY_FILE_VERSION,
    scenario: file.scenario,
    seed: file.seed,
    orderLog: file.orderLog,
    simTimeMs: file.simTimeMs,
  };
  if (file.preRoundPlan !== undefined) {
    out.preRoundPlan = file.preRoundPlan;
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

export function parseReplay(text: string): ReplayFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Replay JSON could not be parsed.");
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("Replay file must be an object.");
  }
  const file = raw as Partial<ReplayFile>;
  if (file.version !== 1 && file.version !== 2) {
    throw new Error(`Unsupported replay version ${String(file.version)}.`);
  }
  if (!file.scenario || typeof file.seed !== "number" || !Array.isArray(file.orderLog)) {
    throw new Error("Replay file is missing scenario, seed, or orderLog.");
  }
  if (typeof file.simTimeMs !== "number" || !Number.isInteger(file.simTimeMs) || file.simTimeMs < 0) {
    throw new Error("Replay simTimeMs must be a non-negative integer.");
  }
  const parsed: ReplayFile = {
    version: file.version,
    scenario: file.scenario,
    seed: file.seed,
    orderLog: file.orderLog,
    simTimeMs: file.simTimeMs,
  };
  if (file.preRoundPlan !== undefined) {
    parsed.preRoundPlan = file.preRoundPlan;
  }
  return parsed;
}
