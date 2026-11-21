/**
 * H0 golden DOM: exact innerHTML of the app at fixed, timer-free states,
 * recorded from the code before the H0 refactor (see tests/support/golden.ts).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/ui/App.tsx";
import { RoundEndBanner } from "../../src/ui/live/RoundEndBanner.tsx";
import type { RoundResult } from "../../src/sim/live-round.ts";
import { readGoldenText, UPDATE_GOLDEN, writeGoldenText } from "../support/golden.ts";

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return { x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 120, width: 200, height: 120, toJSON() { return {}; } };
    },
  });
});

beforeEach(() => {
  // Frames never fire: the snapshots are of static states.
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function board() {
  return screen.getByRole("img", { name: "Drill Hall" });
}

function check(name: string, html: string) {
  if (UPDATE_GOLDEN) {
    writeGoldenText(name, html);
    return;
  }
  expect(html).toBe(readGoldenText(name));
}

describe("H0 golden DOM", () => {
  it("matches at boot, after a route and Q aim, with the setup drawer, and after Go", () => {
    const { container } = render(<App />);
    check("dom-boot.html", container.innerHTML);

    fireEvent.contextMenu(board(), { clientX: 110, clientY: 55 });
    fireEvent.keyDown(window, { key: "q" });
    fireEvent.pointerMove(board(), { clientX: 120, clientY: 40, pointerId: 1 });
    check("dom-route-and-aim.html", container.innerHTML);

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    check("dom-setup-open.html", container.innerHTML);
    fireEvent.click(screen.getByRole("button", { name: "Setup" }));

    const breach = screen.getByLabelText("Breach HUD");
    fireEvent.click(within(breach).getByRole("button", { name: "Buy Flashpoint" }));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Go" }));
    });
    check("dom-after-go.html", container.innerHTML);
  });

  it("matches the round-end banner for every result kind", () => {
    const results: RoundResult[] = [
      { kind: "attack-eliminated" },
      { kind: "defense-eliminated" },
      { kind: "timeout", winner: "defense" },
    ];
    const html = results
      .map((result) => {
        const { container, unmount } = render(<RoundEndBanner result={result} onNewRound={() => undefined} />);
        const out = container.innerHTML;
        unmount();
        return out;
      })
      .join("\n");
    check("dom-round-end-banners.html", html);
  });
});
