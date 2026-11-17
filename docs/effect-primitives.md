# Effect primitives (design)

Tag: **design**. This document plans shared engine primitives so every live agent in `agent-reference.json` (patch 13.10, 30 agents, 130 abilities including passives) can become fully executable. It invents no ability numbers. Game figures stay tagged with their existing sources (`verified` / `secondary` / `sheet` / `estimate` / `aggregator`).

The sim today only executes **Sky Smoke** (vision.smoke + resource.charges + placement.mapTargeted). Everything else below is a build plan.

## 1. Ability → primitives table

| Agent | Slot | Ability | Source | Primitives | Extra rules |
| --- | --- | --- | --- | --- | --- |
| Astra | passive | Astral Form / Stars | sheet | placement.mapTargeted, resource.charges | star buy; astral form placement |
| Astra | C | Gravity Well | verified | movement.pull, projectile.generic, resource.charges, status.vulnerable | Fragile = Vulnerable synonym |
| Astra | Q | Nova Pulse | verified | projectile.generic, resource.charges, status.concuss | standard 2.5s concuss |
| Astra | E | Nebula / Dissipate | sheet | resource.charges, resource.signatureRecharge, vision.smoke | star economy; Dissipate recall |
| Astra | X | Cosmic Divide | verified | info.audioOrMinimap, resource.charges, resource.ultPoints, vision.wallOrVolume | audio/vision wall across map |
| Brimstone | C | Stim Beacon | verified | device.summonOrPlaceable, resource.charges, status.combatStim, status.haste | Haste + Combat Stim |
| Brimstone | Q | Incendiary | sheet | damage.zoneOrHit, resource.charges | ally damage reduced (fraction unpublished) |
| Brimstone | E | Sky Smoke | secondary | resource.charges, resource.signatureRecharge, vision.smoke | already executable in sim |
| Brimstone | X | Orbital Strike | sheet | damage.zoneOrHit, placement.mapTargeted, projectile.generic, resource.charges, resource.ultPoints, vision.wallOrVolume | ally damage reduced (fraction unpublished) |
| Clove | C | Pick-me-up | secondary | resource.charges, status.haste, status.overheal, support.heal | Haste 10% (secondary 13.09) |
| Clove | Q | Meddle | sheet | projectile.generic, resource.charges, status.decay | decay then restore |
| Clove | E | Ruse | sheet | resource.charges, resource.signatureRecharge, vision.smoke | castable while dead |
| Clove | X | Not Dead Yet | secondary | resource.charges, resource.ultPoints, support.revive | killer reward note (secondary) |
| Harbor | C | Storm Surge | sheet | resource.charges, status.nearsight, status.slow | nearsight+slow projectile |
| Harbor | Q | High Tide | sheet | resource.charges, status.slow, vision.wallOrVolume | moving wall |
| Harbor | E | Cove | sheet | resource.charges, resource.signatureRecharge, vision.smoke, vision.wallOrVolume | bullet-blocking smoke |
| Harbor | X | Reckoning | sheet | resource.charges, resource.ultPoints, status.nearsight, status.slow | nearsight+slow cove pulses |
| Miks | C | M-pulse | sheet | resource.charges, status.concuss, support.heal | concuss pulses + heal |
| Miks | Q | Harmonize | sheet | resource.charges, status.combatStim, status.haste, trigger.zone | Combat Stim + Haste |
| Miks | E | Waveform | estimate | resource.charges, resource.signatureRecharge, vision.smoke | smoke (estimate figures) |
| Miks | X | Bassquake | sheet | info.audioOrMinimap, movement.knockback, resource.charges, resource.ultPoints, status.deafen, status.slow | knockback + Deafen + Slow |
| Omen | C | Shrouded Step | sheet | movement.teleport, resource.charges | short TP |
| Omen | Q | Paranoia | secondary | info.audioOrMinimap, projectile.generic, resource.charges, status.deafen, status.nearsight | Nearsight + Deafen projectile |
| Omen | E | Dark Cover | sheet | resource.charges, resource.signatureRecharge, vision.smoke | one-way / bounce cast options |
| Omen | X | From the Shadows | sheet | movement.teleport, placement.mapTargeted, resource.charges, resource.ultPoints | global TP with cancel/vulnerable window |
| Viper | passive | Fuel and Toxin | verified | resource.charges, status.decay | passive fuel + toxin |
| Viper | C | Snake Bite | sheet | damage.zoneOrHit, resource.charges, status.vulnerable | fuel-gated mollie |
| Viper | Q | Poison Cloud | sheet | resource.charges, status.decay, vision.smoke | fuel-gated smoke |
| Viper | E | Toxic Screen | sheet | resource.charges, resource.signatureRecharge, status.decay, vision.wallOrVolume | fuel-gated wall |
| Viper | X | Viper's Pit | sheet | resource.charges, resource.ultPoints, status.decay, status.nearsight, vision.smoke | nearsight+decay smoke zone |
| Iso | C | Contingency | sheet | resource.charges, vision.wallOrVolume | invulnerable wall segment |
| Iso | Q | Undercut | sheet | projectile.generic, resource.charges, status.suppress, status.vulnerable | Vulnerable+Suppress through walls |
| Iso | E | Double Tap | sheet | resource.charges, resource.signatureRecharge, support.shield | focus shield on kill/assist |
| Iso | X | Kill Contract | sheet | resource.charges, resource.ultPoints, status.suppress | 1v1 arena |
| Jett | passive | Drift | sheet | movement.glide, resource.charges | hold to slow fall |
| Jett | C | Cloudburst | verified | resource.charges, vision.smoke | smoke; sim catalog still placeholder |
| Jett | Q | Updraft | estimate | movement.knockback, resource.charges | vertical launch; height model needed |
| Jett | E | Tailwind | verified | movement.dash, resource.charges, resource.signatureRecharge | 2-kill signature recharge |
| Jett | X | Blade Storm | sheet | damage.zoneOrHit, resource.charges, resource.ultPoints | knife charges; kill refresh |
| Neon | passive | Energy | sheet | resource.charges | sprint battery resource |
| Neon | C | Fast Lane | secondary | resource.charges, vision.wallOrVolume | vision-block walls |
| Neon | Q | Relay Bolt | verified | projectile.generic, resource.charges, status.concuss |  |
| Neon | E | High Gear | sheet | movement.dash, resource.charges, resource.signatureRecharge, status.combatStim, status.haste | battery sprint resource |
| Neon | X | Overdrive | sheet | damage.zoneOrHit, resource.charges, resource.ultPoints, status.combatStim | hitscan beam / battery |
| Phoenix | passive | Heating Up | sheet | resource.charges, support.heal | self-heal from own fire |
| Phoenix | C | Blaze | sheet | damage.zoneOrHit, resource.charges, support.heal, vision.wallOrVolume | wall+damage+self heal |
| Phoenix | Q | Hot Hands | estimate | damage.zoneOrHit, resource.charges, support.heal |  |
| Phoenix | E | Curveball | secondary | projectile.flash, projectile.generic, resource.charges, resource.signatureRecharge | 2-kill signature recharge |
| Phoenix | X | Run it Back | verified | resource.charges, resource.ultPoints, support.revive | checkpoint revive |
| Raze | C | Boom Bot | sheet | damage.zoneOrHit, device.summonOrPlaceable, projectile.generic, resource.charges |  |
| Raze | Q | Blast Pack | sheet | damage.zoneOrHit, movement.knockback, projectile.bouncing, projectile.generic, resource.charges |  |
| Raze | E | Paint Shells | sheet | damage.zoneOrHit, projectile.bouncing, projectile.generic, resource.charges, resource.signatureRecharge | 2-kill signature recharge |
| Raze | X | Showstopper | sheet | damage.zoneOrHit, movement.knockback, resource.charges, resource.ultPoints |  |
| Reyna | passive | Soul Harvest | sheet | placement.mapTargeted, resource.charges | soul orb economy |
| Reyna | C | Leer | secondary | resource.charges, status.nearsight |  |
| Reyna | Q | Devour | sheet | resource.charges, resource.signatureRecharge, support.heal |  |
| Reyna | E | Dismiss | sheet | resource.charges, resource.signatureRecharge, status.intangible |  |
| Reyna | X | Empress | sheet | info.reveal, resource.charges, resource.ultPoints, status.combatStim |  |
| Waylay | C | Saturate | sheet | projectile.generic, resource.charges, status.hinder | Hinder multipliers unpublished |
| Waylay | Q | Lightspeed | sheet | movement.dash, resource.charges | multi-segment dash charges |
| Waylay | E | Refract | sheet | movement.teleport, resource.charges, resource.signatureRecharge, status.intangible, status.nearsight | beacon return; nearsight at beacon |
| Waylay | X | Convergent Paths | sheet | resource.charges, resource.ultPoints, status.haste, status.hinder | Haste rename; Hinder |
| Yoru | C | Fakeout | sheet | device.summonOrPlaceable, projectile.flash, projectile.generic, resource.charges | footstep decoy then flash |
| Yoru | Q | Blindside | sheet | projectile.flash, projectile.generic, resource.charges |  |
| Yoru | E | Gatecrash | secondary | device.summonOrPlaceable, movement.teleport, projectile.generic, projectile.steerable, resource.charges, resource.signatureRecharge | beacon TP; 2-kill recharge |
| Yoru | X | Dimensional Drift | sheet | resource.charges, resource.ultPoints, status.intangible | out-of-world travel |
| Breach | C | Aftershock | verified | damage.zoneOrHit, projectile.generic, resource.charges |  |
| Breach | Q | Flashpoint | verified | projectile.flash, projectile.generic, resource.charges |  |
| Breach | E | Fault Line | verified | projectile.generic, resource.charges, resource.signatureRecharge, status.concuss |  |
| Breach | X | Rolling Thunder | verified | movement.knockback, projectile.generic, resource.charges, resource.ultPoints, status.concuss |  |
| Fade | passive | Terror Trail | sheet | info.reveal, resource.charges |  |
| Fade | C | Prowler | secondary | info.reveal, projectile.generic, projectile.homing, resource.charges, status.nearsight | Terror Trail interaction |
| Fade | Q | Seize | sheet | info.audioOrMinimap, resource.charges, status.deafen, status.decay, status.tether, trigger.zone | tether/mark trail; Terror Trail interaction |
| Fade | E | Haunt | verified | info.reveal, resource.charges, resource.signatureRecharge | Terror Trail interaction |
| Fade | X | Nightfall | verified | info.audioOrMinimap, resource.charges, resource.ultPoints, status.deafen, status.decay, status.tether | tether/mark trail; Terror Trail interaction |
| Gekko | passive | Globules | verified | resource.charges | reclaim pet charges |
| Gekko | C | Mosh Pit | sheet | damage.zoneOrHit, device.summonOrPlaceable, projectile.generic, resource.charges | Gekko reclaim globules |
| Gekko | Q | Wingman | verified | device.summonOrPlaceable, projectile.generic, projectile.homing, resource.charges, status.concuss | plant/defuse assist |
| Gekko | E | Dizzy | sheet | device.summonOrPlaceable, projectile.flash, projectile.generic, projectile.homing, resource.charges, resource.signatureRecharge | Gekko reclaim globules |
| Gekko | X | Thrash | verified | device.summonOrPlaceable, projectile.homing, resource.charges, resource.ultPoints, status.detain | Gekko reclaim globules |
| KAY/O | C | FRAG/ment | sheet | damage.zoneOrHit, projectile.generic, resource.charges | cookie pulse damage |
| KAY/O | Q | FLASH/drive | verified | projectile.flash, projectile.generic, resource.charges | over/underhand flash |
| KAY/O | E | ZERO/point | sheet | info.reveal, resource.charges, resource.signatureRecharge, status.suppress | knife stick; suppress+reveal |
| KAY/O | X | NULL/cmd | sheet | resource.charges, resource.ultPoints, status.combatStim, status.suppress | downed/empowered state |
| Skye | C | Regrowth | sheet | resource.charges, support.heal |  |
| Skye | Q | Trailblazer | sheet | damage.zoneOrHit, info.reveal, projectile.generic, projectile.homing, resource.charges, status.concuss, support.heal |  |
| Skye | E | Guiding Light | verified | projectile.flash, projectile.generic, resource.charges, resource.signatureRecharge | bird flash; recharge on cancel |
| Skye | X | Seekers | secondary | info.reveal, projectile.generic, projectile.homing, resource.charges, resource.ultPoints, status.nearsight, status.slow | three homing nearsight |
| Sova | C | Owl Drone | sheet | device.summonOrPlaceable, info.reveal, projectile.generic, resource.charges | pilot drone; dart reveal |
| Sova | Q | Shock Bolt | sheet | damage.zoneOrHit, projectile.bouncing, projectile.generic, resource.charges |  |
| Sova | E | Recon Bolt | verified | info.reveal, projectile.generic, resource.charges, resource.signatureRecharge | dart pulses reveal |
| Sova | X | Hunter's Fury | sheet | damage.zoneOrHit, info.reveal, projectile.generic, resource.charges, resource.ultPoints | three map-piercing blasts |
| Tejo | C | Stealth Drone | sheet | device.summonOrPlaceable, info.reveal, projectile.generic, resource.charges, status.suppress | suppress on contact |
| Tejo | Q | Special Delivery | sheet | damage.zoneOrHit, projectile.bouncing, projectile.generic, resource.charges, status.concuss | bounce concuss grenade |
| Tejo | E | Guided Salvo | sheet | damage.zoneOrHit, placement.mapTargeted, projectile.generic, resource.charges, resource.signatureRecharge | map-targeted rockets |
| Tejo | X | Armageddon | sheet | damage.zoneOrHit, placement.mapTargeted, resource.charges, resource.ultPoints, trigger.zone | map-targeted strike |
| Chamber | C | Trademark | sheet | device.summonOrPlaceable, resource.charges, status.slow, trigger.zone | trap slow; recall |
| Chamber | Q | Headhunter | sheet | damage.zoneOrHit, info.reveal, resource.charges | heavy pistol buy charges |
| Chamber | E | Rendezvous | sheet | movement.teleport, resource.charges, resource.signatureRecharge | two anchors; range limit |
| Chamber | X | Tour De Force | sheet | damage.zoneOrHit, resource.charges, resource.ultPoints, status.slow | operator ult |
| Cypher | C | Trapwire | secondary | damage.zoneOrHit, device.summonOrPlaceable, info.reveal, resource.charges, status.slow, status.snapshot, trigger.zone |  |
| Cypher | Q | Cyber Cage | secondary | info.audioOrMinimap, resource.charges, vision.smoke | sound on enemy cross |
| Cypher | E | Spycam | sheet | device.summonOrPlaceable, info.reveal, resource.charges, resource.signatureRecharge, status.snapshot | Snapshot silhouette; dart reveal |
| Cypher | X | Neural Theft | sheet | info.reveal, resource.charges, resource.ultPoints, status.snapshot | Snapshot silhouette |
| Deadlock | C | Barrier Mesh | secondary | device.summonOrPlaceable, resource.charges, vision.wallOrVolume | destructible wall geometry |
| Deadlock | Q | Sonic Sensor | verified | device.summonOrPlaceable, resource.charges, status.concuss, trigger.zone |  |
| Deadlock | E | GravNet | verified | resource.charges, resource.signatureRecharge, status.slow | forced crouch until removed |
| Deadlock | X | Annihilation | sheet | device.summonOrPlaceable, resource.charges, resource.ultPoints, vision.wallOrVolume | cocoon HP race |
| Killjoy | passive | Out of range | verified | device.summonOrPlaceable, resource.charges | 40m device deactivate |
| Killjoy | C | Nanoswarm | sheet | damage.zoneOrHit, device.summonOrPlaceable, resource.charges, trigger.zone |  |
| Killjoy | Q | Alarmbot | verified | device.summonOrPlaceable, projectile.generic, resource.charges, status.vulnerable, trigger.zone |  |
| Killjoy | E | Turret | verified | damage.zoneOrHit, device.summonOrPlaceable, resource.charges, resource.signatureRecharge, status.slow |  |
| Killjoy | X | Lockdown | sheet | device.summonOrPlaceable, resource.charges, resource.ultPoints, status.detain | large detain windup device |
| Sage | C | Barrier Orb | verified | placement.mapTargeted, projectile.generic, resource.charges, vision.wallOrVolume | destructible wall geometry |
| Sage | Q | Slow Orb | sheet | placement.mapTargeted, projectile.generic, resource.charges, status.slow |  |
| Sage | E | Healing Orb | verified | placement.mapTargeted, projectile.generic, resource.charges, resource.signatureRecharge, support.heal | ally/self targeting |
| Sage | X | Resurrection | sheet | resource.charges, resource.ultPoints, support.revive | full HP no armor |
| Veto | C | Crosscut | sheet | movement.teleport, resource.charges | buy-phase reclaimable TP |
| Veto | Q | Chokehold | sheet | info.audioOrMinimap, resource.charges, status.deafen, status.decay, status.tether, trigger.zone | tether/mark trail; tether+deafen+decay |
| Veto | E | Interceptor | sheet | damage.zoneOrHit, device.summonOrPlaceable, resource.charges, resource.signatureRecharge | destroy enemy utility |
| Veto | X | Evolution | sheet | resource.charges, resource.ultPoints, status.combatStim, support.heal | debuff immunity |
| Vyse | C | Razorvine | sheet | damage.zoneOrHit, device.summonOrPlaceable, resource.charges, status.slow, trigger.zone |  |
| Vyse | Q | Shear | sheet | device.summonOrPlaceable, resource.charges, trigger.zone, vision.wallOrVolume | destructible wall geometry |
| Vyse | E | Arc Rose | sheet | device.summonOrPlaceable, projectile.flash, projectile.generic, resource.charges, resource.signatureRecharge |  |
| Vyse | X | Steel Garden | sheet | resource.charges, resource.ultPoints, vision.wallOrVolume | weapon jam (primary) |
| Hush **[Hush: secondary/aggregator]** | passive | Telekinesis | secondary | device.summonOrPlaceable, resource.charges | Hush: secondary/aggregator data only; extended interact range; Spike attacker-only |
| Hush **[Hush: secondary/aggregator]** | C | Flow | aggregator | movement.dash, movement.glide, resource.charges, status.levitate | Hush: secondary/aggregator data only; anchor dash; air levitate first |
| Hush **[Hush: secondary/aggregator]** | Q | Flashbulb | aggregator | projectile.flash, projectile.generic, projectile.steerable, resource.charges | Hush: secondary/aggregator data only; steerable flash; aggregator |
| Hush **[Hush: secondary/aggregator]** | E | Displacement | aggregator | movement.pull, projectile.generic, projectile.steerable, resource.charges, resource.signatureRecharge, status.concuss | Hush: secondary/aggregator data only; pull+concuss 1.5s conflicts with 2.5s standard |
| Hush **[Hush: secondary/aggregator]** | X | Suspension | aggregator | projectile.generic, projectile.steerable, resource.charges, resource.ultPoints, status.levitate | Hush: secondary/aggregator data only; steerable ult; levitate duration null |

