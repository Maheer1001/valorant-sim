# Manual playtest — live round (fast controls)

Default load: attack = Breach + Brimstone, defense = KAY/O + Jett holding deep behind the divider (out of LOS). Attack fog is on. The round **starts paused** at **1:40**. Setup drawer is **closed**. Starting ult points = 0 (drill option, assumed). At **1366x768** the page should fit without document scroll; the board letterboxes inside the remaining height.

## Controls

| Input | Action |
| --- | --- |
| Click agent / keys **1-5** | Select attacker |
| Shift-click / drag-box | Multi-select |
| **Right-click** ground | Formation move (replace route) for selection |
| **Shift+right-click** | Append a waypoint to each selected route |
| **C / Q / E / X** | Arm ability slot on primary selected agent, then left-click to confirm |
| Mouse wheel (Fault Line armed) | Change charge length 8-56 m (works while hovering the board) |
| **H** | Hold for the whole selection |
| **Space** | Pause / resume |
| **Escape** | Clear selection and cancel armed ability |
| **[ ]** | Cycle speed 0.5 / 1 / 2 / 4 |
| Move / Hold buttons | Secondary; same as right-click / H |

Ability slots on the HUD: **C** and **Q** = basics in catalog order, **E** = signature, **X** = ultimate. HUD is one compact row (up to five cards).

## Checklist

1. **Fit** — At 1366x768, no page scrollbar. Thin header. Board fills leftover height (letterbox OK). HUD stays one row.
2. **Paused start** — Paused badge, timer **1:40**, agents still. Setup closed. No auto-fire for the first ~15 s at 1x (defenders out of LOS).
3. **Space / speed** — Resume; timer counts down. Speed only changes steps per frame.
4. **HUD** — Cards show HP, ult x/8, C/Q/E/X with charges / cooldown / disabled tooltip.
5. **Select** — Click Breach, or press **1**. Shift-click Brimstone. Drag-box both. Escape clears.
6. **Group move** — With both selected, right-click. Formation offsets preserved. Agents already at the destination show **no** "ETA 0.0s" label. Shift+right-click appends a waypoint.
7. **Hotkey cast** — Select Breach, press **Q**, aim preview follows cursor, left-click confirms. Escape cancels.
8. **Fault Line wheel** — Arm **E**, hover the board, scroll wheel: toolbar length and preview rectangle change; clamps at 8 m and 56 m.
9. **Other previews** — Aftershock cylinder, Flashpoint corridor, Rolling Thunder rectangle, Incendiary bounce dots + landing, Stim radius, Sky Smoke / Orbital radius + range ring. Faint existing routes always shown.
10. **Fog / replay** — Top bar fog toggle (both defenders hidden until truth). Download / Load replay.
11. **Setup drawer** — Draft, coverage, starting ult, Buy, full event log, scenario import/export.
12. **Round end** — Timeout or wipe -> banner + **New round** -> paused 1:40.

**Reporting a bug:** attach Replay JSON (scenario + seed + orderLog + simTimeMs), catalog / ruleset versions, and what you clicked.

Assumed drill option: **Starting ult points** is not a live Valorant economy rule.
