# Manual playtest

Default load: attack = Breach + Brimstone, defense = KAY/O + Jett holding deep behind the divider (out of LOS). The app **boots into pre-round**. Bought ability charges start empty so you purchase on the HUD. Setup drawer is **closed**. Starting ult points = 0 (drill option, assumed). At **1366x768** the page should fit without document scroll; the board letterboxes inside the remaining height. No 0-100 s scrub bar (skipped to save vertical space).

---

## Pre-round

Top bar: **Pre-round**, buy timer **m:ss** labeled **(assumed)**, **Hold timer** toggle (default **on** = frozen), **Go**.

| Input | Action |
| --- | --- |
| Click agent / keys **1-5** | Select attacker (spawn only; no defenders on the board) |
| Shift-click / drag-box | Multi-select |
| **Right-click** ground | Set / replace route (formation offsets) |
| **Shift+right-click** | Append a waypoint; discs show index |
| **C / Q / E / X** then left-click | Queue a cast (default: at last waypoint, else at 0 s). Charges not spent yet |
| HUD **+price** / **-** | Buy / refund one charge (uses engine `buyCharge` / buy list) |
| Plan step row | Click to edit trigger (time 0-100 s or waypoint); **x** or Delete removes |
| **Hold** | Clear route for selection (drops invalid at-waypoint steps with a notice) |
| **Go** | Validate plan; on success enter live paused at **1:40**; on failure stay and show status |

### Pre-round checklist

1. **Boot** — Phase badge Pre-round. Buy timer 0:30 (assumed). Hold timer on. No defenders. Setup closed. No document scroll at 1366x768.
2. **Hold timer** — With hold on, wait; timer stays. Turn hold off; timer counts down. At 0 with hold off, auto-Go into paused live.
3. **Buy** — On Breach, + Flashpoint: credits drop, 1/2 shown. + again to 2/2; + disables with max reason. - refunds. "Weapons / armor (roadmap)" note present, no prices.
4. **Route + cast (<= 4)** — Select Breach (or already selected). Right-click a waypoint. Press **Q**. Left-click aim. Plan lists Flashpoint at waypoint 0. Status stays valid after buys.
5. **Edit / delete / shorten** — Click the step, set time 12.5 s, Save. Delete with **x**. Re-queue on a 2-point route; replace route with one point; notice names the dropped step.
6. **Go fail** — Queue a cast with 0 charges; Go; stay in pre-round; plain-language charges message.
7. **Go ok** — Buy Flashpoint, queue at-time 0, Go; live clock **1:40**, Paused. Space; cast fires.

---

## Live round (after Go)

Attack fog is on. Round **starts paused** at **1:40**.

### Controls

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

### Live checklist

1. **Fit** — At 1366x768, no page scrollbar. Thin header. Board fills leftover height (letterbox OK). HUD stays one row.
2. **Paused start** — After Go: Paused badge, timer **1:40**, agents still. Setup closed. No auto-fire for the first ~15 s at 1x (defenders out of LOS).
3. **Space / speed** — Resume; timer counts down. Speed only changes steps per frame.
4. **HUD** — Cards show HP, ult x/8, C/Q/E/X with charges / cooldown / disabled tooltip.
5. **Select** — Click Breach, or press **1**. Shift-click Brimstone. Drag-box both. Escape clears.
6. **Group move** — With both selected, right-click. Formation offsets preserved. Agents already at the destination show **no** "ETA 0.0s" label. Shift+right-click appends a waypoint.
7. **Hotkey cast** — Select Breach, press **Q**, aim preview follows cursor, left-click confirms. Escape cancels.
8. **Fault Line wheel** — Arm **E**, hover the board, scroll wheel: toolbar length and preview rectangle change; clamps at 8 m and 56 m.
9. **Other previews** — Aftershock cylinder, Flashpoint corridor, Rolling Thunder rectangle, Incendiary bounce dots + landing, Stim radius, Sky Smoke / Orbital radius + range ring. Faint existing routes always shown.
10. **Fog / replay** — Top bar fog toggle (both defenders hidden until truth). Download / Load replay. After a pre-round Go, download includes version 2, post-buy scenario, and `preRoundPlan`. Load goes straight to live (log only).
11. **Setup drawer** — Draft, coverage, starting ult, live Buy panel, full event log, scenario import/export.
12. **Round end** — Timeout or wipe -> banner + **New round** -> back to pre-round.

**Reporting a bug:** attach Replay JSON (scenario + seed + orderLog + simTimeMs + optional preRoundPlan), catalog / ruleset versions, and what you clicked.

Assumed: **buy timer 30 s** and **starting ult points** are not live Valorant economy rules. Hold timer is a lab control.
