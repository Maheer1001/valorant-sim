# Effect primitives (design)

Tag: **design**. This document plans shared engine primitives so every live agent in `agent-reference.json` (patch 13.10, 30 agents, 130 abilities including passives) can become fully executable. It invents no ability numbers. Game figures stay tagged with their existing sources (`verified` / `secondary` / `sheet` / `estimate` / `aggregator`).

Sections 1, 3, and 4 are generated from `data/ability-primitives.json` and `data/primitive-stages.json` via `tools/regenerate-effect-primitives-doc.mjs`. Rebuild with `node tools/build-ability-primitives.mjs` then this script.

**Core engine state** (not per-ability primitives): resource.charges, resource.signatureRecharge, resource.ultPoints.

The sim today only executes **Sky Smoke** as a special case. Under the corrected mapping it also needs `placement.mapTargeted`.

## 1. Ability → primitives table

| Agent | Slot | Ability | Source | Primitives | Extra rules |
| --- | --- | --- | --- | --- | --- |
| Astra | passive | Astral Form / Stars | sheet | placement.mapTargeted, resource.passiveMeter |  |
| Astra | C | Gravity Well | verified | movement.pull, projectile.generic, status.vulnerable |  |
| Astra | Q | Nova Pulse | verified | projectile.generic, status.concuss |  |
| Astra | E | Nebula / Dissipate | sheet | placement.mapTargeted, resource.passiveMeter, vision.smoke |  |
| Astra | X | Cosmic Divide | verified | info.audioOrMinimap, placement.mapTargeted, vision.wallOrVolume |  |
| Brimstone | C | Stim Beacon | verified | device.summonOrPlaceable, status.combatStim, status.haste | Haste + Combat Stim; indestructible beacon |
| Brimstone | Q | Incendiary | sheet | damage.zoneOrHit, projectile.bouncing, projectile.generic | thrown mollie; ally damage fraction unpublished |
| Brimstone | E | Sky Smoke | secondary | placement.mapTargeted, vision.smoke | already executable in sim; cast via tactical map |
| Brimstone | X | Orbital Strike | sheet | damage.zoneOrHit, placement.mapTargeted, vision.wallOrVolume | map-targeted strike; not a projectile; ally damage fraction unpublished |
| Clove | C | Pick-me-up | secondary | status.haste, status.overheal, support.heal |  |
| Clove | Q | Meddle | sheet | projectile.generic, status.decay |  |
| Clove | E | Ruse | sheet | placement.mapTargeted, vision.smoke | castable while dead; map placement |
| Clove | X | Not Dead Yet | secondary | support.revive |  |
| Harbor | C | Storm Surge | sheet | projectile.generic, status.nearsight, status.slow |  |
| Harbor | Q | High Tide | sheet | status.slow, vision.wallOrVolume |  |
| Harbor | E | Cove | sheet | placement.mapTargeted, vision.smoke, vision.wallOrVolume |  |
| Harbor | X | Reckoning | sheet | placement.mapTargeted, status.nearsight, status.slow |  |
| Miks | C | M-pulse | sheet | projectile.generic, status.concuss, support.heal |  |
| Miks | Q | Harmonize | sheet | status.combatStim, status.haste |  |
| Miks | E | Waveform | estimate | placement.mapTargeted, vision.smoke |  |
| Miks | X | Bassquake | sheet | info.audioOrMinimap, movement.knockback, status.deafen, status.slow |  |
| Omen | C | Shrouded Step | sheet | movement.teleport |  |
| Omen | Q | Paranoia | secondary | info.audioOrMinimap, projectile.generic, status.deafen, status.nearsight |  |
| Omen | E | Dark Cover | sheet | placement.mapTargeted, vision.smoke |  |
| Omen | X | From the Shadows | sheet | movement.teleport, placement.mapTargeted |  |
| Viper | passive | Fuel and Toxin | verified | resource.passiveMeter, status.decay |  |
| Viper | C | Snake Bite | sheet | damage.zoneOrHit, projectile.generic, status.vulnerable |  |
| Viper | Q | Poison Cloud | sheet | status.decay, vision.smoke |  |
| Viper | E | Toxic Screen | sheet | status.decay, vision.wallOrVolume |  |
| Viper | X | Viper's Pit | sheet | status.decay, status.nearsight, vision.smoke |  |
| Iso | C | Contingency | sheet | vision.wallOrVolume |  |
| Iso | Q | Undercut | sheet | projectile.generic, status.suppress, status.vulnerable |  |
| Iso | E | Double Tap | sheet | support.shield |  |
| Iso | X | Kill Contract | sheet | status.suppress |  |
| Jett | passive | Drift | sheet | movement.glide |  |
| Jett | C | Cloudburst | verified | vision.smoke |  |
| Jett | Q | Updraft | estimate | movement.knockback |  |
| Jett | E | Tailwind | verified | movement.dash |  |
| Jett | X | Blade Storm | sheet | damage.zoneOrHit |  |
| Neon | passive | Energy | sheet | resource.passiveMeter |  |
| Neon | C | Fast Lane | secondary | vision.wallOrVolume |  |
| Neon | Q | Relay Bolt | verified | projectile.generic, status.concuss |  |
| Neon | E | High Gear | sheet | movement.dash, status.haste |  |
| Neon | X | Overdrive | sheet | damage.zoneOrHit |  |
| Phoenix | passive | Heating Up | sheet | support.heal |  |
| Phoenix | C | Blaze | sheet | damage.zoneOrHit, support.heal, vision.wallOrVolume |  |
| Phoenix | Q | Hot Hands | estimate | damage.zoneOrHit, projectile.generic, support.heal |  |
| Phoenix | E | Curveball | secondary | projectile.flash, projectile.generic |  |
| Phoenix | X | Run it Back | verified | support.revive |  |
| Raze | C | Boom Bot | sheet | damage.zoneOrHit, device.summonOrPlaceable, projectile.generic, projectile.homing |  |
| Raze | Q | Blast Pack | sheet | damage.zoneOrHit, movement.knockback, projectile.bouncing, projectile.generic |  |
| Raze | E | Paint Shells | sheet | damage.zoneOrHit, projectile.bouncing, projectile.generic |  |
| Raze | X | Showstopper | sheet | damage.zoneOrHit, movement.knockback |  |
| Reyna | passive | Soul Harvest | sheet | resource.passiveMeter | soul orb economy; not map placement |
| Reyna | C | Leer | secondary | projectile.generic, status.nearsight |  |
| Reyna | Q | Devour | sheet | support.heal |  |
| Reyna | E | Dismiss | sheet | status.intangible |  |
| Reyna | X | Empress | sheet | info.reveal, status.combatStim |  |
| Waylay | C | Saturate | sheet | projectile.generic, status.hinder |  |
| Waylay | Q | Lightspeed | sheet | movement.dash |  |
| Waylay | E | Refract | sheet | movement.teleport, status.intangible, status.nearsight |  |
| Waylay | X | Convergent Paths | sheet | status.haste, status.hinder |  |
| Yoru | C | Fakeout | sheet | device.summonOrPlaceable, projectile.flash, projectile.generic |  |
| Yoru | Q | Blindside | sheet | projectile.flash, projectile.generic |  |
| Yoru | E | Gatecrash | secondary | device.summonOrPlaceable, movement.teleport, projectile.generic, projectile.steerable |  |
| Yoru | X | Dimensional Drift | sheet | movement.glide, status.intangible |  |
| Breach | C | Aftershock | verified | damage.zoneOrHit, projectile.generic |  |
| Breach | Q | Flashpoint | verified | projectile.flash, projectile.generic |  |
| Breach | E | Fault Line | verified | projectile.generic, status.concuss |  |
| Breach | X | Rolling Thunder | verified | movement.knockback, projectile.generic, status.concuss |  |
| Fade | passive | Terror Trail | sheet | info.reveal |  |
| Fade | C | Prowler | secondary | info.reveal, projectile.generic, projectile.homing, status.nearsight |  |
| Fade | Q | Seize | sheet | info.audioOrMinimap, movement.pull, projectile.generic, status.deafen, status.decay, status.tether, trigger.zone |  |
| Fade | E | Haunt | verified | info.reveal |  |
| Fade | X | Nightfall | verified | info.audioOrMinimap, status.deafen, status.decay, status.tether |  |
| Gekko | passive | Globules | verified | resource.passiveMeter |  |
| Gekko | C | Mosh Pit | sheet | damage.zoneOrHit, device.summonOrPlaceable, projectile.generic |  |
| Gekko | Q | Wingman | verified | device.summonOrPlaceable, projectile.generic, projectile.homing, status.concuss |  |
| Gekko | E | Dizzy | sheet | device.summonOrPlaceable, projectile.flash, projectile.generic, projectile.homing |  |
| Gekko | X | Thrash | verified | device.summonOrPlaceable, projectile.homing, status.detain |  |
| KAY/O | C | FRAG/ment | sheet | damage.zoneOrHit, projectile.generic |  |
| KAY/O | Q | FLASH/drive | verified | projectile.flash, projectile.generic |  |
| KAY/O | E | ZERO/point | sheet | info.reveal, projectile.generic, status.suppress |  |
| KAY/O | X | NULL/cmd | sheet | status.combatStim, status.suppress |  |
| Skye | C | Regrowth | sheet | support.heal |  |
| Skye | Q | Trailblazer | sheet | damage.zoneOrHit, projectile.generic, projectile.homing, status.concuss, support.heal |  |
| Skye | E | Guiding Light | verified | projectile.flash, projectile.generic |  |
| Skye | X | Seekers | secondary | info.reveal, projectile.homing, status.nearsight, status.slow |  |
| Sova | C | Owl Drone | sheet | device.summonOrPlaceable, info.reveal, projectile.generic |  |
| Sova | Q | Shock Bolt | sheet | damage.zoneOrHit, projectile.bouncing, projectile.generic |  |
| Sova | E | Recon Bolt | verified | info.reveal, projectile.generic |  |
| Sova | X | Hunter's Fury | sheet | damage.zoneOrHit, info.reveal, placement.mapTargeted |  |
| Tejo | C | Stealth Drone | sheet | device.summonOrPlaceable, info.reveal, projectile.generic, status.suppress |  |
| Tejo | Q | Special Delivery | sheet | damage.zoneOrHit, projectile.bouncing, projectile.generic, status.concuss |  |
| Tejo | E | Guided Salvo | sheet | damage.zoneOrHit, placement.mapTargeted |  |
| Tejo | X | Armageddon | sheet | damage.zoneOrHit, placement.mapTargeted |  |
| Chamber | C | Trademark | sheet | device.summonOrPlaceable, status.slow, trigger.zone |  |
| Chamber | Q | Headhunter | sheet | damage.zoneOrHit, info.reveal |  |
| Chamber | E | Rendezvous | sheet | movement.teleport |  |
| Chamber | X | Tour De Force | sheet | damage.zoneOrHit, status.slow |  |
| Cypher | C | Trapwire | secondary | damage.zoneOrHit, device.summonOrPlaceable, info.reveal, status.slow, status.snapshot, trigger.zone |  |
| Cypher | Q | Cyber Cage | secondary | info.audioOrMinimap, vision.smoke |  |
| Cypher | E | Spycam | sheet | device.summonOrPlaceable, info.reveal, status.snapshot |  |
| Cypher | X | Neural Theft | sheet | info.reveal, status.snapshot |  |
| Deadlock | C | Barrier Mesh | secondary | device.summonOrPlaceable, vision.wallOrVolume |  |
| Deadlock | Q | Sonic Sensor | verified | device.summonOrPlaceable, status.concuss, trigger.zone |  |
| Deadlock | E | GravNet | verified | status.slow |  |
| Deadlock | X | Annihilation | sheet | device.summonOrPlaceable, vision.wallOrVolume |  |
| Killjoy | passive | Out of range | verified | device.summonOrPlaceable |  |
| Killjoy | C | Nanoswarm | sheet | damage.zoneOrHit, device.summonOrPlaceable, projectile.generic | thrown placeable swarm |
| Killjoy | Q | Alarmbot | verified | device.summonOrPlaceable, status.vulnerable, trigger.zone |  |
| Killjoy | E | Turret | verified | damage.zoneOrHit, device.summonOrPlaceable, status.slow |  |
| Killjoy | X | Lockdown | sheet | device.summonOrPlaceable, status.detain |  |
| Sage | C | Barrier Orb | verified | vision.wallOrVolume | world-placed wall; not tactical-map targeted |
| Sage | Q | Slow Orb | sheet | projectile.generic, status.slow | thrown slow field |
| Sage | E | Healing Orb | verified | support.heal | ally/self heal; not map-targeted |
| Sage | X | Resurrection | sheet | support.revive |  |
| Veto | C | Crosscut | sheet | movement.teleport |  |
| Veto | Q | Chokehold | sheet | info.audioOrMinimap, status.deafen, status.decay, status.tether, trigger.zone |  |
| Veto | E | Interceptor | sheet | damage.zoneOrHit, device.summonOrPlaceable |  |
| Veto | X | Evolution | sheet | status.combatStim, support.heal |  |
| Vyse | C | Razorvine | sheet | damage.zoneOrHit, device.summonOrPlaceable, status.slow, trigger.zone |  |
| Vyse | Q | Shear | sheet | device.summonOrPlaceable, trigger.zone, vision.wallOrVolume |  |
| Vyse | E | Arc Rose | sheet | device.summonOrPlaceable, projectile.flash, projectile.generic |  |
| Vyse | X | Steel Garden | sheet | vision.wallOrVolume |  |
| Hush **[Hush: secondary/aggregator]** | passive | Telekinesis | secondary | interact.pickup | Hush secondary/aggregator; range null |
| Hush **[Hush: secondary/aggregator]** | C | Flow | aggregator | movement.dash, movement.glide, status.levitate | Hush: secondary/aggregator data only; Hush secondary/aggregator |
| Hush **[Hush: secondary/aggregator]** | Q | Flashbulb | aggregator | projectile.flash, projectile.generic, projectile.steerable | Hush: secondary/aggregator data only; Hush secondary/aggregator |
| Hush **[Hush: secondary/aggregator]** | E | Displacement | aggregator | movement.pull, projectile.generic, projectile.steerable, status.concuss | Hush: secondary/aggregator data only; Hush secondary/aggregator; concuss 1.5 vs global 2.5 |
| Hush **[Hush: secondary/aggregator]** | X | Suspension | aggregator | projectile.generic, projectile.steerable, status.levitate | Hush: secondary/aggregator data only; Hush secondary/aggregator; levitate duration null |

