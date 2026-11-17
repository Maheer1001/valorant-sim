import { SHIPPED_CATALOG } from "../../sim/agents/catalog.ts";
import { activeSmokes } from "../../sim/map/line-of-sight.ts";
import type { MapDefinition } from "../../sim/map/drill-hall.ts";
import type { World } from "../../sim/run.ts";

export function MapView({ map, world }: { map: MapDefinition; world: World }) {
  const smokes = activeSmokes(world.smokes, world.timeMs);
  return (
    <svg viewBox={`0 0 ${map.widthMm} ${map.heightMm}`} role="img" aria-label={map.name}>
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
          fill="#8aa0b4"
          fillOpacity="0.35"
          stroke="#d5dde6"
          strokeWidth="40"
        />
      ))}
      {world.agents.map((agent) => {
        const definition = SHIPPED_CATALOG.agents.find((item) => item.id === agent.definitionId);
        const name = definition?.name ?? agent.definitionId;
        const fill = agent.side === "attack" ? "#d28a2e" : "#3d8bfd";
        return (
          <g key={agent.instanceId}>
            <circle cx={agent.xMm} cy={agent.yMm} r="280" fill={fill} />
            <text x={agent.xMm + 360} y={agent.yMm - 80} fill="#e7ecf1" fontSize="280">
              {name}
            </text>
            <text x={agent.xMm + 360} y={agent.yMm + 280} fill="#9aa6b2" fontSize="240">
              {agent.hp} hp
            </text>
          </g>
        );
      })}
    </svg>
  );
}