Row count: **130**. Hush rows are marked in the Agent column; their numbers are not primary-confirmed.

## 2. Primitive list

Proposal below follows the user’s list, with three small splits justified by the reference data:

1. **`status.tether` / mark trails** — Fade Seize/Nightfall and Veto Chokehold need sticky trails distinct from Snapshot. **design**
2. **`projectile.flash`** — Kept as a projectile subtype (facing check + smoke block) rather than only a status, because flashes are thrown/steered devices first. **design**
3. **`info.audioOrMinimap`** — Separated from Snapshot/reveal because Cyber Cage / Cosmic Divide / Deafen change information without applying a Snapshot silhouette. **design**

Vulnerable and Fragile are one primitive (`status.vulnerable`); the sheet uses Riot’s Fragile wording for Gravity Well. **design**

### Status effects
| Primitive | Meaning |
| --- | --- |
| status.concuss | stun/accuracy debuff for a duration |
| status.nearsight | vision radius clamp |
| status.deafen | audio muffling |
| status.slow | move-speed reduction / forced crouch |
| status.hinder | unpublished multiplier family (Waylay) |
| status.vulnerable | Fragile/Vulnerable damage amp |
| status.suppress | blocks casts / silences abilities |
| status.decay | temporary HP drain then restore |
| status.detain | root/disable in place |
| status.levitate | suspend in air (Hush Suspension/Flow) |
| status.haste | movement-speed buff |
| status.combatStim | fire-rate / equip / reload / recovery buff |
| status.snapshot | still-image silhouette reveal |
| status.overheal | temporary HP above max |
| status.intangible | untargetable / phase |
| status.tether | trail/tether attach (Fade/Veto) |

