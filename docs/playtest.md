# Manual playtest — live round (fast controls)

Default load: attack = Breach + Brimstone, defense = KAY/O + Jett holding. Attack fog is on. The round **starts paused** at **1:40**. Setup drawer is **closed**. Starting ult points = 0 (drill option, assumed).

## Controls

| Input | Action |
| --- | --- |
| Click agent / keys **1–5** | Select attacker |
| Shift-click / drag-box | Multi-select |
| **Right-click** ground | Formation move (replace route) for selection |
| **Shift+right-click** | Append a waypoint to each selected route |
| **C / Q / E / X** | Arm ability slot on primary selected agent, then left-click to confirm |
| Mouse wheel (Fault Line armed) | Change charge length 8–56 m |
| **H** | Hold for the whole selection |
| **Space** | Pause / resume |
| **Escape** | Clear selection and cancel armed ability |
| **[ ]** | Cycle speed 0.5 ↔ 1 ↔ 2 ↔ 4 |
| Move / Hold buttons | Secondary; same as right-click / H |

Ability slots on the HUD: **C** and **Q** = basics in catalog order, **E** = signature, **X** = ultimate.

## Checklist

1. **Paused start** — Paused badge, timer **1:40**, agents still. Board fills most of the width; Setup is closed.
2. **Space / speed** — Resume; timer counts down. **[** / **]** and speed buttons only change steps per frame.
3. **HUD** — One card per attacker: HP, ult x/8, C/Q/E/X with charges / cooldown / disabled tooltip.
4. **Select** — Click Breach, or press **1**. Shift-click Brimstone. Drag-box both. Escape clears.
5. **Group move** — With both selected, right-click a point. Routes keep formation offsets (not one shared destination). Resume; smooth walk. Shift+right-click adds a waypoint.
6. **Hotkey cast** — Select Breach, press **Q**, aim preview follows cursor, left-click confirms Flashpoint. Escape cancels arming.
7. **Fault Line** — Arm **E**, scroll wheel to change length (label next to cursor), confirm.
8. **Previews while armed** — Aftershock cylinder, Flashpoint corridor, Fault Line / Rolling Thunder rectangles, Incendiary bounce dots + landing radius, Stim radius, Sky Smoke / Orbital radius + cast-range ring. Faint existing routes always shown.
9. **Fog / replay** — Top bar fog toggle. **Download replay** / **Load replay** (opens Setup for JSON). Round-trip should match sim time.
10. **Setup drawer** — Draft, coverage, starting ult, Buy, full event log, scenario import/export.
11. **Round end** — Timeout or wipe → banner + **New round** → paused 1:40.

**Reporting a bug:** attach Replay JSON (scenario + seed + orderLog + simTimeMs), catalog / ruleset versions, and what you clicked.

Assumed drill option: **Starting ult points** is not a live Valorant economy rule.
