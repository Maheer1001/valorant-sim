import type { SimEvent } from "./run.ts";

export function describeEvent(event: SimEvent): string {
  const prefix = `${event.timeMs} ms`;
  switch (event.type) {
    case "move-started":
      return `${prefix} · Move started toward ${event.to.xMm}, ${event.to.yMm}`;
    case "move-arrived":
      return `${prefix} · Arrived at ${event.at.xMm}, ${event.at.yMm}`;
    case "move-blocked":
      return `${prefix} · Movement stopped by a wall at ${event.at.xMm}, ${event.at.yMm}`;
    case "cast-accepted":
      return `${prefix} · Sky Smoke accepted, ${event.chargesRemaining} charges left`;
    case "cast-rejected":
      return `${prefix} · Cast rejected (${event.code})`;
    case "order-rejected":
      return `${prefix} · Order rejected (${event.code})`;
    case "smoke-active":
      return `${prefix} · Sky Smoke is blocking sight`;
    case "smoke-expired":
      return `${prefix} · Sky Smoke expired and sight is clear`;
    case "shot-withheld":
      return `${prefix} · Shot withheld (${event.reason})`;
    case "shot":
      return `${prefix} · Shot hit chance ${event.hitProbabilityBp}/10000, draw ${event.draw}, ${event.hit ? "hit" : "miss"}`;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
