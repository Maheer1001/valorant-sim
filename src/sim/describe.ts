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
      return `${prefix} · ${event.abilityId} accepted, ${event.chargesRemaining} charges left`;
    case "cast-rejected":
      return `${prefix} · Cast rejected (${event.code})`;
    case "order-rejected":
      return `${prefix} · Order rejected (${event.code})`;
    case "smoke-active":
      return `${prefix} · Vision volume is blocking sight`;
    case "smoke-expired":
      return `${prefix} · Vision volume expired and sight is clear`;
    case "shot-withheld":
      return `${prefix} · Shot withheld (${event.reason})`;
    case "shot": {
      const kill =
        event.hit && event.targetHpAfter <= 0 ? " · kill (+1 ult killer, +1 ult victim)" : "";
      return `${prefix} · Shot hit chance ${event.hitProbabilityBp}/10000, draw ${event.draw}, ${event.hit ? "hit" : "miss"}${kill}`;
    }
    case "ability-damage":
      return `${prefix} · ${event.abilityId} burst ${event.burstIndex} dealt damage (${event.hits.length} hit${event.hits.length === 1 ? "" : "s"})`;
    case "flash-resolved":
      return `${prefix} · Flash blinded ${event.blindedInstanceIds.length}, blocked ${event.blockedInstanceIds.length}`;
    case "status-wave":
      return `${prefix} · ${event.abilityId} applied ${event.statusId} (${event.durationMs} ms) to ${event.affectedInstanceIds.length}`;
    case "status-expired":
      return `${prefix} · ${event.statusId} expired (${event.sourceAbilityId})`;
    case "stim-pulse":
      return `${prefix} · Stim Beacon pulsed (${event.affectedInstanceIds.length} allies)`;
    case "device-expired":
      return `${prefix} · Device ${event.deviceId} expired`;
    case "incendiary-detonated":
      return `${prefix} · Incendiary zone started after ${event.bounces} bounces`;
    case "orbital-activated":
      return `${prefix} · Orbital Strike zone started (ult spent)`;
    case "orbital-shrink":
      return `${prefix} · Orbital Strike shrinking to ${event.radiusMm} mm`;
    case "zone-damage":
      return `${prefix} · ${event.abilityId} damage tick (${event.hits.length} hit${event.hits.length === 1 ? "" : "s"})`;
    case "zone-expired":
      return `${prefix} · Zone ended (${event.zoneId})`;
    case "round-ended":
      return `${prefix} · Round ended (${event.result.kind})`;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
