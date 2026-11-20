/**
 * Rebuild data/ability-primitives.json and data/primitive-stages.json
 * from agent-reference.json. Re-audits every ability against effect text.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ref = JSON.parse(fs.readFileSync(path.join(root, "agent-reference.json"), "utf8"));

const CORE = ["resource.charges", "resource.signatureRecharge", "resource.ultPoints"];

const PRIMITIVE_DEFS = {
  "status.concuss": "stun/accuracy debuff for a duration",
  "status.nearsight": "vision radius clamp",
  "status.deafen": "audio muffling",
  "status.slow": "move-speed reduction / forced crouch",
  "status.hinder": "unpublished multiplier family (Waylay)",
  "status.vulnerable": "Fragile/Vulnerable damage amp",
  "status.suppress": "blocks casts",
  "status.decay": "temporary HP drain then restore",
  "status.detain": "root/disable in place",
  "status.levitate": "suspend in air",
  "status.haste": "movement-speed buff",
  "status.combatStim": "fire-rate / equip / reload / recovery buff",
  "status.snapshot": "still-image silhouette reveal",
  "status.overheal": "temporary HP above max",
  "status.intangible": "untargetable / phase",
  "status.tether": "trail/tether attach",
  "vision.smoke": "LOS disk/volume with deploy + expiry",
  "vision.wallOrVolume": "walls, cages, pits, audio walls, bullet-block volumes",
  "damage.zoneOrHit": "instant hits and timed damage fields",
  "projectile.generic": "thrown/fired payload with travel time",
  "projectile.bouncing": "wall/floor bounces",
  "projectile.steerable": "crosshair redirect after cast",
  "projectile.homing": "seeks agents / trails",
  "projectile.flash": "facing-dependent blind; blocked by smokes",
  "movement.dash": "short burst translation",
  "movement.teleport": "instant relocate / beacon return",
  "movement.glide": "fall control / air hold",
  "movement.pull": "attract toward a point",
  "movement.knockback": "push / launch / knockup",
  "device.summonOrPlaceable": "HP, arm, recall, destroy cooldown",
  "trigger.zone": "arm + detect + trigger",
  "support.heal": "ally/self heal over time",
  "support.revive": "return from death / checkpoint",
  "support.shield": "temporary absorb HP",
  "placement.mapTargeted": "tactical-map / astral / global placement",
  "info.reveal": "live or pulsed enemy reveal",
  "info.audioOrMinimap": "sound cues / minimap obscure",
  "interact.pickup": "pick up weapons/Spike and use switches from range",
  "resource.passiveMeter": "fuel / battery / soul-orb / star economy (non-charge)",
};

/** Explicit overrides after effect-text audit. Key: `${agentId}:${slot}` */
const OVERRIDES = {
  // Controllers — map smokes
  "2:E": ["vision.smoke", "placement.mapTargeted"], // Sky Smoke
  "2:Q": ["damage.zoneOrHit", "projectile.generic", "projectile.bouncing"], // Incendiary thrown
  "2:X": ["damage.zoneOrHit", "placement.mapTargeted", "vision.wallOrVolume"], // Orbital: map, NOT projectile
  "2:C": ["device.summonOrPlaceable", "status.combatStim", "status.haste"], // Stim Beacon
  "3:E": ["vision.smoke", "placement.mapTargeted"], // Ruse
  "4:E": ["vision.smoke", "placement.mapTargeted", "vision.wallOrVolume"], // Cove
  "5:E": ["vision.smoke", "placement.mapTargeted"], // Waveform
  "6:E": ["vision.smoke", "placement.mapTargeted"], // Dark Cover
  "1:E": ["vision.smoke", "placement.mapTargeted", "resource.passiveMeter"], // Nebula (stars)
  "1:passive": ["placement.mapTargeted", "resource.passiveMeter"], // Astral Form / Stars
  // Sage orbs — NOT map-targeted
  "27:C": ["vision.wallOrVolume"], // Barrier Orb placed in world
  "27:Q": ["projectile.generic", "status.slow"], // Slow Orb thrown
  "27:E": ["support.heal"], // Healing Orb targeted ally
  "27:X": ["support.revive"], // Resurrection
  // Reyna Soul Harvest — NOT map-targeted
  "13:passive": ["resource.passiveMeter"], // Soul Harvest orbs
  // Killjoy Nanoswarm — thrown
  "26:C": ["damage.zoneOrHit", "projectile.generic", "device.summonOrPlaceable"],
  // Hush Telekinesis
  "30:passive": ["interact.pickup"],
};

