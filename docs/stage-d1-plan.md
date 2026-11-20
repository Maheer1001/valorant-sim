# Stage D1 plan (part 1) -- synergy and counter-composition from catalog tags

Tag: **design**. Plan only. No `src/` or `tests/` change is made by this document.

Naming note: `docs/stage-d-plan.md` and PROJECT_STATUS.md already use "D1" to "D5" and "Stage (d1)" for pre-round engine sub-stages. This document is roadmap stage **D1 (Richer draft report)** from `docs/roadmap.md`. Its sub-stages are numbered **D1.1 to D1.4** so they cannot be confused with the pre-round D1 to D5.

## 1. Goal and non-goals

### Goal

Add two composition evaluators next to the existing coverage evaluator in `src/sim/composition/`:

- `synergy` (new `src/sim/composition/synergy.ts`): which design rules pairing two kinds of tool are fully present, or present with a missing piece, inside one team's draft.
- `counter-composition` (new `src/sim/composition/counter.ts`): for each tool kind the opposing draft brings, whether this draft has a tool kind that a design rule lists as an answer.

Both read only `CompositionProfile` (from `buildProfile`) and catalog data, use the existing `CompositionEvaluator<TReport>` signature, are pure, and return ordered output. Both report **suitability only**. They never output a score, a probability, a win rate or a predicted winner. This keeps the stance in README.md and PROJECT_STATUS.md ("A coverage report is not a match prediction").

The draft panel (`src/ui/draft/DraftPanel.tsx`) shows the new reports in the Setup drawer without adding document scroll at 1366x768.

### Non-goals

- Map fit (`map-suitability`). Waits for G1 (`MapRegion`, `regionsAt`). Stays in `PLANNED_EVALUATORS`.
- Supported plans (`supported-plans`, `SupportedPlanReport` already sketched in `coverage.ts`). Waits for O3. Stays in `PLANNED_EVALUATORS`.
- Any numeric weight, score, ranking between teams, or win claim.
- Any change to the live engine, fog, replay format, scenario format, combat or ability resolution.
- Granting tags from role labels or tactical assignments. Coverage ignores the role label today and these evaluators do the same.
- Counting placeholder or partial abilities. Excluded, like coverage.
- New agents. Sova (K4), KAY/O and Tejo kits (K5) are separate stages; they add tags to their own abilities when they land.

## 2. Current state (read for this plan)

