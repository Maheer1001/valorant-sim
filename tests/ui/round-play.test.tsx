import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/ui/App.tsx";
import { SHIPPED_CATALOG } from "../../src/sim/agents/catalog.ts";
import { isLiveRound, openLiveRound, stepLive } from "../../src/sim/live-round.ts";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import { createPlayableDrill } from "../../src/ui/scenario/playableDrill.ts";
import { serializeReplay, REPLAY_FILE_VERSION } from "../../src/ui/live/replayFile.ts";
import { resultBanner, RoundEndBanner } from "../../src/ui/live/RoundEndBanner.tsx";
import { defenseHoldDecide } from "../../src/tactics/defense-stub.ts";

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

async function openSetup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Setup" }));
}

/** Buy common Breach charges and enter live (paused). */
async function clickGo(user: ReturnType<typeof userEvent.setup>, options?: { flash?: number; aftershock?: boolean }) {
  const flashBuys = options?.flash ?? 2;
  const breach = screen.getByLabelText("Breach HUD");
  for (let i = 0; i < flashBuys; i += 1) {
    const buy = within(breach).queryByRole("button", { name: "Buy Flashpoint" });
    if (buy && !buy.hasAttribute("disabled")) await user.click(buy);
  }
  if (options?.aftershock !== false) {
    const buyAs = within(breach).queryByRole("button", { name: "Buy Aftershock" });
    if (buyAs && !buyAs.hasAttribute("disabled")) await user.click(buyAs);
  }
  await user.click(screen.getByRole("button", { name: "Go" }));
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

function timeoutReplay(): string {
  const scenario = createPlayableDrill(1);
  const opened = openLiveRound(scenario, SHIPPED_CATALOG, STANDARD_RULESET, {
    decide: defenseHoldDecide,
  });
  if (!isLiveRound(opened)) throw new Error(opened.message);
  stepLive(opened, Math.ceil(STANDARD_RULESET.roundDurationMs / STANDARD_RULESET.simStepMs) + 2);
  expect(opened.phase).toBe("ended");
  expect(opened.result?.kind).toBe("timeout");
  return serializeReplay({
    version: REPLAY_FILE_VERSION,
    scenario,
    seed: scenario.seed,
    orderLog: structuredClone(opened.orderLog),
    simTimeMs: opened.world.timeMs,
  });
}

describe("live round UI", () => {
  it("starts paused with a visible paused badge after Go", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickGo(user);
    expect(screen.getByText("Paused — press Space to start")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByLabelText("Round timer")).toHaveTextContent("1:40");
  });

  it("keeps the Setup drawer closed by default and opens it", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(document.getElementById("setup-drawer")?.hidden).toBe(true);
    expect(screen.queryByRole("button", { name: "Close setup" })).toBeNull();
    await openSetup(user);
    expect(document.getElementById("setup-drawer")?.hidden).toBe(false);
    expect(screen.getByRole("button", { name: "Close setup" })).toBeInTheDocument();
  });

  it("renders the board stage before the Setup drawer in DOM order", () => {
    const { container } = render(<App />);
    const stage = container.querySelector('[aria-label="Game stage"]');
    expect(stage?.firstElementChild?.classList.contains("board-shell")).toBe(true);
    expect(stage?.lastElementChild?.id).toBe("setup-drawer");
  });

  it("issues a one-waypoint move immediately and updates the board after steps", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await clickGo(user);
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

  it("selects attackers with keys 1-5 and clears with Escape", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickGo(user);
    await user.keyboard("2");
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Selected brimstone-attack/);
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Selection cleared/);
  });

  it("drag-box selects attackers on the board", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickGo(user);
    const svg = board();
    fireEvent.pointerDown(svg, { button: 0, clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerMove(svg, { button: 0, clientX: 195, clientY: 115, pointerId: 1 });
    fireEvent.pointerUp(svg, { button: 0, clientX: 195, clientY: 115, pointerId: 1 });
    expect(screen.getByLabelText("Plan status").textContent).toMatch(/Selected breach-attack/);
  });

  it("casts Flashpoint with aim from the click (immediate issueOrders)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickGo(user);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.click(screen.getByRole("button", { name: "Cast Flashpoint" }));
    await clickBoard(user, 100, 60);
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Flashpoint aim/);
  });

  it("arms Flashpoint with hotkey Q then confirms with a click", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickGo(user);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.keyboard("q");
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Armed Flashpoint/);
    await clickBoard(user, 100, 60);
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Flashpoint aim/);
  });

  it("sets Fault Line chargeValue from the length slider", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickGo(user);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.click(screen.getByRole("button", { name: "Cast Fault Line" }));
    const slider = screen.getByLabelText("Fault Line charge length");
    fireEvent.change(slider, { target: { value: "32" } });
    await clickBoard(user, 120, 50);
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/length 32 m/);
  });

  it("arms Fault Line with E and changes length via wheel (clamped, preview grows)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickGo(user);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.keyboard("e");
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Armed Fault Line/);
    fireEvent.mouseMove(board(), { clientX: 150, clientY: 60 });
    const slider = screen.getByLabelText("Fault Line charge length");
    expect(slider).toHaveValue("20");
    const extent = (el: Element) => {
      const pts = (el.getAttribute("points") ?? "")
        .trim()
        .split(/\s+/)
        .map((pair) => {
          const [x, y] = pair.split(",").map(Number);
          return { x: x ?? 0, y: y ?? 0 };
        });
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    };
    const before = extent(screen.getByTestId("fault-line-preview"));
    await act(async () => {
      fireEvent.wheel(board(), { deltaY: -100 });
    });
    expect(slider).toHaveValue("21");
    const after = extent(screen.getByTestId("fault-line-preview"));
    expect(after).toBeGreaterThan(before);
    await act(async () => {
      for (let i = 0; i < 80; i += 1) fireEvent.wheel(board(), { deltaY: -100 });
    });
    expect(slider).toHaveValue("56");
    await act(async () => {
      for (let i = 0; i < 80; i += 1) fireEvent.wheel(board(), { deltaY: 100 });
    });
    expect(slider).toHaveValue("8");
  });

  it("refuses an out-of-range map target with a message", async () => {
    const { pointInRange } = await import("../../src/ui/board/coords.ts");
    expect(pointInRange({ xMm: 0, yMm: 0 }, { xMm: 60000, yMm: 0 }, 55000)).toBe(false);
    const user = userEvent.setup();
    render(<App />);
    await openSetup(user);
    fireEvent.change(screen.getByLabelText("Starting ult points"), { target: { value: "8" } });
    await clickGo(user);
    await user.click(screen.getByRole("button", { name: "Select Brimstone" }));
    await user.click(screen.getByRole("button", { name: "Cast Orbital Strike" }));
    await clickBoard(user, 100, 60);
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Orbital Strike at/);
  });

  it("disables a cast when charges are 0 with an explanation", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await clickGo(user);
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
    const brim = screen.getByLabelText("Brimstone HUD");
    await user.click(within(brim).getByRole("button", { name: "Buy Stim Beacon" }));
    await clickGo(user, { flash: 0, aftershock: false });
    await user.click(screen.getByRole("button", { name: "Select Brimstone" }));
    await user.click(screen.getByRole("button", { name: "Cast Stim Beacon" }));
    await clickBoard(user, 40, 70);
    await user.click(screen.getByRole("button", { name: "1x" }));
    await flushFrames(5);
    await openSetup(user);
    const panel = screen.getByRole("region", { name: "Selected agent" });
    await user.click(within(panel).getByRole("button", { name: /Buy Stim Beacon/ }));
    expect(within(panel).getByRole("status")).toHaveTextContent(/Bought Stim Beacon/);
    // Pre-round buy (-200) then live buy (-200) from 800.
    expect(panel).toHaveTextContent(/Credits 400/);
  });

  it("disables ultimate below 8 points and enables at 8", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickGo(user);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    expect(screen.getByRole("button", { name: "Cast Rolling Thunder" })).toBeDisabled();
    await openSetup(user);
    fireEvent.change(screen.getByLabelText("Starting ult points"), { target: { value: "8" } });
    await clickGo(user);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    expect(screen.getByRole("button", { name: "Cast Rolling Thunder" })).toBeEnabled();
  });

  it("toggles Space pause and runs no steps while paused", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await clickGo(user);
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
    await clickGo(user);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await rightClickBoard(user, 90, 55);
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Move breach-attack/);
  });

  it("Shift+right-click appends a waypoint", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickGo(user);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await rightClickBoard(user, 70, 50);
    fireEvent.contextMenu(board(), { clientX: 110, clientY: 55, shiftKey: true });
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Append waypoint/);
  });

  it("hides defenders behind the wall in attack fog", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickGo(user);
    expect(screen.queryByRole("button", { name: "Select Jett" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select KAY/O" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Showing attack view" }));
    expect(screen.getByRole("button", { name: "Select Jett" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select KAY/O" })).toBeInTheDocument();
  });

  it("keeps the default drill quiet for the first 15 seconds at 1x", () => {
    const scenario = createPlayableDrill(1);
    const opened = openLiveRound(scenario, SHIPPED_CATALOG, STANDARD_RULESET, {
      decide: defenseHoldDecide,
    });
    if (!isLiveRound(opened)) throw new Error(opened.message);
    const steps = Math.ceil(15_000 / STANDARD_RULESET.simStepMs);
    stepLive(opened, steps);
    expect(opened.world.timeMs).toBeGreaterThanOrEqual(15_000);
    // Withheld auto-fire attempts may log; no resolved shots or damage.
    expect(opened.events.filter((event) => event.type === "shot")).toEqual([]);
    expect(opened.events.filter((event) => event.type === "ability-damage")).toEqual([]);
    expect(opened.world.agents.every((agent) => agent.alive && agent.hp === 100)).toBe(true);
  });

  it("round-trips a replay export and load to the same sim time", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await clickGo(user);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.click(screen.getByRole("button", { name: "Move" }));
    await clickBoard(user, 70, 50);
    await user.click(screen.getByRole("button", { name: "1x" }));
    await flushFrames(30);
    const timeBefore = screen.getByLabelText("Plan status").textContent ?? "";
    await user.click(screen.getByRole("button", { name: "Download replay" }));
    const replayBox = screen.getByLabelText("Replay JSON");
    expect((replayBox as HTMLTextAreaElement).value).toContain('"orderLog"');
    await user.click(screen.getAllByRole("button", { name: "Load replay" }).at(-1)!);
    expect(screen.getByLabelText("Plan status").textContent).toMatch(/Replay loaded/);
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    const loadedTime = /t=(\d+)/.exec(screen.getByLabelText("Plan status").textContent ?? "")?.[1];
    const priorTime = /t=(\d+)/.exec(timeBefore)?.[1];
    expect(loadedTime).toBe(priorTime);
  });

  it("counts the timer down while running; resetting via drill option restores pre-round then Go", async () => {
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
    await clickGo(user);
    expect(screen.getByLabelText("Round timer")).toHaveTextContent("1:40");
    await user.click(screen.getByRole("button", { name: "4x" }));
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    }
    expect(screen.getByLabelText("Round timer").textContent).not.toBe("1:40");
    await openSetup(user);
    fireEvent.change(screen.getByLabelText("Starting ult points"), { target: { value: "1" } });
    expect(screen.getByLabelText("Phase")).toHaveTextContent("Pre-round");
    await clickGo(user);
    expect(screen.getByLabelText("Round timer")).toHaveTextContent("1:40");
    expect(screen.getByText("Paused — press Space to start")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  it("shows the timeout banner and New round returns to pre-round", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSetup(user);
    fireEvent.change(screen.getByLabelText("Replay JSON"), { target: { value: timeoutReplay() } });
    await user.click(screen.getAllByRole("button", { name: "Load replay" }).at(-1)!);
    expect(screen.getByText(resultBanner({ kind: "timeout", winner: "defense" }))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New round" }));
    expect(screen.getByLabelText("Phase")).toHaveTextContent("Pre-round");
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });

  it("shows attackers-eliminated and defenders-eliminated banners", async () => {
    const onNewRound = vi.fn();
    const { rerender } = render(
      <RoundEndBanner result={{ kind: "attack-eliminated" }} onNewRound={onNewRound} />,
    );
    expect(screen.getByText(/Defenders win — all attackers eliminated/)).toBeInTheDocument();
    rerender(<RoundEndBanner result={{ kind: "defense-eliminated" }} onNewRound={onNewRound} />);
    expect(screen.getByText(/Attackers win — all defenders eliminated/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "New round" }));
    expect(onNewRound).toHaveBeenCalledTimes(1);
  });

  it("HUD cast buttons expose charges, cooldown and disabled reasons", async () => {
    const user = userEvent.setup();
    render(<App />);
    await clickGo(user);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    const aftershock = screen.getByRole("button", { name: "Cast Aftershock" });
    expect(aftershock.title).toMatch(/Aftershock/);
    expect(screen.getByRole("button", { name: "Cast Rolling Thunder" }).title).toMatch(/Need 8 ult/);
  });
});
