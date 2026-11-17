import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DECISION_CONTEXT_VERSION } from "../src/tactics/decision.ts";
import { LEARNING_RECORD_VERSION } from "../src/learning/record.ts";
import { IMPLEMENTED_EVALUATORS, PLANNED_EVALUATORS } from "../src/sim/composition/coverage.ts";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) return [full];
    return [];
  });
}

describe("module boundaries", () => {
  it("keeps later extension points declared and unimplemented", () => {
    expect(DECISION_CONTEXT_VERSION).toBe(1);
    expect(LEARNING_RECORD_VERSION).toBe(1);
    expect(IMPLEMENTED_EVALUATORS).toEqual(["coverage"]);
    expect(PLANNED_EVALUATORS).toEqual([
      "map-suitability",
      "synergy",
      "counter-composition",
      "supported-plans",
    ]);
  });

  it("keeps the simulation free of rendering and ambient randomness", () => {
    const root = path.resolve("src");
    const files = walk(root);
    const isolated = ["sim", "tactics", "learning", "persistence", "rules"];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text.includes("Math.random"), file).toBe(false);
      const relative = path.relative(root, file);
      const top = relative.split(path.sep)[0];
      if (!top || !isolated.includes(top)) continue;
      expect(text, file).not.toMatch(/from ["']react["']/);
      expect(text, file).not.toMatch(/from ["']react-dom["']/);
      expect(text, file).not.toMatch(/from ["'][^"']*\/ui\//);
      if (top === "sim") {
        expect(text, file).not.toMatch(/from ["'][^"']*\/(tactics|learning|persistence)\//);
      }
    }
  });
});
