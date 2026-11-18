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
  type AgentCommand,
  type LiveRound,
  type StandingOrder,
} from "../sim/live-round.ts";
import { DRILL_HALL } from "../sim/map/drill-hall.ts";
import type { AgentBody } from "../sim/run.ts";
import type { Scenario } from "../sim/scenario/types.ts";
import type { Team } from "../sim/composition/team.ts";
import type { Point, RejectionCode } from "../sim/types.ts";
import { STANDARD_RULESET } from "../rules/ruleset.ts";
import { parseScenario, ScenarioFileError, serializeScenario } from "../persistence/scenario-file.ts";
import { defenseHoldDecide } from "../tactics/defense-stub.ts";
import { MapView, type AgentDisplay } from "./board/MapView.tsx";
import { pointInRange, yawDegFromPoints } from "./board/coords.ts";
import {
  abilityPreview,
  clampFaultLengthM,
  formationDestinations,
  movementPreview,
  type PreviewPrimitive,
} from "./board/previews.ts";
import { DraftPanel } from "./draft/DraftPanel.tsx";
import {
  cycleSpeedDown,
  cycleSpeedUp,
  formatRoundTimer,
  hostLoopStep,
  type HostSpeed,
} from "./live/hostLoop.ts";
import { parseReplay, REPLAY_FILE_VERSION, serializeReplay } from "./live/replayFile.ts";
import { RoundEndBanner } from "./live/RoundEndBanner.tsx";
import { AgentPanel } from "./orders/AgentPanel.tsx";
import { AttackerHud } from "./orders/AttackerHud.tsx";
import { castGate, castKind, completeAbilities } from "./orders/abilityUi.ts";
import { abilityHotkeyMap, type AbilityHotkey } from "./orders/hotkeys.ts";
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

function remainingWaypoints(order: StandingOrder | undefined): Point[] {
  if (!order || order.kind !== "move-route") return [];
  return order.waypoints.slice(order.index).map((point) => ({ ...point }));
}

