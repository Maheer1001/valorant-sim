#!/usr/bin/env node
/**
 * Browser smoke test (stage H0, docs/stage-h0-plan.md section 9.4).
 *
 * Drives a local Chrome or Edge in headless mode through the DevTools protocol,
 * using only Node built-ins (fetch, the global WebSocket of Node 22+, child_process).
 * No npm dependency.
 *
 * Usage (from the repo root):
 *   node tools/smoke-browser.mjs                      # starts Vite on port 5199, runs the checks
 *   node tools/smoke-browser.mjs --url http://localhost:5173/   # use a server you already started
 *   node tools/smoke-browser.mjs --save-baseline .smoke/baseline   # also store screenshots as a baseline
 *   node tools/smoke-browser.mjs --compare .smoke/baseline         # compare screenshots to a baseline
 *
 * Browser: set BROWSER_PATH, or the script tries the usual Chrome / Edge / Chromium locations.
 * Output: a JSON report and screenshots in .smoke/run-<timestamp>/ (git-ignored).
 * Exit code: 0 when every check passes, 1 when any check fails, 2 on a setup error.
 *
 * Checks at 1366x768:
 *   1. no document scroll (scroll size equals client size)
 *   2. no console errors and no uncaught exceptions during the run
 *   3. stage d4 regression: a right-click on the drawn centre of Site A puts the
 *      route-waypoint-breach-attack-0 disc within 1 px of the cursor, and its
 *      cx / cy within 30 mm of (16750, 6000)
 *   4. a drag-box drawn tightly around Brimstone selects only Brimstone
 *   5. play run: Go, Space, about 5 s of real time: the round timer advances and
 *      the event log is not empty
 *   6. optional: boot and post-route screenshots are byte-identical to a baseline
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const VIEW = { width: 1366, height: 768 };
const SITE_A_CENTRE_MM = { xMm: 16750, yMm: 6000 };
const BRIMSTONE_SPAWN_MM = { xMm: 3000, yMm: 7000 };
const DEV_PORT = 5199;
const DEBUG_PORT = 9333;

function fail(message, code = 2) {
  console.error(`smoke-browser: ${message}`);
  process.exit(code);
}

// ---------- environment ----------
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!(nodeMajor >= 22) || typeof globalThis.WebSocket !== "function") {
  fail(
    `Node 22 or newer is required (it provides a global WebSocket). Found Node ${process.versions.node}. ` +
      "Install Node 22+ and run again.",
  );
}

const args = process.argv.slice(2);
function option(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const givenUrl = option("--url");
const saveBaseline = option("--save-baseline");
const compareDir = option("--compare");

function findBrowser() {
  if (process.env.BROWSER_PATH) {
    if (existsSync(process.env.BROWSER_PATH)) return process.env.BROWSER_PATH;
    fail(`BROWSER_PATH is set but does not exist: ${process.env.BROWSER_PATH}`);
  }
  const home = os.homedir();
  const candidates = {
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(home, "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ],
    linux: [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    ],
  }[process.platform] ?? [];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    fail(
      "No Chrome, Edge or Chromium found. Install one, or set BROWSER_PATH to its executable. Looked in:\n  " +
        candidates.join("\n  "),
    );
  }
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHttp(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  return false;
}

// ---------- processes ----------
const children = [];
function cleanup() {
  for (const child of children) {
    try {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      else child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
}
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

async function startServer() {
  if (givenUrl) {
    if (!(await waitForHttp(givenUrl, 5000))) fail(`No server answered at ${givenUrl}.`);
    return givenUrl;
  }
  const url = `http://localhost:${DEV_PORT}/`;
  const viteBin = path.resolve("node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) fail("node_modules/vite is missing. Run npm ci first, or pass --url to an already running server.");
  // Run Vite's own entry with this Node binary: no shell, same on every platform.
  const vite = spawn(process.execPath, [viteBin, "--port", String(DEV_PORT), "--strictPort"], { stdio: "ignore" });
  children.push(vite);
  if (!(await waitForHttp(url, 30000))) fail(`The Vite dev server did not start on port ${DEV_PORT} within 30 s.`);
  return url;
}

function startBrowser(executable, profileDir) {
  const browser = spawn(
    executable,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profileDir}`,
      `--window-size=${VIEW.width},${VIEW.height}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  children.push(browser);
}

// ---------- DevTools protocol ----------
async function connect() {
  const until = Date.now() + 20000;
  let target = null;
  while (!target && Date.now() < until) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" });
      if (res.ok) target = await res.json();
    } catch {
      await sleep(250);
    }
  }
  if (!target) fail(`The browser did not open its DevTools port ${DEBUG_PORT}.`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const listener of listeners) listener(msg);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ws, send, on: (listener) => listeners.push(listener) };
}

// ---------- main ----------
const browserPath = findBrowser();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(".smoke", `run-${stamp}`);
mkdirSync(outDir, { recursive: true });
const profileDir = path.join(os.tmpdir(), `valsim-smoke-profile-${process.pid}`);

const appUrl = await startServer();
startBrowser(browserPath, profileDir);
const { send, on, ws } = await connect();

const consoleProblems = [];
/**
 * Browser-generated noise that is not an application error. Only the automatic
 * /favicon.ico request is ignored (the app ships no favicon); it is still listed
 * in the report under "ignored".
 */
