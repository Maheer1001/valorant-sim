/**
 * Regenerate sections 1, 3, and 4 of docs/effect-primitives.md from data/*.json.
 * Preserves sections 5+ from the existing file (turn layer, decisions, provenance).
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const mapping = JSON.parse(fs.readFileSync(path.join(root, "data/ability-primitives.json"), "utf8"));
const stages = JSON.parse(fs.readFileSync(path.join(root, "data/primitive-stages.json"), "utf8"));
const docPath = path.join(root, "docs/effect-primitives.md");
const existing = fs.readFileSync(docPath, "utf8");

const tailMarker = "## 5. Turn layer changes";
const tailIdx = existing.indexOf(tailMarker);
if (tailIdx < 0) throw new Error("Could not find section 5 in effect-primitives.md");
let tail = existing.slice(tailIdx);

// Ensure Approved note on section 6
if (!tail.includes("Approved")) {
  tail = tail.replace(
    "## 6. Decisions needed (max 10)",
    "## 6. Decisions needed (max 10)\n\n**Approved:** all ten recommended answers are approved by the project owner (17 Nov 2026).",
  );
}

const counts = {};
for (const row of mapping.abilities) {
  for (const p of row.primitives) {
    counts[p] = counts[p] || { n: 0, agents: new Set() };
    counts[p].n += 1;
    counts[p].agents.add(row.agent);
  }
}

let md = `# Effect primitives (design)

Tag: **design**. This document plans shared engine primitives so every live agent in \`agent-reference.json\` (patch ${mapping.patch}, ${new Set(mapping.abilities.map((a) => a.agent)).size} agents, ${mapping.abilities.length} abilities including passives) can become fully executable. It invents no ability numbers. Game figures stay tagged with their existing sources (\`verified\` / \`secondary\` / \`sheet\` / \`estimate\` / \`aggregator\`).

Sections 1, 3, and 4 are generated from \`data/ability-primitives.json\` and \`data/primitive-stages.json\` via \`tools/regenerate-effect-primitives-doc.mjs\`. Rebuild with \`node tools/build-ability-primitives.mjs\` then this script.

**Core engine state** (not per-ability primitives): ${mapping.core.join(", ")}.

The sim today only executes **Sky Smoke** as a special case. Under the corrected mapping it also needs \`placement.mapTargeted\`.

## 1. Ability → primitives table

| Agent | Slot | Ability | Source | Primitives | Extra rules |
| --- | --- | --- | --- | --- | --- |
`;

for (const r of mapping.abilities) {
  const hush = r.agent === "Hush" ? " **[Hush: secondary/aggregator]**" : "";
  md += `| ${r.agent}${hush} | ${r.slot} | ${r.ability} | ${r.source} | ${r.primitives.join(", ") || "—"} | ${(r.extra || "").replace(/\|/g, "\\|")} |\n`;
}

md += `
Row count: **${mapping.abilities.length}**. Audit fixes applied when regenerating the mapping:

${mapping.auditFixes.map((f) => `- ${f}`).join("\n")}

## 2. Primitive list

See \`data/ability-primitives.json\` \`primitives\` definitions. Core charge / signature-recharge / ult-point handling lives outside the per-ability list. New primitive \`interact.pickup\` covers Hush Telekinesis.

Vulnerable and Fragile remain one primitive (\`status.vulnerable\`). **design**

## 3. Primitive usage and engine work

Counts exclude core resource fields.

`;

for (const [prim, info] of Object.entries(counts).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))) {
  const agents = [...info.agents].sort();
  md += `### \`${prim}\` — ${info.n} abilities, ${agents.length} agents\n`;
  md += `Agents: ${agents.join(", ")}.\n\n`;
  md += `${mapping.primitives[prim] || ""}\n\n`;
  md += engineNeeds(prim);
  md += "\n";
}

function engineNeeds(prim) {
  const map = {
    "vision.smoke":
      "**Engine:** exists (Sky Smoke). Generalise multi-smoke owners and map placement. **Tests:** LOS block/expiry.",
    "vision.wallOrVolume":
      "**Engine:** dynamic wall segments with HP/fortify; LOS and optional bullet block. **State:** \`walls[]\`. **Events:** wall-raised/destroyed.",
    "damage.zoneOrHit":
      "**Engine:** timed AoE ticks and instant hits. **Events:** damage-applied. **Tests:** DPS windows, death.",
    "projectile.generic":
      "**Engine:** travel jobs with collision. **State:** \`projectiles[]\`. **Orders:** cast with aim/point.",
    "projectile.flash":
      "**Engine:** facing test + smoke block. **Events:** flash-applied/blocked.",
    "projectile.bouncing": "**Engine:** bounce count on Drill Hall segments.",
    "projectile.steerable": "**Engine:** mid-flight aim samples (N≤4 per window). **Orders:** steer polyline.",
    "projectile.homing": "**Engine:** retarget nearest valid enemy each tick.",
    "device.summonOrPlaceable":
      "**Engine:** placeables with HP, arm, recall, destroy cooldowns. **State:** \`devices[]\`.",
    "trigger.zone": "**Engine:** arm + detection predicates. **Events:** trigger-fired.",
    "status.concuss": "**Engine:** status list; keep Hush 1.5s aggregator vs 2.5s standard.",
    "status.nearsight": "**Engine:** per-ability vision radius. **Tests:** view() respects nearsight.",
    "status.slow": "**Engine:** speed multiplier / forced crouch.",
    "status.haste": "**Engine:** move-speed buff; stacks with Combat Stim (**design**).",
    "status.combatStim": "**Engine:** fire-rate/equip/reload from globals.combatStim.",
    "status.decay": "**Engine:** temp HP drain/restore timeline.",
    "status.suppress": "**Engine:** block casts while suppressed.",
    "status.vulnerable": "**Engine:** damage amp flag.",
    "status.detain": "**Engine:** hard lock movement/actions.",
    "status.intangible": "**Engine:** untargetable; shot withheld.",
    "status.snapshot": "**Engine:** frozen silhouette for beliefs.",
    "status.deafen": "**Engine:** audio info filter.",
    "status.hinder": "**Engine:** apply/remove only until multipliers published.",
    "status.levitate": "**Engine:** vertical hold; height model decision.",
    "status.overheal": "**Engine:** temp HP pool decay.",
    "status.tether": "**Engine:** trail attach + break rules.",
    "movement.dash": "**Engine:** path displace with collision.",
    "movement.teleport": "**Engine:** instant move + beacon link.",
    "movement.pull": "**Engine:** force toward point.",
    "movement.knockback": "**Engine:** impulse / knockup.",
    "movement.glide": "**Engine:** fall-speed control; height model.",
    "support.heal": "**Engine:** HoT; healingAssist (verified 13.10).",
    "support.revive": "**Engine:** dead→alive transitions.",
    "support.shield": "**Engine:** absorb layer before HP.",
    "placement.mapTargeted":
      "**Engine:** tactical-map / astral placement orders. **Orders:** map-cast.",
    "info.reveal": "**Engine:** feed view()/beliefs.",
    "info.audioOrMinimap": "**Engine:** optional audioCues on side view.",
    "interact.pickup":
      "**Engine:** extended interact range for weapons/Spike/switches. **State:** interactRangeMm (null until sourced).",
    "resource.passiveMeter":
      "**Engine:** fuel/battery/soul/star meters separate from ability charges.",
  };
  return `${map[prim] || "**Engine:** support with first consumer ability."}\n`;
}

md += `## 4. Recommended build order

Generated from \`data/primitive-stages.json\`. An agent is listed at the first stage whose cumulative primitives cover every primitive that agent's abilities need. Hush is forced last. Core charge/ult fields are assumed available as engine state throughout.

| Stage | Primitives added | Agents newly complete | Roles fully complete after |
| --- | --- | --- | --- |
`;

for (const st of stages.stages) {
  md += `| ${st.id} (${st.label}) | ${st.primitives.join(", ") || "—"} | ${st.agentsCompleted.join(", ") || "—"} | ${(st.rolesFullyCompleteAfter || []).join(", ") || "—"} |\n`;
}

md += `
### Role completion (from generated stages)

`;

const roleFirst = {};
for (const st of stages.stages) {
  for (const role of st.rolesFullyCompleteAfter || []) {
    if (roleFirst[role] == null) roleFirst[role] = st.id;
  }
}
for (const role of ["controller", "duelist", "initiator", "sentinel"]) {
  md += `- **${role}:** first fully complete after stage ${roleFirst[role] ?? "—"}.\n`;
}

md += `
**Recommendation (design):** implement stage 1 (Breach) then stage 2 (Brimstone) as the first executable milestone — see \`docs/stage-1-plan.md\`.

`;

md += `\n${tail}`;
if (!md.endsWith("\n")) md += "\n";
fs.writeFileSync(docPath, md);
console.log("regenerated", docPath);
