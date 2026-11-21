import type { LiveRound } from "./types.ts";

/* Plan-step bookkeeping helpers (no order issuing; see plan-fire.ts). */

export function markUnfiredPlanSteps(round: LiveRound): void {
  for (const step of round.planSteps) {
    if (step.status === "armed") {
      step.status = "not-reached";
      step.due = false;
    }
  }
}

export function cancelWaypointPlans(round: LiveRound, instanceId: string): void {
  for (const step of round.planSteps) {
    if (step.status !== "armed") continue;
    if (step.instanceId !== instanceId) continue;
    if (step.trigger.kind === "at-waypoint") {
      step.status = "cancelled";
      step.due = false;
    }
  }
}

export function cancelAbilityPlans(round: LiveRound, instanceId: string, abilityId: string): void {
  for (const step of round.planSteps) {
    if (step.status !== "armed") continue;
    if (step.instanceId !== instanceId) continue;
    if (step.abilityId === abilityId) {
      step.status = "cancelled";
      step.due = false;
    }
  }
}

export function markWaypointReached(
  round: LiveRound,
  instanceId: string,
  waypointIndex: number,
  reason: "arrived" | "blocked-early",
): void {
  for (const step of round.planSteps) {
    if (step.status !== "armed") continue;
    if (step.instanceId !== instanceId) continue;
    if (step.trigger.kind !== "at-waypoint") continue;
    if (reason === "blocked-early") {
      if (step.trigger.waypointIndex >= waypointIndex) {
        step.due = true;
        step.fireReason = "blocked-early";
      }
    } else if (step.trigger.waypointIndex === waypointIndex) {
      step.due = true;
      step.fireReason = "arrived";
    }
  }
}
