import type { SimEvent } from "../../sim/run.ts";
import { describeEvent } from "../../sim/describe.ts";

export function EventList({ events, cursor }: { events: readonly SimEvent[]; cursor: number }) {
  return (
    <ol className="event-log" aria-label="Event log">
      {events.map((event, index) => (
        <li key={`${event.sequence}-${event.type}`} aria-current={index === cursor - 1 ? "step" : undefined}>
          {describeEvent(event)}
        </li>
      ))}
    </ol>
  );
}