### Vision blockers
| Primitive | Meaning |
| --- | --- |
| vision.smoke | LOS disk/volume with deploy + expiry (existing Sky Smoke model) |
| vision.wallOrVolume | walls, cages, pits, audio walls, bullet-block volumes |

### Damage
| Primitive | Meaning |
| --- | --- |
| damage.zoneOrHit | instant hits and timed damage fields |

### Projectiles
| Primitive | Meaning |
| --- | --- |
| projectile.generic | thrown/fired payload with travel time |
| projectile.arcing | (folded into generic + gravity param) |
| projectile.bouncing | wall bounces |
| projectile.steerable | crosshair redirect after cast |
| projectile.homing | seeks agents / trails |
| projectile.flash | facing-dependent blind; blocked by smokes |

### Movement
| Primitive | Meaning |
| --- | --- |
| movement.dash | short burst translation |
| movement.teleport | instant relocate / beacon return |
| movement.glide | fall control / air hold |
| movement.pull | attract toward a point |
| movement.knockback | push / launch / knockup |

### Devices, triggers, support, info, resources
| Primitive | Meaning |
| --- | --- |
| device.summonOrPlaceable | HP, arm, recall, destroy cooldown |
| trigger.zone | arm + detect + trigger |
| support.heal | ally/self heal over time |
| support.revive | return from death / checkpoint |
| support.shield | temporary absorb HP |
| placement.mapTargeted | map/astral/global placement |
| info.reveal | live or pulsed enemy reveal |
| info.audioOrMinimap | sound cues / minimap obscure |
| resource.charges | spend/buy/max charges |
| resource.signatureRecharge | cooldown, 2-kill, reclaim, fuel |
| resource.ultPoints | orbs/kills/plant/defuse economy |

