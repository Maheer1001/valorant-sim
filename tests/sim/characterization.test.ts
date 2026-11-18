import { readFileSync, readdirSync } from "node:fs";
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

function loadFixture(id: string): CharacterizationCapture {
  const raw = readFileSync(path.join(FIXTURE_DIR, `${id}.json`), "utf8");
  return JSON.parse(raw) as CharacterizationCapture;
}

describe("windowed API characterization fixtures", () => {
  it("has a fixture file for every capture id", () => {
    const captures = allCharacterizationCaptures();
    const files = new Set(readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json")));
    for (const capture of captures) {
      expect(files.has(`${capture.id}.json`), `missing fixture ${capture.id}.json`).toBe(true);
    }
  });

  it("matches stored event streams and final states for every scenario", () => {
    const captures = allCharacterizationCaptures();
    for (const live of captures) {
      const fixture = loadFixture(live.id);
      expect(live.events, live.id).toEqual(fixture.events);
      expect(live.finalState, live.id).toEqual(fixture.finalState);
    }
  });
});
