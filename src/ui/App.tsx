import { useEffect, useMemo, useRef, useState } from "react";
import { FAULT_LINE_ID } from "../sim/agents/abilities/breach.ts";
import { getAgent, SHIPPED_CATALOG } from "../sim/agents/catalog.ts";
import { describeEvent } from "../sim/describe.ts";
import {
  isLiveRound,
  issueOrders,
  openLiveRound,
  replayOrderLog,
  standingPositionAt,
  stepLive,
  viewLive,
  type LiveRound,
  type RoundResult,
} from "../sim/live-round.ts";
import { DRILL_HALL } from "../sim/map/drill-hall.ts";
import type { AgentBody } from "../sim/run.ts";
import type { Scenario } from "../sim/scenario/types.ts";
import type { Team } from "../sim/composition/team.ts";
import type { Point, RejectionCode } from "../sim/types.ts";
import { STANDARD_RULESET } from "../rules/ruleset.ts";
import { parseScenario, ScenarioFileError, serializeScenario } from "../persistence/scenario-file.ts";
import { defenseHoldDecide } from "../tactics/defense-stub.ts";
import { MapView, type AgentDisplay, type BoardPreview } from "./board/MapView.tsx";
import { pointInRange, yawDegFromPoints } from "./board/coords.ts";
import { DraftPanel } from "./draft/DraftPanel.tsx";
import {
  cycleSpeedDown,
  cycleSpeedUp,
  formatRoundTimer,
  hostLoopStep,
  type HostSpeed,
} from "./live/hostLoop.ts";
import { parseReplay, REPLAY_FILE_VERSION, serializeReplay } from "./live/replayFile.ts";
import { AgentPanel } from "./orders/AgentPanel.tsx";
import { castGate, castKind, completeAbilities, cooldownRemainingMs } from "./orders/abilityUi.ts";
import { rejectionMessage } from "./orders/rejectionMessages.ts";
import { createPlayableDrill } from "./scenario/playableDrill.ts";

type ClickMode = "move" | "hold" | { cast: string };

function bootLive(scenario: Scenario): LiveRound {
  const opened = openLiveRound(scenario, SHIPPED_CATALOG, STANDARD_RULESET, {
    decide: defenseHoldDecide,
  });
  if (!isLiveRound(opened)) {
    throw new Error(opened.message);
  }
  return opened;
}

function resultBanner(result: RoundResult): string {
  if (result.kind === "defense-eliminated") return "Attackers win — all defenders eliminated.";
  if (result.kind === "attack-eliminated") return "Defenders win — all attackers eliminated.";
  return "Defenders win — round timer expired.";
}