## 3. Primitive usage and engine work

Counts are ability rows that list the primitive (passives included). Sources for numbers stay in `agent-reference.json`; this section does not invent figures.

### `resource.charges` — 130 abilities, 30 agents
Agents: Astra, Breach, Brimstone, Chamber, Clove, Cypher, Deadlock, Fade, Gekko, Harbor, Hush, Iso, Jett, KAY/O, Killjoy, Miks, Neon, Omen, Phoenix, Raze, Reyna, Sage, Skye, Sova, Tejo, Veto, Viper, Vyse, Waylay, Yoru.

**Engine:** already partially present (`charges` on agents, cast validation). Extend buy/reclaim and per-ability pools. **Events:** charge-spent, charge-gained. **Orders:** cast already. **Tests:** spend/reject empty.

### `projectile.generic` — 43 abilities, 21 agents
Agents: Astra, Breach, Brimstone, Clove, Fade, Gekko, Hush, Iso, KAY/O, Killjoy, Neon, Omen, Phoenix, Raze, Sage, Skye, Sova, Tejo, Vyse, Waylay, Yoru.

**Engine:** ballistic/queued travel jobs with collision. **State:** `projectiles[]`. **Events:** projectile-spawn/land. **Orders:** cast with aim vector/point. **Tests:** travel time determinism.

