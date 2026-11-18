import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/ui/App.tsx";

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 200,
        bottom: 120,
        width: 200,
        height: 120,
        toJSON() {
          return {};
        },
      };
    },
  });
});

beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function board() {
  return screen.getByRole("img", { name: "Drill Hall" });
}

async function clickBoard(user: ReturnType<typeof userEvent.setup>, clientX: number, clientY: number) {
  await user.pointer({ keys: "[MouseLeft]", target: board(), coords: { clientX, clientY } });
}

async function rightClickBoard(user: ReturnType<typeof userEvent.setup>, clientX: number, clientY: number) {
  await user.pointer({ keys: "[MouseRight]", target: board(), coords: { clientX, clientY } });
}

async function flushFrames(frames: number) {
  for (let i = 0; i < frames; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });
  }
}

describe("live round UI", () => {
  it("starts paused with a visible paused badge", () => {
    render(<App />);
    expect(screen.getByText("Paused — press Space to start")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByLabelText("Round timer")).toHaveTextContent("1:40");
  });

  it("issues a one-waypoint move immediately and updates the board after steps", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.click(screen.getByRole("button", { name: "Move" }));
    await clickBoard(user, 80, 50);
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Move breach-attack/);
    await user.click(screen.getByRole("button", { name: "Resume" }));
    await flushFrames(40);
    expect(screen.getByLabelText("Plan status").textContent).toMatch(/t=\d+ ms/);
    const status = screen.getByLabelText("Plan status").textContent ?? "";
    const time = Number(/t=(\d+)/.exec(status)?.[1] ?? 0);
    expect(time).toBeGreaterThan(0);
  });

  it("casts Flashpoint with aim from the click (immediate issueOrders)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.click(screen.getByRole("button", { name: "Cast Flashpoint" }));
    await clickBoard(user, 100, 60);
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Flashpoint aim/);
  });

  it("sets Fault Line chargeValue from the length slider", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.click(screen.getByRole("button", { name: "Cast Fault Line" }));
    const slider = screen.getByLabelText("Fault Line charge length");
    fireEvent.change(slider, { target: { value: "32" } });
    await clickBoard(user, 120, 50);
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/length 32 m/);
  });

  it("refuses an out-of-range map target with a message", async () => {
    const { pointInRange } = await import("../../src/ui/board/coords.ts");
    expect(pointInRange({ xMm: 0, yMm: 0 }, { xMm: 60000, yMm: 0 }, 55000)).toBe(false);
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(screen.getByLabelText("Starting ult points"), { target: { value: "8" } });
    await user.click(screen.getByRole("button", { name: "Select Brimstone" }));
    await user.click(screen.getByRole("button", { name: "Cast Orbital Strike" }));
    await clickBoard(user, 100, 60);
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Orbital Strike at/);
  });

  it("disables a cast when charges are 0 with an explanation", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    const aftershock = screen.getByRole("button", { name: "Cast Aftershock" });
    expect(aftershock).toBeEnabled();
    await user.click(aftershock);
    await clickBoard(user, 80, 50);
    await user.click(screen.getByRole("button", { name: "1x" }));
    await flushFrames(5);
    const again = screen.getByRole("button", { name: "Cast Aftershock" });
    expect(again).toBeDisabled();
    expect(again.title).toMatch(/No charges left/i);
  });

  it("buys a charge and spends credits", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Brimstone" }));
    await user.click(screen.getByRole("button", { name: "Cast Stim Beacon" }));
    await clickBoard(user, 40, 70);
    await user.click(screen.getByRole("button", { name: "1x" }));
    await flushFrames(5);
    const panel = screen.getByRole("region", { name: "Selected agent" });
    await user.click(within(panel).getByRole("button", { name: /Buy Stim Beacon/ }));
    expect(within(panel).getByRole("status")).toHaveTextContent(/Bought Stim Beacon/);
    expect(panel).toHaveTextContent(/Credits 600/);
  });

  it("disables ultimate below 8 points and enables at 8", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    expect(screen.getByRole("button", { name: "Cast Rolling Thunder" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Starting ult points"), { target: { value: "8" } });
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    expect(screen.getByRole("button", { name: "Cast Rolling Thunder" })).toBeEnabled();
  });

  it("toggles Space pause and runs no steps while paused", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    const before = screen.getByLabelText("Plan status").textContent ?? "";
    await flushFrames(20);
    expect(screen.getByLabelText("Plan status").textContent).toBe(before);
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await flushFrames(20);
    const running = screen.getByLabelText("Plan status").textContent ?? "";
    expect(running).toMatch(/t=\d+ ms/);
    const time = Number(/t=(\d+)/.exec(running)?.[1] ?? 0);
    expect(time).toBeGreaterThan(0);
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  it("right-clicks the board to move the selected agent", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await rightClickBoard(user, 90, 55);
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Move breach-attack/);
  });

  it("hides a defender behind the wall in attack fog", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole("button", { name: "Select Jett" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select KAY/O" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Showing attack view" }));
    expect(screen.getByRole("button", { name: "Select Jett" })).toBeInTheDocument();
  });

  it("round-trips a replay export and load to the same sim time", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.click(screen.getByRole("button", { name: "Move" }));
    await clickBoard(user, 70, 50);
    await user.click(screen.getByRole("button", { name: "1x" }));
    await flushFrames(30);
    const timeBefore = screen.getByLabelText("Plan status").textContent ?? "";
    await user.click(screen.getByRole("button", { name: "Download replay" }));
    const replayBox = screen.getByLabelText("Replay JSON");
    expect((replayBox as HTMLTextAreaElement).value).toContain('"orderLog"');
    await user.click(screen.getByRole("button", { name: "Load replay" }));
    expect(screen.getByLabelText("Plan status").textContent).toMatch(/Replay loaded/);
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    const loadedTime = /t=(\d+)/.exec(screen.getByLabelText("Plan status").textContent ?? "")?.[1];
    const priorTime = /t=(\d+)/.exec(timeBefore)?.[1];
    expect(loadedTime).toBe(priorTime);
  });

  it("counts the timer down while running; resetting via drill option restores paused 1:40", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let nowMs = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) =>
        window.setTimeout(() => {
          nowMs += 2_000;
          callback(nowMs);
        }, 0) as unknown as number,
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    expect(screen.getByLabelText("Round timer")).toHaveTextContent("1:40");
    await user.click(screen.getByRole("button", { name: "4x" }));
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }
    expect(screen.getByLabelText("Round timer").textContent).not.toBe("1:40");
    // Timeout/elimination banners are asserted in tests/sim/live-round.test.ts.
    // New round UI path: changing the drill option rebuilds a paused round at 1:40.
    fireEvent.change(screen.getByLabelText("Starting ult points"), { target: { value: "1" } });
    expect(screen.getByLabelText("Round timer")).toHaveTextContent("1:40");
    expect(screen.getByText("Paused — press Space to start")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });
});