export function App() {
  const [startingUlt, setStartingUlt] = useState(0);
  const [scenario, setScenario] = useState(() => createPlayableDrill(1, { startingUltPoints: 0 }));
  const liveRef = useRef<LiveRound>(bootLive(createPlayableDrill(1)));
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((value) => value + 1);

  const [selectedId, setSelectedId] = useState<string | null>("breach-attack");
  const [clickMode, setClickMode] = useState<ClickMode>("move");
  const [faultLengthM, setFaultLengthM] = useState(20);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [showTruth, setShowTruth] = useState(false);
  const [planMessage, setPlanMessage] = useState("Paused — press Space to start.");
  const [agentMessage, setAgentMessage] = useState("");
  const [speed, setSpeed] = useState<HostSpeed>(0);
  const [alpha, setAlpha] = useState(0);
  const accumulatorRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const [fileText, setFileText] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const [replayText, setReplayText] = useState("");

  const live = liveRef.current;
  const paused = speed === 0;
  const remainingMs = Math.max(0, live.ruleset.roundDurationMs - live.world.timeMs);

  function commitScenario(next: Scenario) {
    setSpeed(0);
    accumulatorRef.current = 0;
    setAlpha(0);
    lastFrameRef.current = null;
    setScenario(next);
    liveRef.current = bootLive(next);
    setSelectedId(next.attack.members[0]?.instanceId ?? null);
    setPlanMessage("Paused — press Space to start.");
    setAgentMessage("");
    bump();
  }

  function newRound() {
    commitScenario(createPlayableDrill(scenario.seed, { startingUltPoints: startingUlt }));
  }

  function togglePause() {
    setSpeed((current) => {
      const next = current === 0 ? 1 : 0;
      setPlanMessage(next === 0 ? "Paused." : "Running.");
      return next;
    });
  }

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const previous = lastFrameRef.current;
      lastFrameRef.current = now;
      if (previous != null && liveRef.current.phase === "live") {
        const elapsedMs = now - previous;
        const out = hostLoopStep({
          elapsedMs,
          speed,
          accumulator: accumulatorRef.current,
          simStepMs: liveRef.current.ruleset.simStepMs,
        });
        accumulatorRef.current = out.accumulator;
        setAlpha(out.alpha);
        if (out.steps > 0) {
          stepLive(liveRef.current, out.steps);
          bump();
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [speed]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        togglePause();
        return;
      }
      if (event.key === "]") {
        setSpeed((current) => cycleSpeedUp(current === 0 ? 1 : current));
        return;
      }
      if (event.key === "[") {
        setSpeed((current) => (current === 0 ? 0.5 : cycleSpeedDown(current)));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const boardWorld = useMemo(() => {
    void version;
    return showTruth ? live.world : viewLive(live, "attack");
  }, [live, showTruth, version]);

  const selected =
    live.world.agents.find((agent) => agent.instanceId === selectedId) ?? null;
  const selectedDef = selected ? getAgent(SHIPPED_CATALOG, selected.definitionId) : null;
  const abilities = completeAbilities(selectedDef);

  const agentDisplay = useMemo(() => {
    void version;
    const display: Record<string, AgentDisplay> = {};
    const renderTime = live.world.timeMs + alpha * live.ruleset.simStepMs;
    for (const agent of boardWorld.agents) {
      const truth = live.world.agents.find((item) => item.instanceId === agent.instanceId);
      if (!truth) continue;
      const order = live.standing[agent.instanceId] ?? { kind: "hold" as const };
      const at = standingPositionAt(order, renderTime, { xMm: truth.xMm, yMm: truth.yMm });
      display[agent.instanceId] = {
        xMm: at.xMm,
        yMm: at.yMm,
        facingDeg: truth.facingDeg,
      };
    }
    return display;
  }, [alpha, boardWorld.agents, live, version]);

  const preview: BoardPreview | null = useMemo(() => {
    if (!selected || !hoverPoint) return null;
    const origin = agentDisplay[selected.instanceId] ?? {
      xMm: selected.xMm,
      yMm: selected.yMm,
      facingDeg: selected.facingDeg,
    };
    if (typeof clickMode === "object") {
      const ability = abilities.find((item) => item.id === clickMode.cast);
      if (!ability) return null;
      const kind = castKind(ability.id);
      if (kind === "map-targeted") {
        return {
          rangeOrigin: { xMm: origin.xMm, yMm: origin.yMm },
          rangeMm: ability.maxRangeMm ?? undefined,
          previewCenter: hoverPoint,
          previewRadiusMm: ability.radiusMm ?? undefined,
        };
      }
      if (kind === "aimed") {
        return {
          aimFrom: { xMm: origin.xMm, yMm: origin.yMm },
          aimTo: hoverPoint,
          previewCenter: ability.radiusMm != null ? hoverPoint : undefined,
          previewRadiusMm: ability.radiusMm ?? undefined,
        };
      }
    }
    return { aimFrom: { xMm: origin.xMm, yMm: origin.yMm }, aimTo: hoverPoint };
  }, [abilities, agentDisplay, clickMode, hoverPoint, selected]);

  const recentEvents = useMemo(() => {
    void version;
    return live.events.slice(-30).reverse();
  }, [live.events, version]);

  function onTeams(attack: Team, defense: Team) {
    commitScenario({ ...scenario, attack, defense });
  }

  function onAgentClick(instanceId: string) {
    const agent = live.world.agents.find((item) => item.instanceId === instanceId);
    if (!agent || agent.side !== "attack") return;
    setSelectedId(instanceId);
    setPlanMessage(`Selected ${instanceId}.`);
  }

  function applyCommands(
    side: "attack" | "defense",
    commands: Parameters<typeof issueOrders>[2],
    okMessage: string,
  ) {
    const result = issueOrders(liveRef.current, side, commands);
    if (!result.ok) {
      setPlanMessage(rejectionMessage(result.code as RejectionCode));
      bump();
      return false;
    }
    setPlanMessage(okMessage);
    bump();
    return true;
  }

  function issueMove(point: Point) {
    if (!selectedId || !selected) {
      setPlanMessage("Select an attacker first.");
      return;
    }
    applyCommands(
      "attack",
      [{ kind: "move-route", instanceId: selectedId, waypoints: [point] }],
      `Move ${selectedId} to ${point.xMm},${point.yMm}.`,
    );
  }

  function onPointClick(point: Point) {
    if (!selectedId || !selected) {
      setPlanMessage("Select an attacker first.");
      return;
    }
    if (clickMode === "hold") {
      applyCommands("attack", [{ kind: "hold", instanceId: selectedId }], `Hold ${selectedId}.`);
      return;
    }
    if (clickMode === "move") {
      issueMove(point);
      return;
    }
    const ability = abilities.find((item) => item.id === clickMode.cast);
    if (!ability) {
      setPlanMessage("Pick a complete ability first.");
      return;
    }
    const gate = castGate(selected, ability, live.world.timeMs);
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
      applyCommands(
        "attack",
        [
          {
            kind: "cast",
            instanceId: selectedId,
            abilityId: ability.id,
            target: point,
            mapTarget: point,
          },
        ],
        `${ability.name} at ${point.xMm},${point.yMm}.`,
      );
      return;
    }
    const yaw = yawDegFromPoints({ xMm: selected.xMm, yMm: selected.yMm }, point);
    applyCommands(
      "attack",
      [
        {
          kind: "cast",
          instanceId: selectedId,
          abilityId: ability.id,
          target: point,
          aimYawDeg: yaw,
          chargeValue: ability.id === FAULT_LINE_ID ? faultLengthM : undefined,
        },
      ],
      ability.id === FAULT_LINE_ID
        ? `Fault Line aim ${yaw}° · length ${faultLengthM} m.`
        : `${ability.name} aim ${yaw}°.`,
    );
  }

  function onBuy(nextAgent: AgentBody, note: string) {
    setAgentMessage(note);
    const agent = liveRef.current.world.agents.find((item) => item.instanceId === nextAgent.instanceId);
    if (agent) {
      agent.credits = nextAgent.credits;
      agent.charges = { ...nextAgent.charges };
    }
    bump();
  }

  function downloadReplay() {
    const file = serializeReplay({
      version: REPLAY_FILE_VERSION,
      scenario,
      seed: scenario.seed,
      orderLog: structuredClone(liveRef.current.orderLog),
      simTimeMs: liveRef.current.world.timeMs,
    });
    setReplayText(file);
    setFileMessage("Replay JSON ready below (copy or save).");
  }

  function loadReplay() {
    try {
      const file = parseReplay(replayText);
      setSpeed(0);
      accumulatorRef.current = 0;
      setAlpha(0);
      setScenario(file.scenario);
      const replayed = replayOrderLog(file.scenario, file.orderLog, file.simTimeMs);
      if (!isLiveRound(replayed)) {
        setFileMessage(replayed.message);
        return;
      }
      liveRef.current = replayed;
      liveRef.current.enableDecide = true;
      liveRef.current.decide = defenseHoldDecide;
      setSelectedId(file.scenario.attack.members[0]?.instanceId ?? null);
      setPlanMessage(`Replay loaded at t=${file.simTimeMs} ms (paused).`);
      bump();
      setFileMessage("Replay loaded.");
    } catch (error) {
      setFileMessage(error instanceof Error ? error.message : "Could not load that replay.");
    }
  }

  return (
    <div className="app">
      <header className="masthead">
        <h1>Tactical Simulation Lab</h1>
        <p>
          Live Drill Hall round · Catalog {SHIPPED_CATALOG.version}. Starts paused — Space to run.
          Walk speed, auto-fire, and sim step {STANDARD_RULESET.simStepMs} ms are assumed. Round timer is
          owner-specified.
        </p>
      </header>
      <section className="board">
        <div className="live-hud">
          <h2>{DRILL_HALL.name}</h2>
          <div className="timer" aria-label="Round timer">
            {formatRoundTimer(remainingMs)}
          </div>
          {paused ? (
            <span className="badge paused-badge" role="status">
              Paused — press Space to start
            </span>
          ) : (
            <span className="badge" role="status">
              {speed}x
            </span>
          )}
        </div>
        {live.phase === "ended" && live.result ? (
          <div className="round-banner" role="status">
            <p>{resultBanner(live.result)}</p>
            <button type="button" onClick={newRound}>
              New round
            </button>
          </div>
        ) : null}
        <MapView
          map={DRILL_HALL}
          world={boardWorld}
          selectedInstanceId={selectedId}
          preview={preview}
          agentDisplay={agentDisplay}
          onAgentClick={onAgentClick}
          onPointClick={onPointClick}
          onPointRightClick={issueMove}
          onHoverPoint={setHoverPoint}
        />
        <p className="footnote">{DRILL_HALL.notes} Right-click the board to move the selected attacker.</p>
        <div className="team-actions" aria-label="Transport">
          <button type="button" aria-pressed={!paused} onClick={togglePause}>
            {paused ? "Resume" : "Pause"}
          </button>
          {([0.5, 1, 2, 4] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={speed === value}
              onClick={() => {
                setSpeed(value);
                setPlanMessage(`Speed ${value}x.`);
              }}
            >
              {value}x
            </button>
          ))}
        </div>
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
                applyCommands("attack", [{ kind: "hold", instanceId: selectedId }], `Hold ${selectedId}.`);
              }
            }}
          >
            Hold
          </button>
          {abilities.map((ability) => {
            const gate = selected
              ? castGate(selected, ability, live.world.timeMs)
              : { ok: false as const, code: "unknown-agent" as const, reason: "Select an attacker." };
            const charges =
              ability.maxCharges === null
                ? `${selected?.ultimatePoints ?? 0}/8 ult`
                : `${selected?.charges[ability.id] ?? 0}/${ability.maxCharges}`;
            const cd = selected ? cooldownRemainingMs(selected, ability.id, live.world.timeMs) : 0;
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
          <button type="button" aria-pressed={showTruth} onClick={() => setShowTruth((value) => !value)}>
            {showTruth ? "Showing truth" : "Showing attack view"}
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
              commitScenario(createPlayableDrill(scenario.seed, { startingUltPoints: value }));
            }}
          />
        </label>
        <p className="message" role="status" aria-label="Plan status">
          t={live.world.timeMs} ms · {planMessage}
        </p>
        <AgentPanel
          agent={selected}
          catalog={SHIPPED_CATALOG}
          timeMs={live.world.timeMs}
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
        <h2>Live event log</h2>
        <ol className="event-log" aria-label="Event log">
          {recentEvents.map((event) => (
            <li key={`${event.sequence}-${event.type}-${event.timeMs}`}>{describeEvent(event)}</li>
          ))}
        </ol>
        <div className="team-actions">
          <button type="button" onClick={downloadReplay}>
            Download replay
          </button>
          <button type="button" onClick={loadReplay}>
            Load replay
          </button>
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
                commitScenario(parseScenario(fileText));
                setFileMessage("Scenario loaded.");
              } catch (error) {
                const message =
                  error instanceof ScenarioFileError ? error.message : "Could not load that scenario.";
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
        <label>
          Replay JSON
          <textarea
            className="file-box"
            aria-label="Replay JSON"
            value={replayText}
            onChange={(event) => setReplayText(event.target.value)}
          />
        </label>
        <p className="message" role="status">
          {fileMessage}
        </p>
      </section>
    </div>
  );
}
