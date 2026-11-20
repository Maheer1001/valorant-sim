import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  allCharacterizationCaptures,
  type CharacterizationCapture,
} from "./characterization/scenarios.ts";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/characterization",
);

/** Set to rewrite fixtures after an intentional engine change. Never set in CI. */
const UPDATE = process.env.VALSIM_UPDATE_FIXTURES === "1";

function loadFixture(id: string): CharacterizationCapture {
  const raw = readFileSync(path.join(FIXTURE_DIR, `${id}.json`), "utf8");
  return JSON.parse(raw) as CharacterizationCapture;
}

describe("live engine characterization fixtures", () => {
  if (UPDATE) {
    it("rewrites fixtures (VALSIM_UPDATE_FIXTURES=1)", () => {
      mkdirSync(FIXTURE_DIR, { recursive: true });
      for (const capture of allCharacterizationCaptures()) {
        writeFileSync(path.join(FIXTURE_DIR, `${capture.id}.json`), `${JSON.stringify(capture, null, 2)}\n`);
      }
    });
    return;
  }

  it("has exactly one fixture file per capture id", () => {
    const ids = allCharacterizationCaptures().map((capture) => `${capture.id}.json`).sort();
    const files = readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json")).sort();
    expect(files).toEqual(ids);
  });

  it("matches stored event streams, final worlds and results for every scenario", () => {
    for (const live of allCharacterizationCaptures()) {
      const fixture = loadFixture(live.id);
      expect(live.events, live.id).toEqual(fixture.events);
      expect(live.finalWorld, live.id).toEqual(fixture.finalWorld);
      expect(live.result, live.id).toEqual(fixture.result);
    }
  });
});
