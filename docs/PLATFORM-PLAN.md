# Substation Sim — platform plan

Status: revised November 2026. Replaces the September plan, whose delivered work is
summarised in section 1. [ROADMAP.md](./ROADMAP.md) remains the record of hub and
multiplayer decisions.

Goal: **one learning tool that teaches a substation the way it really works — the plant,
the secondary systems that protect and control it, and the control room that operates it —
at five ability tiers, and films any of it for video.**

---

## 1. Where it stands

### Delivered

- **Foundation.** Legacy editor removed (bundle 736 kB → 493 kB), CI, README.
- **Switching and safety.** Switching instruction sheets worked strictly in order with
  readback; points of isolation and earthing; build exercises graded on what was built.
- **Content.** Six Builder Challenges ported onto the engine, each played to success in tests.
- **Authoring.** In-app scenario editor with validation, "try it", and lesson-pack files.
- **Engine corrections** found by playing the content: faults made every earth arc;
  off-load disconnector operation was punished; saving dropped operation state.

### Why the workbenches do not feel different

The September plan proposed five workbenches. What was built is one screen with panel
toggles: switching workbench changes which side panels appear, but the canvas, the toolbar,
the look and what a click does are identical in all five. Protect resolves seven panels of
which five have nothing to render. Studio is one button.

There is also a category error. Draw, Operate and Protect are *subjects* — layers of the
substation. Study and Studio are *activities* — you can study or film any subject. Putting
all five side by side made them compete when they should compose.

And underneath both: there is no secondary system to show. Protect has nothing distinct to
be *about* until the engine models the circuits that sit between the relays and the plant.

---

## 2. The shape: three workspaces, two modes, five tiers

**Three workspaces, three views of the same substation:**

| Workspace | The substation… | The canvas shows | A click… | Look |
|---|---|---|---|---|
| **Design** | as built | The single-line diagram, editable | places, wires, labels | Light drawing sheet |
| **Protect** | as protected and controlled | Generated secondary sheets: protection, trip and close, interlocking, DC | inspects, isolates a link, opens an MCB, injects a test | Engineering drawing set |
| **Operate** | as it runs | Two views, switched freely: the **substation view** and the **control room view** | operates plant, applies faults; or issues controls and acknowledges alarms | Live single-line diagram; or dark control-room HMI. No editing tools in either |

Design edits the substation; Operate runs it. Operate has two views of the same running
substation, and the learner chooses which to look through:

- **Substation view** — the truth. Live energisation, power flow, faults and switching on the
  single-line diagram, as the tool does today. This is the view for demonstrating how power
  flows and what switching does to it, and it is the default for Junior and Student.
- **Control room view** — what is reported. A SCADA mimic driven by *indications*, with an
  alarm list and controls. **The control room never sees the plant, only what the secondary
  systems report about it**: indications come from auxiliary contacts, controls travel
  through close and trip circuits, and alarms are raised by the secondary systems.

While the secondary side is healthy the two views agree. When it is wrong — DC lost, an
auxiliary contact misreporting, a control switch left in Local — they disagree, and comparing
them is a lesson in itself: the control room shows a breaker closed, the substation view shows
it open, and Protect explains why. A scenario can lock Operate to one view, so a control-room
challenge cannot be solved by peeking at the truth.

**Two modes, available in any workspace:**

- **Learn** — lessons and challenges, and authoring them. Objectives can be about any
  workspace: build a bay in Design, find why a breaker failed to trip in Protect, restore
  supply from the control room view in Operate.
- **Studio** — sequencing, camera and annotation, and export. Any workspace can be filmed,
  including a trip circuit sheet as current flows through it.

**Five tiers** remain the depth control. They decide how much of each workspace a learner is
ready for; they never hide a workspace outright. Junior sees a protection sheet as three
boxes and an arrow; Commissioning sees every link, contact and test block.

---

## 3. The secondary model

### One model: circuits as rungs

Trip circuits, close circuits and interlocks are all the same thing in real life: contacts in
series and parallel between two supply rails, energising a coil. So the engine gets one
secondary model and one evaluator for all of them — a ladder.

- **Supplies:** batteries, chargers, DC distribution boards, MCBs with healthy and tripped
  states. A rung only carries current if its supply is live.
- **Contacts:** auxiliary contacts that follow primary plant (breaker 52a/52b,
  disconnector and earth switch positions), relay output contacts, control switch positions
  (Local/Remote, trip/close), lockout relay contacts, key interlocks, test links.
- **Coils and outputs:** trip and close coils that act on breakers, lockout relays,
  interlock permissives that allow or refuse an operation, alarms and indications.
