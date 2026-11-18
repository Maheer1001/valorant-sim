import type { MouseEvent } from "react";
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
import { clientToMm, pointFromYawPreview } from "./coords.ts";

export type BoardPreview = {
  aimFrom?: Point;
  aimTo?: Point;
  rangeOrigin?: Point;
  rangeMm?: number;
  previewCenter?: Point;
  previewRadiusMm?: number;
};

export function MapView({
  map,
  world,
  selectedInstanceId = null,
  preview = null,
  onAgentClick,
  onPointClick,
  onHoverPoint,
}: {
  map: MapDefinition;
  world: World;
  selectedInstanceId?: string | null;
  preview?: BoardPreview | null;
  onAgentClick?: (instanceId: string) => void;
  onPointClick?: (point: Point) => void;
  onHoverPoint?: (point: Point | null) => void;
}) {
  const smokes = activeSmokes(world.smokes, world.timeMs);

  function pointFromEvent(event: MouseEvent<SVGSVGElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return clientToMm(event.clientX, event.clientY, rect, map.widthMm, map.heightMm);
  }

  function handleSvgClick(event: MouseEvent<SVGSVGElement>) {
    if (!onPointClick) return;
    onPointClick(pointFromEvent(event));
  }

  return (
    <svg
      viewBox={`0 0 ${map.widthMm} ${map.heightMm}`}
      role="img"
      aria-label={map.name}
      onClick={handleSvgClick}
      onMouseMove={(event) => onHoverPoint?.(pointFromEvent(event))}
      onMouseLeave={() => onHoverPoint?.(null)}
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
      {preview?.rangeOrigin && preview.rangeMm != null ? (
        <circle
          cx={preview.rangeOrigin.xMm}
          cy={preview.rangeOrigin.yMm}
          r={preview.rangeMm}
          fill="none"
          stroke="#7eb6ff"
          strokeWidth="40"
          strokeDasharray="200 120"
          pointerEvents="none"
        />
      ) : null}
      {preview?.previewCenter && preview.previewRadiusMm != null ? (
        <circle
          cx={preview.previewCenter.xMm}
          cy={preview.previewCenter.yMm}
          r={preview.previewRadiusMm}
          fill="#7eb6ff"
          fillOpacity="0.18"
          stroke="#b8d4ff"
          strokeWidth="30"
          pointerEvents="none"
        />
      ) : null}
      {preview?.aimFrom && preview.aimTo ? (
        <line
          x1={preview.aimFrom.xMm}
          y1={preview.aimFrom.yMm}
          x2={preview.aimTo.xMm}
          y2={preview.aimTo.yMm}
          stroke="#f2f5f8"
          strokeWidth="40"
          strokeDasharray="160 80"
          pointerEvents="none"
        />
      ) : null}
      {world.agents.map((agent) => {
        const definition = SHIPPED_CATALOG.agents.find((item) => item.id === agent.definitionId);
        const name = definition?.name ?? agent.definitionId;
        const fill = agent.side === "attack" ? "#d28a2e" : "#3d8bfd";
        const selected = agent.instanceId === selectedInstanceId;
        const statuses = activeStatuses(agent, world.timeMs);
        const tip = pointFromYawPreview({ xMm: agent.xMm, yMm: agent.yMm }, agent.facingDeg, 500);
        const barWidth = 600;
        const hpRatio = Math.max(0, Math.min(1, agent.hp / 100));
        return (
          <g
            key={agent.instanceId}
            role={onAgentClick ? "button" : undefined}
            tabIndex={onAgentClick ? 0 : undefined}
            aria-label={`Select ${name}`}
            onClick={(event) => {
              if (!onAgentClick) return;
              event.stopPropagation();
              onAgentClick(agent.instanceId);
            }}
          >
            <circle
              cx={agent.xMm}
              cy={agent.yMm}
              r="280"
              fill={fill}
              stroke={selected ? "#f2f5f8" : "none"}
              strokeWidth={selected ? 60 : 0}
              opacity={agent.alive ? 1 : 0.35}
            />
            <line
              x1={agent.xMm}
              y1={agent.yMm}
              x2={tip.xMm}
              y2={tip.yMm}
              stroke="#f2f5f8"
              strokeWidth="50"
            />
            <rect
              x={agent.xMm - barWidth / 2}
              y={agent.yMm - 480}
              width={barWidth}
              height="70"
              fill="#242b33"
            />
            <rect
              x={agent.xMm - barWidth / 2}
              y={agent.yMm - 480}
              width={Math.round(barWidth * hpRatio)}
              height="70"
              fill="#5cb86a"
            />
            <text x={agent.xMm + 360} y={agent.yMm - 80} fill="#e7ecf1" fontSize="280">
              {name}
            </text>
            <text x={agent.xMm + 360} y={agent.yMm + 220} fill="#9aa6b2" fontSize="220">
              {agent.hp} hp · ult {agent.ultimatePoints}
            </text>
            {statuses.length > 0 ? (
              <text x={agent.xMm + 360} y={agent.yMm + 480} fill="#f0b27a" fontSize="200">
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
