import { useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import { zoneRadiusMm } from "../../sim/agents/abilities/brimstone-resolve.ts";
import { SHIPPED_CATALOG } from "../../sim/agents/catalog.ts";
import {
  STATUS_BLIND,
  STATUS_COMBAT_STIM,
  STATUS_CONCUSS,
  STATUS_HASTE,
  activeStatuses,
} from "../../sim/effects/status.ts";
import { activeSmokes } from "../../sim/map/line-of-sight.ts";
import type { MapDefinition } from "../../sim/map/drill-hall.ts";
import type { Point } from "../../sim/types.ts";
import type { World } from "../../sim/run.ts";
import { pointFromYawPreview, svgClientToMm } from "./coords.ts";
import type { PreviewPrimitive } from "./previews.ts";

export type AgentDisplay = {
  xMm: number;
  yMm: number;
  facingDeg: number;
};

export type BoardModifiers = {
  shiftKey: boolean;
};

function labelLayout(
  agents: readonly { instanceId: string; xMm: number; yMm: number }[],
): Record<string, { nameDx: number; nameDy: number; hpDx: number; hpDy: number }> {
  const sorted = [...agents].sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);
  const layout: Record<string, { nameDx: number; nameDy: number; hpDx: number; hpDy: number }> = {};
  for (let i = 0; i < sorted.length; i += 1) {
    let bump = 0;
    for (let j = 0; j < i; j += 1) {
      const dx = sorted[i]!.xMm - sorted[j]!.xMm;
      const dy = sorted[i]!.yMm - sorted[j]!.yMm;
      if (dx * dx + dy * dy < 900 * 900) bump += 1;
    }
    layout[sorted[i]!.instanceId] = {
      nameDx: bump * 480,
      nameDy: -620 - bump * 140,
      hpDx: bump * 480,
      hpDy: 520 + bump * 140,
    };
  }
  return layout;
}

