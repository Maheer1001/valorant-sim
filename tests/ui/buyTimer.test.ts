import { describe, expect, it } from "vitest";
import { formatBuyTimer, tickBuyTimer } from "../../src/ui/preround/buyTimer.ts";

describe("buyTimer", () => {
  it("freezes when hold is on", () => {
    expect(tickBuyTimer({ remainingMs: 12_000, hold: true }, 5_000)).toEqual({
      remainingMs: 12_000,
      hold: true,
    });
  });

  it("counts down when hold is off and clamps at 0", () => {
    expect(tickBuyTimer({ remainingMs: 12_000, hold: false }, 5_000).remainingMs).toBe(7_000);
    expect(tickBuyTimer({ remainingMs: 1_000, hold: false }, 5_000).remainingMs).toBe(0);
  });

  it("formats m:ss", () => {
    expect(formatBuyTimer(30_000)).toBe("0:30");
    expect(formatBuyTimer(90_000)).toBe("1:30");
  });
});
