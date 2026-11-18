/**
 * Information a future opponent may use. Milestone 2 exposes `view(side)` from
 * the round layer for fog-of-war beliefs. The scripted runner still does not
 * call this context. The defense stub only emits hold orders.
 *
 * Live rounds: the live decision hook `LiveDecideFn` is defined in
 * `src/sim/live-round.ts` (not here, so `src/sim` never imports `src/tactics`).
 * It receives the fogged `World` from `viewLive(round, side)` instead of a
 * `DecisionContext`, because `DecisionContext` is built per `selfInstanceId`
 * and is incomplete for team-wide commands such as holding all five agents.
 * The fogged world already carries own agents plus visible enemies. `DecisionContext`
 * and `BeliefSnapshot` remain for future per-agent planners.
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
