import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DRILL_HALL } from "../../src/sim/map/drill-hall.ts";
import { App } from "../../src/ui/App.tsx";
import { createPlayableDrill } from "../../src/ui/scenario/playableDrill.ts";

/**
 * Letterboxed board: the SVG box is 3:1 while Drill Hall is 5:3, so with
 * preserveAspectRatio="xMidYMid meet" the map is drawn 833.33 px wide, centred,
 * with empty bars left and right. jsdom has no layout, so the rect is mocked and
 * MapView falls back to the rect-based letterbox math (no getScreenCTM in jsdom).
 */
const BOARD = { left: 0, top: 0, width: 1500, height: 500 };

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return {
        x: BOARD.left,
        y: BOARD.top,
        left: BOARD.left,
        top: BOARD.top,
        right: BOARD.left + BOARD.width,
        bottom: BOARD.top + BOARD.height,
        width: BOARD.width,
        height: BOARD.height,
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
});

/** Where a map point is DRAWN on this board (forward meet transform, written out independently). */
function drawnClient(xMm: number, yMm: number): { clientX: number; clientY: number } {
  const scale = Math.min(BOARD.width / DRILL_HALL.widthMm, BOARD.height / DRILL_HALL.heightMm);
  const offsetX = (BOARD.width - DRILL_HALL.widthMm * scale) / 2;
  const offsetY = (BOARD.height - DRILL_HALL.heightMm * scale) / 2;
  return { clientX: BOARD.left + offsetX + xMm * scale, clientY: BOARD.top + offsetY + yMm * scale };
}

const SITE_A = DRILL_HALL.sites[0]!;
const SITE_A_CENTRE = {
  xMm: SITE_A.xMm + SITE_A.widthMm / 2,
  yMm: SITE_A.yMm + SITE_A.heightMm / 2,
};

function board() {
  return screen.getByRole("img", { name: "Drill Hall" });
}

describe("letterboxed board click mapping", () => {
  it("draws Site A centre where the test expects it (guards the fixture math)", () => {
    expect(SITE_A_CENTRE).toEqual({ xMm: 16750, yMm: 6000 });
    const drawn = drawnClient(SITE_A_CENTRE.xMm, SITE_A_CENTRE.yMm);
    expect(drawn.clientX).toBeCloseTo(1031.25, 6);
    expect(drawn.clientY).toBeCloseTo(250, 6);
  });

  it("puts a pre-round right-click waypoint within 1 mm of the drawn Site A centre", () => {
    render(<App />);
    fireEvent.contextMenu(board(), drawnClient(SITE_A_CENTRE.xMm, SITE_A_CENTRE.yMm));
    expect(screen.getByLabelText("Plan status")).toHaveTextContent(/Move breach-attack/);
    const disc = screen.getByTestId("route-waypoint-breach-attack-0");
    const cx = Number(disc.getAttribute("cx"));
    const cy = Number(disc.getAttribute("cy"));
    expect(Math.abs(cx - SITE_A_CENTRE.xMm)).toBeLessThanOrEqual(1);
    expect(Math.abs(cy - SITE_A_CENTRE.yMm)).toBeLessThanOrEqual(1);
  });

  it("drag-box selects by drawn positions, not by raw client fractions", () => {
    render(<App />);
    // Box drawn tightly around Brimstone's drawn position (Breach is 2 m away and must stay out).
    const brim = createPlayableDrill(1).attack.members.find((m) => m.instanceId === "brimstone-attack")!;
    const a = drawnClient(brim.xMm - 400, brim.yMm - 400);
    const b = drawnClient(brim.xMm + 400, brim.yMm + 400);
    fireEvent.pointerDown(board(), { button: 0, clientX: a.clientX, clientY: a.clientY, pointerId: 1 });
    fireEvent.pointerMove(board(), { button: 0, clientX: b.clientX, clientY: b.clientY, pointerId: 1 });
    fireEvent.pointerUp(board(), { button: 0, clientX: b.clientX, clientY: b.clientY, pointerId: 1 });
    expect(screen.getByLabelText("Plan status")).toHaveTextContent("Selected brimstone-attack.");
  });
});
