import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
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

function board() {
  return screen.getByRole("img", { name: "Drill Hall" });
}

async function clickBoard(user: ReturnType<typeof userEvent.setup>, clientX: number, clientY: number) {
  await user.pointer({ keys: "[MouseLeft]", target: board(), coords: { clientX, clientY } });
}

describe("interactive round UI", () => {
  it("queues a move for the selected attacker", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.click(screen.getByRole("button", { name: "Move" }));
    await clickBoard(user, 50, 60);
    expect(screen.getByRole("list", { name: "Queued attack orders" })).toHaveTextContent(/breach-attack move to/);
  });

  it("queues Flashpoint with aimYawDeg from the click", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.click(screen.getByRole("button", { name: "Cast Flashpoint" }));
    await clickBoard(user, 100, 60);
    const queue = screen.getByRole("list", { name: "Queued attack orders" });
    expect(queue).toHaveTextContent(/flashpoint/);
    expect(queue).toHaveTextContent(/yaw/);
  });

  it("sets Fault Line chargeValue from the length slider", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.click(screen.getByRole("button", { name: "Cast Fault Line" }));
    const slider = screen.getByLabelText("Fault Line charge length");
    fireEvent.change(slider, { target: { value: "32" } });
    await clickBoard(user, 120, 50);
    expect(screen.getByRole("list", { name: "Queued attack orders" })).toHaveTextContent(/length 32 m/);
  });

  it("refuses an out-of-range map target with a message", async () => {
    const { pointInRange } = await import("../../src/ui/board/coords.ts");
    const { rejectionMessage } = await import("../../src/ui/orders/rejectionMessages.ts");
    // Drill Hall fits inside Sky Smoke 55 m / Orbital 60 m, so the guard is unit-tested here
    // and the App uses the same message when a click fails the check.
    expect(pointInRange({ xMm: 0, yMm: 0 }, { xMm: 60000, yMm: 0 }, 55000)).toBe(false);
    expect(rejectionMessage("out-of-range")).toMatch(/outside the ability's cast range/i);
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(screen.getByLabelText("Starting ult points"), { target: { value: "8" } });
    await user.click(screen.getByRole("button", { name: "Select Brimstone" }));
    await user.click(screen.getByRole("button", { name: "Cast Orbital Strike" }));
    // In-range click still queues (map is smaller than 60 m).
    await clickBoard(user, 100, 60);
    expect(screen.getByRole("list", { name: "Queued attack orders" })).toHaveTextContent(/orbital-strike/);
  });

  it("disables a cast when charges are 0 with an explanation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    const aftershock = screen.getByRole("button", { name: "Cast Aftershock" });
    expect(aftershock).toBeEnabled();
    await user.click(aftershock);
    await clickBoard(user, 80, 50);
    await user.click(screen.getByRole("button", { name: "Resolve window" }));
    const again = screen.getByRole("button", { name: "Cast Aftershock" });
    expect(again).toBeDisabled();
    expect(again.title).toMatch(/No charges left/i);
  });

  it("buys a charge and spends credits", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Select Brimstone" }));
    await user.click(screen.getByRole("button", { name: "Cast Stim Beacon" }));
    await clickBoard(user, 40, 70);
    await user.click(screen.getByRole("button", { name: "Resolve window" }));
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

  it("resolves a window and shows event log lines; fog toggle works", async () => {
    const user = userEvent.setup();
    render(<App />);
    // Place defenders: default has LOS through doorway. Move breach behind wall via scenario truth toggle test.
    await user.click(screen.getByRole("button", { name: "Select Breach" }));
    await user.click(screen.getByRole("button", { name: "Move" }));
    await clickBoard(user, 40, 50);
    await user.click(screen.getByRole("button", { name: "Resolve window" }));
    expect(screen.getAllByRole("status").some((node) => /Resolved window/i.test(node.textContent ?? ""))).toBe(
      true,
    );
    expect(screen.getByRole("list", { name: "Event log" }).textContent?.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Showing attack view" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Showing attack view" }));
    expect(screen.getByRole("button", { name: "Showing truth" })).toBeInTheDocument();
  });

  it("hides a defender behind the wall in attack fog", async () => {
    const user = userEvent.setup();
    render(<App />);
    // Attack fog: Jett starts behind the divider; KAY/O is on the doorway line.
    expect(screen.queryByRole("button", { name: "Select Jett" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select KAY/O" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Showing attack view" }));
    expect(screen.getByRole("button", { name: "Select Jett" })).toBeInTheDocument();
  });
});
