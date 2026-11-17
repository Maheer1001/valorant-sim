import { describe, expect, it } from "vitest";
import { RIFLE_A } from "../../src/sim/combat/assumed-rifle.ts";
import { runScenario } from "../../src/sim/run.ts";
import { createDefaultDrill } from "../../src/sim/scenario/default-drill.ts";

describe("assumed rifle", () => {
  it("logs the hit chance and the combat draw as separate fields", () => {
    expect(RIFLE_A.provenance.kind).toBe("assumed");
    const first = shot(1);
    const second = shot(2);
    expect(first.hitProbabilityBp).toBe(second.hitProbabilityBp);
    expect(first.draw).not.toBe(second.draw);
    expect(first.hit).toBe(first.draw < first.hitProbabilityBp);
    expect(second.hit).toBe(second.draw < second.hitProbabilityBp);
  });

  it("does not draw when the shot is withheld", () => {
    const withWithheld = createDefaultDrill(9);
    const withoutWithheld = createDefaultDrill(9);
    withoutWithheld.orders = withoutWithheld.orders.filter((order) => !(order.kind === "engage" && order.atMs === 4000));
    const drawn = shotFrom(withWithheld);
    const compared = shotFrom(withoutWithheld);
    expect(drawn.draw).toBe(compared.draw);
    const result = runScenario(withWithheld);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const withheld = result.events.find((event) => event.type === "shot-withheld");
    expect(withheld && !("draw" in withheld)).toBe(true);
  });
});

function shot(seed: number) {
  return shotFrom(createDefaultDrill(seed));
}

function shotFrom(scenario: ReturnType<typeof createDefaultDrill>) {
  const result = runScenario(scenario);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  const event = result.events.find((item) => item.type === "shot");
  if (event?.type !== "shot") throw new Error("missing shot");
  return event;
}