const EXTRA = {
  "2:E": "already executable in sim; cast via tactical map",
  "2:Q": "thrown mollie; ally damage fraction unpublished",
  "2:X": "map-targeted strike; not a projectile; ally damage fraction unpublished",
  "2:C": "Haste + Combat Stim; indestructible beacon",
  "3:E": "castable while dead; map placement",
  "13:passive": "soul orb economy; not map placement",
  "27:C": "world-placed wall; not tactical-map targeted",
  "27:Q": "thrown slow field",
  "27:E": "ally/self heal; not map-targeted",
  "26:C": "thrown placeable swarm",
  "30:passive": "Hush secondary/aggregator; range null",
  "30:C": "Hush secondary/aggregator",
  "30:Q": "Hush secondary/aggregator",
  "30:E": "Hush secondary/aggregator; concuss 1.5 vs global 2.5",
  "30:X": "Hush secondary/aggregator; levitate duration null",
};

function classify(agent, ab) {
  const key = `${agent.id}:${ab.slot}`;
  if (OVERRIDES[key]) {
    return {
      primitives: [...OVERRIDES[key]].sort(),
      extra: EXTRA[key] || "",
      override: true,
    };
  }

  const e = (ab.effect || []).join(" ").toLowerCase();
  const name = ab.name.toLowerCase();
  const p = new Set();
  const notes = [];

  if (/concuss/.test(e)) p.add("status.concuss");
  if (/nearsight/.test(e)) p.add("status.nearsight");
  if (/deafen/.test(e)) p.add("status.deafen");
  if (/\bslow\b/.test(e) || /forced crouch/.test(e)) p.add("status.slow");
  if (/hinder/.test(e)) p.add("status.hinder");
  if (/vulnerable|fragile/.test(e)) p.add("status.vulnerable");
  if (/suppress/.test(e)) p.add("status.suppress");
  if (/decay/.test(e)) p.add("status.decay");
  if (/detain/.test(e)) p.add("status.detain");
  if (/levitat|suspend/.test(e)) p.add("status.levitate");
  if (/combat stim/.test(e)) p.add("status.combatStim");
  if (/movement speed|haste|sprint/.test(e)) p.add("status.haste");
  if (/overheal/.test(e)) p.add("status.overheal");
  if (/intangible|invisible/.test(e)) p.add("status.intangible");
  if (/tether|mark/.test(e) && !/trade/.test(name)) p.add("status.tether");

  if (/smoke/.test(e)) p.add("vision.smoke");
  if (/wall|vision block|bullet block|audio block|cocoon|weapon jam/.test(e)) {
    p.add("vision.wallOrVolume");
  }

  if (/damage/.test(e)) p.add("damage.zoneOrHit");

  // Projectiles: thrown/fired traveling payloads — not map ultimates
  const isMapUlt =
    /orbital|armageddon|guided salvo|from the shadows|cosmic divide|hunter's fury|nightfall|reckoning|bassquake|steel garden|null\/cmd|kill contract|dimensional drift|convergent paths|showstopper|overdrive|blade storm|tour de force|empress|run it back|not dead yet|resurrection|annihilation|lockdown|evolution|thrash|seekers/.test(
      name,
    );
  if (
    !isMapUlt &&
    (/flash|bolt|drone|bot|pack|shell|grenade|orb|pulse|surge|paranoia|meddle|undercut|saturate|blindside|curveball|flashpoint|aftershock|fault|relay|mosh|dizzy|wingman|trailblazer|prowler|seize|frag|zero\/point|special delivery|owl|stealth|shock|recon|paint|blast|boom|fakeout|gatecrash|arc rose|gravity well|nova pulse|flashbulb|displacement|suspension|leer|hot hands|incendiary|nanoswarm|snake bite|poison cloud/.test(
      name + e,
    ) ||
      /flash|projectile|throw|bolt/.test(e + name))
  ) {
    // many of these are projectiles; refine
    if (
      [
        "aftershock",
        "flashpoint",
        "fault line",
        "rolling thunder",
        "incendiary",
        "nanoswarm",
        "meddle",
        "storm surge",
        "paranoia",
        "snake bite",
        "undercut",
        "relay bolt",
        "curveball",
        "hot hands",
        "blast pack",
        "paint shells",
        "boom bot",
        "leer",
        "saturate",
        "blindside",
        "fakeout",
        "gatecrash",
        "frag/ment",
        "flash/drive",
        "zero/point",
        "trailblazer",
        "guiding light",
        "prowler",
        "seize",
        "dizzy",
        "wingman",
        "mosh pit",
        "owl drone",
        "shock bolt",
        "recon bolt",
        "stealth drone",
        "special delivery",
        "slow orb",
        "arc rose",
        "gravity well",
        "nova pulse",
        "m-pulse",
        "flashbulb",
        "displacement",
        "suspension",
        "cloudburst",
      ].includes(name)
    ) {
      p.add("projectile.generic");
    }
  }

  if (/flash/.test(e) || ["flashpoint", "curveball", "blindside", "flash/drive", "guiding light", "dizzy", "fakeout", "arc rose", "flashbulb"].includes(name)) {
    p.add("projectile.flash");
    p.add("projectile.generic");
  }
  if (["shock bolt", "paint shells", "blast pack", "special delivery", "incendiary"].includes(name)) {
    p.add("projectile.bouncing");
  }
  if (["gatecrash", "flashbulb", "displacement", "suspension"].includes(name)) {
    p.add("projectile.steerable");
  }
  if (["prowler", "seekers", "wingman", "dizzy", "trailblazer", "thrash", "boom bot"].includes(name)) {
    p.add("projectile.homing");
  }

  if (/dash|propel|slide/.test(e + name) || ["tailwind", "lightspeed", "flow", "high gear"].includes(name)) {
    p.add("movement.dash");
  }
  if (/teleport/.test(e) || ["shrouded step", "from the shadows", "gatecrash", "rendezvous", "crosscut", "refract"].includes(name)) {
    p.add("movement.teleport");
  }
  if (/glide|drift/.test(e + name) || name === "drift" || name === "flow") p.add("movement.glide");
  if (/pull/.test(e) || ["gravity well", "displacement", "seize"].includes(name)) p.add("movement.pull");
  if (/knockback|knockup|launch/.test(e) || ["blast pack", "showstopper", "bassquake", "rolling thunder", "updraft"].includes(name)) {
    p.add("movement.knockback");
  }
  if (name === "flow") {
    p.add("status.levitate");
    p.add("movement.dash");
  }
  if (name === "suspension") p.add("status.levitate");

  // Devices
  if (
    [
      "turret",
      "alarmbot",
      "trapwire",
      "sonic sensor",
      "spycam",
      "trademark",
      "barrier mesh",
      "razorvine",
      "shear",
      "arc rose",
      "interceptor",
      "owl drone",
      "stealth drone",
      "boom bot",
      "fakeout",
      "gatecrash",
      "wingman",
      "dizzy",
      "thrash",
      "mosh pit",
      "lockdown",
      "annihilation",
      "stim beacon",
      "nanoswarm",
      "out of range",
    ].includes(name)
  ) {
    p.add("device.summonOrPlaceable");
  }
  if (
    ["trapwire", "sonic sensor", "trademark", "alarmbot", "razorvine", "shear", "seize", "chokehold"].includes(name) ||
    /trap|sensor|detect|arm|wire|alarm/.test(e + name)
  ) {
    if (["trapwire", "sonic sensor", "trademark", "alarmbot", "razorvine", "shear", "seize", "chokehold"].includes(name)) {
      p.add("trigger.zone");
    }
  }

  if (/heal|overheal|regrowth|devour|heating|blaze|hot hands|healing orb|m-pulse|evolution|pick-me-up/.test(e + name)) {
    p.add("support.heal");
  }
  if (/revive|respawn|not dead|run it back|resurrection/.test(e + name)) p.add("support.revive");
  if (/shield|double tap/.test(e + name) && name !== "cove") p.add("support.shield");

  // Snapshot for Cypher reveals
  if (agent.name === "Cypher" && /reveal/.test(e)) p.add("status.snapshot");
  if (/reveal|ping|highlight|haunt|recon|neural|spycam|owl|seeker|zero\/point|stealth|hunter|empress|terror/.test(e + name)) {
    p.add("info.reveal");
  }
  if (/audio cue|audio block|deafen/.test(e) || name === "cyber cage" || name === "cosmic divide") {
    p.add("info.audioOrMinimap");
  }

  // Map-targeted (explicit list — do not infer orbs)
  if (
    [
      "sky smoke",
      "ruse",
      "cove",
      "waveform",
      "dark cover",
      "nebula / dissipate",
      "astral form / stars",
      "orbital strike",
      "from the shadows",
      "armageddon",
      "guided salvo",
      "hunter's fury",
      "cosmic divide",
      "reckoning",
    ].includes(name)
  ) {
    p.add("placement.mapTargeted");
  }

  // Passive meters
  if (["fuel and toxin", "energy", "soul harvest", "globules", "astral form / stars"].includes(name)) {
    p.add("resource.passiveMeter");
  }

  // Interact
  if (name === "telekinesis") p.add("interact.pickup");

  // Smoke without override already handled; add placement for listed smokes only via override/list above

  if (agent.name === "Hush") notes.push("Hush: secondary/aggregator data only");
  if (EXTRA[key]) notes.push(EXTRA[key]);

  // Ensure damage names
  if (["blade storm", "showstopper", "overdrive", "headhunter", "tour de force", "hunter's fury"].includes(name)) {
    p.add("damage.zoneOrHit");
  }

  // Rolling Thunder is a channeled wave, treat as projectile-like blast sequence
  if (name === "rolling thunder") {
    p.add("projectile.generic");
    p.add("status.concuss");
    p.add("movement.knockback");
  }
  if (name === "fault line") {
    p.add("projectile.generic");
    p.add("status.concuss");
  }
  if (name === "aftershock") {
    p.add("projectile.generic");
    p.add("damage.zoneOrHit");
  }
  if (name === "flashpoint") {
    p.add("projectile.flash");
    p.add("projectile.generic");
  }

  // Walls without smoke
  if (["barrier orb", "barrier mesh", "shear", "fast lane", "contingency", "blaze", "high tide", "toxic screen"].includes(name)) {
    p.add("vision.wallOrVolume");
  }
  if (name === "blaze") {
    p.add("damage.zoneOrHit");
    p.add("support.heal");
  }
  if (name === "poison cloud" || name === "viper's pit") p.add("vision.smoke");
  if (name === "cloudburst") p.add("vision.smoke");
  if (name === "cyber cage") {
    p.add("vision.smoke");
    p.add("info.audioOrMinimap");
  }

  // Remove accidental mapTargeted on non-map
  if (["barrier orb", "slow orb", "healing orb", "soul harvest", "incendiary", "nanoswarm"].includes(name)) {
    p.delete("placement.mapTargeted");
  }

  return { primitives: [...p].sort(), extra: notes.join("; "), override: false };
}

