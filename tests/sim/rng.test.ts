import { describe, expect, it } from "vitest";
import { createStream, forkSeed } from "../../src/sim/rng.ts";

describe("seeded streams", () => {
  it("repeats a stream and keeps forks isolated", () => {
    const first = createStream(42, "combat");
    const second = createStream(42, "combat");
    const draws = [first.nextInt(10000), first.nextInt(10000), first.nextInt(10000)];
    expect([second.nextInt(10000), second.nextInt(10000), second.nextInt(10000)]).toEqual(draws);
    expect(forkSeed(42, "combat")).not.toBe(forkSeed(42, "abilities"));
    const abilities = createStream(42, "abilities");
    const abilityDraws = [abilities.nextInt(10000), abilities.nextInt(10000), abilities.nextInt(10000)];
    expect(abilityDraws).not.toEqual(draws);
  });
});
