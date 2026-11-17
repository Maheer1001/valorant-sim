import { describe, expect, it } from "vitest";
import { runScenario } from "../../src/sim/run.ts";
import { openSession, snapshotAt, stepSession } from "../../src/sim/session.ts";
import { createDefaultDrill } from "../../src/sim/scenario/default-drill.ts";

describe("default drill", () => {
  it("repeats the same log and final state for one seed", () => {
    const first = runScenario(createDefaultDrill(4));
    const second = runScenario(createDefaultDrill(4));
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });

  it("rejects the scripted smoke when Brimstone is removed", () => {
    const scenario = createDefaultDrill(1);
    scenario.attack = { side: "attack", members: [] };
    const result = runScenario(scenario);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((event) => event.type === "cast-rejected" && event.code === "unknown-agent")).toBe(true);
    expect(result.events.some((event) => event.type === "smoke-active")).toBe(false);
    expect(result.final.smokes).toHaveLength(0);
  });

  it("steps the session from the initial snapshot", () => {
    const session = openSession(createDefaultDrill(1));
    expect(session.outcome.ok).toBe(true);
    expect(snapshotAt(session)?.timeMs).toBe(0);
    const stepped = stepSession(session);
    expect(stepped.cursor).toBe(1);
    if (!stepped.outcome.ok) return;
    expect(snapshotAt(stepped)?.timeMs).toBe(stepped.outcome.events[0]?.timeMs);
  });
});
