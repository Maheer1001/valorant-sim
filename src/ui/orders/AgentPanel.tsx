import { getAgent, type Catalog } from "../../sim/agents/catalog.ts";
import { buyCharge } from "../../sim/economy/buy.ts";
import { activeStatuses } from "../../sim/effects/status.ts";
import type { AgentBody } from "../../sim/run.ts";
import { cooldownRemainingMs, completeAbilities } from "./abilityUi.ts";
import { rejectionMessage } from "./rejectionMessages.ts";

export function AgentPanel({
  agent,
  catalog,
  timeMs,
  onBuy,
  message,
}: {
  agent: AgentBody | null;
  catalog: Catalog;
  timeMs: number;
  onBuy: (next: AgentBody, note: string) => void;
  message: string;
}) {
  if (!agent) {
    return (
      <section className="agent-panel" aria-label="Selected agent">
        <h3>Selected agent</h3>
        <p className="footnote">Select an attacker on the board.</p>
      </section>
    );
  }
  const definition = getAgent(catalog, agent.definitionId);
  const statuses = activeStatuses(agent, timeMs);
  const bought = completeAbilities(definition).filter(
    (ability) => ability.maxCharges !== null && ability.costCredits != null && ability.costCredits > 0,
  );

  return (
    <section className="agent-panel" aria-label="Selected agent">
      <h3>
        {definition?.name ?? agent.definitionId}{" "}
        <span className="badge">{agent.instanceId}</span>
      </h3>
      <ul className="agent-stats">
        <li>HP {agent.hp}{agent.alive ? "" : " (down)"}</li>
        <li>Facing {agent.facingDeg}°</li>
        <li>Credits {agent.credits}</li>
        <li>Ult points {agent.ultimatePoints}/8</li>
        {completeAbilities(definition).map((ability) => {
          const charges =
            ability.maxCharges === null ? "ult" : `${agent.charges[ability.id] ?? 0}/${ability.maxCharges}`;
          const cd = cooldownRemainingMs(agent, ability.id, timeMs);
          return (
            <li key={ability.id}>
              {ability.name}: {charges}
              {cd > 0 ? ` · CD ${(cd / 1000).toFixed(1)}s` : ""}
            </li>
          );
        })}
        {statuses.map((status) => (
          <li key={`${status.id}-${status.sourceAbilityId}`}>
            Status {status.id} · {Math.max(0, status.untilMs - timeMs)} ms left
          </li>
        ))}
      </ul>
      <div className="team-actions">
        {bought.map((ability) => (
          <button
            key={ability.id}
            type="button"
            onClick={() => {
              const result = buyCharge(agent, ability.id, catalog);
              if (!result.ok) {
                onBuy(agent, rejectionMessage(result.code));
                return;
              }
              onBuy(result.agent, `Bought ${ability.name} (−${ability.costCredits} credits).`);
            }}
          >
            Buy {ability.name} ({ability.costCredits})
          </button>
        ))}
      </div>
      <p className="message" role="status">
        {message}
      </p>
    </section>
  );
}
