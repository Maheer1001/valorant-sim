import type { Point } from "../../types.ts";

/** Breach follow-up jobs (types only; moved verbatim from run.ts in stage H0). */
export type BreachJob =
  | { type: "aftershock-burst"; instanceId: string; yawDeg: number; burstIndex: number }
  | { type: "flashpoint-impact"; instanceId: string; impact: Point; yawDeg: number }
  | { type: "fault-line-wave"; instanceId: string; yawDeg: number; lengthMm: number }
  | { type: "rolling-thunder-blast"; instanceId: string; yawDeg: number; blastIndex: number };
