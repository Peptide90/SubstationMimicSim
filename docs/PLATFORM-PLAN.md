# Substation Sim — platform plan

Status: proposal, September 2026. Supersedes the forward-looking half of
[ROADMAP.md](./ROADMAP.md); that document remains the record of hub/multiplayer decisions.

Goal, restated: **one learning tool that teaches substation layouts, component purpose,
switching operations and protection across five ability tiers, and produces broadcast-quality
animated diagrams as a by-product of the same document.**

---

## 1. Where the project actually is

Better than the README suggests. The engine under `web/src/mimic-designer-v2/` is not a
drawing toy — it is a small, tested power-system simulator:

| Capability | Where | State |
|---|---|---|
| Document model (symbols, busbars, conductors, phases, labels) | `drawing/model.ts` (580 lines) | Solid, versioned, migrated |
| Topology extraction + islanding | `topology/` | Solid |
| Energisation, earthing, live/earth conflict, arc & interlock refusal | `topology/operation.ts` | Solid |
| Power flow, per-phase values, thermal state | `simulation/powerFlow.ts` | Solid |
| Relays: functions, inputs, outputs, zones, breaker-fail, intertrip | `simulation/protection.ts` | Solid, largely unexposed |
| Faults: phase-earth, phase-phase, transient, high-impedance, hot joints | `faults/faults.ts` | Solid |
| Scenario runner: objectives, events, hints, replay log, scoring | `scenarios/runner.ts` | Solid |
| Learning tiers (Junior → Commissioning Engineer) | `learning/` | Wired into the UI, thinly used |
| Animation sequencer + animated SVG/PNG export | `animation/`, `rendering/drawingExport.ts` | Working |
| BP109 nomenclature inference | `nomenclature/` | Working |

91 tests pass under `web/`. The domain foundations for the whole ambition are already built.

### The three real problems

**1. `MimicDesignerV2.tsx` is 2,890 lines.** It is the designer, the operator HMI, the protection
configurator, the scenario runner, the lesson player and the animation studio in one component,
with roughly 60 `useState` hooks. Every new teaching feature makes the next one harder. This —
not missing features — is what will stop the roadmap.

**2. Three generations of the app are in the tree; two are dead.** `App.tsx`'s React Flow editor
(`legacy-editor`) is unreachable from any button. `ChallengeApp.tsx` (1,541 lines) has **no
importer at all** — the "Builder Challenges" tile now routes to V2's scenario view. Together with
their supporting `core/`, `ui/`, `app/hooks/` trees that is roughly 4,000 lines of maintained-looking
dead code, plus the `reactflow` dependency.

**3. The engine is richer than the UI admits.** The protection model supports coordination,
blocking and lockout; the UI shows a relay list. The tier system defines five audiences; most
content targets one.

### What the dead code is still worth (the check you asked for)

`ChallengeApp` must **not** be deleted outright. It contains four things V2's scenario runner
cannot express, and all four are on the critical path for teaching switching:

- **Build objectives** — `buildBay`, `includeComponent`, `connectBetween`. V2 can only grade
  *operating* an existing drawing, never *constructing* one. "Build a line bay" is the single
  most valuable exercise type you have and it lives only here.
- **Switching instruction sheets** — `SwitchingInstructionsModal.tsx`, with verbs, sequence
  numbering and line-end colours (RED/BLUE/YELLOW/GREEN/BLACK). Authentic UK control practice,
  and exactly the artefact an apprentice must learn to write and execute.
- **Isolation tagging** — `tagIsolation`, caution/danger notices. Not modelled in V2 at all.
- **Scoring and resilience tests** — graded builds with pass/fail probes.

Port these into the V2 scenario model first (Phase 1), then delete. The legacy React Flow
editor has no such value and can go immediately.

---

## 2. One tool or several?

**One application, one engine, several workbenches.** Not a suite of separate tools.

The reason is the document. A single-line diagram, its topology, its switching state, its
protection settings and its animation timeline are all the same object. Split the tool and you
split that object — then you spend the rest of the project writing importers between your own
programs, and a lesson can no longer become a video without a round trip.

Three separate tools would also fail your actual use case. You do not draw a substation, then
teach it, then film it as three jobs. You draw it *while* explaining it and hit record.