Row count: **130**. Audit fixes applied when regenerating the mapping:

- Sage Barrier Orb / Slow Orb / Healing Orb: removed placement.mapTargeted
- Reyna Soul Harvest: removed placement.mapTargeted; uses resource.passiveMeter
- Map smokes (Sky Smoke, Ruse, Cove, Waveform, Dark Cover, Nebula/Dissipate): added placement.mapTargeted
- Brimstone Incendiary: added projectile.generic + projectile.bouncing
- Killjoy Nanoswarm: added projectile.generic
- Brimstone Orbital Strike: removed projectile.generic; kept placement.mapTargeted
- Hush Telekinesis: removed device.summonOrPlaceable; added interact.pickup
- resource.charges / signatureRecharge / ultPoints moved to core (not per-ability)

## 2. Primitive list

See `data/ability-primitives.json` `primitives` definitions. Core charge / signature-recharge / ult-point handling lives outside the per-ability list. New primitive `interact.pickup` covers Hush Telekinesis.

Vulnerable and Fragile remain one primitive (`status.vulnerable`). **design**

## 3. Primitive usage and engine work

Counts exclude core resource fields.

### `projectile.generic` — 45 abilities, 25 agents
Agents: Astra, Breach, Brimstone, Clove, Fade, Gekko, Harbor, Hush, Iso, KAY/O, Killjoy, Miks, Neon, Omen, Phoenix, Raze, Reyna, Sage, Skye, Sova, Tejo, Viper, Vyse, Waylay, Yoru.

