import { useEffect, useState } from "react";
import { SKY_SMOKE_ID } from "../sim/agents/abilities/sky-smoke.ts";
import { SHIPPED_CATALOG } from "../sim/agents/catalog.ts";
import { DRILL_HALL } from "../sim/map/drill-hall.ts";
import { createDefaultDrill } from "../sim/scenario/default-drill.ts";
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
import type { Scenario } from "../sim/scenario/types.ts";
import type { Team } from "../sim/composition/team.ts";
import type { Point } from "../sim/types.ts";
import { STANDARD_RULESET } from "../rules/ruleset.ts";
import { parseScenario, ScenarioFileError, serializeScenario } from "../persistence/scenario-file.ts";
import { defenseHoldPlan } from "../tactics/defense-stub.ts";
import { MapView } from "./board/MapView.tsx";
import { DraftPanel } from "./draft/DraftPanel.tsx";
import { EventList } from "./timeline/EventList.tsx";
import { Transport } from "./timeline/Transport.tsx";

type ClickMode = "move" | "smoke";

function bootRound(scenario: Scenario): Round {
  const opened = openRound(scenario);
  if (!isRound(opened)) {
    throw new Error(opened.message);
  }
  return opened;
}

export function App() {
  const [scenario, setScenario] = useState(() => createDefaultDrill(1));
  const [round, setRound] = useState<Round>(() => bootRound(createDefaultDrill(1)));
  const [queued, setQueued] = useState<WindowOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>("brimstone-attack");
  const [clickMode, setClickMode] = useState<ClickMode>("move");
  const [showTruth, setShowTruth] = useState(false);
  const [planMessage, setPlanMessage] = useState("");
  const [playing, setPlaying] = useState(false);
  const [fileText, setFileText] = useState("");
  const [fileMessage, setFileMessage] = useState("");

  function commit(next: Scenario) {
    setPlaying(false);
    setScenario(next);
    setRound(bootRound(next));
    setQueued([]);
    setPlanMessage("");
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

  const events = round.lastWindowEvents;
  const canStep = round.cursor < events.length;

  function onTeams(attack: Team, defense: Team) {
    commit({ ...scenario, attack, defense });
  }

  function onAgentClick(instanceId: string) {
    const agent = round.state.agents.find((item) => item.instanceId === instanceId);
    if (!agent || agent.side !== "attack") return;
    setSelectedId(instanceId);
    setPlanMessage(`Selected ${instanceId}.`);
  }

  function onPointClick(point: Point) {
    if (!selectedId) {
      setPlanMessage("Select an attacker first.");
      return;
    }
    if (clickMode === "move") {
      setQueued((current) => [
        ...current.filter((order) => !(order.kind === "move" && order.instanceId === selectedId)),
        { kind: "move", instanceId: selectedId, to: point },
      ]);
      setPlanMessage(`Queued move for ${selectedId} to ${point.xMm},${point.yMm}.`);
      return;
    }
    setQueued((current) => [
      ...current.filter((order) => !(order.kind === "cast" && order.instanceId === selectedId)),
      {
        kind: "cast",
        instanceId: selectedId,
        abilityId: SKY_SMOKE_ID,
        target: point,
      },
    ]);
    setPlanMessage(`Queued Sky Smoke for ${selectedId} at ${point.xMm},${point.yMm}.`);
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
      setPlanMessage(attackResult.message);
      return;
    }
    next = attackResult.round;
    const defenseResult = submitPlan(next, "defense", defenseHoldPlan(next));
    if (!defenseResult.ok) {
      setPlanMessage(defenseResult.message);
      return;
    }
    next = defenseResult.round;
    const resolved = resolveWindow(next);
    if (!resolved.ok) {
      setPlanMessage(resolved.message);
      return;
    }
    setRound(resolved.round);
    setQueued([]);
    setPlanMessage(
      `Resolved window ${resolved.state.windowIndex}. ${resolved.events.length} events. Assumed window ${STANDARD_RULESET.windowMs} ms.`,
    );
  }

  return (
    <div className="app">
      <header className="masthead">
        <h1>Tactical Simulation Lab</h1>
        <p>
          Drill Hall is an original schematic. Catalog {SHIPPED_CATALOG.version}. Sky Smoke figures are secondary.
          Rifle A, walk speed, auto-fire interval, and the {STANDARD_RULESET.windowMs} ms planning window are assumed.
          Coverage describes complete abilities and does not predict a winner.
        </p>
      </header>
      <section className="board">
        <h2>{DRILL_HALL.name}</h2>
        <MapView
          map={DRILL_HALL}
          world={boardWorld}
          selectedInstanceId={selectedId}
          onAgentClick={onAgentClick}
          onPointClick={onPointClick}
        />
        <p className="footnote">{DRILL_HALL.notes}</p>
        <div className="team-actions">
          <button
            type="button"
            aria-pressed={clickMode === "move"}
            onClick={() => setClickMode("move")}
          >
            Queue move
          </button>
          <button
            type="button"
            aria-pressed={clickMode === "smoke"}
            onClick={() => setClickMode("smoke")}
          >
            Queue Sky Smoke
          </button>
          <button type="button" onClick={onResolveWindow}>
            Resolve window
          </button>
          <button
            type="button"
            aria-pressed={showTruth}
            onClick={() => setShowTruth((value) => !value)}
          >
            {showTruth ? "Showing truth" : "Showing attack view"}
          </button>
          <button type="button" onClick={() => setQueued([])}>
            Clear queued orders
          </button>
        </div>
        <p className="message" role="status">
          Window {round.state.windowIndex} · t={round.state.timeMs} ms · queued {queued.length}. {planMessage}
        </p>
        {queued.length > 0 ? (
          <ul className="queue-list" aria-label="Queued attack orders">
            {queued.map((order, index) => (
              <li key={`${order.kind}-${order.instanceId}-${index}`}>
                {order.kind === "move"
                  ? `${order.instanceId} move to ${order.to.xMm},${order.to.yMm}`
                  : order.kind === "cast"
                    ? `${order.instanceId} cast ${order.abilityId} at ${order.target.xMm},${order.target.yMm}`
                    : `${order.instanceId} ${order.kind}`}
              </li>
            ))}
          </ul>
        ) : null}
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
