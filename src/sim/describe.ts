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
    case "shot":
      return `${prefix} · Shot hit chance ${event.hitProbabilityBp}/10000, draw ${event.draw}, ${event.hit ? "hit" : "miss"}`;
    case "ability-damage":
      return `${prefix} · ${event.abilityId} burst ${event.burstIndex} hit ${event.hits.length}`;
    case "flash-resolved":
      return `${prefix} · ${event.abilityId} blinded ${event.blindedInstanceIds.length}, blocked ${event.blockedInstanceIds.length}`;
    case "status-wave":
      return `${prefix} · ${event.abilityId} applied ${event.statusId} to ${event.affectedInstanceIds.length}`;
    case "status-expired":
      return `${prefix} · ${event.statusId} expired (${event.sourceAbilityId})`;
    case "stim-pulse":
      return `${prefix} · Stim Beacon pulsed (${event.affectedInstanceIds.length} allies)`;
    case "device-expired":
      return `${prefix} · Device ${event.deviceId} expired`;
    case "incendiary-detonated":
      return `${prefix} · Incendiary detonated after ${event.bounces} bounces`;
    case "orbital-activated":
      return `${prefix} · Orbital Strike active`;
    case "orbital-shrink":
      return `${prefix} · Orbital Strike radius ${event.radiusMm} mm`;
    case "zone-damage":
      return `${prefix} · ${event.abilityId} zone hit ${event.hits.length}`;
    case "zone-expired":
      return `${prefix} · Zone ${event.zoneId} expired`;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