thrown/fired payload with travel time

**Engine:** travel jobs with collision. **State:** `projectiles[]`. **Orders:** cast with aim/point.

### `damage.zoneOrHit` — 27 abilities, 17 agents
Agents: Breach, Brimstone, Chamber, Cypher, Gekko, Jett, KAY/O, Killjoy, Neon, Phoenix, Raze, Skye, Sova, Tejo, Veto, Viper, Vyse.

instant hits and timed damage fields

**Engine:** timed AoE ticks and instant hits. **Events:** damage-applied. **Tests:** DPS windows, death.

### `device.summonOrPlaceable` — 25 abilities, 12 agents
Agents: Brimstone, Chamber, Cypher, Deadlock, Gekko, Killjoy, Raze, Sova, Tejo, Veto, Vyse, Yoru.

HP, arm, recall, destroy cooldown

**Engine:** placeables with HP, arm, recall, destroy cooldowns. **State:** `devices[]`.

### `info.reveal` — 14 abilities, 8 agents
Agents: Chamber, Cypher, Fade, KAY/O, Reyna, Skye, Sova, Tejo.

live or pulsed enemy reveal

**Engine:** feed view()/beliefs.

### `placement.mapTargeted` — 14 abilities, 8 agents
Agents: Astra, Brimstone, Clove, Harbor, Miks, Omen, Sova, Tejo.

