import type { AgentCommand } from "./command-types.ts";
import { issueOrders } from "./orders.ts";
import type { LiveRound } from "./types.ts";

/** Issue casts for armed plan steps that are due; only path that spends plan casts. */
export function fireDuePlanSteps(round: LiveRound, atTimeMs: number): void {
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