### `resource.signatureRecharge` — 31 abilities, 30 agents
Agents: Astra, Breach, Brimstone, Chamber, Clove, Cypher, Deadlock, Fade, Gekko, Harbor, Hush, Iso, Jett, KAY/O, Killjoy, Miks, Neon, Omen, Phoenix, Raze, Reyna, Sage, Skye, Sova, Tejo, Veto, Viper, Vyse, Waylay, Yoru.

**Engine:** cooldown clocks, 2-kill counters, Gekko reclaim, fuel meters. **State:** `cooldownReadyAtMs`, kill credit hooks. **Events:** signature-recharged. **Tests:** 2-kill vs cooldown paths.

### `resource.ultPoints` — 30 abilities, 30 agents
Agents: Astra, Breach, Brimstone, Chamber, Clove, Cypher, Deadlock, Fade, Gekko, Harbor, Hush, Iso, Jett, KAY/O, Killjoy, Miks, Neon, Omen, Phoenix, Raze, Reyna, Sage, Skye, Sova, Tejo, Veto, Viper, Vyse, Waylay, Yoru.

**Engine:** point ledger from kill/death/orb/plant/defuse; assists do not grant points (`rules.assists.givesUltPoints: false`, verified assist defs). **Events:** ult-point-gained, ult-cast. **Tests:** cost gate.

### `damage.zoneOrHit` — 27 abilities, 17 agents
Agents: Breach, Brimstone, Chamber, Cypher, Gekko, Jett, KAY/O, Killjoy, Neon, Phoenix, Raze, Skye, Sova, Tejo, Veto, Viper, Vyse.

