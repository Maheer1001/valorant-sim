import { useEffect, useMemo, useState } from "react";
import { FAULT_LINE_ID } from "../sim/agents/abilities/breach.ts";
import { getAgent, SHIPPED_CATALOG } from "../sim/agents/catalog.ts";
import { DRILL_HALL } from "../sim/map/drill-hall.ts";
import {
  isRound,
  openRound,
  resolveWindow,
  snapshotRound,
  stepRound,
  submitPlan,
  viewWorld,
  type Round,
  type WindowOrder,
} from "../sim/round.ts";
import type { AgentBody } from "../sim/run.ts";
import type { Scenario } from "../sim/scenario/types.ts";
import type { Team } from "../sim/composition/team.ts";
import type { Point, RejectionCode } from "../sim/types.ts";
import { STANDARD_RULESET } from "../rules/ruleset.ts";
import { parseScenario, ScenarioFileError, serializeScenario } from "../persistence/scenario-file.ts";
import { defenseHoldPlan } from "../tactics/defense-stub.ts";
import { MapView, type BoardPreview } from "./board/MapView.tsx";
import { pointInRange, yawDegFromPoints } from "./board/coords.ts";
import { DraftPanel } from "./draft/DraftPanel.tsx";
import { AgentPanel } from "./orders/AgentPanel.tsx";
import { castGate, castKind, completeAbilities, cooldownRemainingMs } from "./orders/abilityUi.ts";
import { rejectionMessage } from "./orders/rejectionMessages.ts";
import { createPlayableDrill } from "./scenario/playableDrill.ts";
import { EventList } from "./timeline/EventList.tsx";
import { Transport } from "./timeline/Transport.tsx";

type ClickMode = "move" | "hold" | { cast: string };

function bootRound(scenario: Scenario): Round {
  const opened = openRound(scenario);
  if (!isRound(opened)) {
    throw new Error(opened.message);
  }
  return opened;
}