So: **one document, one simulation core, and workbenches that change which affordances are on
screen.** A workbench is a filter over one shared state, not a separate app.

| Workbench | Question it answers | Primary user |
|---|---|---|
| **Draw** | What does this substation look like? | You, authoring |
| **Operate** | What happens when I switch it? | Learner |
| **Protect** | Why did it trip, and would it grade? | Engineer tier |
| **Study** | Am I doing this correctly? (lessons, challenges, marking) | Learner |
| **Studio** | How do I film this? | You, producing |

`learning/featureVisibility.ts` already proves the pattern works; it is applied too narrowly.
Workbenches are the same idea promoted to a first-class concept, with tier as a second axis:
**workbench decides which panels exist, tier decides how much of each panel is shown.**

The one genuine candidate for a separate program is the **multiplayer/classroom server** — a
different runtime with different concerns. Keep it separate (it already is), and have it drive
the same document format.

---

## 3. Plan

### Phase 0 — Clear the ground (~1 week)

Nothing else on this list is pleasant until this is done.

1. Delete the legacy React Flow editor: `App.tsx`'s `AppInner`, `core/`, `ui/` (React Flow nodes),
   `app/hooks/`, `app/util/`, `templates/`, `components/modals/`. Drop `reactflow`.
   `App.tsx` becomes a ~40-line router.
2. **Quarantine, do not delete, `app/challenges/`** until Phase 1 has ported the four items above.
3. Fix root `npm test` — it runs `node --test` against `.ts` files and reports 18 failures that
   are not real. Make it delegate to `web`'s vitest.
