import type { RejectionCode } from "../rejections.ts";
import type { Point } from "../types.ts";
import type { RoundResult } from "../world.ts";

/** Engine-owned jobs (moved verbatim from run.ts). */
export type CoreJob =
  | { type: "move"; instanceId: string; to: Point; speedMmPerSec: number }
  | {
      type: "cast";
      instanceId: string;
      abilityId: string;
      target: Point;
      aimYawDeg?: number;
      chargeValue?: number;
      mapTarget?: Point;
    }
  | { type: "engage"; instanceId: string; targetInstanceId: string; weaponId: string }
  | { type: "auto-engage"; instanceId: string; weaponId: string }
  | {
      type: "move-resolve";
      instanceId: string;
      from: Point;
      at: Point;
      startMs: number;
      blocked: boolean;
    }
  | { type: "smoke-active"; smokeId: string }
  | { type: "smoke-expire"; smokeId: string }
  | {
      type: "status-expire";
      instanceId: string;
      statusId: string;
      sourceAbilityId: string;
    };

/**
 * Every event that existed before stage H0 (moved verbatim from run.ts). Several
 * are shared by more than one kit, so they stay here; new stages add their own
 * event types in their own files.
 */
export type CoreEvent =
  | { type: "move-started"; from: Point; to: Point }
  | { type: "move-arrived"; at: Point }
  | { type: "move-blocked"; at: Point }
  | { type: "cast-accepted"; abilityId: string; target: Point; chargesRemaining: number }
  | { type: "cast-rejected"; abilityId: string; code: RejectionCode }
  | { type: "order-rejected"; orderType: string; code: RejectionCode }
  | { type: "smoke-active"; smokeId: string; xMm: number; yMm: number; radiusMm: number }
  | { type: "smoke-expired"; smokeId: string }
  | {
      type: "shot-withheld";
      targetInstanceId: string;
      reason: "no-line-of-sight" | "shooter-down" | "target-down" | "blinded";
    }
  | {
      type: "shot";
      targetInstanceId: string;
      weaponId: string;
      hitProbabilityBp: number;
      draw: number;
      hit: boolean;
      damage: number;
      targetHpAfter: number;
    }
  | {
      type: "ability-damage";
      abilityId: string;
      burstIndex: number;
      hits: { targetInstanceId: string; damage: number; targetHpAfter: number }[];
    }
  | {
      type: "flash-resolved";
      abilityId: string;
      blindedInstanceIds: string[];
      blockedInstanceIds: string[];
    }
  | {
      type: "status-wave";
      abilityId: string;
      statusId: string;
      affectedInstanceIds: string[];
      durationMs: number;
      blastIndex?: number;
    }
  | {
      type: "status-expired";
      statusId: string;
      sourceAbilityId: string;
      removed: boolean;
    }
  | { type: "stim-pulse"; deviceId: string; affectedInstanceIds: string[] }
  | { type: "device-expired"; deviceId: string }
  | { type: "incendiary-detonated"; at: Point; bounces: number; zoneId: string }
  | { type: "orbital-activated"; zoneId: string; at: Point }
  | { type: "orbital-shrink"; zoneId: string; radiusMm: number }
  | {
      type: "zone-damage";
      abilityId: string;
      zoneId: string;
      radiusMm: number;
      hits: { targetInstanceId: string; damage: number; targetHpAfter: number }[];
    }
  | { type: "zone-expired"; zoneId: string }
  | { type: "round-ended"; result: RoundResult };
