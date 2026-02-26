# Solo Grid Operator Mode (v1)

## Architecture

This v1 implementation introduces a map-first Operator mode with a modular monorepo-friendly structure:

- `packages/map-core`
  - MapLibre initialization.
  - PMTiles protocol binding.
  - Region pack definitions and loader stubs.
  - Custom grid overlay renderer for nodes/corridors.
- `packages/sim-core`
  - Tick-loop scenario engine.
  - Scripted event scheduler and auto-pause triggers.
  - Lightweight flow/frequency models.
- `packages/scenarios`
  - Scenario TypeScript schema.
  - UK tutorial scenario content.
- `src/pages/*`
  - `/operator` age band picker + scenarios.
  - `/operator/play/:scenarioId` main play page.
  - `/operator/debrief/:runId` debrief stub.

## Run locally

```bash
npm install
npm run dev
```

Then open:
- `http://localhost:5173/operator`

## PMTiles setup (self-hosted static assets)

PMTiles files are expected in:

- `public/tiles/uk.pmtiles` (required for UK)
- other stubs are prepared (e.g. `iberia.pmtiles`), but optional.

These tile archives are intentionally **not committed** to git (`.gitignore` excludes `public/tiles/*.pmtiles`).

### Generate a minimal UK PMTiles pack

One approach using Planetiler:

```bash
# 1) Download UK area extract in .osm.pbf format
# Example source: Geofabrik (outside this repo)

# 2) Build vector MBTiles using Planetiler profile
java -Xmx8g -jar planetiler.jar \
  --area=great-britain \
  --download=false \
  --osm-path=/path/to/great-britain-latest.osm.pbf \
  --output=/tmp/uk.mbtiles

# 3) Convert MBTiles to PMTiles
pmtiles convert /tmp/uk.mbtiles ./public/tiles/uk.pmtiles
```

Alternative: if you already have a UK-oriented PMTiles vector dataset with standard layers (`water`, `landcover`, `boundary`), place it directly at `public/tiles/uk.pmtiles`.

## Region pack system

`packages/map-core/src/regions.ts` provides:
- concrete UK pack (`id: uk`, bounds, center, zoom, tile path)
- stub pack(s) for expansion (Iberia shown)

To add more packs (Italy/Switzerland, Texas, etc):
1. Add a new entry with bounds/center/zoom/tile path.
2. Place corresponding PMTiles in `public/tiles/`.
3. Add scenarios that reference the new `regionId`.

## Scenario schema and engine

Scenario type includes:
- network (`nodes`, `corridors`)
- scripted events
- pause triggers + allowed actions
- objectives

Engine behavior:
- runs one-second ticks.
- applies scripted events on schedule.
- computes corridor loading via a heuristic DC-ish approximation.
- computes frequency via inertia + droop-like response from net imbalance.
- auto-pauses on configured pause triggers.

## UI behavior and age bands

- Map occupies ~70% viewport height.
- Bottom panel includes:
  - system state (frequency, RoCoF, load/gen, reserve)
  - strict timestamped event log text
  - decision panel when auto-paused
- Age bands are selected per session on `/operator` (no persistence).
- Band A content is included in v1; Bands B/C are scaffolded for future scenarios.
