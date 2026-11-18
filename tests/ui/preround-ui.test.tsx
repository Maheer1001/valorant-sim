import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/ui/App.tsx";
import { STANDARD_RULESET } from "../../src/rules/ruleset.ts";
import { parseReplay } from "../../src/ui/live/replayFile.ts";
import type { PreRoundPlan } from "../../src/sim/preround.ts";

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

function readPlan(): PreRoundPlan {
  const node = screen.getByTestId("pre-round-plan");
  return JSON.parse(node.textContent ?? "{}") as PreRoundPlan;
}

describe("pre-round UI", () => {
  it("boots into pre-round without rendering defenders", () => {
    render(<App />);
    expect(screen.getByLabelText("Phase")).toHaveTextContent("Pre-round");
    expect(screen.getByLabelText("Buy timer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select Jett" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select KAY/O" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Round timer")).not.toBeInTheDocument();
  });

  it("hold timer keeps remaining time; hold off counts down and auto-Goes at 0", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    const timer = screen.getByLabelText("Buy timer");
    expect(timer).toHaveTextContent("0:30");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(timer).toHaveTextContent("0:30");

    await user.click(screen.getByLabelText("Hold timer"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(timer.textContent).not.toBe("0:30");

    // Jump remaining to near zero via hold-off ticks covering buyPhaseMs.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STANDARD_RULESET.buyPhaseMs + 1_000);
    });
    expect(screen.getByLabelText("Round timer")).toHaveTextContent("1:40");
    expect(screen.getByText("Paused — press Space to start")).toBeInTheDocument();
  });

  it("buy +/- changes credits and charges and shows disabled reasons", async () => {
    const user = userEvent.setup();
    render(<App />);
    const breach = screen.getByLabelText("Breach HUD");
    expect(breach).toHaveTextContent(/800c/);
    const buyFlash = within(breach).getByRole("button", { name: "Buy Flashpoint" });
    expect(buyFlash).toBeEnabled();
    await user.click(buyFlash);
    expect(breach).toHaveTextContent(/550c/);
    expect(breach).toHaveTextContent(/Flashpoint 1\/2/);
    await user.click(buyFlash);
    expect(breach).toHaveTextContent(/Flashpoint 2\/2/);
    expect(buyFlash).toBeDisabled();
    expect(buyFlash.title).toMatch(/already at max|charges/i);

    await user.click(within(breach).getByRole("button", { name: "Refund Flashpoint" }));
    expect(breach).toHaveTextContent(/Flashpoint 1\/2/);
    expect(breach).toHaveTextContent(/550c|800c/);
  });

  it("route plus one cast via real interactions is <= 4 steps and builds the plan", async () => {
    const user = userEvent.setup();
    render(<App />);
    // 1 select (already default breach) — count from route
    await rightClickBoard(user, 90, 55); // 2 route
    await user.keyboard("q"); // hotkey arm
    await clickBoard(user, 100, 60); // 3 aim adds cast
    const plan = readPlan();
    expect(plan.version).toBe(1);
    expect(plan.side).toBe("attack");
    const breach = plan.agents.find((a) => a.instanceId === "breach-attack");
    expect(breach?.route.length).toBe(1);
    expect(breach?.abilities).toHaveLength(1);
    expect(breach?.abilities[0]?.abilityId).toBe("flashpoint");
    expect(breach?.abilities[0]?.trigger).toEqual({ kind: "at-waypoint", waypointIndex: 0 });
  });

  it("edits a trigger, deletes a step, and drops waypoint steps when the route shortens", async () => {
    const user = userEvent.setup();
    render(<App />);
    await rightClickBoard(user, 70, 50);
    fireEvent.contextMenu(board(), { clientX: 110, clientY: 55, shiftKey: true });
    await user.keyboard("q");
    await clickBoard(user, 100, 60);
    let plan = readPlan();
    const stepId = plan.agents[0]?.abilities[0]?.id;
    expect(stepId).toBeTruthy();
    await user.click(screen.getByTestId(`plan-step-${stepId}`).querySelector("button")!);
    const time = screen.getByLabelText(`Trigger time ${stepId}`);
    fireEvent.change(time, { target: { value: "12.5" } });
    const kind = screen.getByLabelText(`Trigger kind ${stepId}`);
    fireEvent.change(kind, { target: { value: "at-time" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    plan = readPlan();
    expect(plan.agents[0]?.abilities[0]?.trigger).toEqual({ kind: "at-time", timeMs: 12_500 });

    await user.click(screen.getByRole("button", { name: "Delete Flashpoint step" }));
    plan = readPlan();
    expect(plan.agents[0]?.abilities ?? []).toHaveLength(0);

    // Ensure two waypoints, then queue a cast on waypoint 1.
    await rightClickBoard(user, 70, 50);
    fireEvent.contextMenu(board(), { clientX: 110, clientY: 55, shiftKey: true });
    plan = readPlan();
    expect(plan.agents.find((a) => a.instanceId === "breach-attack")?.route.length).toBe(2);
    await user.keyboard("q");
    await clickBoard(user, 100, 60);
    plan = readPlan();
    expect(plan.agents[0]?.abilities[0]?.trigger).toEqual({ kind: "at-waypoint", waypointIndex: 1 });
    // Replace route with one waypoint — drops index 1 step.
    await rightClickBoard(user, 80, 50);
    plan = readPlan();
    expect(plan.agents[0]?.abilities ?? []).toHaveLength(0);
    expect(screen.getByLabelText("Plan status").textContent).toMatch(/Dropped plan steps/);
  });

  it("Go failure shows the message and stays in pre-round", async () => {
    const user = userEvent.setup();
    render(<App />);
    const breach = screen.getByLabelText("Breach HUD");
    // Soft-reserve oversubscribe: queue 1 flash with 0 charges (no buy).
    await user.keyboard("q");
    await clickBoard(user, 100, 60);
    expect(readPlan().agents[0]?.abilities).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByLabelText("Phase")).toHaveTextContent("Pre-round");
    expect(screen.getByLabelText("Plan status").textContent).toMatch(/charges|No charges/i);
    expect(screen.queryByLabelText("Round timer")).not.toBeInTheDocument();
    expect(breach).toBeInTheDocument();
  });

  it("Go success starts paused at 1:40 and plan casts fire after Space", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    const breach = screen.getByLabelText("Breach HUD");
    await user.click(within(breach).getByRole("button", { name: "Buy Flashpoint" }));
    await user.keyboard("q");
    await clickBoard(user, 100, 60);
    // Edit to at-time 0 so it fires on first steps.
    const stepId = readPlan().agents[0]!.abilities[0]!.id;
    await user.click(
      within(screen.getByTestId(`plan-step-${stepId}`)).getByRole("button", { name: /at waypoint|at \d/i }),
    );
    fireEvent.change(screen.getByLabelText(`Trigger kind ${stepId}`), { target: { value: "at-time" } });
    fireEvent.change(screen.getByLabelText(`Trigger time ${stepId}`), { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByLabelText("Round timer")).toHaveTextContent("1:40");
    expect(screen.getByText("Paused — press Space to start")).toBeInTheDocument();
    await user.keyboard(" ");
    await flushFrames(10);
    const status = screen.getByLabelText("Plan status").textContent ?? "";
    expect(status).toMatch(/t=\d+ ms/);
    const time = Number(/t=(\d+)/.exec(status)?.[1] ?? 0);
    expect(time).toBeGreaterThan(0);
  });

  it("replay download after a pre-round round includes v2, post-buy scenario, and preRoundPlan", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    const brim = screen.getByLabelText("Brimstone HUD");
    await user.click(within(brim).getByRole("button", { name: "Buy Stim Beacon" }));
    await user.click(screen.getByRole("button", { name: "Go" }));
    await user.click(screen.getByRole("button", { name: "1x" }));
    await flushFrames(20);
    await user.click(screen.getByRole("button", { name: "Download replay" }));
    const text = (screen.getByLabelText("Replay JSON") as HTMLTextAreaElement).value;
    expect(text).toContain('"version": 2');
    const file = parseReplay(text);
    expect(file.version).toBe(2);
    expect(file.preRoundPlan).toBeTruthy();
    expect(file.preRoundPlan?.buys).toEqual([{ instanceId: "brimstone-attack", abilityId: "stim-beacon" }]);
    const stim = file.scenario.attack.members.find((m) => m.instanceId === "brimstone-attack");
    expect(stim?.charges["stim-beacon"]).toBe(1);
    expect(stim?.credits).toBe(STANDARD_RULESET.startingCredits - 200);

    await user.click(screen.getAllByRole("button", { name: "Load replay" }).at(-1)!);
    expect(screen.getByLabelText("Plan status").textContent).toMatch(/Replay loaded/);
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });
});