export function App() {
  const [startingUlt, setStartingUlt] = useState(0);
  const [scenario, setScenario] = useState(() => createPlayableDrill(1, { startingUltPoints: 0 }));
  const [round, setRound] = useState<Round>(() => bootRound(createPlayableDrill(1)));
  const [queued, setQueued] = useState<WindowOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>("breach-attack");
  const [clickMode, setClickMode] = useState<ClickMode>("move");
  const [faultLengthM, setFaultLengthM] = useState(20);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [showTruth, setShowTruth] = useState(false);
  const [planMessage, setPlanMessage] = useState("");
  const [agentMessage, setAgentMessage] = useState("");
  const [playing, setPlaying] = useState(false);
  const [fileText, setFileText] = useState("");
  const [fileMessage, setFileMessage] = useState("");

  function commit(next: Scenario) {
    setPlaying(false);
    setScenario(next);
    setRound(bootRound(next));
    setQueued([]);
    setPlanMessage("");
    setAgentMessage("");
    const firstAttack = next.attack.members[0]?.instanceId ?? null;
    setSelectedId(firstAttack);
  }

  useEffect(() => {
    if (!playing) return;
    if (round.cursor >= round.lastWindowEvents.length) {
      setPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setRound((current) => stepRound(current));
    }, 700);
    return () => window.clearInterval(timer);
  }, [playing, round.cursor, round.lastWindowEvents.length]);

  const steppedWorld = snapshotRound(round);
  const boardWorld = showTruth ? steppedWorld : viewWorld(round.state.mapId, steppedWorld, "attack");
  const selected = round.state.agents.find((agent) => agent.instanceId === selectedId) ?? null;
  const selectedDef = selected ? getAgent(SHIPPED_CATALOG, selected.definitionId) : null;
  const abilities = completeAbilities(selectedDef);

  const events = round.lastWindowEvents;
  const canStep = round.cursor < events.length;

  const preview: BoardPreview | null = useMemo(() => {
    if (!selected || !hoverPoint) return null;
    if (typeof clickMode === "object") {
      const ability = abilities.find((item) => item.id === clickMode.cast);
      if (!ability) return null;
      const kind = castKind(ability.id);
      if (kind === "map-targeted") {
        return {
          rangeOrigin: { xMm: selected.xMm, yMm: selected.yMm },
          rangeMm: ability.maxRangeMm ?? undefined,
          previewCenter: hoverPoint,
          previewRadiusMm: ability.radiusMm ?? undefined,
        };
      }
      if (kind === "aimed") {
        return {
          aimFrom: { xMm: selected.xMm, yMm: selected.yMm },
          aimTo: hoverPoint,
          previewCenter: ability.radiusMm != null ? hoverPoint : undefined,
          previewRadiusMm: ability.radiusMm ?? undefined,
        };
      }
    }
    return { aimFrom: { xMm: selected.xMm, yMm: selected.yMm }, aimTo: hoverPoint };
  }, [abilities, clickMode, hoverPoint, selected]);

  function onTeams(attack: Team, defense: Team) {
    commit({ ...scenario, attack, defense });
  }

  function onAgentClick(instanceId: string) {
    const agent = round.state.agents.find((item) => item.instanceId === instanceId);
    if (!agent || agent.side !== "attack") return;
    setSelectedId(instanceId);
    setPlanMessage(`Selected ${instanceId}.`);
  }

  function replaceOrdersFor(instanceId: string, order: WindowOrder) {
    setQueued((current) => [
      ...current.filter((item) => item.instanceId !== instanceId),
      order,
    ]);
  }

  function onPointClick(point: Point) {
    if (!selectedId || !selected) {
      setPlanMessage("Select an attacker first.");
      return;
    }
    if (clickMode === "hold") {
      replaceOrdersFor(selectedId, { kind: "hold", instanceId: selectedId });
      setPlanMessage(`Queued hold for ${selectedId}.`);
      return;
    }
    if (clickMode === "move") {
      replaceOrdersFor(selectedId, { kind: "move", instanceId: selectedId, to: point });
      setPlanMessage(`Queued move for ${selectedId} to ${point.xMm},${point.yMm}.`);
      return;
    }
    const ability = abilities.find((item) => item.id === clickMode.cast);
    if (!ability) {
      setPlanMessage("Pick a complete ability first.");
      return;
    }
    const gate = castGate(selected, ability, round.state.timeMs);
    if (!gate.ok) {
      setPlanMessage(gate.reason);
      return;
    }
    const kind = castKind(ability.id);
    if (kind === "map-targeted") {
      const range = ability.maxRangeMm ?? 0;
      if (!pointInRange({ xMm: selected.xMm, yMm: selected.yMm }, point, range)) {
        setPlanMessage(
          `Out of range: ${ability.name} reaches ${(range / 1000).toFixed(0)} m from the caster.`,
        );
        return;
      }
      replaceOrdersFor(selectedId, {
        kind: "cast",
        instanceId: selectedId,
        abilityId: ability.id,
        target: point,
        mapTarget: point,
      });
      setPlanMessage(`Queued ${ability.name} at ${point.xMm},${point.yMm}.`);
      return;
    }
    const yaw = yawDegFromPoints({ xMm: selected.xMm, yMm: selected.yMm }, point);
    replaceOrdersFor(selectedId, {
      kind: "cast",
      instanceId: selectedId,
      abilityId: ability.id,
      target: point,
      aimYawDeg: yaw,
      chargeValue: ability.id === FAULT_LINE_ID ? faultLengthM : undefined,
    });
    setPlanMessage(
      ability.id === FAULT_LINE_ID
        ? `Queued Fault Line aim ${yaw}° · length ${faultLengthM} m.`
        : `Queued ${ability.name} aim ${yaw}°.`,
    );
  }

  function buildAttackPlan(): WindowOrder[] {
    const byAgent = new Map<string, WindowOrder[]>();
    for (const order of queued) {
      const list = byAgent.get(order.instanceId) ?? [];
      list.push(order);
      byAgent.set(order.instanceId, list);
    }
    const orders: WindowOrder[] = [];
    for (const agent of round.state.agents) {
      if (agent.side !== "attack" || !agent.alive) continue;
      const listed = byAgent.get(agent.instanceId);
      if (!listed || listed.length === 0) {
        orders.push({ kind: "hold", instanceId: agent.instanceId });
      } else {
        orders.push(...listed);
      }
    }
    return orders;
  }

  function onResolveWindow() {
    setPlaying(false);
    let next = round;
    const attackPlan = buildAttackPlan();
    const attackResult = submitPlan(next, "attack", attackPlan);
    if (!attackResult.ok) {
      setPlanMessage(rejectionMessage(attackResult.code as RejectionCode));
      return;
    }
    next = attackResult.round;
    const defenseResult = submitPlan(next, "defense", defenseHoldPlan(next));
    if (!defenseResult.ok) {
      setPlanMessage(rejectionMessage(defenseResult.code as RejectionCode));
      return;
    }
    next = defenseResult.round;
    const resolved = resolveWindow(next);
    if (!resolved.ok) {
      setPlanMessage(rejectionMessage(resolved.code as RejectionCode));
      return;
    }
    setRound(resolved.round);
    setQueued([]);
    setPlanMessage(
      `Resolved window ${resolved.state.windowIndex}. ${resolved.events.length} events. Assumed window ${STANDARD_RULESET.windowMs} ms.`,
    );
  }

  function onBuy(nextAgent: AgentBody, note: string) {
    setAgentMessage(note);
    setRound((current) => ({
      ...current,
      state: {
        ...current.state,
        agents: current.state.agents.map((agent) =>
          agent.instanceId === nextAgent.instanceId ? structuredClone(nextAgent) : agent,
        ),
      },
    }));
  }

  return (
    <div className="app">
      <header className="masthead">
        <h1>Tactical Simulation Lab</h1>
        <p>
          Drill Hall playable round · Catalog {SHIPPED_CATALOG.version}. Breach and Brimstone are fully executable.
          Walk speed, auto-fire, and the {STANDARD_RULESET.windowMs} ms window are assumed.
        </p>
      </header>
      <section className="board">
        <h2>{DRILL_HALL.name}</h2>
        <MapView
          map={DRILL_HALL}
          world={boardWorld}
          selectedInstanceId={selectedId}
          preview={preview}
          onAgentClick={onAgentClick}
          onPointClick={onPointClick}
          onHoverPoint={setHoverPoint}
        />
        <p className="footnote">{DRILL_HALL.notes}</p>
        <div className="team-actions" aria-label="Order modes">
          <button type="button" aria-pressed={clickMode === "move"} onClick={() => setClickMode("move")}>
            Move
          </button>
          <button
            type="button"
            aria-pressed={clickMode === "hold"}
            onClick={() => {
              setClickMode("hold");
              if (selectedId) {
                replaceOrdersFor(selectedId, { kind: "hold", instanceId: selectedId });
                setPlanMessage(`Queued hold for ${selectedId}.`);
              }
            }}
          >
            Hold
          </button>
          {abilities.map((ability) => {
            const gate = selected ? castGate(selected, ability, round.state.timeMs) : { ok: false as const, code: "unknown-agent" as const, reason: "Select an attacker." };
            const charges =
              ability.maxCharges === null
                ? `${selected?.ultimatePoints ?? 0}/8 ult`
                : `${selected?.charges[ability.id] ?? 0}/${ability.maxCharges}`;
            const cd = selected ? cooldownRemainingMs(selected, ability.id, round.state.timeMs) : 0;
            const title = gate.ok
              ? `${ability.name} · ${charges}${cd > 0 ? ` · CD ${(cd / 1000).toFixed(1)}s` : ""}`
              : gate.reason;
            return (
              <button
                key={ability.id}
                type="button"
                aria-label={`Cast ${ability.name}`}
                aria-pressed={typeof clickMode === "object" && clickMode.cast === ability.id}
                disabled={!gate.ok}
                title={title}
                onClick={() => setClickMode({ cast: ability.id })}
              >
                {ability.name} ({charges}
                {cd > 0 ? ` · ${(cd / 1000).toFixed(0)}s` : ""})
              </button>
            );
          })}
          <button type="button" onClick={onResolveWindow}>
            Resolve window
          </button>
          <button type="button" aria-pressed={showTruth} onClick={() => setShowTruth((value) => !value)}>
            {showTruth ? "Showing truth" : "Showing attack view"}
          </button>
          <button type="button" onClick={() => setQueued([])}>
            Clear queued orders
          </button>
        </div>
        {typeof clickMode === "object" && clickMode.cast === FAULT_LINE_ID ? (
          <label className="fault-slider">
            Fault Line length {faultLengthM} m
            <input
              type="range"
              min={8}
              max={56}
              value={faultLengthM}
              aria-label="Fault Line charge length"
              onChange={(event) => setFaultLengthM(Number(event.target.value))}
            />
          </label>
        ) : null}
        <label className="drill-option">
          Drill option, assumed — starting ult points
          <input
            type="number"
            min={0}
            max={8}
            value={startingUlt}
            aria-label="Starting ult points"
            onChange={(event) => {
              const value = Math.max(0, Math.min(8, Number(event.target.value) || 0));
              setStartingUlt(value);
              commit(createPlayableDrill(scenario.seed, { startingUltPoints: value }));
            }}
          />
        </label>
        <p className="message" role="status">
          Window {round.state.windowIndex} · t={round.state.timeMs} ms · queued {queued.length}. {planMessage}
        </p>
        {queued.length > 0 ? (
          <ul className="queue-list" aria-label="Queued attack orders">
            {queued.map((order, index) => (
              <li key={`${order.kind}-${order.instanceId}-${index}`}>
                {describeQueued(order)}
              </li>
            ))}
          </ul>
        ) : null}
        <AgentPanel
          agent={selected}
          catalog={SHIPPED_CATALOG}
          timeMs={round.state.timeMs}
          onBuy={onBuy}
          message={agentMessage}
        />
      </section>
      <aside className="draft">
        <DraftPanel
          catalog={SHIPPED_CATALOG}
          ruleset={STANDARD_RULESET}
          map={DRILL_HALL}
          attack={scenario.attack}
          defense={scenario.defense}
          onTeams={onTeams}
        />
      </aside>
      <section className="timeline">
        <h2>Window timeline</h2>
        <Transport
          seed={scenario.seed}
          cursor={round.cursor}
          total={events.length}
          playing={playing}
          canStep={canStep}
          onSeed={(seed) => commit({ ...scenario, seed })}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onStep={() => setRound((current) => stepRound(current))}
        />
        <EventList events={events} cursor={round.cursor} />
        <div className="team-actions">
          <button
            type="button"
            onClick={() => {
              setFileText(serializeScenario(scenario));
              setFileMessage("");
            }}
          >
            Export scenario
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                commit(parseScenario(fileText));
                setFileMessage("Scenario loaded.");
              } catch (error) {
                const message = error instanceof ScenarioFileError ? error.message : "Could not load that scenario.";
                setFileMessage(message);
              }
            }}
          >
            Import scenario
          </button>
        </div>
        <label>
          Scenario JSON
          <textarea
            className="file-box"
            aria-label="Scenario JSON"
            value={fileText}
            onChange={(event) => setFileText(event.target.value)}
          />
        </label>
        <p className="message" role="status">
          {fileMessage}
        </p>
      </section>
    </div>
  );
}

function describeQueued(order: WindowOrder): string {
  if (order.kind === "move") {
    return `${order.instanceId} move to ${order.to.xMm},${order.to.yMm}`;
  }
  if (order.kind === "cast") {
    const extras = [
      order.aimYawDeg != null ? `yaw ${order.aimYawDeg}` : null,
      order.chargeValue != null ? `length ${order.chargeValue} m` : null,
      order.mapTarget ? `map ${order.mapTarget.xMm},${order.mapTarget.yMm}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return `${order.instanceId} cast ${order.abilityId}${extras ? ` (${extras})` : ""}`;
  }
  if (order.kind === "shoot") {
    return `${order.instanceId} shoot ${order.targetInstanceId}`;
  }
  return `${order.instanceId} hold`;
}
