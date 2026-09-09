# Quarantined: Builder Challenges content

This folder is **reference material awaiting a port, not live code.** Nothing here is
imported by the application; it is kept in the compiled tree so it keeps type-checking
rather than rotting in git history.

## Why it was kept

The React Flow editor these files were written against has been deleted. The *content and
rules* were kept because they express four things the V2 scenario model cannot yet:

1. **Build objectives** — `buildBay`, `includeComponent`, `connectBetween` in `types.ts`.
   V2 can only grade *operating* an existing drawing, never *constructing* one.
2. **Switching instruction sheets** — `SwitchingInstruction`, `SwitchingSegment`,
   `LineEndColour` (RED/BLUE/YELLOW/GREEN/BLACK) and `SwitchingInstructionsModal.tsx`.
3. **Isolation tagging** — the `tagIsolation` objective type.
4. **Scoring and resilience probes** — `ScenarioScoring`, `ScenarioResilienceTest`.

`scenarios.ts` holds the authored content itself: four tutorials and the graded levels.

## What is reference vs. what is portable

| File | Fate |
|---|---|
| `scenarios.ts`, `types.ts` | **Port the content and schema** into the V2 scenario model |
| `SwitchingInstructionsModal.tsx` | **Portable as-is** — plain React, no editor coupling |
| `ChallengeEvaluator.ts`, `tutorialRunner.ts` | **Reference only** — semantics to re-implement against the V2 document |
| `energize.ts`, `powerSim.ts`, `energizeUtils.ts` | **Superseded** by `mimic-designer-v2/topology` and `simulation` |
| `flowTypes.ts`, `graphUtils.ts`, `model.ts` | Shims keeping the above compiling; delete with the folder |

`flowTypes.ts` replaces React Flow's `Node`/`Edge` types — React Flow is no longer a
dependency.

## Delete this folder when

The V2 scenario model supports build objectives, switching instruction sheets and
isolation tagging, and the `scenarios.ts` content has been re-authored against it.
See `docs/PLATFORM-PLAN.md`, Phase 1.
