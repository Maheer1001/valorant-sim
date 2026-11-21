import { useEffect, useMemo, useRef, useState } from "react";
import { FAULT_LINE_ID } from "../sim/agents/abilities/breach.ts";
import { getAgent, SHIPPED_CATALOG } from "../sim/agents/catalog.ts";
import { describeEvent } from "../sim/describe.ts";
import { buyCharge } from "../sim/economy/buy.ts";
import {
  isLiveRound,
  issueOrders,
  replayOrderLog,
  standingPositionAt,
  stepLive,
  viewLive,
  type AgentCommand,
  type LiveRound,
  type StandingOrder,
} from "../sim/live-round.ts";
import { DRILL_HALL } from "../sim/map/drill-hall.ts";
import {
  applyBuysToScenario,
  startLiveFromPreRound,
  validatePlan,
  type BuyLine,
  type PlanAbility,
  type PreRoundPlan,
} from "../sim/preround.ts";
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
import { formatBuyTimer, tickBuyTimer } from "./preround/buyTimer.ts";
import {
  addPlanAbility,
  appendAgentWaypoint,
  buildPreRoundPlan,
  clearAgentRoute,
  defaultTrigger,
  getDraft,
  instanceToBody,
  removePlanAbility,
  setAgentRoute,
  updatePlanAbility,
  type PlanDraftMap,
} from "./preround/planState.ts";
import { createPlayableDrill } from "./scenario/playableDrill.ts";

type ClickMode = "move" | "hold" | { cast: string };
type UiPhase = "pre-round" | "live";

function remainingWaypoints(order: StandingOrder | undefined): Point[] {
  if (!order || order.kind !== "move-route") return [];
  return order.waypoints.slice(order.index).map((point) => ({ ...point }));
}

function abilityDisplayName(definitionId: string, abilityId: string): string {
  const definition = getAgent(SHIPPED_CATALOG, definitionId);
  return definition?.abilities.find((item) => item.id === abilityId)?.name ?? abilityId;
}

/** Pre-round starts bought abilities empty so HUD +/- can purchase (lab buy phase). */
function scenarioForPreRound(scenario: Scenario): Scenario {
  const next = structuredClone(scenario);
  for (const member of next.attack.members) {
    const definition = getAgent(SHIPPED_CATALOG, member.definitionId);
    if (!definition) continue;
    for (const ability of definition.abilities) {
      if (ability.maxCharges !== null && ability.costCredits != null && ability.costCredits > 0) {
        member.charges[ability.id] = 0;
      }
    }
  }
  return next;
}