**Engine:** timed AoE ticks and instant hits; ally damage policy when recorded. **Events:** damage-applied. **Tests:** DPS windows, death.

### `device.summonOrPlaceable` — 26 abilities, 13 agents
Agents: Brimstone, Chamber, Cypher, Deadlock, Gekko, Hush, Killjoy, Raze, Sova, Tejo, Veto, Vyse, Yoru.

**Engine:** placeable entities with HP, arm time, recall, destroy cooldowns (45s verified where noted). **State:** `devices[]`. **Events:** device-placed/destroyed/recalled. **Tests:** destroy cooldown.

### `info.reveal` — 15 abilities, 8 agents
Agents: Chamber, Cypher, Fade, KAY/O, Reyna, Skye, Sova, Tejo.

**Engine:** feed `view()` / beliefs. **Tests:** Recon Bolt pulses.

### `vision.wallOrVolume` — 13 abilities, 10 agents
Agents: Astra, Brimstone, Deadlock, Harbor, Iso, Neon, Phoenix, Sage, Viper, Vyse.

**Engine:** wall segments with HP/fortify/decay; LOS and optional bullet block. **State:** `walls[]` dynamic. **Events:** wall-raised, wall-destroyed. **Orders:** cast with segment/placement. **Tests:** clip movement + LOS.

### `status.slow` — 12 abilities, 9 agents
Agents: Chamber, Cypher, Deadlock, Harbor, Killjoy, Miks, Sage, Skye, Vyse.

**Engine:** speed multiplier + GravNet forced crouch. **Tests:** move distance under slow.

### `trigger.zone` — 11 abilities, 9 agents
Agents: Chamber, Cypher, Deadlock, Fade, Killjoy, Miks, Tejo, Veto, Vyse.

**Engine:** arm timer + detection predicates (sound, presence). **Events:** trigger-fired. **Tests:** walking vs running for Sonic Sensor.

### `status.concuss` — 10 abilities, 9 agents
Agents: Astra, Breach, Deadlock, Gekko, Hush, Miks, Neon, Skye, Tejo.

**Engine:** status list on agents; 2.5s standard set vs exceptions (Hush 1.5s aggregator — keep both). **Tests:** duration table.

### `vision.smoke` — 10 abilities, 9 agents
Agents: Astra, Brimstone, Clove, Cypher, Harbor, Jett, Miks, Omen, Viper.

**Engine:** exists (Sky Smoke). Generalise multi-smoke owners, one-ways, bullet-block flag (Harbor Cove). **Tests:** LOS block/expiry.

### `support.heal` — 10 abilities, 7 agents
Agents: Clove, Miks, Phoenix, Reyna, Sage, Skye, Veto.

**Engine:** HoT; healingAssist rule (verified 13.10). **Tests:** Healing Orb.

### `placement.mapTargeted` — 9 abilities, 6 agents
Agents: Astra, Brimstone, Omen, Reyna, Sage, Tejo.

**Engine:** map pick UI / order target on minimap space. **Orders:** map-cast. **Tests:** Astra stars.

### `projectile.flash` — 9 abilities, 8 agents
Agents: Breach, Gekko, Hush, KAY/O, Phoenix, Skye, Vyse, Yoru.

**Engine:** facing test + smoke/cage block (13.05-style). **Events:** flash-applied/blocked. **Tests:** looking-at vs looking-away.

### `status.decay` — 8 abilities, 4 agents
Agents: Clove, Fade, Veto, Viper.

**Engine:** temp HP drain/restore timeline. **Tests:** Meddle restore.

### `status.nearsight` — 8 abilities, 7 agents
Agents: Fade, Harbor, Omen, Reyna, Skye, Viper, Waylay.

**Engine:** per-ability vision radius (Prowler 7, Paranoia 7.5, Leer 6, Seekers 7.5 — secondary). **Tests:** view() respects nearsight.

### `info.audioOrMinimap` — 7 abilities, 6 agents
Agents: Astra, Cypher, Fade, Miks, Omen, Veto.

**Engine:** optional audio channel in fog model. **Tests:** Cyber Cage cross cue.

### `status.combatStim` — 7 abilities, 6 agents
Agents: Brimstone, KAY/O, Miks, Neon, Reyna, Veto.

**Engine:** fire-rate/equip/reload modifiers from globals.combatStim. **Tests:** auto-fire interval interaction.

### `movement.teleport` — 6 abilities, 5 agents
Agents: Chamber, Omen, Veto, Waylay, Yoru.

**Engine:** instant move + beacon link. **Tests:** Rendezvous range.

### `projectile.homing` — 6 abilities, 3 agents
Agents: Fade, Gekko, Skye.

**Engine:** retarget nearest valid enemy each tick; trail follow for Fade. **Tests:** seeker path.

### `status.haste` — 5 abilities, 5 agents
Agents: Brimstone, Clove, Miks, Neon, Waylay.

**Engine:** speed buff stacking rules (**design**). **Tests:** Pick-me-up 10% secondary.

### `movement.knockback` — 5 abilities, 4 agents
Agents: Breach, Jett, Miks, Raze.

