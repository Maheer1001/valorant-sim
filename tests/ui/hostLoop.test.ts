import { describe, expect, it } from "vitest";
import { cycleSpeedDown, cycleSpeedUp, formatRoundTimer, hostLoopStep } from "../../src/ui/live/hostLoop.ts";

describe("hostLoop", () => {
  it("produces the same step count for different frame sequences with the same total elapsed", () => {
    const simStepMs = 50;
    const speed = 1 as const;
    const framesA = [16, 16, 16, 16, 16];
    const framesB = [33, 10, 20, 17];
    const totalA = framesA.reduce((sum, ms) => sum + ms, 0);
    const totalB = framesB.reduce((sum, ms) => sum + ms, 0);
    expect(totalA).toBe(totalB);

    let acc = 0;
    let stepsA = 0;
    for (const elapsedMs of framesA) {
      const out = hostLoopStep({ elapsedMs, speed, accumulator: acc, simStepMs });
      stepsA += out.steps;
      acc = out.accumulator;
    }

    acc = 0;
    let stepsB = 0;
    for (const elapsedMs of framesB) {
      const out = hostLoopStep({ elapsedMs, speed, accumulator: acc, simStepMs });
      stepsB += out.steps;
      acc = out.accumulator;
    }
    expect(stepsA).toBe(stepsB);
  });

  it("returns zero steps while paused (speed 0) and keeps alpha from the accumulator", () => {
    const out = hostLoopStep({
      elapsedMs: 1000,
      speed: 0,
      accumulator: 0.4,
      simStepMs: 50,
    });
    expect(out.steps).toBe(0);
    expect(out.accumulator).toBe(0.4);
    expect(out.alpha).toBe(0.4);
  });

  it("scales steps with speed for the same wall-clock elapsed", () => {
    const base = hostLoopStep({ elapsedMs: 200, speed: 1, accumulator: 0, simStepMs: 50 });
    const double = hostLoopStep({ elapsedMs: 200, speed: 2, accumulator: 0, simStepMs: 50 });
    expect(double.steps).toBe(base.steps * 2);
  });

  it("caps steps per frame and drops excess time", () => {
    const out = hostLoopStep({
      elapsedMs: 10_000,
      speed: 4,
      accumulator: 0,
      simStepMs: 50,
      maxStepsPerFrame: 10,
    });
    expect(out.steps).toBe(10);
    expect(out.accumulator).toBe(0);
  });

  it("formats the round timer as m:ss", () => {
    expect(formatRoundTimer(100_000)).toBe("1:40");
    expect(formatRoundTimer(65_000)).toBe("1:05");
    expect(formatRoundTimer(500)).toBe("0:00");
  });

  it("cycles speed with brackets helpers", () => {
    expect(cycleSpeedUp(1)).toBe(2);
    expect(cycleSpeedUp(4)).toBe(4);
    expect(cycleSpeedDown(2)).toBe(1);
    expect(cycleSpeedDown(0.5)).toBe(0.5);
  });
});
