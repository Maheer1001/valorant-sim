import { getAgent, type Catalog } from "../../sim/agents/catalog.ts";
import { activeStatuses } from "../../sim/effects/status.ts";
import type { AgentBody } from "../../sim/run.ts";
import { castGate, cooldownRemainingMs } from "./abilityUi.ts";
import { abilityHotkeyMap, type AbilityHotkey } from "./hotkeys.ts";

const HOTKEY_ORDER: AbilityHotkey[] = ["C", "Q", "E", "X"];

export function AttackerHud({
  attackers,
  catalog,
  timeMs,
  selectedIds,
  armedAbilityId,
  onSelect,
  onArm,
}: {
  attackers: readonly AgentBody[];
  catalog: Catalog;
  timeMs: number;
  selectedIds: readonly string[];
  armedAbilityId: string | null;
  onSelect: (instanceId: string) => void;
  onArm: (instanceId: string, abilityId: string) => void;
}) {
  return (
    <div className="attacker-hud" aria-label="Attacker HUD">
      {attackers.map((agent, index) => {
        const definition = getAgent(catalog, agent.definitionId);
        const selected = selectedIds.includes(agent.instanceId);
        const statuses = activeStatuses(agent, timeMs);
        const hotkeys = abilityHotkeyMap(definition);
        return (
          <article
            key={agent.instanceId}
            className={`hud-card${selected ? " selected" : ""}`}
            aria-label={`${definition?.name ?? agent.definitionId} HUD`}
            aria-pressed={selected}
            onClick={() => onSelect(agent.instanceId)}
          >
            <header className="hud-card-head">
              <span className="hud-index">{index + 1}</span>
              <div>
                <strong>{definition?.name ?? agent.definitionId}</strong>
                <span className="hud-role">{definition?.role ?? ""}</span>
              </div>
              <span className="hud-ult">
                {agent.ultimatePoints}/8
              </span>
            </header>
            <div className="hud-hp" aria-label={`${definition?.name ?? agent.definitionId} HP`}>
              <div className="hud-hp-fill" style={{ width: `${Math.max(0, Math.min(100, agent.hp))}%` }} />
            </div>
            {statuses.length > 0 ? (
              <div className="hud-statuses">
                {statuses.map((status) => (
                  <span key={`${status.id}-${status.sourceAbilityId}`} className="badge">
                    {status.id} {Math.max(0, Math.ceil((status.untilMs - timeMs) / 1000))}s
                  </span>
                ))}
              </div>
            ) : null}
            <div className="hud-abilities">
              {HOTKEY_ORDER.map((key) => {
                const ability = hotkeys[key];
                if (!ability) {
                  return (
                    <button key={key} type="button" disabled title="No ability in this slot">
                      {key}
                    </button>
                  );
                }
                const gate = castGate(agent, ability, timeMs);
                const charges =
                  ability.maxCharges === null
                    ? `${agent.ultimatePoints}/8`
                    : `${agent.charges[ability.id] ?? 0}/${ability.maxCharges}`;
                const cd = cooldownRemainingMs(agent, ability.id, timeMs);
                const title = gate.ok
                  ? `${ability.name} · ${charges}${cd > 0 ? ` · CD ${(cd / 1000).toFixed(1)}s` : ""}`
                  : gate.reason;
                const pressed =
                  selected && armedAbilityId === ability.id && selectedIds[0] === agent.instanceId;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={`Cast ${ability.name}`}
                    aria-pressed={pressed}
                    disabled={!gate.ok}
                    title={title}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(agent.instanceId);
                      onArm(agent.instanceId, ability.id);
                    }}
                  >
                    <span className="hud-hotkey">{key}</span>
                    <span className="hud-ability-name">{ability.name}</span>
                    <span className="hud-ability-meta">
                      {charges}
                      {cd > 0 ? ` · ${(cd / 1000).toFixed(0)}s` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
