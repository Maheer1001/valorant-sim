/**
 * Golden fixture IO for stage H0 (behaviour-neutral refactor).
 *
 * Fixtures under tests/fixtures/h0-golden/ were recorded from the code BEFORE
 * the H0 refactor. During H0 they must never be regenerated: a mismatch means
 * the refactor changed behaviour. Regenerate only on purpose, outside H0, with
 * VALSIM_UPDATE_FIXTURES=1 and list the reason in the stage status.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GOLDEN_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/h0-golden",
);

export const UPDATE_GOLDEN = process.env.VALSIM_UPDATE_FIXTURES === "1";

function file(name: string): string {
  return path.join(GOLDEN_DIR, name);
}

export function writeGoldenJson(name: string, value: unknown): void {
  mkdirSync(GOLDEN_DIR, { recursive: true });
  writeFileSync(file(name), `${JSON.stringify(value, null, 1)}\n`);
}

export function readGoldenJson<T>(name: string): T {
  return JSON.parse(readFileSync(file(name), "utf8")) as T;
}

export function writeGoldenText(name: string, value: string): void {
  mkdirSync(GOLDEN_DIR, { recursive: true });
  writeFileSync(file(name), value.endsWith("\n") ? value : `${value}\n`);
}

export function readGoldenText(name: string): string {
  return readFileSync(file(name), "utf8").replace(/\r\n/g, "\n").replace(/\n$/, "");
}