tactical-map / astral / global placement

**Engine:** tactical-map / astral placement orders. **Orders:** map-cast.

### `vision.wallOrVolume` — 13 abilities, 10 agents
Agents: Astra, Brimstone, Deadlock, Harbor, Iso, Neon, Phoenix, Sage, Viper, Vyse.

walls, cages, pits, audio walls, bullet-block volumes

**Engine:** dynamic wall segments with HP/fortify; LOS and optional bullet block. **State:** `walls[]`. **Events:** wall-raised/destroyed.

### `status.slow` — 12 abilities, 9 agents
Agents: Chamber, Cypher, Deadlock, Harbor, Killjoy, Miks, Sage, Skye, Vyse.

move-speed reduction / forced crouch

**Engine:** speed multiplier / forced crouch.

### `status.concuss` — 10 abilities, 9 agents
Agents: Astra, Breach, Deadlock, Gekko, Hush, Miks, Neon, Skye, Tejo.

stun/accuracy debuff for a duration

**Engine:** status list; keep Hush 1.5s aggregator vs 2.5s standard.

### `support.heal` — 10 abilities, 7 agents
Agents: Clove, Miks, Phoenix, Reyna, Sage, Skye, Veto.

ally/self heal over time

**Engine:** HoT; healingAssist (verified 13.10).

