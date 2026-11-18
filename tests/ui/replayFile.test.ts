import { describe, expect, it } from "vitest";
import { isLiveRound, issueOrders, openLiveRound, replayOrderLog, stepLive } from "../../src/sim/live-round.ts";
import { createPlayableDrill } from "../../src/ui/scenario/playableDrill.ts";
import { parseReplay, REPLAY_FILE_VERSION, serializeReplay } from "../../src/ui/live/replayFile.ts";

describe("replay file", () => {
  it("round-trips serialize → parse → replayOrderLog to the same world time and agents", () => {
    const scenario = createPlayableDrill(3);
    const live = openLiveRound(scenario);
    expect(isLiveRound(live)).toBe(true);
    if (!isLiveRound(live)) return;
    issueOrders(live, "attack", [
      {
        kind: "move-route",
        instanceId: "breach-attack",
        waypoints: [{ xMm: 5000, yMm: 6000 }],
      },
    ]);
    stepLive(live, 40);
    const json = serializeReplay({
      version: REPLAY_FILE_VERSION,
      scenario,
      seed: scenario.seed,
      orderLog: structuredClone(live.orderLog),
      simTimeMs: live.world.timeMs,
    });
    expect(json).toContain('"version": 2');
    const parsed = parseReplay(json);
    const replayed = replayOrderLog(parsed.scenario, parsed.orderLog, parsed.simTimeMs);
    expect(isLiveRound(replayed)).toBe(true);
    if (!isLiveRound(replayed)) return;
    expect(replayed.world.timeMs).toBe(live.world.timeMs);
    expect(replayed.world.agents.map((agent) => ({ id: agent.instanceId, x: agent.xMm, y: agent.yMm }))).toEqual(
      live.world.agents.map((agent) => ({ id: agent.instanceId, x: agent.xMm, y: agent.yMm })),
    );
  });
});
