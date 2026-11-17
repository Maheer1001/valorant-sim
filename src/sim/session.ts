import { runScenario, type RunResult, type World } from "./run.ts";
import type { Scenario } from "./scenario/types.ts";
import { SHIPPED_CATALOG, type Catalog } from "./agents/catalog.ts";
import { STANDARD_RULESET, type Ruleset } from "../rules/ruleset.ts";

export type Session = {
  scenario: Scenario;
  outcome: RunResult;
  cursor: number;
};

export function openSession(
  scenario: Scenario,
  catalog: Catalog = SHIPPED_CATALOG,
  ruleset: Ruleset = STANDARD_RULESET,
): Session {
  return { scenario, outcome: runScenario(scenario, catalog, ruleset), cursor: 0 };
}

export function stepSession(session: Session): Session {
  if (!session.outcome.ok) return session;
  if (session.cursor >= session.outcome.events.length) return session;
  return { ...session, cursor: session.cursor + 1 };
}

export function snapshotAt(session: Session): World | null {
  if (!session.outcome.ok) return null;
  if (session.cursor <= 0) return session.outcome.initial;
  return session.outcome.frames[session.cursor - 1] ?? session.outcome.final;
}
