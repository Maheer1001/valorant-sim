import type { OrderLogEntry } from "../../sim/live-round.ts";
import type { Scenario } from "../../sim/scenario/types.ts";

export const REPLAY_FILE_VERSION = 1;

export type ReplayFile = {
  version: typeof REPLAY_FILE_VERSION;
  scenario: Scenario;
  seed: number;
  orderLog: OrderLogEntry[];
  simTimeMs: number;
};

export function serializeReplay(file: ReplayFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
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
  if (file.version !== REPLAY_FILE_VERSION) {
    throw new Error(`Unsupported replay version ${String(file.version)}.`);
  }
  if (!file.scenario || typeof file.seed !== "number" || !Array.isArray(file.orderLog)) {
    throw new Error("Replay file is missing scenario, seed, or orderLog.");
  }
  if (typeof file.simTimeMs !== "number" || !Number.isInteger(file.simTimeMs) || file.simTimeMs < 0) {
    throw new Error("Replay simTimeMs must be a non-negative integer.");
  }
  return {
    version: REPLAY_FILE_VERSION,
    scenario: file.scenario,
    seed: file.seed,
    orderLog: file.orderLog,
    simTimeMs: file.simTimeMs,
  };
}