const abilities = [];
const auditFixes = [
  "Sage Barrier Orb / Slow Orb / Healing Orb: removed placement.mapTargeted",
  "Reyna Soul Harvest: removed placement.mapTargeted; uses resource.passiveMeter",
  "Map smokes (Sky Smoke, Ruse, Cove, Waveform, Dark Cover, Nebula/Dissipate): added placement.mapTargeted",
  "Brimstone Incendiary: added projectile.generic + projectile.bouncing",
  "Killjoy Nanoswarm: added projectile.generic",
  "Brimstone Orbital Strike: removed projectile.generic; kept placement.mapTargeted",
  "Hush Telekinesis: removed device.summonOrPlaceable; added interact.pickup",
  "resource.charges / signatureRecharge / ultPoints moved to core (not per-ability)",
];

for (const agent of ref.agents) {
  for (const ab of agent.abilities) {
    const { primitives, extra, override } = classify(agent, ab);
    // Strip any core that slipped in
    const cleaned = primitives.filter((p) => !CORE.includes(p));
    abilities.push({
      key: `${agent.id}:${ab.slot}`,
      agentId: agent.id,
      agent: agent.name,
      role: agent.role,
      slot: ab.slot,
      ability: ab.name,
      kind: ab.kind,
      source: ab.source,
      primitives: cleaned,
      extra,
      override,
    });
  }
}

