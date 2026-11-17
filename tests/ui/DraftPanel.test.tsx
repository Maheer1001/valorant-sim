import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../../src/ui/App.tsx";
import { CATALOG_VERSION } from "../../src/sim/agents/catalog.ts";

describe("draft panel", () => {
  it("shows the catalog and changes coverage when Brimstone leaves Attack", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("button", { name: "Brimstone, Controller" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "KAY/O, Initiator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jett, Duelist" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cypher, Sentinel" })).toBeInTheDocument();

    const kit = screen.getByRole("region", { name: "Agent kit" });
    expect(within(kit).getByText("Sky Smoke")).toBeInTheDocument();
    expect(within(kit).getByText("Stim Beacon")).toBeInTheDocument();
    expect(within(kit).getAllByText(/complete/).length).toBeGreaterThanOrEqual(4);

    await user.click(screen.getByRole("button", { name: "KAY/O, Initiator" }));
    expect(within(screen.getByRole("region", { name: "Agent kit" })).getByText("FLASH/DRIVE")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Agent kit" })).getAllByText("placeholder").length).toBeGreaterThan(0);

    const attack = screen.getByRole("region", { name: "Attack coverage" });
    expect(attack).toHaveTextContent("smoke: Brimstone Sky Smoke");

    await user.click(screen.getByRole("button", { name: "Remove Brimstone from Attack" }));
    expect(screen.getByRole("region", { name: "Attack coverage" })).toHaveTextContent(/Gaps:.*smoke/);
    expect(screen.getByRole("region", { name: "Attack coverage" })).not.toHaveTextContent("Brimstone Sky Smoke");
  });

  it("steps the timeline and exports the scenario", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByLabelText("Timeline position")).toHaveTextContent(/^0 \//);
    await user.click(screen.getByRole("button", { name: "Resolve window" }));
    expect(screen.getByLabelText("Timeline position")).toHaveTextContent(/^0 \//);
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByLabelText("Timeline position")).toHaveTextContent(/^1 \//);
    expect(screen.getByRole("listitem", { current: "step" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export scenario" }));
    const file = screen.getByLabelText("Scenario JSON");
    if (!(file instanceof HTMLTextAreaElement)) throw new Error("Scenario JSON is not a textarea.");
    expect(file.value).toContain(CATALOG_VERSION);
  });
});