export function App() {
  const [uiPhase, setUiPhase] = useState<UiPhase>("pre-round");
  const [startingUlt, setStartingUlt] = useState(0);
  const [scenario, setScenario] = useState(() =>
    scenarioForPreRound(createPlayableDrill(1, { startingUltPoints: 0 })),
  );
  const liveRef = useRef<LiveRound | null>(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((value) => value + 1);

  const [buys, setBuys] = useState<BuyLine[]>([]);
  const [drafts, setDrafts] = useState<PlanDraftMap>({});
  const [buyRemainingMs, setBuyRemainingMs] = useState(STANDARD_RULESET.buyPhaseMs);
  const [holdBuyTimer, setHoldBuyTimer] = useState(true);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [routeNotice, setRouteNotice] = useState("");
  const [savedPreRoundPlan, setSavedPreRoundPlan] = useState<PreRoundPlan | null>(null);
  const planSeqRef = useRef(0);
  const autoGoLockRef = useRef(false);
  const buyTickRef = useRef<number | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>(["breach-attack"]);
  const [clickMode, setClickMode] = useState<ClickMode>("move");
  const [faultLengthM, setFaultLengthM] = useState(20);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [showTruth, setShowTruth] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [planMessage, setPlanMessage] = useState("Pre-round — plan buys and routes, then Go.");
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
  const uiPhaseRef = useRef(uiPhase);
  uiPhaseRef.current = uiPhase;

  const live = liveRef.current;
  const paused = speed === 0;
  const remainingMs =
    live != null ? Math.max(0, live.ruleset.roundDurationMs - live.world.timeMs) : STANDARD_RULESET.roundDurationMs;

  const postBuyScenario: Scenario = useMemo(() => {
    const applied = applyBuysToScenario(scenario, buys, SHIPPED_CATALOG);
    if ("ok" in applied && applied.ok === false) return scenario;
    return applied as Scenario;
  }, [scenario, buys]);

  const currentPlan = useMemo(
    () => buildPreRoundPlan(buys, drafts, scenario.attack.members),
    [buys, drafts, scenario.attack.members],
  );

  const planValidation = useMemo(
    () => validatePlan(scenario, currentPlan, SHIPPED_CATALOG, STANDARD_RULESET),
    [scenario, currentPlan],
  );

  function resetToPreRound(next: Scenario) {
    setSpeed(0);
    accumulatorRef.current = 0;
    setAlpha(0);
    lastFrameRef.current = null;
    setScenario(next);
    liveRef.current = null;
    setUiPhase("pre-round");
    setBuys([]);
    setDrafts({});
    setBuyRemainingMs(STANDARD_RULESET.buyPhaseMs);
    setHoldBuyTimer(true);
    autoGoLockRef.current = false;
    setEditingStepId(null);
    setEditingInstanceId(null);
    setRouteNotice("");
    setSavedPreRoundPlan(null);
    setSelectedIds(next.attack.members[0] ? [next.attack.members[0].instanceId] : []);
    setClickMode("move");
    setPlanMessage("Pre-round — plan buys and routes, then Go.");
    setAgentMessage("");
    bump();
  }

  function newRound() {
    resetToPreRound(
      scenarioForPreRound(createPlayableDrill(scenario.seed, { startingUltPoints: startingUlt })),
    );
  }

  function enterLive(round: LiveRound, plan: PreRoundPlan, message: string) {
    liveRef.current = round;
    setSavedPreRoundPlan(plan);
    setUiPhase("live");
    setSpeed(0);
    accumulatorRef.current = 0;
    setAlpha(0);
    lastFrameRef.current = null;
    setClickMode("move");
    setPlanMessage(message);
    setEditingStepId(null);
    bump();
  }

  function goLive() {
    autoGoLockRef.current = true;
    const plan = buildPreRoundPlan(buys, drafts, scenario.attack.members);
    const validated = validatePlan(scenario, plan, SHIPPED_CATALOG, STANDARD_RULESET);
    if (!validated.ok) {
      setPlanMessage(rejectionMessage(validated.code as RejectionCode));
      autoGoLockRef.current = false;
      bump();
      return;
    }
    const opened = startLiveFromPreRound(scenario, plan, SHIPPED_CATALOG, STANDARD_RULESET, {
      decide: defenseHoldDecide,
    });
    if (!isLiveRound(opened)) {
      setPlanMessage(rejectionMessage(opened.code as RejectionCode));
      autoGoLockRef.current = false;
      bump();
      return;
    }
    enterLive(opened, plan, "Paused — press Space to start.");
  }
  const goLiveRef = useRef(goLive);
  goLiveRef.current = goLive;

  function togglePause() {
    if (uiPhaseRef.current !== "live") return;
    setSpeed((current) => {
      const next = current === 0 ? 1 : 0;
      setPlanMessage(next === 0 ? "Paused." : "Running.");
      return next;
    });
  }

  // Buy timer (host-only). Hold freezes; at 0 with hold off, auto-Go.
  useEffect(() => {
    if (uiPhase !== "pre-round") return;
    if (holdBuyTimer) return;
    let last = performance.now();
    buyTickRef.current = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      setBuyRemainingMs((prev) => {
        const next = tickBuyTimer({ remainingMs: prev, hold: false }, elapsed).remainingMs;
        if (next <= 0 && !autoGoLockRef.current) {
          autoGoLockRef.current = true;
          queueMicrotask(() => goLiveRef.current());
        }
        return next;
      });
    }, 100);
    return () => {
      if (buyTickRef.current != null) window.clearInterval(buyTickRef.current);
    };
  }, [uiPhase, holdBuyTimer]);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const previous = lastFrameRef.current;
      lastFrameRef.current = now;
      const round = liveRef.current;
      if (previous != null && round != null && round.phase === "live" && uiPhaseRef.current === "live") {
        const elapsedMs = now - previous;
        const out = hostLoopStep({
          elapsedMs,
          speed,
          accumulator: accumulatorRef.current,
          simStepMs: round.ruleset.simStepMs,
        });
        accumulatorRef.current = out.accumulator;
        setAlpha(out.alpha);
        if (out.steps > 0) {
          stepLive(round, out.steps);
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
      if (event.key === "Delete" || event.key === "Backspace") {
        if (uiPhaseRef.current === "pre-round" && editingStepId && editingInstanceId) {
          event.preventDefault();
          setDrafts((current) => removePlanAbility(current, editingInstanceId, editingStepId));
          setEditingStepId(null);
          setEditingInstanceId(null);
          setPlanMessage("Removed plan step.");
          return;
        }
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (uiPhaseRef.current === "live") togglePause();
        return;
      }
      if (event.key === "Escape") {
        setClickMode("move");
        setSelectedIds([]);
        setEditingStepId(null);
        setEditingInstanceId(null);
        setPlanMessage("Selection cleared.");
        return;
      }
      if (uiPhaseRef.current === "live") {
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
          const round = liveRef.current;
          if (!round) return;
          const result = issueOrders(
            round,
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
      }
      if (event.key === "h" || event.key === "H") {
        if (uiPhaseRef.current === "pre-round") {
          clearRoutesForSelection();
          return;
        }
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
        const agent =
          uiPhaseRef.current === "pre-round"
            ? postBuyScenario.attack.members.find((item) => item.instanceId === id)
            : liveRef.current?.world.agents.find((item) => item.instanceId === id);
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
  });

  const preRoundAttackers = useMemo(
    () => postBuyScenario.attack.members.map(instanceToBody),
    [postBuyScenario],
  );

  const preRoundWorld = useMemo(
    () => ({
      timeMs: 0,
      agents: preRoundAttackers,
      smokes: [],
      devices: [],
      zones: [],
    }),
    [preRoundAttackers],
  );

  const boardWorld = useMemo(() => {
    void version;
    if (uiPhase === "pre-round") return preRoundWorld;
    if (!live) return preRoundWorld;
    return showTruth ? live.world : viewLive(live, "attack");
  }, [live, showTruth, version, uiPhase, preRoundWorld]);

  const attackers = useMemo(() => {
    void version;
    if (uiPhase === "pre-round") return preRoundAttackers;
    return live?.world.agents.filter((agent) => agent.side === "attack") ?? preRoundAttackers;
  }, [live, version, uiPhase, preRoundAttackers]);

  const selectedBody: AgentBody | null = useMemo(() => {
    if (uiPhase === "pre-round") {
      return preRoundAttackers.find((agent) => agent.instanceId === primaryId) ?? null;
    }
    return live?.world.agents.find((agent) => agent.instanceId === primaryId) ?? null;
  }, [uiPhase, preRoundAttackers, live, primaryId]);

  const selectedDef = selectedBody ? getAgent(SHIPPED_CATALOG, selectedBody.definitionId) : null;
  const abilities = completeAbilities(selectedDef);
  const armedAbilityId = typeof clickMode === "object" ? clickMode.cast : null;

  const agentDisplay = useMemo(() => {
    void version;
    const display: Record<string, AgentDisplay> = {};
    if (uiPhase === "pre-round" || !live) {
      for (const agent of boardWorld.agents) {
        display[agent.instanceId] = {
          xMm: agent.xMm,
          yMm: agent.yMm,
          facingDeg: agent.facingDeg,
        };
      }
      return display;
    }
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
  }, [alpha, boardWorld.agents, live, version, uiPhase]);

  const previewPrimitives = useMemo(() => {
    void version;
    const primitives: PreviewPrimitive[] = [];
    const walls = DRILL_HALL.walls;
    const speedMm = STANDARD_RULESET.walkSpeedMmPerSec;

    if (uiPhase === "pre-round") {
      for (const member of scenario.attack.members) {
        const draft = getDraft(drafts, member.instanceId);
        if (draft.route.length === 0) continue;
        const from = { xMm: member.xMm, yMm: member.yMm };
        primitives.push(
          ...movementPreview({
            from,
            waypoints: draft.route,
            walls,
            walkSpeedMmPerSec: speedMm,
          }),
        );
        draft.route.forEach((point, index) => {
          primitives.push({
            kind: "circle",
            center: point,
            radiusMm: 280,
            fill: true,
            testId: `route-waypoint-${member.instanceId}-${index}`,
          });
          primitives.push({ kind: "label", at: point, text: String(index) });
        });
      }
    } else if (live) {
      for (const agent of live.world.agents) {
        const order = live.standing[agent.instanceId];
        if (!order || order.kind !== "move-route") continue;
        const from = agentDisplay[agent.instanceId] ?? {
          xMm: agent.xMm,
          yMm: agent.yMm,
          facingDeg: agent.facingDeg,
        };
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
    }

    if (hoverPoint && (clickMode === "move" || typeof clickMode === "object")) {
      if (clickMode === "move" && selectedIds.length > 0) {
        const group = selectedIds
          .map((id) => {
            const agent = attackers.find((item) => item.instanceId === id);
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
      if (typeof clickMode === "object" && selectedBody) {
        const origin = agentDisplay[selectedBody.instanceId] ?? {
          xMm: selectedBody.xMm,
          yMm: selectedBody.yMm,
          facingDeg: selectedBody.facingDeg,
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
              incendiarySpacingMm: STANDARD_RULESET.incendiaryFloorSpacingMm,
            }).primitives,
          );
        }
      }
    }
    return primitives;
  }, [
    abilities,
    agentDisplay,
    attackers,
    clickMode,
    drafts,
    faultLengthM,
    hoverPoint,
    live,
    scenario.attack.members,
    selectedBody,
    selectedIds,
    uiPhase,
    version,
  ]);

  const recentEvents = useMemo(() => {
    void version;
    return live?.events.slice(-30).reverse() ?? [];
  }, [live, version]);

  const killFeed = recentEvents.slice(0, 6);

  const statusLine =
    uiPhase === "pre-round"
      ? [
          routeNotice,
          !planValidation.ok ? rejectionMessage(planValidation.code as RejectionCode) : "",
          planMessage,
        ]
          .filter(Boolean)
          .join(" · ")
      : `t=${live?.world.timeMs ?? 0} ms · ${planMessage}`;

  function onTeams(attack: Team, defense: Team) {
    resetToPreRound(scenarioForPreRound({ ...scenario, attack, defense }));
  }

  function clearRoutesForSelection() {
    if (selectedIds.length === 0) {
      setPlanMessage("Select an attacker first.");
      return;
    }
    let notice = "";
    setDrafts((current) => {
      let next = current;
      for (const id of selectedIds) {
        const member = scenario.attack.members.find((item) => item.instanceId === id);
        const result = clearAgentRoute(next, id, (abilityId) =>
          abilityDisplayName(member?.definitionId ?? "", abilityId),
        );
        next = result.map;
        if (result.notice) notice = result.notice;
      }
      return next;
    });
    if (notice) setRouteNotice(notice);
    setPlanMessage(`Cleared route for ${selectedIds.join(", ")}.`);
    setClickMode("hold");
  }

  function applyCommands(
    side: "attack" | "defense",
    commands: Parameters<typeof issueOrders>[2],
    okMessage: string,
  ) {
    const round = liveRef.current;
    if (!round) return false;
    const result = issueOrders(round, side, commands);
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
    if (uiPhase === "pre-round") {
      clearRoutesForSelection();
      return;
    }
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
    if (uiPhase === "pre-round") {
      const group = selectedIds
        .map((id) => {
          const agent = preRoundAttackers.find((item) => item.instanceId === id);
          if (!agent) return null;
          return { instanceId: id, xMm: agent.xMm, yMm: agent.yMm };
        })
        .filter((item): item is { instanceId: string; xMm: number; yMm: number } => item != null);
      const destinations = formationDestinations(group, point);
      let nextDrafts = drafts;
      let notice = "";
      for (const entry of destinations) {
        const member = scenario.attack.members.find((item) => item.instanceId === entry.instanceId);
        if (append) {
          nextDrafts = appendAgentWaypoint(nextDrafts, entry.instanceId, entry.destination);
        } else {
          const result = setAgentRoute(nextDrafts, entry.instanceId, [entry.destination], (abilityId) =>
            abilityDisplayName(member?.definitionId ?? "", abilityId),
          );
          nextDrafts = result.map;
          if (result.notice) notice = result.notice;
        }
      }
      setDrafts(nextDrafts);
      setRouteNotice(notice);
      setPlanMessage(
        append
          ? `Append waypoint for ${selectedIds.join(", ")}.`
          : `Move ${selectedIds.join(", ")}.`,
      );
      setClickMode("move");
      return;
    }
    const group = selectedIds
      .map((id) => {
        const agent = liveRef.current?.world.agents.find((item) => item.instanceId === id);
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
      const prior = append ? remainingWaypoints(liveRef.current?.standing[entry.instanceId]) : [];
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
    if (!primaryId || !selectedBody) {
      setPlanMessage("Select an attacker first.");
      return;
    }
    if (typeof clickMode !== "object") return;
    const ability = abilities.find((item) => item.id === clickMode.cast);
    if (!ability) {
      setPlanMessage("Pick a complete ability first.");
      return;
    }

    if (uiPhase === "pre-round") {
      const kind = castKind(ability.id);
      if (kind === "map-targeted") {
        const range = ability.maxRangeMm ?? 0;
        if (!pointInRange({ xMm: selectedBody.xMm, yMm: selectedBody.yMm }, point, range)) {
          setPlanMessage(
            `Out of range: ${ability.name} reaches ${(range / 1000).toFixed(0)} m from the caster.`,
          );
          return;
        }
      }
      const draft = getDraft(drafts, primaryId);
      const trigger = defaultTrigger(draft.route);
      planSeqRef.current += 1;
      const step: PlanAbility = {
        id: `p${planSeqRef.current}`,
        abilityId: ability.id,
        trigger,
        target: { ...point },
      };
      if (kind !== "map-targeted") {
        step.aimYawDeg = yawDegFromPoints(
          { xMm: selectedBody.xMm, yMm: selectedBody.yMm },
          point,
        );
        if (ability.id === FAULT_LINE_ID) step.chargeValue = faultLengthM;
      } else {
        step.mapTarget = { ...point };
      }
      setDrafts((current) => addPlanAbility(current, primaryId, step));
      setPlanMessage(
        ability.id === FAULT_LINE_ID
          ? `Queued Fault Line · length ${faultLengthM} m.`
          : `Queued ${ability.name}.`,
      );
      setClickMode("move");
      return;
    }

    const gate = castGate(selectedBody, ability, live?.world.timeMs ?? 0);
    if (!gate.ok) {
      setPlanMessage(gate.reason);
      return;
    }
    const kind = castKind(ability.id);
    if (kind === "map-targeted") {
      const range = ability.maxRangeMm ?? 0;
      if (!pointInRange({ xMm: selectedBody.xMm, yMm: selectedBody.yMm }, point, range)) {
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
    const yaw = yawDegFromPoints({ xMm: selectedBody.xMm, yMm: selectedBody.yMm }, point);
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
    const agent = liveRef.current?.world.agents.find((item) => item.instanceId === nextAgent.instanceId);
    if (agent) {
      agent.credits = nextAgent.credits;
      agent.charges = { ...nextAgent.charges };
    }
    bump();
  }

  function onPreRoundBuy(instanceId: string, abilityId: string) {
    const member = postBuyScenario.attack.members.find((item) => item.instanceId === instanceId);
    if (!member) return;
    const result = buyCharge(instanceToBody(member), abilityId, SHIPPED_CATALOG);
    if (!result.ok) {
      setPlanMessage(rejectionMessage(result.code));
      return;
    }
    setBuys((current) => [...current, { instanceId, abilityId }]);
    setPlanMessage(`Bought ${abilityDisplayName(member.definitionId, abilityId)}.`);
  }

  function onPreRoundRefund(instanceId: string, abilityId: string) {
    setBuys((current) => {
      const index = [...current]
        .map((line, i) => ({ line, i }))
        .reverse()
        .find((entry) => entry.line.instanceId === instanceId && entry.line.abilityId === abilityId)?.i;
      if (index == null) return current;
      return current.filter((_, i) => i !== index);
    });
    setPlanMessage(`Refunded one ${abilityId} buy.`);
  }

  function downloadReplay() {
    const round = liveRef.current;
    if (!round) {
      setFileMessage("Go live before downloading a replay.");
      setSetupOpen(true);
      return;
    }
    const file = serializeReplay({
      version: REPLAY_FILE_VERSION,
      scenario: round.scenario,
      seed: round.scenario.seed,
      orderLog: structuredClone(round.orderLog),
      simTimeMs: round.world.timeMs,
      preRoundPlan: savedPreRoundPlan ?? undefined,
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
      setSavedPreRoundPlan(file.preRoundPlan ?? null);
      setUiPhase("live");
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
          {uiPhase === "pre-round" ? "Pre-round" : "Live"} · {SHIPPED_CATALOG.version} · Space pause ·
          1-5 select · C/Q/E/X cast · H hold · RMB move
        </p>
      </header>

      <section className="game-stage" aria-label="Game stage">
        <div className="board-shell" ref={boardFocusRef}>
          <div className="board-topbar" aria-label="Transport">
            <h2>{DRILL_HALL.name}</h2>
            {uiPhase === "pre-round" ? (
              <>
                <span className="badge" aria-label="Phase">
                  Pre-round
                </span>
                <div className="timer" aria-label="Buy timer">
                  {formatBuyTimer(buyRemainingMs)}{" "}
                  <span className="timer-note">(assumed)</span>
                </div>
                <label className="hold-timer">
                  <input
                    type="checkbox"
                    checked={holdBuyTimer}
                    aria-label="Hold timer"
                    onChange={(event) => setHoldBuyTimer(event.target.checked)}
                  />
                  Hold timer
                </label>
                <button type="button" aria-label="Go" onClick={goLive}>
                  Go
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
            {uiPhase === "live" ? (
              <button type="button" aria-pressed={showTruth} onClick={() => setShowTruth((value) => !value)}>
                {showTruth ? "Showing truth" : "Showing attack view"}
              </button>
            ) : null}
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

          {uiPhase === "live" && live?.phase === "ended" && live.result ? (
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
                const agent = boardWorld.agents.find((item) => item.instanceId === instanceId);
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
            {uiPhase === "live" ? (
              <ol className="kill-feed" aria-label="Kill feed">
                {killFeed.map((event) => (
                  <li key={`${event.sequence}-${event.type}-${event.timeMs}`}>{describeEvent(event)}</li>
                ))}
              </ol>
            ) : null}
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
              {statusLine}
            </p>
          </div>

          {uiPhase === "pre-round" ? (
            <pre data-testid="pre-round-plan" hidden>
              {JSON.stringify(currentPlan)}
            </pre>
          ) : null}

          <AttackerHud
            attackers={attackers}
            catalog={SHIPPED_CATALOG}
            timeMs={live?.world.timeMs ?? 0}
            selectedIds={selectedIds}
            armedAbilityId={armedAbilityId}
            mode={uiPhase === "pre-round" ? "pre-round" : "live"}
            drafts={drafts}
            buys={buys}
            editingStepId={editingStepId}
            onSelect={(instanceId) => {
              setSelectedIds([instanceId]);
              setPlanMessage(`Selected ${instanceId}.`);
            }}
            onArm={(_instanceId, abilityId) => setClickMode({ cast: abilityId })}
            onBuyAbility={onPreRoundBuy}
            onRefundAbility={onPreRoundRefund}
            onSelectStep={(instanceId, stepId) => {
              setEditingInstanceId(instanceId);
              setEditingStepId(stepId);
              setSelectedIds([instanceId]);
            }}
            onDeleteStep={(instanceId, stepId) => {
              setDrafts((current) => removePlanAbility(current, instanceId, stepId));
              if (editingStepId === stepId) {
                setEditingStepId(null);
                setEditingInstanceId(null);
              }
              setPlanMessage("Removed plan step.");
            }}
            onSaveStepTrigger={(instanceId, stepId, trigger) => {
              setDrafts((current) => updatePlanAbility(current, instanceId, stepId, { trigger }));
              setEditingStepId(null);
              setEditingInstanceId(null);
              setPlanMessage("Updated plan trigger.");
            }}
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
                  resetToPreRound(
                    scenarioForPreRound(
                      createPlayableDrill(scenario.seed, { startingUltPoints: value }),
                    ),
                  );
                }}
              />
            </label>
            {uiPhase === "live" ? (
              <AgentPanel
                agent={selectedBody}
                catalog={SHIPPED_CATALOG}
                timeMs={live?.world.timeMs ?? 0}
                onBuy={onBuy}
                message={agentMessage}
              />
            ) : (
              <p className="footnote">Buy charges on the attacker HUD during pre-round.</p>
            )}
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
                    resetToPreRound(scenarioForPreRound(parseScenario(fileText)));
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
