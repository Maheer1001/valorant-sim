/**
 * Information a future opponent may use. Milestone 1 does not build this
 * context and does not choose actions. The runner executes scenario orders.
 */
export const DECISION_CONTEXT_VERSION = 1;

export type BeliefSnapshot = {
  visibleEnemyInstanceIds: readonly string[];
};

export type DecisionContext = {
  version: typeof DECISION_CONTEXT_VERSION;
  timeMs: number;
  selfInstanceId: string;
  rulesetId: string;
  catalogVersion: string;
  beliefs: BeliefSnapshot;
};

/** A future planner emits these. Milestone 1 does not. */
export type ActionIntent = {
  instanceId: string;
  abilityId: string | null;
};
