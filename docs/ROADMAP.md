# Grid Games roadmap

Hub product: **The Electric Brit's Grid Games** (`gridgame.electricbrit.co.uk`).
**Substation 2D Sim** (formerly Mimic Designer V2 / Substation Mimic) is one game among several, not the product title.

This document consolidates planning that previously lived only in architecture notes, a stale README checklist, and unmerged PR branches.

---

## Priority status

| Priority | Theme | Status |
|----------|--------|--------|
| P1 | Hub landing with large game tiles (tablet-friendly) | Shipped in V0.7 |
| P2 | Multiplayer revitalization + GM demonstrator | Deferred |
| P3 | Designer polish, operator mode decision, QA/CI | Backlog |

---

## P1 — Hub landing (done)

- Home screen brands as **The Electric Brit's Grid Games**.
- Modes are data-driven tiles in `web/src/app/games/catalogue.ts`.
- Playable tiles: Substation 2D Sim, Builder Challenges, Multiplayer Grid Game (MVP).
- Placeholder tiles: Utility Empire 2D, Grid Card Game.
- Format shown as small tags (Solo / Multiplayer / Physical), not baked into titles.
- Adding another game should be catalogue data (+ optional tile art), not a MainMenu rewrite.

---

## P2 — Multiplayer (deferred)

The multiplayer client is an early MVP (lobby, GM console, role placeholders). Role panels still show placeholder copy; global leaderboard submission is stubbed. Treat as **neglected MVP**, not production-ready.

### GM Demonstrator mode (not started)

**Goal:** Game master can run a guided walkthrough that shows players how to play (lobby, roles, scenario start, inject events).

**Dependencies before this is worth building:**

1. Replace operator / field / planner **placeholder panels** with real mimic/HMI (or absorb work from `codex/implement-role-differentiated-multiplayer-gameplay`).
2. Confirm hosting path (`codex/prepare-multiplayer-hosting-scripts-and-database` / Docker docs on that branch).
3. Then add a GM-only **Demonstrator** flow (scripted narration or step prompts over a live or local room).

Related deferred MP items from open branches:

- Docker / multiplayer hosting foundations
- Richer role-differentiated gameplay
- Optional Postgres telemetry / privacy draft and leaderboard

Do **not** implement demonstrator until the core MP experience is playable beyond placeholders.

---

## P3 — Broader backlog

Ordered by current ROI:

1. **Sync README planned-feature checkboxes** with what Substation 2D Sim and challenges already deliver; point readers here for forward work.
2. **Substation 2D Sim increments** (see [mimic-designer-v2-architecture.md](./mimic-designer-v2-architecture.md)): marquee/resize, connection snap/tees, richer symbols and inspector, route validation beyond the debug panel.
3. **Solo Grid Operator** (`codex/add-solo-grid-operator-mode-to-gridgame`, closed PR #14): decide merge as a hub tile, revive, or archive.
4. **Wire Utility Empire 2D / Grid Card Game** placeholders to real destinations when those projects are ready.
5. **MP revitalization spike** when ready — then P2 demonstrator.
6. **QA workflows** (open PR #8) if CI is needed before more surface area.

---

## Out of scope notes

- electricbrit-site already links to Grid Games as “Educational Games”; hub branding should stay aligned with that.
- Legacy React Flow solo editor remains hidden; not a hub tile.
