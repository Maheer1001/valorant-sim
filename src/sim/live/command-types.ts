import type { Point, RejectionCode } from "../types.ts";

/*
 * Command shapes (types only), split from commands.ts so live/types.ts can use
 * them without an import cycle. Stages add their command members here.
 */

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

export type CommandValidation = { ok: true } | { ok: false; code: RejectionCode; message: string };