// Validate all primitives defined
const used = new Set(abilities.flatMap((a) => a.primitives));
for (const p of used) {
  if (!PRIMITIVE_DEFS[p]) {
    throw new Error(`Undefined primitive: ${p}`);
  }
}

const mapping = {
  version: 1,
  patch: ref.patch,
  core: CORE,
  coreNote:
    "Charge pools, signature recharge rules, and ult points are engine-wide state, not per-ability primitives. They live on each agent in the live round world.",
  primitives: PRIMITIVE_DEFS,
  abilities,
  auditFixes,
};

fs.writeFileSync(path.join(root, "data/ability-primitives.json"), `${JSON.stringify(mapping, null, 2)}\n`);

// --- Stage builder ---
function agentNeeds(agentName) {
  const set = new Set();
  for (const row of abilities) {
    if (row.agent === agentName) for (const p of row.primitives) set.add(p);
  }
  return set;
}

const agentsMeta = ref.agents.map((a) => ({
  name: a.name,
  role: a.role,
  needs: agentNeeds(a.name),
}));

function isComplete(needs, have) {
  for (const p of needs) if (!have.has(p)) return false;
  return true;
}

function uncovered(needs, have) {
  return [...needs].filter((p) => !have.has(p));
}

/** Greedy stages: finish easiest non-Hush agent each stage; prefer Breach/Brimstone; Hush last. */
const have = new Set();
const completed = new Set();
const stages = [];
const allPrimitives = [...used];
let stageId = 0;

