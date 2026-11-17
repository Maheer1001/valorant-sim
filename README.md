# Valorant Tactical Simulation

A deterministic, seeded tactical simulator for 5v5 Valorant-style rounds. Draft two teams, run a scripted scenario, and step through it event by event on an SVG map. Line of sight, smokes, ability charges and shots are all resolved by an engine with no UI code in it.

> Fan project. Not affiliated with or endorsed by Riot Games. The map ("Drill Hall") and the weapon ("Rifle A") are original stand-ins, not game assets.

## What works (Milestone 1)

- **Draft:** pick agents for attack and defence, up to five per team, one copy of each agent per team. Inspect kits and see which abilities are implemented and which are placeholders.
- **Composition coverage:** each team gets a report of what its abilities cover (smokes, entry, flank watch) and where the gaps are.
- **Simulation:** an event queue ordered by `(timeMs, sequence, agentId)`, with integer milliseconds and millimetres. Walls block movement and sight. An active Sky Smoke blocks sight until the moment it expires.
- **Seeded randomness:** named RNG streams forked from the scenario seed. Each shot stores its hit chance and its draw separately, so the same seed always gives the same run.
- **Timeline:** play, pause and step through the engine log.
- **Scenarios:** export and import scenarios as versioned JSON.

Every rule and ability number is tagged with its source (patch notes, wiki, or assumed). The full list is in [`PROJECT_STATUS.md`](PROJECT_STATUS.md).

## Stack

React 19, TypeScript, Vite, SVG rendering. Vitest with Testing Library for tests, and ESLint with `typescript-eslint` for linting. There's no backend.

## Run it

Requires Node.js 20+ on your PATH.

```bash
npm install
npm run dev        # dev server
npm test           # Vitest
npm run lint
npm run typecheck
npm run build      # production build to dist/
```

## Layout

```text
src/
  sim/          engine: clock, rng, map geometry + line of sight, agents, abilities, combat, composition
  tactics/      decision contracts (filled in later milestones)
  learning/     learning-record contracts
  persistence/  scenario JSON (de)serialisation
  rules/        rulesets and source provenance
  ui/           React: board, draft panel, timeline
tests/          unit tests + an architecture test that keeps sim/ free of React imports
```

## Roadmap

Planned evaluators include map suitability, synergy, counter-composition and supported plans. See `PROJECT_STATUS.md` for what's done, what's assumed and what's next.