function renderPrimitive(primitive: PreviewPrimitive, key: string) {
  if (primitive.kind === "polyline") {
    const d = primitive.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.xMm} ${p.yMm}`).join(" ");
    return (
      <path
        key={key}
        d={d}
        fill="none"
        stroke={primitive.stroke ?? (primitive.faint ? "#5a6570" : "#f2f5f8")}
        strokeWidth={primitive.faint ? 30 : 45}
        strokeDasharray={primitive.faint ? "120 100" : "160 80"}
        opacity={primitive.faint ? 0.45 : 0.9}
        pointerEvents="none"
      />
    );
  }
  if (primitive.kind === "polygon") {
    const points = primitive.points.map((p) => `${p.xMm},${p.yMm}`).join(" ");
    return (
      <polygon
        key={key}
        data-testid={primitive.testId}
        points={points}
        fill={primitive.fill ?? "#7eb6ff"}
        fillOpacity="0.16"
        stroke="#b8d4ff"
        strokeWidth="30"
        pointerEvents="none"
      />
    );
  }
  if (primitive.kind === "circle") {
    return (
      <circle
        key={key}
        data-testid={primitive.testId}
        cx={primitive.center.xMm}
        cy={primitive.center.yMm}
        r={primitive.radiusMm}
        fill={primitive.fill ? "#7eb6ff" : "none"}
        fillOpacity={primitive.fill ? 0.18 : 0}
        stroke={primitive.dashed ? "#7eb6ff" : "#b8d4ff"}
        strokeWidth="30"
        strokeDasharray={primitive.dashed ? "200 120" : undefined}
        pointerEvents="none"
      />
    );
  }
  if (primitive.kind === "line") {
    return (
      <line
        key={key}
        x1={primitive.from.xMm}
        y1={primitive.from.yMm}
        x2={primitive.to.xMm}
        y2={primitive.to.yMm}
        stroke="#f2f5f8"
        strokeWidth="40"
        strokeDasharray="160 80"
        pointerEvents="none"
      />
    );
  }
  if (primitive.kind === "dots") {
    return (
      <g key={key} pointerEvents="none">
        {primitive.points.map((point, index) => (
          <circle
            key={`${key}-${index}`}
            cx={point.xMm}
            cy={point.yMm}
            r="160"
            fill="#f0b27a"
            fillOpacity="0.85"
          />
        ))}
      </g>
    );
  }
  return (
    <text
      key={key}
      x={primitive.at.xMm}
      y={primitive.at.yMm}
      fill="#e7ecf1"
      fontSize="240"
      pointerEvents="none"
    >
      {primitive.text}
    </text>
  );
}

export function MapView({
  map,
  world,
  selectedInstanceIds = [],
  previewPrimitives = [],
  agentDisplay = null,
  onAgentClick,
  onPointClick,
  onPointRightClick,
  onHoverPoint,
  onBoxSelect,
  onWheelPoint,
}: {
  map: MapDefinition;
  world: World;
  selectedInstanceIds?: readonly string[];
  previewPrimitives?: readonly PreviewPrimitive[];
  agentDisplay?: Record<string, AgentDisplay> | null;
  onAgentClick?: (instanceId: string, modifiers: BoardModifiers) => void;
  onPointClick?: (point: Point, modifiers: BoardModifiers) => void;
  onPointRightClick?: (point: Point, modifiers: BoardModifiers) => void;
  onHoverPoint?: (point: Point | null) => void;
  onBoxSelect?: (instanceIds: string[], modifiers: BoardModifiers) => void;
  onWheelPoint?: (point: Point, deltaY: number) => void;
}) {
  const smokes = activeSmokes(world.smokes, world.timeMs);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    startClient: { x: number; y: number };
    startMm: Point;
    pointerId: number;
    moved: boolean;
    shiftKey: boolean;
  } | null>(null);
  const [box, setBox] = useState<{ a: Point; b: Point } | null>(null);

  /**
   * Single conversion point for every board input (click, right-click, hover
   * previews, drag-box ends, wheel), so all of them agree with what is drawn.
   */
  function pointFromClient(clientX: number, clientY: number): Point {
    return svgClientToMm(svgRef.current, clientX, clientY, map.widthMm, map.heightMm);
  }

  function pointFromEvent(event: MouseEvent<SVGSVGElement> | PointerEvent<SVGSVGElement> | WheelEvent<SVGSVGElement>): Point {
    return pointFromClient(event.clientX, event.clientY);
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    dragRef.current = {
      startClient: { x: event.clientX, y: event.clientY },
      startMm: pointFromEvent(event),
      pointerId: event.pointerId,
      moved: false,
      shiftKey: event.shiftKey,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    onHoverPoint?.(pointFromEvent(event));
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClient.x;
    const dy = event.clientY - drag.startClient.y;
    if (!drag.moved && dx * dx + dy * dy > 16) {
      drag.moved = true;
    }
    if (drag.moved) {
      setBox({ a: drag.startMm, b: pointFromEvent(event) });
    }
  }

  function agentsInBox(a: Point, b: Point): string[] {
    const minX = Math.min(a.xMm, b.xMm);
    const maxX = Math.max(a.xMm, b.xMm);
    const minY = Math.min(a.yMm, b.yMm);
    const maxY = Math.max(a.yMm, b.yMm);
    return world.agents
      .filter((agent) => {
        if (agent.side !== "attack" || !agent.alive) return false;
        const display = agentDisplay?.[agent.instanceId];
        const xMm = display?.xMm ?? agent.xMm;
        const yMm = display?.yMm ?? agent.yMm;
        return xMm >= minX && xMm <= maxX && yMm >= minY && yMm <= maxY;
      })
      .map((agent) => agent.instanceId);
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setBox(null);
    const modifiers = { shiftKey: drag.shiftKey || event.shiftKey };
    if (drag.moved) {
      const end = pointFromEvent(event);
      onBoxSelect?.(agentsInBox(drag.startMm, end), modifiers);
      return;
    }
    onPointClick?.(pointFromEvent(event), modifiers);
  }

  function handleContextMenu(event: MouseEvent<SVGSVGElement>) {
    if (!onPointRightClick) return;
    event.preventDefault();
    onPointRightClick(pointFromEvent(event), { shiftKey: event.shiftKey });
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    if (!onWheelPoint) return;
    event.preventDefault();
    onWheelPoint(pointFromEvent(event), event.deltaY);
  }

  const displayAgents = world.agents.map((agent) => {
    const display = agentDisplay?.[agent.instanceId];
    return {
      instanceId: agent.instanceId,
      xMm: display?.xMm ?? agent.xMm,
      yMm: display?.yMm ?? agent.yMm,
    };
  });
  const labels = labelLayout(displayAgents);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${map.widthMm} ${map.heightMm}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={map.name}
      tabIndex={0}
      className="board-svg"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
        setBox(null);
      }}
      onContextMenu={handleContextMenu}
      onMouseLeave={() => onHoverPoint?.(null)}
      onWheel={handleWheel}
    >
      <rect x="0" y="0" width={map.widthMm} height={map.heightMm} fill="#10141a" />
      {map.sites.map((site) => (
        <g key={site.id}>
          <rect
            x={site.xMm}
            y={site.yMm}
            width={site.widthMm}
            height={site.heightMm}
            fill="#1e3a32"
            stroke="#3f6b5b"
            strokeWidth="40"
          />
          <text x={site.xMm + 120} y={site.yMm + 500} fill="#c9ddd4" fontSize="320">
            {site.name}
          </text>
        </g>
      ))}
      {map.walls.map((wall, index) => (
        <line
          key={`${wall.a.xMm}-${wall.a.yMm}-${index}`}
          x1={wall.a.xMm}
          y1={wall.a.yMm}
          x2={wall.b.xMm}
          y2={wall.b.yMm}
          stroke="#d5dde6"
          strokeWidth="70"
        />
      ))}
      {smokes.map((smoke) => (
        <circle
          key={smoke.id}
          cx={smoke.xMm}
          cy={smoke.yMm}
          r={smoke.radiusMm}
          fill={smoke.abilityId === "orbital-strike" ? "#c45c26" : "#8aa0b4"}
          fillOpacity="0.35"
          stroke="#d5dde6"
          strokeWidth="40"
        />
      ))}
      {world.zones.map((zone) => {
        const radius = zoneRadiusMm(zone, world.timeMs);
        if (radius <= 0) return null;
        return (
          <circle
            key={zone.id}
            cx={zone.xMm}
            cy={zone.yMm}
            r={radius}
            fill={zone.abilityId === "orbital-strike" ? "#c45c26" : "#d28a2e"}
            fillOpacity="0.28"
            stroke="#f0b27a"
            strokeWidth="30"
          />
        );
      })}
      {world.devices.map((device) => (
        <circle
          key={device.id}
          cx={device.xMm}
          cy={device.yMm}
          r={device.radiusMm}
          fill="#3d8bfd"
          fillOpacity="0.2"
          stroke="#7eb6ff"
          strokeWidth="30"
          strokeDasharray="120 80"
        />
      ))}
      {previewPrimitives.map((primitive, index) => renderPrimitive(primitive, `preview-${index}`))}
      {box ? (
        <rect
          x={Math.min(box.a.xMm, box.b.xMm)}
          y={Math.min(box.a.yMm, box.b.yMm)}
          width={Math.abs(box.b.xMm - box.a.xMm)}
          height={Math.abs(box.b.yMm - box.a.yMm)}
          fill="#7eb6ff"
          fillOpacity="0.12"
          stroke="#7eb6ff"
          strokeWidth="40"
          strokeDasharray="120 80"
          pointerEvents="none"
        />
      ) : null}
      {world.agents.map((agent) => {
        const definition = SHIPPED_CATALOG.agents.find((item) => item.id === agent.definitionId);
        const name = definition?.name ?? agent.definitionId;
        const fill = agent.side === "attack" ? "#d28a2e" : "#3d8bfd";
        const selected = selectedInstanceIds.includes(agent.instanceId);
        const statuses = activeStatuses(agent, world.timeMs);
        const display = agentDisplay?.[agent.instanceId];
        const xMm = display?.xMm ?? agent.xMm;
        const yMm = display?.yMm ?? agent.yMm;
        const facingDeg = display?.facingDeg ?? agent.facingDeg;
        const tip = pointFromYawPreview({ xMm, yMm }, facingDeg, 500);
        const barWidth = 600;
        const hpRatio = Math.max(0, Math.min(1, agent.hp / 100));
        const offset = labels[agent.instanceId] ?? { nameDx: 0, nameDy: -620, hpDx: 0, hpDy: 520 };
        return (
          <g
            key={agent.instanceId}
            role={onAgentClick ? "button" : undefined}
            tabIndex={onAgentClick ? 0 : undefined}
            aria-label={`Select ${name}`}
            onPointerDown={(event) => {
              if (!onAgentClick) return;
              event.stopPropagation();
            }}
            onClick={(event) => {
              if (!onAgentClick) return;
              event.stopPropagation();
              onAgentClick(agent.instanceId, { shiftKey: event.shiftKey });
            }}
          >
            <circle
              cx={xMm}
              cy={yMm}
              r="280"
              fill={fill}
              stroke={selected ? "#f2f5f8" : "none"}
              strokeWidth={selected ? 60 : 0}
              opacity={agent.alive ? 1 : 0.35}
            />
            <line
              x1={xMm}
              y1={yMm}
              x2={tip.xMm}
              y2={tip.yMm}
              stroke="#f2f5f8"
              strokeWidth="50"
            />
            <rect
              x={xMm - barWidth / 2}
              y={yMm - 480}
              width={barWidth}
              height="70"
              fill="#242b33"
            />
            <rect
              x={xMm - barWidth / 2}
              y={yMm - 480}
              width={Math.round(barWidth * hpRatio)}
              height="70"
              fill="#5cb86a"
            />
            <text
              x={xMm + offset.nameDx}
              y={yMm + offset.nameDy}
              fill="#e7ecf1"
              fontSize="260"
              textAnchor="middle"
            >
              {name}
            </text>
            <text
              x={xMm + offset.hpDx}
              y={yMm + offset.hpDy}
              fill="#9aa6b2"
              fontSize="200"
              textAnchor="middle"
            >
              {agent.hp} hp
            </text>
            {statuses.length > 0 ? (
              <text
                x={xMm + offset.hpDx}
                y={yMm + offset.hpDy + 260}
                fill="#f0b27a"
                fontSize="180"
                textAnchor="middle"
              >
                {statuses
                  .map((status) => {
                    const left = Math.max(0, status.untilMs - world.timeMs);
                    const label =
                      status.id === STATUS_CONCUSS
                        ? "concussed"
                        : status.id === STATUS_BLIND
                          ? "flashed"
                          : status.id === STATUS_HASTE
                            ? "haste"
                            : status.id === STATUS_COMBAT_STIM
                              ? "combat stim"
                              : status.id;
                    return `${label} ${(left / 1000).toFixed(1)}s`;
                  })
                  .join(" · ")}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