| File | What it does today |
| --- | --- |
| `src/sim/types.ts` | `CapabilityKind = "smoke" \| "flash" \| "entry" \| "recon" \| "flank-watch" \| "area-denial"`. `TRACKED_CAPABILITIES` lists those six in that order. `ImplementationStatus = "complete" \| "partial" \| "placeholder"`. `Role`, `TacticalAssignment`. |
| `src/sim/agents/definition.ts` | `AbilityDefinition` has one `capability: CapabilityKind \| null` plus figures, `notModeled?`, `referenceStats?`. `AgentDefinition`, `Catalog`. |
| `src/sim/agents/catalog.ts` | `SHIPPED_CATALOG` (Brimstone, KAY/O, Jett, Cypher, Breach), `CATALOG_VERSION = "m2-stage1-brimstone-2026-11-17"`, `getAgent`. `listed(...)` builds placeholder abilities (KAY/O FLASH/DRIVE `flash`, Jett Cloudburst `smoke`, Jett Tailwind `entry`, Cypher Trapwire `flank-watch`, rest `null`). |
| `src/sim/agents/abilities/brimstone.ts`, `sky-smoke.ts`, `breach.ts` | The eight complete abilities. Capabilities: Stim Beacon `null`, Incendiary `area-denial`, Sky Smoke `smoke`, Orbital Strike `area-denial`, Aftershock `area-denial`, Flashpoint `flash`, Fault Line `null`, Rolling Thunder `null`. |
| `src/sim/effects/status.ts` | `STATUS_CONCUSS`, `STATUS_BLIND`, `STATUS_HASTE`, `STATUS_COMBAT_STIM`, applied by `breach-resolve.ts` and the Brimstone resolve code. |
| `src/sim/composition/profile.ts` | `buildProfile(team, catalog, mapId, rulesetId)` -> `CompositionProfile { rulesetId, mapId, side, members }`. `AbilityProfile` copies `implementation`, `capability`, duration, charges, deploy delay, radius. |
| `src/sim/composition/coverage.ts` | `CompositionEvaluator<TReport> = (profile, context: EvaluationContext) => TReport`, `EvaluationContext { mapId; opposingProfile }`. `IMPLEMENTED_EVALUATORS = ["coverage"]`, `PLANNED_EVALUATORS = ["map-suitability", "synergy", "counter-composition", "supported-plans"]`, `PlannedEvaluator`, `SupportedPlanReport`. `evaluateCoverage` keeps only `implementation === "complete"` with a non-null capability, sorts offers by kind then agent name, derives overlaps and gaps in `TRACKED_CAPABILITIES` order. `formatCoverage`. `COVERAGE_DOES_NOT_PREDICT_WINS` (kind assumed). |
| `src/sim/composition/team.ts` | `Team`, `addMember`, `removeMember`, `setAssignment`, `compositionViolation`. Not changed. |
| `src/rules/provenance.ts` | Code kinds `verified \| secondary \| assumed \| owner`. Design choices in code are `kind: "assumed"` with a "design" source string (for example `FLASH_LOOK_HALF_ANGLE_PROVENANCE`, `INCENDIARY_TICK_PROVENANCE` in `src/rules/ruleset.ts`). |
| `data/ability-primitives.json` | Per-ability primitive lists (design mapping, patch 13.10). Breach: Aftershock `damage.zoneOrHit, projectile.generic`; Flashpoint `projectile.flash, projectile.generic`; Fault Line `projectile.generic, status.concuss`; Rolling Thunder `movement.knockback, projectile.generic, status.concuss`. Brimstone rows listed in `docs/effect-primitives.md` section 1. Read by `tests/data/primitive-stages.test.ts`. |
| `src/ui/draft/DraftPanel.tsx` | Builds both profiles every render, calls `evaluateCoverage` for each side with the other as `opposingProfile`, renders `TeamColumn` with a `<section aria-label="<Title> coverage">` holding `<pre className="coverage">`. |
| `src/ui/App.tsx` | Renders `DraftPanel` inside `<aside id="setup-drawer">` (`.setup-drawer.open` is `min(360px, 28%)` wide with `overflow: auto` in `src/ui/styles.css`). |
| `tests/architecture.test.ts` | `expect(IMPLEMENTED_EVALUATORS).toEqual(["coverage"])` and `expect(PLANNED_EVALUATORS).toEqual([four names])`. Boundary scan: `src/sim` imports no React, UI, tactics, learning or persistence. |
| `tests/sim/composition.test.ts` | Fixture helpers `entryAbility`, `duelist`, `fixtureDuelists`, `teamOf`; asserts coverage overlaps, gaps, placeholder exclusion, mapId independence, and the exact list of complete ability ids. |
| `tests/ui/DraftPanel.test.tsx` | Renders `App`, opens Setup, checks catalog buttons, kit badges, and the `Attack coverage` region text. |

Default drill teams (PROJECT_STATUS.md): attack Breach + Brimstone, defense KAY/O + Jett. Defense has no complete ability today.

## 3. Design

### 3.1 Do we need new catalog tags? Yes, as effect tags, not new capability kinds

`CapabilityKind` is one coverage category per ability, and every kind in `TRACKED_CAPABILITIES` produces a gap line in every coverage report. Adding `"concuss"`, `"reveal"` or `"molly"` there would change the coverage output for every draft and break the PROJECT_STATUS rule that concuss, nearsight, slow and the rest stay separate from coverage kinds. It also cannot express Fault Line (concuss, capability `null`) or Rolling Thunder (concuss plus knockback) without losing the existing category.

Decision (design): keep `CapabilityKind` and `TRACKED_CAPABILITIES` unchanged. Add an optional list of **effect tags** to each ability. Effect tag values are a subset of the primitive ids in `data/ability-primitives.json`, so they reuse a vocabulary the repo already maintains and a data test can cross-check them.

```ts
// src/sim/types.ts (additions)
export type EffectTag =
  | "vision.smoke"
  | "vision.wallOrVolume"
  | "projectile.flash"
  | "status.concuss"
  | "damage.zoneOrHit"
  | "movement.knockback"
  | "status.haste"
  | "status.combatStim"
  | "info.reveal"      // reserved for K4 (Sova); no shipped ability carries it in D1
  | "status.suppress"; // reserved for K5 (KAY/O, Tejo); no shipped ability carries it in D1

export const EFFECT_TAGS: readonly EffectTag[] = [
  "vision.smoke",
  "vision.wallOrVolume",
  "projectile.flash",
  "status.concuss",
  "damage.zoneOrHit",
  "movement.knockback",
  "status.haste",
  "status.combatStim",
  "info.reveal",
  "status.suppress",
];
```