### `vision.smoke` — 10 abilities, 9 agents
Agents: Astra, Brimstone, Clove, Cypher, Harbor, Jett, Miks, Omen, Viper.

LOS disk/volume with deploy + expiry

**Engine:** exists (Sky Smoke). Generalise multi-smoke owners and map placement. **Tests:** LOS block/expiry.

### `projectile.flash` — 9 abilities, 8 agents
Agents: Breach, Gekko, Hush, KAY/O, Phoenix, Skye, Vyse, Yoru.

facing-dependent blind; blocked by smokes

**Engine:** facing test + smoke block. **Events:** flash-applied/blocked.

### `status.decay` — 8 abilities, 4 agents
Agents: Clove, Fade, Veto, Viper.

temporary HP drain then restore

**Engine:** temp HP drain/restore timeline.

### `status.nearsight` — 8 abilities, 7 agents
Agents: Fade, Harbor, Omen, Reyna, Skye, Viper, Waylay.

vision radius clamp

**Engine:** per-ability vision radius. **Tests:** view() respects nearsight.

### `trigger.zone` — 8 abilities, 7 agents
Agents: Chamber, Cypher, Deadlock, Fade, Killjoy, Veto, Vyse.

arm + detect + trigger

**Engine:** arm + detection predicates. **Events:** trigger-fired.

