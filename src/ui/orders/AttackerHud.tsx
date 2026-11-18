import { useState } from "react";
import { getAgent, type Catalog } from "../../sim/agents/catalog.ts";
import { buyCharge } from "../../sim/economy/buy.ts";
import { activeStatuses } from "../../sim/effects/status.ts";
import type { BuyLine, PlanAbility } from "../../sim/preround.ts";
import type { AgentBody } from "../../sim/run.ts";
import { castGate, cooldownRemainingMs, completeAbilities } from "./abilityUi.ts";
import { abilityHotkeyMap, type AbilityHotkey } from "./hotkeys.ts";
import { rejectionMessage } from "./rejectionMessages.ts";
import { plannedCount, triggerLabel, type AgentPlanDraft } from "../preround/planState.ts";

const HOTKEY_ORDER: AbilityHotkey[] = ["C", "Q", "E", "X"];

export type PlanStepView = PlanAbility & {
  flagged?: boolean;
  /** Live plan-step status after Go; pre-round omits. */
  status?: "armed" | "fired" | "cancelled" | "rejected" | "not-reached";
};

export function AttackerHud({
  attackers,
  catalog,
  timeMs,
  selectedIds,
  armedAbilityId,
  onSelect,
  onArm,
  mode = "live",
  drafts,
  buys = [],
  onBuyAbility,
  onRefundAbility,
  onSelectStep,
  onDeleteStep,
  onSaveStepTrigger,
  editingStepId,
}: {
  attackers: readonly AgentBody[];
  catalog: Catalog;
  timeMs: number;
  selectedIds: readonly string[];
  armedAbilityId: string | null;
  onSelect: (instanceId: string) => void;
  onArm: (instanceId: string, abilityId: string) => void;
  mode?: "live" | "pre-round";
  drafts?: Record<string, AgentPlanDraft>;
  buys?: readonly BuyLine[];
  onBuyAbility?: (instanceId: string, abilityId: string) => void;
  onRefundAbility?: (instanceId: string, abilityId: string) => void;
  onSelectStep?: (instanceId: string, stepId: string) => void;
  onDeleteStep?: (instanceId: string, stepId: string) => void;
  onSaveStepTrigger?: (
    instanceId: string,
    stepId: string,
    trigger: PlanAbility["trigger"],
  ) => void;
  editingStepId?: string | null;
}) {
  return (
    <div className="attacker-hud" aria-label="Attacker HUD">
      {attackers.map((agent, index) => {
        const definition = getAgent(catalog, agent.definitionId);
        const selected = selectedIds.includes(agent.instanceId);
        const statuses = activeStatuses(agent, timeMs);
        const hotkeys = abilityHotkeyMap(definition);
        const draft = drafts?.[agent.instanceId] ?? { route: [], abilities: [] };
        const bought = completeAbilities(definition).filter(
          (ability) =>
            ability.maxCharges !== null && ability.costCredits != null && ability.costCredits > 0,
        );
        return (
          <article
            key={agent.instanceId}
            className={`hud-card${selected ? " selected" : ""}${mode === "pre-round" ? " hud-card-preround" : ""}`}
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
                {mode === "pre-round" ? `${agent.credits}c` : `${agent.ultimatePoints}/8`}
              </span>
            </header>
            <div className="hud-hp" aria-label={`${definition?.name ?? agent.definitionId} HP`}>
              <div
                className="hud-hp-fill"
                style={{ width: `${Math.max(0, Math.min(100, agent.hp))}%` }}
              />
            </div>
            {mode === "pre-round" ? (
              <div className="hud-buy" aria-label={`${definition?.name ?? agent.definitionId} buy`}>
                {bought.map((ability) => {
                  const probe = buyCharge(agent, ability.id, catalog);
                  const have = agent.charges[ability.id] ?? 0;
                  const max = ability.maxCharges ?? 0;
                  const planned = plannedCount(draft, ability.id);
                  const canBuy = probe.ok;
                  const buyTitle = canBuy
                    ? `Buy ${ability.name} (${ability.costCredits})`
                    : rejectionMessage(probe.code);
                  const canRefund = buys.some(
                    (line) => line.instanceId === agent.instanceId && line.abilityId === ability.id,
                  );
                  return (
                    <div key={ability.id} className="hud-buy-row">
                      <span className="hud-buy-label">
                        {ability.name} {have}/{max}
                        {planned > 0 ? `, ${planned} planned` : ""}
                      </span>
                      <button
                        type="button"
                        aria-label={`Buy ${ability.name}`}
                        title={buyTitle}
                        disabled={!canBuy}
                        onClick={(event) => {
                          event.stopPropagation();
                          onBuyAbility?.(agent.instanceId, ability.id);
                        }}
                      >
                        +{ability.costCredits}
                      </button>
                      <button
                        type="button"
                        aria-label={`Refund ${ability.name}`}
                        title={canRefund ? "Remove one buy of this ability" : "No buy to refund"}
                        disabled={!canRefund}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRefundAbility?.(agent.instanceId, ability.id);
                        }}
                      >
                        -
                      </button>
                    </div>
                  );
                })}
                <p className="hud-roadmap" title="Weapons and armor are roadmap">
                  Weapons / armor (roadmap)
                </p>
              </div>
            ) : null}
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
                const planned = mode === "pre-round" ? plannedCount(draft, ability.id) : 0;
                const charges =
                  ability.maxCharges === null
                    ? `${agent.ultimatePoints}/8`
                    : `${agent.charges[ability.id] ?? 0}/${ability.maxCharges}`;
                const chargeLabel =
                  mode === "pre-round" && ability.maxCharges !== null && planned > 0
                    ? `${charges}, ${planned} planned`
                    : charges;
                const cd = cooldownRemainingMs(agent, ability.id, timeMs);
                const allowArm =
                  mode === "pre-round"
                    ? ability.maxCharges === null
                      ? agent.ultimatePoints >= 8
                      : true
                    : gate.ok;
                const title =
                  mode === "pre-round"
                    ? `${ability.name} · ${chargeLabel}`
                    : gate.ok
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
                    disabled={!allowArm || (mode === "live" && !gate.ok)}
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
                      {chargeLabel}
                      {mode === "live" && cd > 0 ? ` · ${(cd / 1000).toFixed(0)}s` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            {mode === "pre-round" ? (
              <PlanStepList
                instanceId={agent.instanceId}
                draft={draft}
                catalog={catalog}
                definitionId={agent.definitionId}
                editingStepId={editingStepId ?? null}
                onSelectStep={onSelectStep}
                onDeleteStep={onDeleteStep}
                onSaveStepTrigger={onSaveStepTrigger}
                agent={agent}
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function PlanStepList({
  instanceId,
  draft,
  catalog,
  definitionId,
  editingStepId,
  onSelectStep,
  onDeleteStep,
  onSaveStepTrigger,
  agent,
}: {
  instanceId: string;
  draft: AgentPlanDraft;
  catalog: Catalog;
  definitionId: string;
  editingStepId: string | null;
  onSelectStep?: (instanceId: string, stepId: string) => void;
  onDeleteStep?: (instanceId: string, stepId: string) => void;
  onSaveStepTrigger?: (
    instanceId: string,
    stepId: string,
    trigger: PlanAbility["trigger"],
  ) => void;
  agent: AgentBody;
}) {
  const definition = getAgent(catalog, definitionId);
  const flagged = (() => {
    const reserved: Record<string, number> = { ...agent.charges };
    const ids = new Set<string>();
    for (const ability of draft.abilities) {
      const have = reserved[ability.abilityId] ?? 0;
      if (have <= 0) ids.add(ability.id);
      else reserved[ability.abilityId] = have - 1;
    }
    return ids;
  })();

  if (draft.abilities.length === 0 && draft.route.length === 0) {
    return <p className="hud-plan-empty">No plan</p>;
  }

  return (
    <ul className="hud-plan" aria-label={`${definition?.name ?? definitionId} plan`}>
      {draft.route.length > 0 ? (
        <li className="hud-plan-route">Route {draft.route.length} wp</li>
      ) : null}
      {draft.abilities.map((step) => {
        const ability = definition?.abilities.find((item) => item.id === step.abilityId);
        const name = ability?.name ?? step.abilityId;
        const editing = editingStepId === step.id;
        const isFlagged = flagged.has(step.id);
        return (
          <li
            key={step.id}
            className={`hud-plan-step${isFlagged ? " flagged" : ""}`}
            data-testid={`plan-step-${step.id}`}
          >
            <button
              type="button"
              className="hud-plan-step-select"
              onClick={(event) => {
                event.stopPropagation();
                onSelectStep?.(instanceId, step.id);
              }}
            >
              {name} · {triggerLabel(step.trigger)}
            </button>
            <button
              type="button"
              aria-label={`Delete ${name} step`}
              className="hud-plan-step-delete"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteStep?.(instanceId, step.id);
              }}
            >
              x
            </button>
            {editing ? (
              <StepTriggerEditor
                step={step}
                routeLength={draft.route.length}
                onSave={(trigger) => onSaveStepTrigger?.(instanceId, step.id, trigger)}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function StepTriggerEditor({
  step,
  routeLength,
  onSave,
}: {
  step: PlanAbility;
  routeLength: number;
  onSave: (trigger: PlanAbility["trigger"]) => void;
}) {
  const [kind, setKind] = useState<"at-time" | "at-waypoint">(step.trigger.kind);
  const [timeSec, setTimeSec] = useState(
    step.trigger.kind === "at-time" ? (step.trigger.timeMs / 1000).toFixed(1) : "0",
  );
  const [waypointIndex, setWaypointIndex] = useState(
    step.trigger.kind === "at-waypoint"
      ? String(step.trigger.waypointIndex)
      : String(Math.max(0, routeLength - 1)),
  );

  return (
    <div
      className="hud-plan-edit"
      onClick={(event) => event.stopPropagation()}
      aria-label={`Edit trigger ${step.id}`}
    >
      <label>
        Kind
        <select
          aria-label={`Trigger kind ${step.id}`}
          value={kind}
          onChange={(event) =>
            setKind(event.target.value === "at-waypoint" ? "at-waypoint" : "at-time")
          }
        >
          <option value="at-time">Time</option>
          <option value="at-waypoint" disabled={routeLength === 0}>
            Waypoint
          </option>
        </select>
      </label>
      <label>
        Time (s)
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          aria-label={`Trigger time ${step.id}`}
          value={timeSec}
          onChange={(event) => setTimeSec(event.target.value)}
        />
      </label>
      <label>
        Waypoint
        <select
          aria-label={`Trigger waypoint ${step.id}`}
          value={waypointIndex}
          onChange={(event) => setWaypointIndex(event.target.value)}
          disabled={routeLength === 0}
        >
          {Array.from({ length: routeLength }, (_, index) => (
            <option key={index} value={index}>
              {index}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          if (kind === "at-waypoint") {
            onSave({ kind: "at-waypoint", waypointIndex: Number(waypointIndex) });
          } else {
            const sec = Math.max(0, Math.min(100, Number(timeSec) || 0));
            onSave({ kind: "at-time", timeMs: Math.round(sec * 1000) });
          }
        }}
      >
        Save
      </button>
    </div>
  );
}