Travel primitives (`projectile.generic`, `projectile.bouncing`, `placement.mapTargeted`) are left out: they describe delivery, not what the tool does to a fight. The user's example words map as: "flash" -> `projectile.flash` (and the existing `flash` capability), "concuss" -> `status.concuss`, "reveal" -> `info.reveal` (reserved), "molly" -> `damage.zoneOrHit` together with the existing `area-denial` capability.

```ts
// src/sim/agents/definition.ts (addition to AbilityDefinition)
  /**
   * Effect tags used by draft reports. Subset of this ability's primitives in
   * data/ability-primitives.json, limited to effects this build executes.
   * Omitted means none. Placeholder abilities carry none.
   */
  effects?: readonly EffectTag[];
```

Tag assignment for the eight complete abilities (each value is in that ability's row in `data/ability-primitives.json`, and each is executed by the current resolve code):

| Ability | File | `capability` (unchanged) | `effects` (new) |
| --- | --- | --- | --- |
| Stim Beacon | `abilities/brimstone.ts` | null | `status.combatStim`, `status.haste` |
| Incendiary | `abilities/brimstone.ts` | area-denial | `damage.zoneOrHit` |
| Sky Smoke | `abilities/sky-smoke.ts` | smoke | `vision.smoke` |
| Orbital Strike | `abilities/brimstone.ts` | area-denial | `damage.zoneOrHit`, `vision.wallOrVolume` |
| Aftershock | `abilities/breach.ts` | area-denial | `damage.zoneOrHit` |
| Flashpoint | `abilities/breach.ts` | flash | `projectile.flash` |
| Fault Line | `abilities/breach.ts` | null | `status.concuss` |
| Rolling Thunder | `abilities/breach.ts` | null | `status.concuss`, `movement.knockback` |

The implementer confirms each row against the resolve code before tagging (Orbital Strike LOS block via a smoke volume is described in PROJECT_STATUS.md Stage 1 result; if the resolve code does not block sight, drop `vision.wallOrVolume`).

Placeholder abilities in `catalog.ts` (`listed(...)`) get no `effects`. The evaluators would ignore them anyway; leaving them empty avoids writing claims about unbuilt tools into the catalog.

```ts
// src/sim/composition/profile.ts (AbilityProfile addition)
  effects: readonly EffectTag[]; // ability.effects ?? []
```

### 3.2 Shared helpers (new `src/sim/composition/tags.ts`)

```ts
import type { CapabilityKind, EffectTag } from "../types.ts";
import type { CompositionProfile } from "./profile.ts";

export type TagRef =
  | { kind: "capability"; value: CapabilityKind }
  | { kind: "effect"; value: EffectTag };

export type AbilityRef = {
  instanceId: string;
  agentDefinitionId: string;
  agentName: string;
  abilityId: string;
  abilityName: string;
};

/** Complete abilities only. Placeholder and partial abilities never match. */
export function abilitiesWithTag(profile: CompositionProfile, ref: TagRef): AbilityRef[];

/** Codepoint comparison. No locale dependence. */
export function compareText(a: string, b: string): number;

/** Sort key: agentName, then abilityName, then instanceId, then abilityId. */
export function compareAbilityRef(a: AbilityRef, b: AbilityRef): number;

export function formatTagRef(ref: TagRef): string; // "capability entry" / "effect status.concuss"
```

`abilitiesWithTag` walks `profile.members` and `member.abilities`, keeps `implementation === "complete"`, matches `capability === ref.value` or `effects.includes(ref.value)`, and returns the refs sorted with `compareAbilityRef`. Role and assignment are never read.

### 3.3 Design rules

Rules are frozen data arrays. Every rule carries the same provenance object:

```ts
export const DESIGN_RULE_PROVENANCE: Provenance = {
  kind: "assumed",
  source: "stage-d1 design rule",
  note: "A modelling choice about which tools work together or answer each other in this simulator. Not a measured win rate. Reports describe suitability and never predict a winner.",
};
```

#### Synergy (`src/sim/composition/synergy.ts`)

```ts
export type SynergyRule = {
  id: string;
  label: string;
  kind: "pairing" | "tension";
  requires: readonly TagRef[]; // two or more; each matched by a different ability
  rationale: string;
  provenance: Provenance;      // DESIGN_RULE_PROVENANCE
};

export type SynergyFinding = {
  ruleId: string;
  label: string;
  kind: "pairing" | "tension";
  status: "present" | "partial";
  matched: { ref: TagRef; abilities: AbilityRef[] }[]; // in rule order, refs with at least one match
  missing: TagRef[];                                   // in rule order
};

export type SynergyReport = { kind: "synergy"; findings: SynergyFinding[] };

export const SYNERGY_RULES: readonly SynergyRule[];
export const evaluateSynergy: CompositionEvaluator<SynergyReport>;
export function formatSynergy(report: SynergyReport): string;
export const SYNERGY_DOES_NOT_PREDICT_WINS: Provenance;
```

Initial rule set (all design; the owner may edit the list, see Open question 1):

| id | kind | requires | rationale (tied to existing sim mechanics) |
| --- | --- | --- | --- |
| `flash-then-entry` | pairing | effect `projectile.flash`, capability `entry` | Blind applies to agents looking at the flash (`flashLookHalfAngleDeg`, assumed); an entering ally follows it. |
| `concuss-in-denial` | pairing | effect `status.concuss`, capability `area-denial` | Concuss multiplies walk speed (`concussWalkSpeedMultiplierBp`, assumed), so a concussed agent stays longer in a denied area. |
| `stim-for-entry` | pairing | effect `status.haste`, capability `entry` | Haste raises movement for allies in the beacon, which helps the agent taking space. |
| `smoke-blocks-own-flash` | tension | effect `vision.smoke`, effect `projectile.flash` | A live smoke blocks the look a flash needs (PROJECT_STATUS.md). Both on one team means sequencing matters. |

Status rules: `present` when every ref has at least one matching ability and a distinct ability can be chosen per ref; `partial` when at least one ref matches but not all; no finding when nothing matches. "Distinct ability" is checked by a deterministic greedy pass in rule order over the sorted refs (one ability cannot fill two refs; two abilities of one agent can). Findings keep `SYNERGY_RULES` order. `context` is ignored except as the signature requires: synergy is a single-team evaluator.

#### Counter-composition (`src/sim/composition/counter.ts`)

```ts
export type CounterRule = {
  id: string;
  label: string;
  threat: TagRef;              // looked up in context.opposingProfile
  answers: readonly TagRef[];  // looked up in profile; any one answers
  rationale: string;
  provenance: Provenance;      // DESIGN_RULE_PROVENANCE
};

export type CounterFinding = {
  ruleId: string;
  label: string;
  status: "answered" | "unanswered";
  threatAbilities: AbilityRef[]; // opposing, sorted
  answerAbilities: AbilityRef[]; // own, sorted, empty when unanswered
};

export type CounterReport = {
  kind: "counter-composition";
  opposing: "present" | "absent"; // absent when context.opposingProfile is null
  findings: CounterFinding[];
};

export const COUNTER_RULES: readonly CounterRule[];
export const evaluateCounterComposition: CompositionEvaluator<CounterReport>;
export function formatCounter(report: CounterReport): string;
export const COUNTER_DOES_NOT_PREDICT_WINS: Provenance;
```

Initial rule set (design):

| id | threat (opposing) | answers (own) | rationale |
| --- | --- | --- | --- |
| `smoke-vs-flash` | effect `projectile.flash` | effect `vision.smoke` | A live smoke blocks the look the opposing flash needs. |
| `concuss-vs-entry` | capability `entry` | effect `status.concuss` | Concuss slows walk speed and lowers hit chance (`concussHitChancePenaltyBp`, assumed) for the entering agent. |
| `denial-vs-entry` | capability `entry` | capability `area-denial` | A damage zone on the entry path costs the entering agent time or hp. |

A finding exists only when the opposing profile has at least one complete ability matching `threat`. Findings keep `COUNTER_RULES` order. The report is directional: the panel runs it once per side, so "what Attack brings that Defense cannot answer" is the Defense report.

### 3.4 Evaluator registry

```ts
// src/sim/composition/coverage.ts after D1.2
export const IMPLEMENTED_EVALUATORS = ["coverage", "synergy"] as const;
export const PLANNED_EVALUATORS = ["map-suitability", "counter-composition", "supported-plans"] as const;

// after D1.3
export const IMPLEMENTED_EVALUATORS = ["coverage", "synergy", "counter-composition"] as const;
export const PLANNED_EVALUATORS = ["map-suitability", "supported-plans"] as const;
```

`PlannedEvaluator` stays derived from `PLANNED_EVALUATORS`. The comment "Milestone 1 ships coverage only" on `CompositionEvaluator` is updated to name the implemented list. The arrays stay in `coverage.ts` so `tests/architecture.test.ts` keeps its import path.

`tests/architecture.test.ts` changes in two steps, exactly:

- D1.2: `expect(IMPLEMENTED_EVALUATORS).toEqual(["coverage", "synergy"]);` and `expect(PLANNED_EVALUATORS).toEqual(["map-suitability", "counter-composition", "supported-plans"]);`
- D1.3: `expect(IMPLEMENTED_EVALUATORS).toEqual(["coverage", "synergy", "counter-composition"]);` and `expect(PLANNED_EVALUATORS).toEqual(["map-suitability", "supported-plans"]);`
- Both steps add: the union of the two arrays, sorted, equals `["counter-composition", "coverage", "map-suitability", "supported-plans", "synergy"]`, and the two arrays share no name.

### 3.5 Wording rules for reports

- Format functions print rule labels, ability names and the tag `(design)`. They print no numbers: no match counts, no percentages, no scores.
- The UI shows one fixed line under the report: "Design rules. Suitability only. Not a match prediction."
- Words "win", "chance", "favoured", "probability" and "%" never appear in `formatSynergy` or `formatCounter` output (tested).

## 4. Determinism and fog implications

- `evaluateSynergy` and `evaluateCounterComposition` are pure functions of `(profile, context)`. No RNG stream, no clock, no `World`, no `LiveRound`. They never mutate inputs.
- Output order is fixed: findings in rule-array order, refs in rule order, abilities sorted by `compareAbilityRef` (codepoint, not `localeCompare`, so the order does not depend on the host locale). Identical profiles give deep-equal reports. A different `context.mapId` gives the same report (tested, matching the coverage test).
- Reports are not stored in scenario JSON, replay files or the order log. Live-round determinism and replay are untouched.
- Adding `effects` changes no simulated field. Recommendation: do not bump `CATALOG_VERSION` (Open question 2), because scenario import rejects a mismatched version and no simulated value changes.
- Fog: the evaluators read profiles, never fogged or truth world state. The counter report reads the full opposing draft. PROJECT_STATUS.md records (secondary) that the other team's locks stay hidden until the first buy phase in the live game. In this sandbox the user authors both drafts, so showing the counter report leaks nothing. When O2 supplies a hidden opponent draft, the caller passes `opposingProfile: null` until the draft is revealed and the report shows `opposing: "absent"`.
- `src/sim/composition/*` keeps importing nothing from `src/tactics`, `src/ui` or React (existing boundary test).

## 5. Provenance and unknowns

This stage adds **no numeric game value and no new numeric constant**.

| Value | Tag | Named constant (if assumed) | How to confirm |
| --- | --- | --- | --- |
| Effect tag vocabulary (`EFFECT_TAGS`) | design (primitive ids from `data/ability-primitives.json`) | n/a | `tests/data/catalog-effects.test.ts` asserts each tag is a key of `primitives` in that file. |
| Per-ability effect assignments (section 3.1 table) | design | n/a | Data test: each tag is in that ability's primitive row; implementer reads the resolve code. |
| Each synergy rule | design; code provenance `kind: "assumed"`, source "stage-d1 design rule" | `DESIGN_RULE_PROVENANCE` | Owner review of `SYNERGY_RULES`. |
| Each counter rule | design; same provenance | `DESIGN_RULE_PROVENANCE` | Owner review of `COUNTER_RULES`. |
| "Reports do not predict wins" | assumed (same pattern as `COVERAGE_DOES_NOT_PREDICT_WINS`) | `SYNERGY_DOES_NOT_PREDICT_WINS`, `COUNTER_DOES_NOT_PREDICT_WINS` | Wording test in section 6. |
| `concussWalkSpeedMultiplierBp` 7000, `concussHitChancePenaltyBp` 2000, `flashLookHalfAngleDeg` 90 | assumed (existing, unchanged; cited in rationale text only) | existing names in `src/rules/ruleset.ts` | Not changed by D1. Rationale strings name the constant, not the number. |
| Smoke blocks the look a flash needs | existing rule in PROJECT_STATUS.md; patch 13.05 note is verified only for blocking ending when the smoke ends | n/a | Not re-tagged. |
| Other team's locks hidden until first buy phase | secondary (existing ruleset note) | n/a | Only affects when O2 passes an opposing profile. |

## 6. Staged delivery

Every sub-stage ends with `npm run check` green (lint, typecheck, tests, build) and a browser check at 1366x768 on the dev server.

### D1.1 Effect tags in the catalog

- Add `EffectTag`, `EFFECT_TAGS` to `src/sim/types.ts`; `effects?` to `AbilityDefinition`; `effects` to `AbilityProfile` (`ability.effects ?? []`).
- Tag the eight complete abilities per the section 3.1 table in `brimstone.ts`, `sky-smoke.ts`, `breach.ts`. Placeholders untouched.
- Acceptance:
  - New `tests/data/catalog-effects.test.ts`: every `EFFECT_TAGS` entry is a key in `data/ability-primitives.json` `primitives`; for every `SHIPPED_CATALOG` ability with `effects`, each tag is in the primitive row whose agent and ability name match (case-insensitive, so `FLASH/DRIVE` matches `FLASH/drive`); every placeholder ability has no `effects`; the exact per-ability table of section 3.1.
  - `tests/sim/composition.test.ts` unchanged and still green: coverage output does not change.
  - `tests/sim/scenario-file.test.ts` still green (no `CATALOG_VERSION` change, per Open question 2).
  - Browser: Setup drawer coverage text identical to before for the default drill.

### D1.2 Synergy evaluator

- New `src/sim/composition/tags.ts`, new `src/sim/composition/synergy.ts`. Update the arrays and comment in `coverage.ts` (section 3.4).
- Acceptance:
  - `tests/architecture.test.ts` updated to the D1.2 arrays plus the union and disjoint assertions.
  - New `tests/sim/synergy.test.ts` (reuses the `teamOf` and fixture pattern from `tests/sim/composition.test.ts`, copied locally to avoid editing that file):
    - Shipped Breach + Brimstone (attack): `concuss-in-denial` present (Fault Line or Rolling Thunder with Incendiary, Orbital Strike or Aftershock); `smoke-blocks-own-flash` present (Sky Smoke, Flashpoint); `flash-then-entry` partial with `missing` = capability `entry`; `stim-for-entry` partial with `missing` = capability `entry`.
    - Shipped KAY/O + Jett: no findings (every ability is a placeholder), even though FLASH/DRIVE has capability `flash` and Tailwind has `entry`.
    - Fixture with a placeholder ability carrying `effects`: never matches.
    - Distinct-ability rule: a fixture ability with both `projectile.flash` and capability `entry` alone gives `partial`, not `present`.
    - Same report for two `context.mapId` values and for `opposingProfile` null vs non-null; deep-equal on repeat call; input profile not mutated (frozen fixture).
    - Findings order equals `SYNERGY_RULES` order; abilities sorted by `compareAbilityRef`.
    - `formatSynergy` output contains no match of `/win|chance|favou?red|probability|%/i` and every rule line ends with `(design)`.
    - Every rule's `provenance` is `DESIGN_RULE_PROVENANCE`.
  - Browser: drawer unchanged (no UI yet).

### D1.3 Counter-composition evaluator

- New `src/sim/composition/counter.ts`. Update arrays in `coverage.ts` to the D1.3 values.
- Acceptance:
  - `tests/architecture.test.ts` updated to the D1.3 arrays.
  - New `tests/sim/counter.test.ts`:
    - Defense KAY/O + Jett against attack Breach + Brimstone: one finding `smoke-vs-flash`, `unanswered`, `threatAbilities` = Breach Flashpoint.
    - Attack Breach + Brimstone against defense KAY/O + Jett: no findings (no complete opposing ability).
    - Defense with Brimstone against attack Breach: `smoke-vs-flash` `answered` with Sky Smoke.
    - Fixture complete `entry` duelist on the opposing side, own Breach: `concuss-vs-entry` answered (Fault Line, Rolling Thunder) and `denial-vs-entry` answered (Aftershock).
    - `opposingProfile: null` -> `{ kind: "counter-composition", opposing: "absent", findings: [] }`.
    - Placeholder opposing threats are ignored; mapId independence; deep-equal repeat; order equals `COUNTER_RULES`.
    - `formatCounter` wording check as in D1.2.
  - Browser: drawer unchanged.

### D1.4 Draft report UI

- `DraftPanel.tsx`: call `evaluateSynergy` and `evaluateCounterComposition` next to `evaluateCoverage` for each side. Add one report-view toggle (section 7). `TeamColumn` gets the formatted text for the active view.
- Acceptance:
  - `tests/ui/DraftPanel.test.tsx` keeps the existing coverage assertions (Coverage is the default view) and adds:
    - Buttons `Coverage`, `Synergy`, `Counters` in a group labelled `Draft report view`; Coverage has `aria-pressed="true"` on open.
    - After clicking `Synergy`, region `Attack synergy` contains `concuss-in-denial` and `Fault Line`; region `Defense synergy` contains `No design pairing found`.
    - After clicking `Counters`, region `Defense counters` contains `smoke-vs-flash` and `Flashpoint` and `unanswered`; removing Brimstone and adding him to Defense changes it to `answered`.
    - The disclaimer `Design rules. Suitability only. Not a match prediction.` is visible in Synergy and Counters views.
  - Browser at 1366x768: open Setup with the default drill, fill both teams to five members with shipped agents where uniqueness allows, switch through the three views; `document.documentElement.scrollHeight <= window.innerHeight` in every view (only the drawer scrolls internally, as today); the board stays visible.
  - `docs/status/d1.md` gives the integrator the PROJECT_STATUS.md and README.md text: "Coverage is the only composition evaluator" replaced by the implemented list, with the suitability-only sentence kept.

## 7. UI impact

- Layout: the per-team `<section aria-label="<Title> coverage">` becomes a report section whose content follows one shared toggle placed above the two team columns: `Coverage | Synergy | Counters` (buttons with `aria-pressed`, styled with the existing `.catalog, .team-actions` flex rule). Section labels become `<Title> coverage`, `<Title> synergy`, `<Title> counters` depending on the view. Text stays in `<pre className="coverage">`.
- Clicks: switching view is 1 click and applies to both teams. Drafting is unchanged (select agent, Add: 2 clicks); every report updates on the same render with no extra click.
- Previews: none on the board. The report is text only.
- Empty states: Synergy "No design pairing found."; Counters with no applicable rule "No opposing tool matches a counter rule."; with `opposing: "absent"` "Opposing draft not shown."
- One-screen rule: showing one view at a time keeps the drawer content about the height of the current coverage block plus the toggle row and the disclaimer line. The drawer already scrolls internally (`overflow: auto`); the document must not scroll at 1366x768. No board, top bar or HUD change.

## 8. Files touched

> Build protocol (consistency pass): this stage is built under [`parallel-build-plan.md`](parallel-build-plan.md). Edits listed here to `src/ui/App.tsx`, `src/ui/styles.css`, `rejectionMessages.ts`, `describe.ts` and the shared docs are integration-file edits: the stage's UI lives in its own component files (with their own CSS), and the App mount lines, message entries and doc text are applied at merge. After H0, engine edits go into the split modules and this stage's reserved slots.

| File | new / modify | Sub-stage | Change |
| --- | --- | --- | --- |
| `src/sim/types.ts` | modify | D1.1 | `EffectTag`, `EFFECT_TAGS` |
| `src/sim/agents/definition.ts` | modify | D1.1 | `effects?` on `AbilityDefinition` |
| `src/sim/agents/abilities/brimstone.ts` | modify | D1.1 | `effects` on Stim Beacon, Incendiary, Orbital Strike |
| `src/sim/agents/abilities/sky-smoke.ts` | modify | D1.1 | `effects` on Sky Smoke |
| `src/sim/agents/abilities/breach.ts` | modify | D1.1 | `effects` on the four Breach abilities |
| `src/sim/composition/profile.ts` | modify | D1.1 | `effects` on `AbilityProfile` |
| `tests/data/catalog-effects.test.ts` | new | D1.1 | tag vocabulary and assignment checks |
| `src/sim/composition/tags.ts` | new | D1.2 | `TagRef`, `AbilityRef`, `abilitiesWithTag`, `compareText`, `compareAbilityRef`, `formatTagRef` |
| `src/sim/composition/synergy.ts` | new | D1.2 | rules, evaluator, formatter, `SYNERGY_DOES_NOT_PREDICT_WINS` (`DESIGN_RULE_PROVENANCE` goes in `tags.ts` so counter does not import synergy) |
| `src/sim/composition/coverage.ts` | modify | D1.2, D1.3 | `IMPLEMENTED_EVALUATORS`, `PLANNED_EVALUATORS`, comment |
| `tests/architecture.test.ts` | modify | D1.2, D1.3 | evaluator arrays, union and disjoint checks |
| `tests/sim/synergy.test.ts` | new | D1.2 | section 6 D1.2 assertions |
| `src/sim/composition/counter.ts` | new | D1.3 | rules, evaluator, formatter, provenance constant |
| `tests/sim/counter.test.ts` | new | D1.3 | section 6 D1.3 assertions |
| `src/ui/draft/DraftPanel.tsx` | modify | D1.4 | evaluator calls, view toggle, report sections, disclaimer |
| `src/ui/styles.css` | modify | D1.4 | add the toggle class to the existing flex rule; disclaimer text style |
| `tests/ui/DraftPanel.test.tsx` | modify | D1.4 | view toggle and report text assertions |
| `docs/status/d1.md` | new | D1 close | Stage result, playtest steps and the exact text for PROJECT_STATUS.md / README.md / docs/playtest.md / docs/roadmap.md. The integrator applies that text at merge (docs/parallel-build-plan.md); this stage's branch never edits those shared docs. |

Not touched: `src/sim/agents/catalog.ts` (placeholders stay untagged; `CATALOG_VERSION` unchanged), `src/sim/composition/team.ts`, `tests/sim/composition.test.ts`, `src/ui/App.tsx`, every live-round, fog, map and tactics file.

## 9. Dependencies

- Must land first: the live engine (done). Nothing else; this part "can start now" per `docs/roadmap.md`.
- Ownership contract names consumed: none required. D1 does not use G1 `MapRegion` / `regionsAt` (map fit is out of scope) or O3 plans.
- Names D1 defines that later stages consume: `EffectTag`, `EFFECT_TAGS`, `AbilityDefinition.effects`, `AbilityProfile.effects`, `TagRef`, `AbilityRef`, `SYNERGY_RULES`, `COUNTER_RULES`, `DESIGN_RULE_PROVENANCE`, `evaluateSynergy`, `evaluateCounterComposition`.
  - K4 tags Sova abilities with `info.reveal` and may add rules; K5 tags with `status.suppress`. Both edit `EFFECT_TAGS` only if they need a tag D1 did not reserve.
  - D1 later parts (map fit after G1, supported plans after O3) move their names from `PLANNED_EVALUATORS` to `IMPLEMENTED_EVALUATORS` and edit `tests/architecture.test.ts` again.
- Parallel scheduling: D1.1 edits `src/sim/types.ts` and the Breach / Brimstone ability files, which kit stages (K4, K5) and G3 may also edit. Land D1.1 as a short standalone change.

## 10. Risks

1. Readers take a design rule as a win claim. Mitigation: no numbers in reports, fixed disclaimer, wording test, `(design)` on every line.
2. The rule set is opinionated and small. Mitigation: rules are data with ids; owner review before D1.2 merges (Open question 1).
3. Effect tags drift from what the resolve code really does when a kit changes. The data test only checks against `data/ability-primitives.json`. Mitigation: kit stage checklists add "update `effects`" next to "update capability".
4. Drawer height grows past one screen with five-member teams. Mitigation: one view at a time; browser check measures document scroll.
5. Merge conflicts on `src/sim/types.ts`, `coverage.ts` and `tests/architecture.test.ts` with other stages. Mitigation: small, early D1.1; array edits are one line each.
6. Showing the full opposing draft conflicts with hidden locks once a real opponent exists. Mitigation: `opposing: "absent"` path; O2 passes null until reveal.

## 11. Open questions

1. Which synergy and counter rules ship? Recommended: the four synergy and three counter rules in section 3.3, reviewed by the owner; more rules arrive with K4/K5 kits.
2. Bump `CATALOG_VERSION` for the new `effects` field? Recommended: no. No simulated value changes and scenario import rejects a version mismatch. Document that `CATALOG_VERSION` tracks simulated content.
3. Can two abilities of one agent satisfy a pairing (Breach alone has Fault Line and Aftershock)? Recommended: yes, distinct abilities are enough; the report lists the abilities so the reader sees it is one agent.
4. Show partial synergies? Recommended: yes, with the missing tag named. It is the most useful draft hint and contains no prediction.
5. Should tactical assignments (entry, anchor, flank-watch) count as tags? Recommended: no. Abilities only, like coverage ignores role labels; assignments may feed O3 plans later.
6. Should placeholder abilities appear greyed in the report ("would match once built")? Recommended: no in D1. Excluded like coverage; the kit view already shows the placeholder badge.
