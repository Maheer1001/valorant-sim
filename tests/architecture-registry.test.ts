/**
 * Stage H0 architecture rules (kept separate so tests/architecture.test.ts stays unmodified).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve("src");
const IMPORT_RE = /^\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+"([^"]+)";/gms;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "graphify-out" ? [] : walk(full);
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [full] : [];
  });
}

type Edge = { to: string; typeOnly: boolean };

function importGraph(): Map<string, Edge[]> {
  const graph = new Map<string, Edge[]>();
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    const edges: Edge[] = [];
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[4]!;
      if (!spec.startsWith(".")) continue;
      const target = path.resolve(path.dirname(file), spec);
      if (existsSync(target)) edges.push({ to: target, typeOnly: Boolean(match[2]) });
    }
    graph.set(file, edges);
  }
  return graph;
}

/** Strongly connected components with more than one file (Tarjan). */
function cycles(graph: Map<string, Edge[]>, includeTypeOnly: boolean): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const out: string[][] = [];
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const edge of graph.get(v) ?? []) {
      if (!includeTypeOnly && edge.typeOnly) continue;
      const w = edge.to;
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const component: string[] = [];
      for (;;) {
        const w = stack.pop()!;
        onStack.delete(w);
        component.push(path.relative(SRC, w).split(path.sep).join("/"));
        if (w === v) break;
      }
      if (component.length > 1) out.push(component.sort());
    }
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return out;
}

describe("H0 module boundaries", () => {
  const graph = importGraph();

  it("has no import cycles in src (runtime imports)", () => {
    expect(cycles(graph, false)).toEqual([]);
  });

  it("has no import cycles in src (including type-only imports)", () => {
    expect(cycles(graph, true)).toEqual([]);
  });

  it("keeps kits off the engine entry points: src/sim/agents/** never imports run.ts, live-round.ts or src/sim/live/**", () => {
    const forbidden = (target: string) => {
      const rel = path.relative(SRC, target).split(path.sep).join("/");
      return rel === "sim/run.ts" || rel === "sim/live-round.ts" || rel.startsWith("sim/live/");
    };
    const offenders: string[] = [];
    for (const [file, edges] of graph) {
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      if (!rel.startsWith("sim/agents/")) continue;
      for (const edge of edges) {
        if (forbidden(edge.to)) offenders.push(`${rel} -> ${path.relative(SRC, edge.to).split(path.sep).join("/")}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("registers nothing by side effect: no module-level register*() calls in src/sim", () => {
    const offenders = walk(path.join(SRC, "sim")).filter((file) =>
      /^register\w*\(/m.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
