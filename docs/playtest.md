# Manual playtest — live round (Breach + Brimstone)

Default load: attack = Breach + Brimstone, defense = KAY/O + Jett holding. Attack fog is on. The round **starts paused** at **1:40**. Starting ult points = 0 (drill option, assumed).

1. **Paused start** — Confirm the **Paused — press Space to start** badge and timer **1:40**. Agents should not move until you resume.
2. **Space / Resume** — Press **Space** or **Resume**. Timer should count down. Press Space again to pause; windups and moves freeze with sim time.
3. **Speed** — Click **0.5x / 1x / 2x / 4x** or use **[** / **]** . Faster speeds only change how many sim steps run per frame.
4. **Fog** — KAY/O may be visible through the doorway; Jett should be hidden. Toggle **Showing attack view** → **Showing truth** and confirm Jett appears, then switch back.
5. **Select + Move** — Click **Breach**. Click **Move**, then click a corridor point (or **right-click** the board). Order applies immediately. Resume and watch Breach walk smoothly (no jump-teleport between windows).
6. **Hold** — Select Breach, click **Hold**. He stops after the current segment.
7. **Aftershock** — **Cast Aftershock** → click ahead. Aim line while hovering. Resume; look for zone / damage lines in the live event log (newest first).
8. **Flashpoint** — **Cast Flashpoint** → click toward a defender. Expect flash / status badges when someone is hit.
9. **Fault Line** — **Cast Fault Line**, drag the **charge length** slider (8–56 m), click aim. Expect concuss badges and signature cooldown on the button.
10. **Rolling Thunder** — Set **Starting ult points** to **8**, re-select Breach. **Cast Rolling Thunder** should enable. Aim-click; expect ult spend in the log.
11. **Incendiary / Stim / Sky Smoke / Orbital** — Select Brimstone. Cast each with a board click (map target for Sky Smoke / Orbital — **9 m** Orbital preview). Stim shows a radius for your team only. Buy Stim after spending a charge; credits drop.
12. **Disabled casts** — Empty Aftershock or Stim; cast button disabled with a tooltip. Ult below 8 disables Rolling Thunder / Orbital.
13. **Event log** — After several casts, confirm human lines (flash, concuss, damage tick, zone start, ult spend, kill).
14. **Replay** — **Download replay**, copy the Replay JSON, optionally tweak nothing, **Load replay**. Round should restore paused at the same sim time with the same agent positions.
15. **Draft / scenario** — Change an agent in Draft; round rebuilds paused. **Export scenario** / **Import scenario** still round-trip teams.
16. **Round end** — Let the timer reach **0:00** (or eliminate a side). Banner shows who won. **New round** (or change starting ult) restores a paused 1:40.

**Reporting a bug:** attach the **Replay JSON** (scenario + seed + orderLog + simTimeMs), the ruleset / catalog version from the header, and what you clicked. Prefer a short clip description (agent, ability, expected vs seen).

Assumed drill option: **Starting ult points** is not a live Valorant economy rule.
