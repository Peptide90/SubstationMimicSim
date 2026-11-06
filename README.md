# Substation Mimic Sim

This project was started by Jordan Taylor (@TheElectricBrit) as an educational resource for creating high voltage single line mimic diagrams for use in teaching and media production.

The live hub is **The Electric Brit's Grid Games** (Substation 2D Sim is one of several modes). See [docs/ROADMAP.md](docs/ROADMAP.md) for current priorities.

You can access the live version online here:

This repository holds **The Electric Brit's Grid Games** hub and its flagship mode,
**Substation 2D Sim** — a single-line mimic designer, power-system simulator and teaching
platform. Draw a substation, operate it, watch protection respond, and export the whole
thing as an animated diagram for video.

See **[docs/PLATFORM-PLAN.md](docs/PLATFORM-PLAN.md)** for where this is going, and
[docs/ROADMAP.md](docs/ROADMAP.md) for hub and multiplayer decisions.

## What it does today

**Drawing**
- Drag-and-drop symbol library, orthogonal busbar and conductor drafting, snapping
- Single-line and three-phase views of the same document
- Substation templates: single busbar, double busbar, breaker-and-a-half, mesh corner
- Automatic BP109 nomenclature inference, with manual labels preserved
- SVG and PNG export, print view

**Simulation**
- Topology extraction, islanding and energisation tracing
- Per-phase power flow, voltage and current values, thermal state
- Earthing, live/earth conflict detection, arc and interlock refusal on illegal operations
- Faults: phase-earth, phase-phase, three-phase, transient, high-impedance, hot joints
- Protection relays: functions, inputs, outputs, zones, breaker-fail and intertrip
- SCADA-style operational event log

**Teaching**
- Five learning tiers (Junior → Commissioning Engineer) that adapt vocabulary,
  visible systems, tooling and operational strictness
- Scenario runner with objectives, timed events, tiered hints, replay log and scoring
- Built-in lessons, challenges and sandbox templates

**Switching and safety**
- Switching instruction sheets worked strictly in order, with readback of checks and
  line-end colours, and out-of-sequence operations recorded
- Points of isolation (locked open, caution notice) and points of earthing (locked closed)
- Build exercises graded on what the learner constructed, not just how they operate it

**Authoring**
- In-app scenario editor with live validation, "try it" as a learner, and shareable
  lesson-pack files

**Animation**
- Step sequencer for switching operations with per-step timing
- Animated SVG export for use in videos

## Known gaps

Tracked in [docs/PLATFORM-PLAN.md](docs/PLATFORM-PLAN.md):

- The protection engine is far richer than the UI exposes (the relay input/output
  manager panels are currently disabled in the build)
- Animation has no camera or annotation keyframes
- Timed scenario events are not yet editable in the scenario editor

## How to Build

The Vite frontend lives in `web/`. From the repository root:

```bash
npm run build
```

Or from `web/` directly:

```bash
cd web
npm install
npm run build
```

The production bundle is written to `web/dist/`.

### Cloudflare Pages

The app must be built from a branch that includes the `web/` directory. On GitHub, **`master` has the full app**; **`main` does not include `web/`**, so a Pages project with root directory `web` will fail on `main` with:

`Error: Cannot find cwd: /opt/buildhome/repo/web`

**Recommended Pages settings (either approach):**

**Option A — build from `master` with root directory `web` (current layout):**

| Setting | Value |
| --- | --- |
| Production branch | `master` |
| Root directory | `web` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |

**Option B — build from repository root:**

| Setting | Value |
| --- | --- |
| Production branch | `master` |
| Root directory | *(leave empty)* |
| Build command | `npm run build` |
| Build output directory | `web/dist` |

`wrangler.toml` files are included at the repo root and in `web/` for Wrangler/Pages tooling.

## How to Run Locally (Multiplayer MVP)

From the `web/` directory (recommended so the server can reuse the same node_modules):

```bash
npm install
npm run dev:client
```

To start the multiplayer server in a separate terminal (this script will ensure the server dependencies are installed):

```bash
npm run dev:server
```

If you prefer running the server directly from the `server/` directory instead:

```bash
cd server
npm install
npm run dev
```

Or run both together:

```bash
npm install
npm run dev:mp
```

By default, the multiplayer server listens on `http://localhost:3001`. Set `VITE_MP_SERVER_URL` to point the client at a different endpoint if needed.