**Engine:** impulse + optional launch. **Tests:** Blast Pack.

### `status.deafen` — 5 abilities, 4 agents
Agents: Fade, Miks, Omen, Veto.

**Engine:** audio info filter for beliefs. **Tests:** decision context omits sound cues.

### `status.suppress` — 5 abilities, 3 agents
Agents: Iso, KAY/O, Tejo.

**Engine:** block casts while suppressed. **Tests:** cast-rejected while suppressed.

### `status.vulnerable` — 4 abilities, 4 agents
Agents: Astra, Iso, Killjoy, Viper.

**Engine:** damage amp flag. **Tests:** amplified Rifle A hit.

### `movement.dash` — 4 abilities, 4 agents
Agents: Hush, Jett, Neon, Waylay.

**Engine:** displace along path with collision. **Orders:** dash destination / segment. **Tests:** Tailwind window.

### `projectile.bouncing` — 4 abilities, 3 agents
Agents: Raze, Sova, Tejo.

**Engine:** bounce count + wall normals on Drill Hall segments. **Tests:** bounce count.

### `projectile.steerable` — 4 abilities, 2 agents
Agents: Hush, Yoru.

**Engine:** mid-flight aim updates; see turn-layer §5. **Orders:** steer segments. **Tests:** path under recorded steer plan.

### `support.revive` — 3 abilities, 3 agents
Agents: Clove, Phoenix, Sage.

**Engine:** dead→alive transitions; Not Dead Yet killer rewards (secondary). **Tests:** Resurrection.

### `status.intangible` — 3 abilities, 3 agents
Agents: Reyna, Waylay, Yoru.

**Engine:** untargetable; shot withheld. **Tests:** Dismiss.

### `status.tether` — 3 abilities, 2 agents
Agents: Fade, Veto.

**Engine:** trail attach + break rules. **Tests:** Seize/Chokehold.

### `status.snapshot` — 3 abilities, 1 agents
Agents: Cypher.

**Engine:** frozen silhouette pose for reveal UX / beliefs. **Tests:** Spycam dart / Neural Theft.

### `movement.pull` — 2 abilities, 2 agents
Agents: Astra, Hush.

**Engine:** force integrate toward point. **Tests:** Gravity Well / Displacement.

### `movement.glide` — 2 abilities, 2 agents
Agents: Hush, Jett.

**Engine:** fall-speed control; height model. **Tests:** Drift hold.

### `status.hinder` — 2 abilities, 1 agents
Agents: Waylay.

**Engine:** placeholder multipliers until published. **Tests:** apply/remove only.

### `status.detain` — 2 abilities, 2 agents
Agents: Gekko, Killjoy.

**Engine:** hard lock movement/actions. **Tests:** Lockdown/Thrash.

### `status.levitate` — 2 abilities, 1 agents
Agents: Hush.

**Engine:** vertical hold; needs height model decision. **Tests:** Suspension (aggregator).

### `status.overheal` — 1 abilities, 1 agents
Agents: Clove.

**Engine:** temp HP pool decay. **Tests:** Pick-me-up overheal.

### `support.shield` — 1 abilities, 1 agents
Agents: Iso.

**Engine:** absorb layer before HP. **Tests:** Double Tap.


## 4. Recommended build order

Ranked by how many *new* abilities a stage unlocks once prior stages exist. Tags on stages are **design**. Numbers cited stay with their JSON sources.

| Stage | Primitives unlocked | Why this order | Newly completable agents (all C/Q/E/X + passives executable) |
| --- | --- | --- | --- |
| 0 (done) | vision.smoke (basic), resource.charges (basic), damage via Rifle A, LOS | Milestone 1–2 | none fully; Brimstone only Sky Smoke live |
| 1 | resource.signatureRecharge (cooldown), projectile.generic, projectile.flash, status.nearsight (flash-adjacent), vision.smoke generalisation | Unlocks the densest “throw utility” set and finishes several initiator/controller basics | *Partial kits only* |
| 2 | status.concuss, status.slow, damage.zoneOrHit (mollies), device.summonOrPlaceable (simple) | Concuss+slow are the most common combat statuses | **Breach** (Aftershock, Flashpoint, Fault Line, Rolling Thunder — all verified-heavy) |
| 3 | vision.wallOrVolume, placement.mapTargeted, status.decay, status.vulnerable | Controller walls/smokes/decay | **Brimstone** (full), then **Harbor** once bullet-block smoke exists; **Viper** when fuel meter exists |
| 4 | movement.dash, movement.teleport, resource.signatureRecharge (2-kill), status.intangible | Duelist entry | **Jett** (needs height for Updraft/Drift — or stub vertical as **design** no-op on flat map), **Phoenix** after heal-from-fire |
| 5 | info.reveal, projectile.homing, status.tether, device drones | Initiator info | **Sova**, **Fade**, **Skye** |
| 6 | trigger.zone, device HP/recall/destroy CD, status.snapshot, status.detain | Sentinel kits | **Cypher**, **Killjoy**, **Deadlock**, **Sage** (heal/revive), **Chamber** |
| 7 | status.combatStim, status.haste, status.suppress, support.heal/shield/revive polish | Buff/economy completeness | **Reyna**, **KAY/O**, **Iso**, **Clove**, **Miks**, **Veto**, **Neon**, **Raze**, **Yoru**, **Waylay**, **Tejo**, **Gekko**, **Astra**, **Omen**, **Vyse** |
| 8 | projectile.steerable, movement.pull/levitate, Telekinesis interacts | Hush last (aggregator) | **Hush** **[secondary/aggregator]** |