const ignoredProblems = [];
const isIgnorable = (entry) => entry.level === "error" && /\/favicon\.ico$/.test(entry.url ?? "") && /404/.test(entry.text);
on((msg) => {
  if (msg.method === "Runtime.exceptionThrown") {
    consoleProblems.push(`exception: ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`);
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleProblems.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
  } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    const entry = msg.params.entry;
    const line = `log: ${entry.text}${entry.url ? ` (${entry.url})` : ""}`;
    if (isIgnorable(entry)) ignoredProblems.push(line);
    else consoleProblems.push(line);
  }
});

const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`page eval failed: ${result.exceptionDetails.text}`);
  return result.result.value;
};
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, ...extra });
const key = async (keyName, code, keyCode) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: keyName, code, windowsVirtualKeyCode: keyCode });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code, windowsVirtualKeyCode: keyCode });
};
const screenshot = async (name) => {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const file = path.join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  return file;
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { ...VIEW, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: appUrl });
let ready = false;
for (let i = 0; i < 80 && !ready; i += 1) {
  await sleep(250);
  ready = await evaluate(`!!document.querySelector('svg[aria-label="Drill Hall"]')`);
}
if (!ready) fail("The app did not render the Drill Hall board within 20 s.");
await sleep(500);

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

// Map millimetres to client pixels with the SVG's real transform.
const mmToClient = (point) =>
  evaluate(`(() => {
    const svg = document.querySelector('svg[aria-label="Drill Hall"]');
    const p = new DOMPoint(${point.xMm}, ${point.yMm}).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  })()`);
const planStatus = () => evaluate(`document.querySelector('[aria-label="Plan status"]')?.textContent ?? ''`);

// 1. Scroll
const scroll = await evaluate(`({
  scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight,
  scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })`);
check(
  "no document scroll at 1366x768",
  scroll.scrollHeight === scroll.clientHeight && scroll.scrollWidth === scroll.clientWidth,
  scroll,
);
const bootShot = await screenshot("boot");

// 3. Site A click (stage d4 regression)
const site = await evaluate(`(() => {
  const svg = document.querySelector('svg[aria-label="Drill Hall"]');
  const rect = [...svg.querySelectorAll('rect')].find((el) => el.getAttribute('x') === '15000');
  if (!rect) return null;
  const r = rect.getBoundingClientRect();
  const b = svg.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, board: { width: b.width, height: b.height } };
})()`);
if (!site) {
  check("Site A rect found", false, "no <rect x=15000> on the board");
} else {
  await mouse("mouseMoved", site.x, site.y);
  await mouse("mousePressed", site.x, site.y, { button: "right", buttons: 2, clickCount: 1 });
  await mouse("mouseReleased", site.x, site.y, { button: "right", buttons: 0, clickCount: 1 });
  await sleep(300);
  const disc = await evaluate(`(() => {
    const el = document.querySelector('[data-testid="route-waypoint-breach-attack-0"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, cx: Number(el.getAttribute('cx')), cy: Number(el.getAttribute('cy')) };
  })()`);
  if (!disc) {
    check("Site A right-click places a waypoint", false, { cursor: site, status: await planStatus() });
  } else {
    const px = Math.hypot(disc.x - site.x, disc.y - site.y);
    const mm = Math.hypot(disc.cx - SITE_A_CENTRE_MM.xMm, disc.cy - SITE_A_CENTRE_MM.yMm);
    check("Site A waypoint within 1 px of the cursor", px <= 1, { offsetPx: Number(px.toFixed(3)), board: site.board });
    check("Site A waypoint within 30 mm of (16750, 6000)", mm <= 30, { waypointMm: { x: disc.cx, y: disc.cy }, offsetMm: Number(mm.toFixed(1)) });
  }
}
const routeShot = await screenshot("post-route");

