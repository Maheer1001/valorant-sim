/**
 * Information a future opponent may use. Milestone 2 exposes `view(side)` from
 * the round layer for fog-of-war beliefs. The scripted runner still does not
 * call this context. The defense stub only emits hold orders.
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

/** A future planner emits these. The defense stub does not. */
export type ActionIntent = {
  instanceId: string;
  abilityId: string | null;
};