### Earliest whole-role completion

- **Initiators first complete role:** after Stage 5 (+ Gekko reclaim in Stage 7). Breach alone is Stage 2; full initiator row needs reveal/homing/reclaim.
- **Sentinels:** Stage 6 delivers Cypher/Killjoy/Deadlock/Sage; Chamber/Vyse/Veto finish in Stage 7.
- **Controllers:** Stage 3 gets Brimstone + Harbor (+ Viper with fuel); Astra/Omen/Clove/Miks need map placement / TP / stim in Stage 7.
- **Duelists:** staggered; no clean early full-role cut without height + 2-kill + stim. Earliest “all duelists” is late Stage 7–8.

**Recommendation (design):** chase **Stage 2 → Breach complete**, then **Stage 3 → Brimstone complete**, then **Stage 5–6 → Sova + Cypher**, matching the old “FLASH/DRIVE, Tailwind, Trapwire” next-task but under this primitive spine.

## 5. Turn layer changes (`src/sim/round.ts`) — describe only

Tag: **design**. Do not implement here.

1. **Orders with targets or steering.** Extend `WindowOrder` beyond point cast: aim yaw/pitch (or 2D facing), optional multi-point steer polyline for steerable projectiles, ally-instance target for heals, map-cell target for astral/global ults, beacon/device instance ids for recall/TP.
2. **Channelled / windup actions.** Represent windup as queued `channel-start` / `channel-complete` jobs inside the window; validation must fail if suppressed/detained before complete. Window end may leave an in-flight channel in `pendingJobs` (same pattern as mid-move lerp).
3. **Effects that outlast a window.** Statuses, smokes, walls, devices, projectiles, and damage zones already must persist on `RoundState` (today only smokes + agents). Carry `pendingJobs` across windows (already begun for moves).
4. **Interrupts.** Destruction of a device, kill/down of caster, Suppress, and hard CC cancel channels; emit typed cancel events; refund rules follow each ability’s source notes (no invented refunds).
5. **Cancellation.** Player order `cancel` / `recall` for beacons, birds, drones, smokes where the reference says reclaim; defense stub stays hold-only until a real planner exists.
6. **Auto-engage vs utility.** Auto-fire must respect Suppress, flash, detain, and intangible; withheld reasons expand beyond LOS.
7. **Determinism.** Steer polylines and channel timings are part of the plan seed; no `Math.random`. Steerable aggregator kits (Hush) use the same queue ordering `(timeMs, sequence, agentId)`.

## 6. Decisions needed (max 10)

| # | Question | Recommended answer | Tag |
| --- | --- | --- | --- |
| 1 | How to discretise crosshair-steered abilities in turn windows? | Plan a polyline of at most N aim samples per window (N=4 **design**), applied at fixed offsets inside the window; no continuous mouse. | design |
| 2 | Does Drill Hall gain height / vertical movement? | Stay 2D for Stages 1–6; model Updraft/Drift/Flow air levitate as timing-only stubs until a height layer exists. | design |
| 3 | How does fog of war treat sounds? | `view(side)` stays visual; add optional `audioCues[]` on the side view for cage crosses / footsteps, hidden from the opponent’s view. | design |
| 4 | Flash facing test on a 2D map? | Use agent facing yaw (new state field); default face move target or last aim order. Looking-at = angle within ±θ (**design** θ=90° until measured). | design |
| 5 | Stacking Haste + Combat Stim? | Allow both; do not invent diminishing returns; apply multipliers independently as listed in reference/globals. | design |
| 6 | Fragile vs Vulnerable? | Single `status.vulnerable` primitive; keep source wording on the ability. | design |
| 7 | Hush concuss 1.5s vs global 2.5s list? | Keep both; Hush uses aggregator 1.5; do not rewrite globals. | design (matches JSON conflicts note) |
| 8 | Ally damage fractions unpublished? | Apply damage to self rules where stated; skip ally damage until a source gives a fraction. | design |
| 9 | When is an agent “fully executable”? | All slots + passive have `implementation: complete` in the sim catalog and tests for ownership, charges, timing, geometry. | design |
| 10 | Assist ult points? | `givesUltPoints: false` stays; verified assist rules track scoreboard assists only. | design |

## 7. Provenance reminder

- Do not copy `aggregator` or `estimate` figures into the sim catalog as if verified.
- Sky Smoke figures remain **secondary**; Rifle A, window length, walk speed, auto-fire remain **assumed**.
- Patch 13.10 cooldown numbers on Spycam/Turret/Arc Rose use `statSources` / verified notes; ability-level Spycam and Arc Rose sources remain **sheet**.

---

Generated from `agent-reference.json` patch 13.10 for planning only.