### `info.audioOrMinimap` — 7 abilities, 6 agents
Agents: Astra, Cypher, Fade, Miks, Omen, Veto.

sound cues / minimap obscure

**Engine:** optional audioCues on side view.

### `projectile.homing` — 7 abilities, 4 agents
Agents: Fade, Gekko, Raze, Skye.

seeks agents / trails

**Engine:** retarget nearest valid enemy each tick.

### `movement.teleport` — 6 abilities, 5 agents
Agents: Chamber, Omen, Veto, Waylay, Yoru.

instant relocate / beacon return

**Engine:** instant move + beacon link.

### `resource.passiveMeter` — 6 abilities, 5 agents
Agents: Astra, Gekko, Neon, Reyna, Viper.

fuel / battery / soul-orb / star economy (non-charge)

**Engine:** fuel/battery/soul/star meters separate from ability charges.

### `movement.knockback` — 5 abilities, 4 agents
Agents: Breach, Jett, Miks, Raze.

push / launch / knockup

**Engine:** impulse / knockup.

### `projectile.bouncing` — 5 abilities, 4 agents
Agents: Brimstone, Raze, Sova, Tejo.

wall/floor bounces

**Engine:** bounce count on Drill Hall segments.

### `status.combatStim` — 5 abilities, 5 agents
Agents: Brimstone, KAY/O, Miks, Reyna, Veto.

fire-rate / equip / reload / recovery buff

**Engine:** fire-rate/equip/reload from globals.combatStim.

### `status.deafen` — 5 abilities, 4 agents
Agents: Fade, Miks, Omen, Veto.

audio muffling

**Engine:** audio info filter.

### `status.haste` — 5 abilities, 5 agents
Agents: Brimstone, Clove, Miks, Neon, Waylay.

movement-speed buff

**Engine:** move-speed buff; stacks with Combat Stim (**design**).

### `status.suppress` — 5 abilities, 3 agents
Agents: Iso, KAY/O, Tejo.

blocks casts

**Engine:** block casts while suppressed.

### `movement.dash` — 4 abilities, 4 agents
Agents: Hush, Jett, Neon, Waylay.

short burst translation

**Engine:** path displace with collision.

### `projectile.steerable` — 4 abilities, 2 agents
Agents: Hush, Yoru.

crosshair redirect after cast

**Engine:** mid-flight aim samples (N≤4 per window). **Orders:** steer polyline.

### `status.vulnerable` — 4 abilities, 4 agents
Agents: Astra, Iso, Killjoy, Viper.

Fragile/Vulnerable damage amp

**Engine:** damage amp flag.

### `movement.glide` — 3 abilities, 3 agents
Agents: Hush, Jett, Yoru.

fall control / air hold

**Engine:** fall-speed control; height model.

### `movement.pull` — 3 abilities, 3 agents
Agents: Astra, Fade, Hush.

attract toward a point

**Engine:** force toward point.

### `status.intangible` — 3 abilities, 3 agents
Agents: Reyna, Waylay, Yoru.

untargetable / phase

**Engine:** untargetable; shot withheld.

### `status.snapshot` — 3 abilities, 1 agents
Agents: Cypher.

still-image silhouette reveal

**Engine:** frozen silhouette for beliefs.

### `status.tether` — 3 abilities, 2 agents
Agents: Fade, Veto.

trail/tether attach

**Engine:** trail attach + break rules.

### `support.revive` — 3 abilities, 3 agents
Agents: Clove, Phoenix, Sage.

return from death / checkpoint