// 4. Drag-box around Brimstone only (Breach is 2 m away)
const a = await mmToClient({ xMm: BRIMSTONE_SPAWN_MM.xMm - 400, yMm: BRIMSTONE_SPAWN_MM.yMm - 400 });
const b = await mmToClient({ xMm: BRIMSTONE_SPAWN_MM.xMm + 400, yMm: BRIMSTONE_SPAWN_MM.yMm + 400 });
await mouse("mouseMoved", a.x, a.y);
await mouse("mousePressed", a.x, a.y, { button: "left", buttons: 1, clickCount: 1 });
for (let i = 1; i <= 5; i += 1) {
  await mouse("mouseMoved", a.x + ((b.x - a.x) * i) / 5, a.y + ((b.y - a.y) * i) / 5, { button: "left", buttons: 1 });
}
await mouse("mouseReleased", b.x, b.y, { button: "left", buttons: 0, clickCount: 1 });
await sleep(200);
const dragStatus = await planStatus();
check("drag-box selects only Brimstone", dragStatus.trim() === "Selected brimstone-attack.", { status: dragStatus });

// 5. Play run
const clicked = await evaluate(`(() => { const go = document.querySelector('button[aria-label="Go"]'); if (!go) return false; go.click(); return true; })()`);
await sleep(300);
const timerBefore = await evaluate(`document.querySelector('[aria-label="Round timer"]')?.textContent ?? ''`);
await evaluate(`document.querySelector('svg[aria-label="Drill Hall"]')?.focus()`);
await key(" ", "Space", 32);
await sleep(5000);
const timerAfter = await evaluate(`document.querySelector('[aria-label="Round timer"]')?.textContent ?? ''`);
const eventCount = await evaluate(`document.querySelectorAll('[aria-label="Event log"] li').length`);
check("play run: Go accepted", clicked, { status: await planStatus() });
check("play run: round timer advances after Space and 5 s", timerBefore !== "" && timerAfter !== timerBefore, {
  before: timerBefore,
  after: timerAfter,
});
check("play run: event log is not empty", eventCount > 0, { events: eventCount });
await screenshot("after-play");

// 2. Console (checked last so it covers the whole run)
check("no console errors or uncaught exceptions", consoleProblems.length === 0, { errors: consoleProblems, ignored: ignoredProblems });

// 6. Screenshots against a baseline
if (saveBaseline) {
  mkdirSync(saveBaseline, { recursive: true });
  writeFileSync(path.join(saveBaseline, "boot.png"), readFileSync(bootShot));
  writeFileSync(path.join(saveBaseline, "post-route.png"), readFileSync(routeShot));
}
if (compareDir) {
  for (const [name, file] of [["boot", bootShot], ["post-route", routeShot]]) {
    const base = path.join(compareDir, `${name}.png`);
    if (!existsSync(base)) {
      check(`screenshot ${name} matches baseline`, false, `missing ${base}`);
      continue;
    }
    check(`screenshot ${name} matches baseline`, readFileSync(base).equals(readFileSync(file)), { baseline: base, current: file });
  }
}

ws.close();
const report = {
  when: new Date().toISOString(),
  node: process.versions.node,
  browser: browserPath,
  url: appUrl,
  viewport: VIEW,
  checks,
  passed: checks.every((c) => c.ok),
};
writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}  ${JSON.stringify(c.detail)}`);
console.log(`report: ${path.join(outDir, "report.json")}`);
cleanup();
process.exit(report.passed ? 0 : 1);