stages.push({
  id: 0,
  label: "foundation (done)",
  primitives: [],
  note: "Milestone 1–2: event queue, Rifle A, LOS, Sky Smoke as a special case. Under the corrected mapping no agent is fully complete yet (Sky Smoke needs placement.mapTargeted in the general model).",
  agentsCompleted: [],
  rolesFullyCompleteAfter: [],
});

function othersDoneExceptHush() {
  return agentsMeta.every((a) => a.name === "Hush" || completed.has(a.name));
}

function pickNextTarget() {
  const remaining = agentsMeta.filter((a) => !completed.has(a.name));
  if (remaining.length === 1 && remaining[0].name === "Hush") return remaining[0];
  const nonHush = remaining.filter((a) => a.name !== "Hush");
  for (const prefer of ["Breach", "Brimstone"]) {
    const hit = nonHush.find((a) => a.name === prefer);
    if (hit) return hit;
  }
  // Prefer the agent with fewest missing primitives; tie-break by role size progress
  return nonHush
    .slice()
    .sort((a, b) => {
      const am = uncovered(a.needs, have).length;
      const bm = uncovered(b.needs, have).length;
      if (am !== bm) return am - bm;
      return a.name.localeCompare(b.name);
    })[0];
}

while (completed.size < agentsMeta.length) {
  const target = pickNextTarget();
  if (!target) break;
  if (target.name === "Hush" && !othersDoneExceptHush()) {
    throw new Error("Hush selected before other agents finished");
  }

  const stagePrims = uncovered(target.needs, have);
  for (const p of stagePrims) have.add(p);

  const newly = [];
  for (const a of agentsMeta) {
    if (completed.has(a.name)) continue;
    // Defer Hush until every other agent is already complete.
    if (a.name === "Hush" && target.name !== "Hush") continue;
    if (isComplete(a.needs, have)) {
      newly.push(a.name);
      completed.add(a.name);
    }
  }

  stageId += 1;
  const rolesDone = {};
  for (const role of ["controller", "duelist", "initiator", "sentinel"]) {
    const members = agentsMeta.filter((a) => a.role === role);
    rolesDone[role] = members.every((a) => completed.has(a.name));
  }

  stages.push({
    id: stageId,
    label: `stage-${stageId}`,
    primitives: [...new Set(stagePrims)].sort(),
    agentsCompleted: [...new Set(newly)].sort(),
    rolesFullyCompleteAfter: Object.entries(rolesDone)
      .filter(([, v]) => v)
      .map(([k]) => k),
  });

  if (stageId > 40) throw new Error("stage builder runaway");
}

const placed = new Set(stages.flatMap((s) => s.primitives));
const missingPrims = allPrimitives.filter((p) => !placed.has(p));
if (missingPrims.length) {
  stages.push({
    id: stageId + 1,
    label: "remainder",
    primitives: missingPrims.sort(),
    agentsCompleted: [],
    rolesFullyCompleteAfter: [],
    note: "Primitives unused by any agent requirement; kept for catalog completeness.",
  });
}

const stagesDoc = {
  version: 1,
  patch: ref.patch,
  core: CORE,
  stages,
  agentRequirements: Object.fromEntries(
    agentsMeta.map((a) => [a.name, { role: a.role, primitives: [...a.needs].sort() }]),
  ),
};

fs.writeFileSync(path.join(root, "data/primitive-stages.json"), `${JSON.stringify(stagesDoc, null, 2)}\n`);

console.log("abilities", abilities.length);
console.log("primitives used", used.size);
console.log("stages", stages.length);
for (const s of stages) {
  console.log(
    `  ${s.id}: +${s.primitives.length} prims → [${s.agentsCompleted.join(", ")}] roles:${(s.rolesFullyCompleteAfter || []).join(",")}`,
  );
}
console.log("auditFixes", auditFixes.length);