export function App() {
  const [startingUlt, setStartingUlt] = useState(0);
  const [scenario, setScenario] = useState(() => createPlayableDrill(1, { startingUltPoints: 0 }));
  const liveRef = useRef<LiveRound>(bootLive(createPlayableDrill(1)));
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((value) => value + 1);

  const [selectedIds, setSelectedIds] = useState<string[]>(["breach-attack"]);
  const [clickMode, setClickMode] = useState<ClickMode>("move");
  const [faultLengthM, setFaultLengthM] = useState(20);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [showTruth, setShowTruth] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [planMessage, setPlanMessage] = useState("Paused — press Space to start.");
  const [agentMessage, setAgentMessage] = useState("");
  const [speed, setSpeed] = useState<HostSpeed>(0);
  const [alpha, setAlpha] = useState(0);
  const accumulatorRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const [fileText, setFileText] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const [replayText, setReplayText] = useState("");
  const boardFocusRef = useRef<HTMLDivElement | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const primaryId = selectedIds[0] ?? null;
  const primaryIdRef = useRef(primaryId);
  primaryIdRef.current = primaryId;

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
    setSelectedIds(next.attack.members[0] ? [next.attack.members[0].instanceId] : []);
    setClickMode("move");
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
      if (event.key === "Escape") {
        setClickMode("move");
        setSelectedIds([]);
        setPlanMessage("Selection cleared.");
        return;
      }
      if (event.key === "]") {
        setSpeed((current) => cycleSpeedUp(current === 0 ? 1 : current));
        return;
      }
      if (event.key === "[") {
        setSpeed((current) => (current === 0 ? 0.5 : cycleSpeedDown(current)));
        return;
      }
      if (event.key === "h" || event.key === "H") {
        const ids = selectedIdsRef.current;
        if (ids.length === 0) {
          setPlanMessage("Select an attacker first.");
          return;
        }
        const result = issueOrders(
          liveRef.current,
          "attack",
          ids.map((instanceId) => ({ kind: "hold" as const, instanceId })),
        );
        if (!result.ok) {
          setPlanMessage(rejectionMessage(result.code as RejectionCode));
        } else {
          setPlanMessage(`Hold ${ids.join(", ")}.`);
        }
        setClickMode("hold");
        bump();
        return;
      }
      if (/^[1-5]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        const member = scenario.attack.members[index];
        if (!member) return;
        setSelectedIds([member.instanceId]);
        setPlanMessage(`Selected ${member.instanceId}.`);
        return;
      }
      const hotkey = event.key.toUpperCase() as AbilityHotkey;
      if (hotkey === "C" || hotkey === "Q" || hotkey === "E" || hotkey === "X") {
        const id = primaryIdRef.current;
        const agent = liveRef.current.world.agents.find((item) => item.instanceId === id);
        if (!agent || agent.side !== "attack") return;
        const definition = getAgent(SHIPPED_CATALOG, agent.definitionId);
        const ability = abilityHotkeyMap(definition)[hotkey];
        if (!ability) return;
        setSelectedIds((ids) =>
          ids[0] === agent.instanceId
            ? ids
            : [agent.instanceId, ...ids.filter((item) => item !== agent.instanceId)],
        );
        setClickMode({ cast: ability.id });
        setPlanMessage(`Armed ${ability.name} (${hotkey}).`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenario.attack.members]);

  const boardWorld = useMemo(() => {
    void version;
    return showTruth ? live.world : viewLive(live, "attack");
  }, [live, showTruth, version]);

  const attackers = useMemo(() => {
    void version;
    return live.world.agents.filter((agent) => agent.side === "attack");
  }, [live.world.agents, version]);

  const selected =
    live.world.agents.find((agent) => agent.instanceId === primaryId) ?? null;
  const selectedDef = selected ? getAgent(SHIPPED_CATALOG, selected.definitionId) : null;
  const abilities = completeAbilities(selectedDef);
  const armedAbilityId = typeof clickMode === "object" ? clickMode.cast : null;

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

  const previewPrimitives = useMemo(() => {
    void version;
    const primitives: PreviewPrimitive[] = [];
    const walls = DRILL_HALL.walls;
    const speedMm = live.ruleset.walkSpeedMmPerSec;

    for (const agent of live.world.agents) {
      const order = live.standing[agent.instanceId];
      if (!order || order.kind !== "move-route") continue;
      const from = agentDisplay[agent.instanceId] ?? { xMm: agent.xMm, yMm: agent.yMm, facingDeg: agent.facingDeg };
      const remaining = remainingWaypoints(order);
      if (remaining.length === 0) continue;
      const faint = movementPreview({
        from: { xMm: from.xMm, yMm: from.yMm },
        waypoints: remaining,
        walls,
        walkSpeedMmPerSec: speedMm,
        faint: true,
      });
      primitives.push(...faint.filter((item) => item.kind === "polyline"));
    }

    if (hoverPoint && (clickMode === "move" || typeof clickMode === "object")) {
      if (clickMode === "move" && selectedIds.length > 0) {
        const group = selectedIds
          .map((id) => {
            const agent = live.world.agents.find((item) => item.instanceId === id);
            const display = agentDisplay[id];
            if (!agent || !display) return null;
            return { instanceId: id, xMm: display.xMm, yMm: display.yMm };
          })
          .filter((item): item is { instanceId: string; xMm: number; yMm: number } => item != null);
        for (const dest of formationDestinations(group, hoverPoint)) {
          const from = group.find((item) => item.instanceId === dest.instanceId)!;
          primitives.push(
            ...movementPreview({
              from,
              waypoints: [dest.destination],
              walls,
              walkSpeedMmPerSec: speedMm,
            }),
          );
        }
      }
      if (typeof clickMode === "object" && selected) {
        const origin = agentDisplay[selected.instanceId] ?? {
          xMm: selected.xMm,
          yMm: selected.yMm,
          facingDeg: selected.facingDeg,
        };
        const ability = abilities.find((item) => item.id === clickMode.cast);
        if (ability) {
          primitives.push(
            ...abilityPreview({
              abilityId: ability.id,
              origin: { xMm: origin.xMm, yMm: origin.yMm },
              aim: hoverPoint,
              walls,
              chargeLengthM: faultLengthM,
              radiusMm: ability.radiusMm,
              maxRangeMm: ability.maxRangeMm,
              incendiarySpacingMm: live.ruleset.incendiaryFloorSpacingMm,
            }).primitives,
          );
        }
      }
    }
    return primitives;
  }, [
    abilities,
    agentDisplay,
    clickMode,
    faultLengthM,
    hoverPoint,
    live,
    selected,
    selectedIds,
    version,
  ]);

  const recentEvents = useMemo(() => {
    void version;
    return live.events.slice(-30).reverse();
  }, [live.events, version]);

  const killFeed = recentEvents.slice(0, 6);

  function onTeams(attack: Team, defense: Team) {
    commitScenario({ ...scenario, attack, defense });
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

  function issueHoldSelection() {
    if (selectedIds.length === 0) {
      setPlanMessage("Select an attacker first.");
      return;
    }
    applyCommands(
      "attack",
      selectedIds.map((instanceId) => ({ kind: "hold" as const, instanceId })),
      `Hold ${selectedIds.join(", ")}.`,
    );
    setClickMode("hold");
  }

  function issueGroupMove(point: Point, append: boolean) {
    if (selectedIds.length === 0) {
      setPlanMessage("Select an attacker first.");
      return;
    }
    const group = selectedIds
      .map((id) => {
        const agent = liveRef.current.world.agents.find((item) => item.instanceId === id);
        const display = agentDisplay[id];
        if (!agent || agent.side !== "attack") return null;
        return {
          instanceId: id,
          xMm: display?.xMm ?? agent.xMm,
          yMm: display?.yMm ?? agent.yMm,
        };
      })
      .filter((item): item is { instanceId: string; xMm: number; yMm: number } => item != null);
    const destinations = formationDestinations(group, point);
    const commands: AgentCommand[] = destinations.map((entry) => {
      const prior = append ? remainingWaypoints(liveRef.current.standing[entry.instanceId]) : [];
      return {
        kind: "move-route",
        instanceId: entry.instanceId,
        waypoints: [...prior, entry.destination],
      };
    });
    applyCommands(
      "attack",
      commands,
      append
        ? `Append waypoint for ${selectedIds.join(", ")}.`
        : `Move ${selectedIds.join(", ")}.`,
    );
    setClickMode("move");
  }

  function issueCastAt(point: Point) {
    if (!primaryId || !selected) {
      setPlanMessage("Select an attacker first.");
      return;
    }
    if (typeof clickMode !== "object") return;
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
            instanceId: primaryId,
            abilityId: ability.id,
            target: point,
            mapTarget: point,
          },
        ],
        `${ability.name} at ${point.xMm},${point.yMm}.`,
      );
      setClickMode("move");
      return;
    }
    const yaw = yawDegFromPoints({ xMm: selected.xMm, yMm: selected.yMm }, point);
    applyCommands(
      "attack",
      [
        {
          kind: "cast",
          instanceId: primaryId,
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
    setClickMode("move");
  }

  function onPointClick(point: Point) {
    if (clickMode === "hold") {
      issueHoldSelection();
      return;
    }
    if (typeof clickMode === "object") {
      issueCastAt(point);
      return;
    }
    issueGroupMove(point, false);
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
    setSetupOpen(true);
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
      setSelectedIds(file.scenario.attack.members[0] ? [file.scenario.attack.members[0].instanceId] : []);
      setPlanMessage(`Replay loaded at t=${file.simTimeMs} ms (paused).`);
      bump();
      setFileMessage("Replay loaded.");
    } catch (error) {
      setFileMessage(error instanceof Error ? error.message : "Could not load that replay.");
    }
  }

  return (
    <div className="app app-live">
      <header className="masthead">
        <h1>Tactical Simulation Lab</h1>
        <p>
          Live Drill Hall · Catalog {SHIPPED_CATALOG.version}. Starts paused — Space to run. Hotkeys 1–5,
          C/Q/E/X, H hold, right-click move.
        </p>
      </header>

      <section className="game-stage" aria-label="Game stage">
        <div className="board-shell" ref={boardFocusRef}>
          <div className="board-topbar" aria-label="Transport">
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
            <button type="button" aria-pressed={showTruth} onClick={() => setShowTruth((value) => !value)}>
              {showTruth ? "Showing truth" : "Showing attack view"}
            </button>
            <button type="button" onClick={downloadReplay}>
              Download replay
            </button>
            <button
              type="button"
              onClick={() => {
                setSetupOpen(true);
              }}
            >
              Load replay
            </button>
            <button
              type="button"
              aria-expanded={setupOpen}
              aria-controls="setup-drawer"
              onClick={() => setSetupOpen((value) => !value)}
            >
              Setup
            </button>
          </div>

          {live.phase === "ended" && live.result ? (
            <RoundEndBanner result={live.result} onNewRound={newRound} />
          ) : null}

          <div className="board-canvas">
            <MapView
              map={DRILL_HALL}
              world={boardWorld}
              selectedInstanceIds={selectedIds}
              previewPrimitives={previewPrimitives}
              agentDisplay={agentDisplay}
              onAgentClick={(instanceId, modifiers) => {
                const agent = live.world.agents.find((item) => item.instanceId === instanceId);
                if (!agent || agent.side !== "attack") return;
                setSelectedIds((current) => {
                  if (modifiers.shiftKey) {
                    return current.includes(instanceId)
                      ? current.filter((id) => id !== instanceId)
                      : [...current, instanceId];
                  }
                  return [instanceId];
                });
                setPlanMessage(`Selected ${instanceId}.`);
              }}
              onPointClick={(point) => onPointClick(point)}
              onPointRightClick={(point, modifiers) => issueGroupMove(point, modifiers.shiftKey)}
              onHoverPoint={setHoverPoint}
              onBoxSelect={(ids, modifiers) => {
                if (ids.length === 0) return;
                setSelectedIds((current) => {
                  if (modifiers.shiftKey) {
                    const set = new Set([...current, ...ids]);
                    return [...set];
                  }
                  return ids;
                });
                setPlanMessage(`Selected ${ids.join(", ")}.`);
              }}
              onWheelPoint={(_point, deltaY) => {
                if (typeof clickMode === "object" && clickMode.cast === FAULT_LINE_ID) {
                  setFaultLengthM((value) =>
                    clampFaultLengthM(value + (deltaY < 0 ? 1 : -1)),
                  );
                }
              }}
            />
            <ol className="kill-feed" aria-label="Kill feed">
              {killFeed.map((event) => (
                <li key={`${event.sequence}-${event.type}-${event.timeMs}`}>{describeEvent(event)}</li>
              ))}
            </ol>
          </div>

          <div className="secondary-orders" aria-label="Order modes">
            <button type="button" aria-pressed={clickMode === "move"} onClick={() => setClickMode("move")}>
              Move
            </button>
            <button type="button" aria-pressed={clickMode === "hold"} onClick={issueHoldSelection}>
              Hold
            </button>
            {typeof clickMode === "object" && clickMode.cast === FAULT_LINE_ID ? (
              <label className="fault-slider inline">
                Fault Line {faultLengthM} m
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
            <p className="message" role="status" aria-label="Plan status">
              t={live.world.timeMs} ms · {planMessage}
            </p>
          </div>

          <AttackerHud
            attackers={attackers}
            catalog={SHIPPED_CATALOG}
            timeMs={live.world.timeMs}
            selectedIds={selectedIds}
            armedAbilityId={armedAbilityId}
            onSelect={(instanceId) => {
              setSelectedIds([instanceId]);
              setPlanMessage(`Selected ${instanceId}.`);
            }}
            onArm={(_instanceId, abilityId) => setClickMode({ cast: abilityId })}
          />
        </div>

        <aside
          id="setup-drawer"
          className={`setup-drawer${setupOpen ? " open" : ""}`}
          aria-label="Setup"
          hidden={!setupOpen}
        >
          <div className="setup-drawer-inner">
            <button type="button" className="drawer-close" onClick={() => setSetupOpen(false)}>
              Close setup
            </button>
            <DraftPanel
              catalog={SHIPPED_CATALOG}
              ruleset={STANDARD_RULESET}
              map={DRILL_HALL}
              attack={scenario.attack}
              defense={scenario.defense}
              onTeams={onTeams}
            />
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
            <AgentPanel
              agent={selected}
              catalog={SHIPPED_CATALOG}
              timeMs={live.world.timeMs}
              onBuy={onBuy}
              message={agentMessage}
            />
            <h3>Full event log</h3>
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
          </div>
        </aside>
      </section>
    </div>
  );
}