4. Add CI: typecheck, lint, test, build on push. (Open PR #8 may already cover this.)
5. Update the README checklist — most of it shipped; it currently undersells the project badly.

**Exit:** one editor in the tree, green CI, honest README.

### Phase 1 — Split the workbench and absorb the challenge content (~3-4 weeks)

The enabling refactor. Behaviour-preserving, and the highest-leverage work in this plan.

1. Lift document state out of `MimicDesignerV2.tsx` into a store (`zustand` is already a
   dependency) with typed actions. The component stops owning the document.
2. Extract panels into `workbenches/{draw,operate,protect,study,studio}/`, each a real module
   with its own panel set. Target: no file over ~400 lines.
3. Promote workbench to a first-class concept alongside tier — a `WorkbenchId × LearningTier`
   matrix resolving to visible panels, tools and vocabulary. Absorbs `featureVisibility.ts`.
4. **Extend the scenario model** to cover what `ChallengeApp` could do and V2 cannot: build
   objectives, switching instruction sheets, isolation tags, scoring, resilience probes.
   Port the six legacy tutorials/levels onto it, then delete `app/challenges/`.

**Exit:** adding a teaching feature means adding a file, not editing a 3,000-line one; the
Builder Challenges content is back and running on the modern engine.

### Phase 2 — Tiered protection (~4-6 weeks)

Your answer was explicit: tiered, from single trip and alarm up to full coordination — and
**where drawings are shown, they must be simplified to only what is modelled.** That last
constraint is the discipline that keeps this honest, and it drives the design below.

| Tier | What protection *is*, at this level | Screen |
|---|---|---|
| Junior | "A guard watches the wire and switches it off." | Trip animation + one plain sentence |
| Student | Relay saw too much current, told the breaker to open | Trip banner, cause, affected section |
| Apprentice | Pickup, time delay, alarm vs trip, what a lockout means | Relay card: setting, measured value, margin |
| Engineer | Time-current curves, discrimination, blocking, intertrip | Curve plot, grading margins, zone overlay |
| Commissioning | Scheme logic: inhibit, lockout, reclaim, backup timing | Simplified scheme diagram + injection/test mode |

Build order:

1. **Trip storytelling (all tiers).** The event log already records trips; give the same event a
   tier-appropriate rendering. Cheapest, biggest immediate teaching win, no engine work.
2. **Relay inspector.** One relay: function, input, setting, live measured value, margin to
   pickup, time to trip. Apprentice and up.
3. **Time-current curve view.** Plot IDMT curves for selected relays on shared axes with the
   fault current marked. Standard curves (IEC SI/VI/EI, DT) as data; the engine's timing must be
   driven by the *same* curve definitions the plot draws, or the picture lies.
4. **Coordination checking.** Grading margins between upstream/downstream pairs, flagged when
   they fail. Engineer tier.
5. **Scheme logic — the constrained part.** Add intertrip, blocking, inhibit, reclaim and lockout
   to the relay model where they are not already there, then render a **generated** scheme
   diagram whose every element is a modelled object. No decorative wiring, no drawn contact that
   does nothing. If it appears, it is simulated.

**Exit:** the same fault, viewed at five tiers, gives five true explanations at five depths.

### Phase 3 — Animation Studio (~3-4 weeks)

Your answer: export is fine, the win is **keyframes, annotations and camera movement**. So this
is an upgrade of the sequencer, not of the exporter.

1. **Timeline UI.** The sequencer becomes a proper track view: scrubbable, with steps as blocks
   you drag to retime. Groundwork exists in `animation/sequence.ts`.
2. **Camera keyframes.** Pan/zoom/scale as a keyframed track, interpolated with easing. Lets a
   sequence follow the action across a large substation instead of showing all of it small.
3. **Annotation track.** Callout arrows, highlight rings, text overlays, dimmed non-focus areas,
   each with in/out times on the timeline. This is what makes a clip teach rather than just move.
4. **Narration pacing.** Per-step dwell and hold so timing can be matched to a voiceover.
5. Extend `buildAnimatedSequenceExportSvg` to bake camera and annotation tracks into the export.

Deliberately deferred: in-browser video capture. OBS over a keyframed, annotated animation beats
a WebM encoder over a plain one, and it is a fraction of the work.

**Exit:** a switching sequence can be filmed with camera moves and callouts, straight from the
document that models it.

### Phase 4 — Content authoring (~4 weeks) — *your stated priority*

Content-first, tier-agnostic. The point of this phase is that **you stop needing a code change
to publish a lesson.**

1. **Scenario editor in-app.** Author objectives, teaching steps, events, hints and tier text
   through UI, not by editing `builtInScenarios.ts`. This is the keystone deliverable.
2. **Tier text authoring.** Write the five variants of an explanation side by side, so tier
   coverage is visible and gaps are obvious.
3. **Lesson packs.** Bundle drawing + scenario + animation + notes as one shareable file, with
   import/export. `scenarios/packageScenario.ts` is the seed.
4. **Content library.** Browse, search and filter packs by tier, topic and substation type.
5. **Symbol library expansion.** 12 symbol types today. Realistic teaching needs reactors,
   capacitor banks, tap changers, auto-reclosers, ring main units, generators, NER/NEC,
   station transformers, GIS-specific and switch-disconnector variants.

**Exit:** a lesson is a file you author and share, not a commit.

---

## 4. Sequencing

Phases 0 and 1 are prerequisites for everything and should not be reordered. After that, 2, 3
and 4 are genuinely independent — but given your content-first answer, **run Phase 4 before
Phase 2**, and treat Phase 3 as the pleasant interleave when you want to make something rather
than build something.

Suggested order: **0 → 1 → 4 → 2 → 3**, with Phase 3's timeline UI pulled forward if a video
deadline demands it.

## 5. Naming

The identity crisis is a symptom, not a cause. Once workbenches exist, the naming resolves
itself: the *platform* is the thing with a name, and Draw / Operate / Protect / Study / Studio
are modes within it, not products. Under Grid Games, "Substation 2D Sim" is a fine tile name
for the platform as a whole — and one more rename should wait until Phase 1 has settled what
the thing actually is.

## 6. Open questions

- **Realism ceiling.** Is this always a teaching abstraction, or do you eventually want real
  impedances and fault-level calculation? It changes how much `powerFlow.ts` must grow, and it
  is much cheaper to decide before Phase 2 than during it.
- **Assessment.** Does a learner's progress need to be recorded for an instructor to review —
  scores, attempts, a marking view? That is a server, and it should be scoped alongside the
  existing multiplayer work rather than bolted on later.
- **Classroom multiplayer.** Still deferred in ROADMAP.md. Phase 1's shared document store is
  what would make it tractable; worth revisiting once that lands.
