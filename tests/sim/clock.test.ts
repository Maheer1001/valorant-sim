import { describe, expect, it } from "vitest";
import { EventQueue } from "../../src/sim/clock.ts";

describe("event queue", () => {
  it("orders by time, then sequence, then agent id", () => {
    const queue = new EventQueue<string>();
    queue.push({ timeMs: 10, sequence: 2, agentId: "b", payload: "later-seq" });
    queue.push({ timeMs: 5, sequence: 9, agentId: "z", payload: "earlier-time" });
    queue.push({ timeMs: 10, sequence: 2, agentId: "a", payload: "same-time-agent" });
    queue.push({ timeMs: 10, sequence: 1, agentId: "z", payload: "earlier-seq" });

    expect(queue.pop()?.payload).toBe("earlier-time");
    expect(queue.pop()?.payload).toBe("earlier-seq");
    expect(queue.pop()?.payload).toBe("same-time-agent");
    expect(queue.pop()?.payload).toBe("later-seq");
  });
});