- **Measurement:** CT cores and VT secondaries, each wired to the relay functions they feed,
  carrying the primary quantities the engine already computes.

Evaluating it is small and honest: a rung is continuous if every element in it conducts, and
a continuous rung energises its coil. A trip coil that energises opens its breaker. An
interlock rung that does not conduct refuses the operation, and the learner can see exactly
which contact held it.

This replaces today's hard-coded refusals. The physics stays — an earth closed onto live
plant still arcs — but *preventing* it becomes the interlocking scheme's job, which can be
seen, authored, defeated with a key, and can fail.

### Generated sheets

Secondary drawings are **generated from the model, never drawn by hand**, applying the rule
from decision 5.1: if it is on a sheet, it is simulated.

| Sheet | Layout | Shows |
|---|---|---|
| Protection block diagram | Layered, left to right | CT cores → relay functions → outputs → breakers and intertrips |
| Trip and close circuits | Ladder: two rails, one rung per path | Supply, MCB, control switch, relay contacts, interlocks, coil |
| Interlocking scheme | Ladder | The conditions each permissive requires, live |
| DC distribution | Tree | Battery and charger → boards → MCBs → circuits |

Ladders and layered block diagrams have well-known automatic layouts, which is what makes
generated sheets feasible rather than a drawing tool in disguise. Every element cross-references
its plant: selecting a breaker's trip coil highlights the breaker on the single-line diagram,
and the reverse.

Live state is drawn on the sheets: energised rungs, picked-up relays, open MCBs, defeated
interlocks. That is also what Studio films.

### What each tier does with it

| Tier | Protect workspace | Operate: control room view |
|---|---|---|
| Junior | Block diagram only: "the guard sees danger and tells the switch to open" | Indications and a big alarm light |
| Student | Block diagram with values; interlocks as plain rules | Alarm list with plain explanations |
| Apprentice | Interlocking and trip circuit sheets; open an MCB and see the consequence | Local/Remote, controls refused and why |
| Engineer | Settings, curves, grading, intertrips, breaker fail | Full alarm handling and priorities |
| Commissioning | Test links, secondary injection, trip circuit supervision | Indication faults, aux contact discrepancies |

The substation view is available at every tier and changes little between them, beyond the
existing tier controls on power-flow detail and terminology.

---

## 4. Roadmap

Each phase ships content as well as features: at least one lesson that uses what it adds,
written in the in-app editor (decision 5.2). Sizes are relative: S, M, L.

### Phase A — Three workspaces (M) — **done**

Make the differentiation real before adding depth, so that every later phase has a home.

1. Replace the five-way switcher with **Design / Protect / Operate**, and add **Learn** and
   **Studio** as mode toggles available in all three.
2. Each workspace owns its canvas behaviour, toolbar and look, not just its side panels.
   Design keeps today's editor. Operate loses the editing tools and gains its two views: the
   substation view is today's operate canvas with power-flow overlays, and the control room
   view is a dark HMI shell with a status bar, an alarm list, and controls issued by clicking
   plant. Until Phase F, the control room view shows plant state directly — correct while the
   secondary side is healthy, which until then it always is. Protect gets a sheet viewer.
3. Protect's first sheet is the **protection block diagram**, generated from the relay model
   that already exists (inputs, functions, outputs), with a relay inspector beside it.
4. A minimal alarm list in the control room view, fed by today's event log. It grows in every
   later phase.
5. A scenario setting to lock Operate to one view.

**Exit:** a stranger can tell which workspace they are in from a screenshot.

*Delivered:* `workspaces/` replaces the workbench switcher, with tests that every workspace
and view resolves to a different canvas. Design is the light editor; Protect shows the
generated block diagram as an engineering sheet with a title block, live relay and breaker
state, and plant cross-referencing; Operate's substation view is the live diagram, and its
control room view is a dark HMI with a status bar, an alarm list with acknowledgement, and
select-before-operate controls. Editing is confined to Design, and faults to the substation
view. Learn and Studio are toggles in all three.

