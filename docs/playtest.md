# Manual playtest — interactive round (Breach + Brimstone)

Default load: attack = Breach + Brimstone, defense = KAY/O + Jett holding. Attack fog is on. Starting ult points = 0 (drill option).

1. **Board / fog** — Confirm Breach and Brimstone markers on the left. KAY/O may be visible through the doorway; Jett should be hidden. Toggle **Showing attack view** → **Showing truth** and confirm Jett appears behind the wall, then switch back to attack fog.
2. **Select + Move** — Click **Breach**. Click **Move**, then click a point further into the corridor. Confirm a queued order and an aim/facing update after **Resolve window**.
3. **Hold** — Select Breach, click **Hold**, resolve. Event log should mention hold / resolve; Breach stays put.
4. **Aftershock** — Select Breach → **Cast Aftershock** → click ahead of him. Confirm aim line, then resolve. Look for zone start / damage tick lines if a defender sits in the cone.
5. **Flashpoint** — **Cast Flashpoint** → click toward a defender. Resolve. Expect flash / status badges (flashed) with seconds when someone is hit.
6. **Fault Line** — **Cast Fault Line**. Drag the **charge length** slider (label shows metres, 8–56). Click aim direction. Resolve. Expect concuss statuses / event lines; confirm signature cooldown appears on the Fault Line button.
7. **Rolling Thunder** — Set **Starting ult points** to **8**, re-select Breach. Confirm **Cast Rolling Thunder** enables. Aim-click and resolve. Expect ult spend in the log and ult points back to 0.
8. **Incendiary** — Select Brimstone → **Cast Incendiary** → click ahead. Resolve. Confirm incendiary circle overlay (shrinking radius) and damage-tick lines if someone stands in it.
9. **Stim Beacon** — **Cast Stim Beacon** → click near Brimstone. Resolve. Confirm a stim radius ring (attack team only) and haste / combat-stim badges. Spend the charge, then use **Buy Stim Beacon** in the agent panel; credits should drop and a charge return.
10. **Sky Smoke** — **Cast Sky Smoke** → click a map point within ~55 m. Confirm range ring + smoke preview circle, then resolve. Smoke discs should appear on the board.
11. **Orbital Strike** — Set ult points to **8**, select Brimstone → **Cast Orbital Strike** → click a map point. Confirm 60 m range ring + 10 m preview. Resolve. Expect ult spend, orbital circle / shrink overlays, and damage ticks if a defender stays inside.
12. **Disabled casts** — After emptying Aftershock (or Stim), confirm the cast button is disabled with a tooltip about charges. With ult at 0, Rolling Thunder / Orbital should explain “need 8”.
13. **Plan errors** — Queue nothing harmful; clear plan; try casting with 0 charges via UI (disabled). If you import a bad scenario, rejection text should be plain language, not raw codes alone.
14. **Draft / scenarios** — Open Draft, change an agent if desired, confirm the round rebuilds. Export JSON, refresh, import — agents and window should restore.
15. **Event log** — After several resolves, skim the log for human lines: flash, concuss, damage tick, zone start, ult spend, kill (if someone dies).

Assumed drill option: **Starting ult points** is not a live Valorant economy rule; it only primes ult for testing.