**Engine:** dead→alive transitions.

### `status.detain` — 2 abilities, 2 agents
Agents: Gekko, Killjoy.

root/disable in place

**Engine:** hard lock movement/actions.

### `status.hinder` — 2 abilities, 1 agents
Agents: Waylay.

unpublished multiplier family (Waylay)

**Engine:** apply/remove only until multipliers published.

### `status.levitate` — 2 abilities, 1 agents
Agents: Hush.

suspend in air

**Engine:** vertical hold; height model decision.

### `interact.pickup` — 1 abilities, 1 agents
Agents: Hush.

pick up weapons/Spike and use switches from range

**Engine:** extended interact range for weapons/Spike/switches. **State:** interactRangeMm (null until sourced).

### `status.overheal` — 1 abilities, 1 agents
Agents: Clove.

temporary HP above max

**Engine:** temp HP pool decay.

### `support.shield` — 1 abilities, 1 agents
Agents: Iso.

temporary absorb HP

**Engine:** absorb layer before HP.

## 4. Recommended build order

Generated from `data/primitive-stages.json`. An agent is listed at the first stage whose cumulative primitives cover every primitive that agent's abilities need. Hush is forced last. Core charge/ult fields are assumed available as engine state throughout.

| Stage | Primitives added | Agents newly complete | Roles fully complete after |
| --- | --- | --- | --- |
| 0 (foundation (done)) | — | — | — |
| 1 (stage-1) | damage.zoneOrHit, movement.knockback, projectile.flash, projectile.generic, status.concuss | Breach | — |
| 2 (stage-2) | device.summonOrPlaceable, placement.mapTargeted, projectile.bouncing, status.combatStim, status.haste, vision.smoke, vision.wallOrVolume | Brimstone | — |
| 3 (stage-3) | projectile.homing | Raze | — |
| 4 (stage-4) | info.reveal | Sova | — |
| 5 (stage-5) | status.suppress | KAY/O, Tejo | — |
| 6 (stage-6) | status.slow, trigger.zone | Deadlock, Vyse | — |
| 7 (stage-7) | movement.teleport | Chamber | — |
| 8 (stage-8) | status.nearsight | Harbor | — |
| 9 (stage-9) | support.heal | Skye | — |
| 10 (stage-10) | support.revive | Phoenix, Sage | — |
| 11 (stage-11) | status.decay, status.overheal | Clove | — |
| 12 (stage-12) | info.audioOrMinimap, status.snapshot | Cypher | — |
| 13 (stage-13) | status.deafen | Miks, Omen | — |
| 14 (stage-14) | status.tether | Veto | — |
| 15 (stage-15) | movement.pull | Fade | — |
| 16 (stage-16) | resource.passiveMeter, status.vulnerable | Astra, Viper | controller |
| 17 (stage-17) | status.detain | Gekko, Killjoy | controller, initiator, sentinel |
| 18 (stage-18) | support.shield | Iso | controller, initiator, sentinel |
| 19 (stage-19) | movement.dash | Neon | controller, initiator, sentinel |
| 20 (stage-20) | movement.glide | Jett | controller, initiator, sentinel |
| 21 (stage-21) | status.intangible | Reyna | controller, initiator, sentinel |
| 22 (stage-22) | status.hinder | Waylay | controller, initiator, sentinel |
| 23 (stage-23) | projectile.steerable | Yoru | controller, initiator, sentinel |
| 24 (stage-24) | interact.pickup, status.levitate | Hush | controller, duelist, initiator, sentinel |

### Role completion (from generated stages)

- **controller:** first fully complete after stage 16.
- **duelist:** first fully complete after stage 24.
- **initiator:** first fully complete after stage 17.
- **sentinel:** first fully complete after stage 17.

**Recommendation (design):** implement stage 1 (Breach) then stage 2 (Brimstone) as the first executable milestone — see `docs/stage-1-plan.md`.


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

**Approved:** all ten recommended answers are approved by the project owner (17 Nov 2026).

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
