import type { Point } from "../../types.ts";

/** Brimstone follow-up jobs (types only; moved verbatim from run.ts in stage H0). */
export type BrimstoneJob =
  | { type: "stim-beacon-pulse"; deviceId: string }
  | { type: "device-expire"; deviceId: string }
  | { type: "incendiary-detonate"; instanceId: string; at: Point; bounces: number }
  | { type: "orbital-activate"; instanceId: string; at: Point }
  | { type: "orbital-shrink"; zoneId: string; smokeId: string; radiusMm: number }
  | { type: "zone-tick"; zoneId: string }
  | { type: "zone-expire"; zoneId: string };