*Corrections and findings:*
- The two switched-off panels the September review called "relay inputs and outputs" were in
  fact a duplicate of the Power Flow dialog (removed as dead code) and a zones and relays
  manager (now Protect's relay manager).
- Routine operations were classified by guessing from message text, so a breaker whose id
  contained "fault" raised an urgent alarm when opened. The switching engine now tags its
  own events.

### Phase B — The secondary model (L)

The foundation for everything after it, with no new teaching on its own.

1. Supplies, contacts, coils and CT/VT secondaries as part of the drawing document, migrated
   and versioned like the rest.
2. The rung evaluator: continuity, coil energisation, and coil actions on primary plant.
   Pure, deterministic and exhaustively tested, like the switching engine.
3. **Standard schemes generated for standard bays**, so an author never has to wire a
   secondary system by hand to get a working one. A feeder bay gets a default trip circuit,
   close circuit and interlocking from its plant.
4. The ladder sheet renderer, with live state and plant cross-referencing.

**Exit:** a feeder bay's trip and close circuits are generated, drawn and evaluated, and
operating the breaker from its close circuit behaves exactly as operating it directly does today.

### Phase C — Interlocking schemes (M)

First because switching is the original purpose of the tool, and every existing switching
lesson gets better.

1. Today's hard-coded disconnector and earth refusals become generated interlock rungs,
   visible on the interlocking sheet. The physical consequences (arcing) stay in the engine.
2. A refused operation says *which* condition held it, and links to the rung.
3. Key interlocks, and defeating an interlock with an override that is logged and graded.
4. Interlocking authored per scenario: a lesson can ship with a deliberately wrong scheme
   for the learner to find.

**Exit:** a lesson where the interlocking is wrong, and the learner finds out why on the sheet.

### Phase D — DC, trip and close circuits, and Local/Remote (M)

Gives the secondary side consequences.

1. Batteries, chargers, distribution and MCBs, with the DC distribution sheet.
2. Protection trips travel through the trip circuit: open its MCB and the breaker cannot
   trip, so breaker-fail or backup protection has to clear the fault.
3. Close circuits with Local/Remote control switches: a remote close from the control room view is refused
   while the bay is in Local, and says so.
4. Trip circuit supervision and DC failure alarms.

**Exit:** the lesson "the breaker failed to trip — find out why" works at Apprentice and above.

### Phase E — Protection in depth (L)

The tiered protection ladder from decision 5.1, now on a model that can carry it.

1. **Fault current.** Faults do not raise current in the engine today, so an overcurrent
   relay only ever sees load current and cannot trip on a fault (earth-fault and
   differential functions can). A deliberately simple fault-level model is needed — the
   first real pressure on decision 5.4, to be met openly rather than with a silent
   approximation.
2. CT cores and ratios wired to relay functions; VT secondaries.
3. A relay inspector with settings, and time–current curves drawn from the same
   definitions that drive trip timing.
4. Grading and discrimination between relays, with margins flagged.
5. Intertrips, blocking, breaker fail and lockout relays as rungs and contacts.
6. Commissioning tier: test links, secondary injection, isolating a relay for testing.

**Exit:** the same fault, viewed at all five tiers, gives five true explanations at five depths.

### Phase F — Control and SCADA (M)

Last because indications and alarms draw on everything before them.

1. Indications derived from auxiliary contacts, not from the plant: a misreporting contact
   shows a wrong position in the control room view while the substation view shows the truth.
2. Alarm priorities, acknowledgement, standing and fleeting alarms, alarm floods.
3. Controls in the control room view travel through control circuits and never move plant
   directly. The substation view keeps direct operation, for demonstrating power flow.
4. Lessons that start in the control room view with something wrong, compare it with the
   substation view, and end in Protect finding the cause.

**Exit:** a full fault scenario played entirely from the control room, using only what the
control room would see.

### Running alongside

- **Studio:** timeline, camera keyframes and annotations, as planned in September — now able
  to film any workspace, including live secondary sheets.
- **Learn:** editing timed events in the editor, a lesson library browser, and content for
  each phase.
- **Design:** mid-conductor tees (which unblocks the reserve-bus level), and the symbol
  library expansion.

### Order, and why

**A → B → C → D → E → F.** A first because it is the visible problem and gives everything
else a home. B is the dependency for the rest. C next because switching is the core purpose,
D because it gives the secondary side consequences, E because it builds on D's trip chain,
and F last because it consumes everything else. Studio and Learn work can be done at any time.

---

## 5. Decisions

The questions this plan opened are answered here. Each is settled enough to build against;
where a decision has a cost, the cost is stated rather than hidden.

Decisions 5.1–5.6 were recorded in September 2026 and still stand. Their phase numbers refer
to the September plan: its Phase 2 (protection) is now Phases B–E, its Phase 3 is the Studio
mode, and its Phase 4 is the Learn mode. Decisions 5.7–5.10 were added with this revision.

### 5.1 Protection depth — tiered, all the way up

**Decided:** tiered from a single trip-and-alarm account through settings and curves to
coordination, discrimination, intertrips, blocking, inhibit and lockout. Where a drawing is
shown, **it is simplified to only what is modelled.**

That last clause is the binding constraint, and it is the useful one. A scheme diagram that
draws a contact the simulation does not evaluate teaches a learner something false and can
never be debugged. So: every element rendered in a protection diagram maps to a simulated
object, or it is not drawn. Where the model lacks something the picture needs, the model gains
it first. This makes Phase 2 partly an engine task, not only a UI task.

The tier ladder is now expressed in code, in `workbenches/registry.ts` and
`protection/tripNarrative.ts`, and pinned by tests asserting that depth increases with tier and
that the plain-language account is never removed.

### 5.2 Audience — content-first, tier-agnostic

**Decided:** no single audience drives the roadmap. The priority is the authoring tooling that
lets content be made for any tier without a code change, which moves **Phase 4 ahead of
Phase 2**.

The consequence to accept: protection depth arrives later than it otherwise would. The
compensation is that when it arrives, lessons for it can be written without a commit — and the
trip narrative already gives every tier something true in the meantime.

### 5.3 Video — keyframes, annotations and camera movement

**Decided:** export is adequate; the gap is direction, not encoding. Phase 3 builds a timeline
with camera keyframes and an annotation track. **In-browser video capture is explicitly
dropped** — OBS pointed at a keyframed, annotated animation produces a better clip for a
fraction of the work, and reintroducing a capture pipeline later costs nothing that this
decision forecloses.

### 5.4 Realism ceiling — a teaching abstraction, held honest

**Decided:** this is a teaching tool, not a study package. It does not need load flow
convergence, sequence components or fault-level calculation, and it should not pretend to.

The rule that keeps that honest is the same one as 5.1: **the tool may simplify, but it must
not lie.** A displayed number must come from something modelled. Where a tier needs a figure
the engine cannot honestly produce, the answer is to show less, not to fabricate a plausible
value.

`simulation/powerFlow.ts` therefore grows only where a teaching surface demands it — Phase 2's
time-current curves need fault current at a point, which is the first real pressure on this
boundary and should be met with a documented, deliberately simple model rather than a silent
approximation.

### 5.5 Assessment — local now, server only when someone asks

**Decided:** progress stays per-learner in the browser (`persistence/progressStore.ts`), and
lesson packs carry results out as files. No accounts, no telemetry, no instructor dashboard for
now.

An instructor marking view is a server, and a server for schoolchildren's work is a data
protection commitment, not a feature. If classroom use makes it necessary, it should be scoped
together with the deferred multiplayer server rather than grown separately — and the privacy
draft noted in ROADMAP.md becomes a prerequisite, not an afterthought.

### 5.6 Classroom multiplayer — still deferred, now cheaper

**Unchanged, but reassessed.** Multiplayer stays deferred. Phase 1's shared document store is
the thing that would make it tractable; revisit once that has landed rather than before.

### 5.7 Structure — three workspaces and two modes

**Decided (November 2026):** Design, Protect and Operate are workspaces, each with its own
canvas, tools and look. Learn and Studio are modes available in all three. This replaces the
five-workbench switcher, which mixed subjects with activities.

### 5.8 Secondary drawings — generated sheets

**Decided:** secondary systems are shown on separate sheets generated from the model, not
overlaid on the single-line diagram and not drawn by hand. Generation is what keeps 5.1
honest: a sheet cannot show a contact the engine does not evaluate. Cross-referencing keeps
the sheets connected to the plant.

### 5.9 Operate — a substation view and a control room view

**Decided:** Operate runs the substation through two views the learner switches between: a
substation view showing the true plant state and power flow, and a control-room HMI showing
only what the secondary systems report. The substation view keeps the tool's strength in
demonstrating power flow and switching, and is the natural view for video; the control room
view teaches operating from indications. Neither has editing tools, which is what separates
Operate from Design. Scenarios may lock Operate to one view.

### 5.10 Secondary scope — all four, in dependency order

**Decided:** the protection trip chain, interlocking schemes, DC and auxiliary supplies, and
control and SCADA are all in scope, built on one ladder model in the order set out in
section 4.

## 6. Open questions, for the phases that need them

- **Device conventions (Phase B).** Label secondary devices with ANSI numbers (52a/52b,
  86, 94), IEC designations, or the National Grid conventions the BP109 labelling already
  follows? This affects every generated sheet, so it should be settled before B.
- **Key interlocks (Phase C).** Model them as keys that physically move between locks, or
  as a simplified permissive? The first teaches more and costs more.
- **Intertrips between substations (Phase E).** Real intertrips run between sites. Does a
  document need to hold two substations, or is a remote end represented as an interface?
