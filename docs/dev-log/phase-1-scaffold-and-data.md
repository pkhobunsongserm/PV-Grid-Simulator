# Phase 1 — Scaffold, Data, and README

> Documentation only — see the note at the top of [the index](README.md).

## Goal

Turn the empty repository into a real Next.js project with the three
reference data files in place, an empty folder skeleton ready for the real
code, and a `README.md` written *before* any application code, so every
later phase (and every future Claude Code session) has a single source of
truth to work from from day one.

## What I built

- **The Next.js project itself** — Next.js 14, App Router, TypeScript,
  Tailwind CSS, ESLint, via `create-next-app`.
- **`data/tou_tariff.json`, `data/household_load.json`, `data/solar_profile.json`**
  — the three files you supplied, written in verbatim.
- **An empty folder skeleton** — `lib/`, `lib/__tests__/`, `store/`, `hooks/`,
  `components/layout/`, `components/controls/`, `components/results/` — so
  the project structure documented in the plan existed before any file did.
- **`vitest.config.ts`** — configured to run tests in plain Node (no
  simulated browser), since the simulation engine has no UI code in it.
- **`README.md`** — rewritten from the default `create-next-app` boilerplate
  into the project's full reference document: every locked engineering
  decision from the planning phase, the tech stack rationale, the project
  structure, and the code documentation standard.

## Key decisions & reasoning

- **`README.md` was written in Phase 1, not deferred to the end.** The
  original plan had it as a Phase 7 (final polish) task. You asked for it to
  move to before Phase 1 specifically so it would exist as a reference from
  the very start of the repo, rather than only being assembled after
  everything was already built. Every phase since has opened by treating
  README.md as the fixed source of truth to build against.
- **The dispatch priority order, EV commute mechanics, reserve-vs-floor
  asymmetry, and every other "locked decision"** were decided during the
  planning conversation (see the plan file) and transcribed into README.md
  essentially unchanged — Phase 1 didn't invent new engineering decisions, it
  made the already-decided ones durable and repo-local instead of living only
  in a planning conversation.

## Problems encountered & how I fixed them

- **npm package names can't contain capital letters**, but the repository
  folder itself is `PV-grid-simulator` (capitalized, at your naming). Running
  `create-next-app` directly targeting `.` failed immediately with an npm
  naming-restriction error. Fixed by scaffolding into a temporary
  lowercase-named sibling folder (`pv-grid-simulator-tmp`), moving all its
  contents into `PV-grid-simulator/` afterward, and manually correcting the
  `"name"` field in `package.json` to `"pv-grid-simulator"` (the folder name
  and the npm package name don't have to match — only the package name has
  the character restriction).
- Removed the nested `.git` folder that `create-next-app` creates by default
  inside the temp folder before moving files over, since the target repo
  wasn't a git repository at the time and I didn't want to silently turn it
  into one without being asked.

## Verification

- `npm run build` — compiled successfully, including Next's own type-checking
  and linting pass, with only the default landing page in place.
- Manually confirmed the final folder listing matched the structure documented
  in the plan before moving on.

## What's next

Phase 2 fills in the actual simulation engine inside the `lib/` folder this
phase created — see
[phase-2-simulation-engine.md](phase-2-simulation-engine.md).
