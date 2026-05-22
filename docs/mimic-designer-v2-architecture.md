# Mimic Designer V2 Architecture (Refined CAD-lite pass)

## Audit and scope guardrails

- This implementation only touches `mimic-designer-v2` and its isolated route.
- Existing/legacy Mimic Designer paths are intentionally left intact behind separate routing.
- Simulation semantics are preserved as metadata fields but this pass prioritises the drawing editor UX.

## Module boundaries

- `drawing/model.ts`
  - Authoritative document schema for symbols, busbars, conductors, labels, and phase metadata.
- `nomenclature/engine.ts`
  - Label generation and duplicate avoidance. Manual labels are preserved.
- `topology/extractTopology.ts`
  - Derived graph model from drawing connections (kept separate from visual components).
- `symbols/library.ts`
  - Data-driven symbol catalogue for palette placement.
- `ui/MimicDesignerV2.tsx`
  - CAD-lite interaction shell (tooling, pan/zoom, selection, inspector, theme toggle).
- `theme/tokens.css` and `canvas/editor.css`
  - Light-first visual system with dark-theme override and neutral technical styling.

## Interaction features delivered in this pass

- Pan + zoom canvas with wheel zoom and pan gesture support.
- Grid rendering and snap-based placement/movement.
- Symbol palette insertion with electrical object metadata.
- Selection, multi-select, delete, rotate.
- Orthogonal conductor/busbar polyline drafting with preview and cancel.
- Single-line vs three-phase view toggle without data loss.
- Phase-specific device marker/tooltip in single-line mode.
- Property inspector for label and voltage edits.
- Undo/redo keyboard shortcuts for common editing flows.
- Save/load and sample drawing seeding.
- Debug panel for object counts, selection, current mode/view, and topology status.

## Notes / next increments

- Add marquee rectangle selection and resize handles.
- Add explicit flip operations with terminal transform helpers.
- Improve connection snapping to nearest terminal/intersection and tee-point creation.
- Expand inspector phase editing controls and per-object metadata controls.
- Add richer vector symbol rendering per equipment type.

## Topology extraction refinement (this pass)

- Added dedicated topology modules:
  - `topology/types.ts` (graph contract)
  - `topology/connectivity.ts` (terminal/world-position + connection primitives)
  - `topology/graph.ts` (node/branch/device/island derivation)
  - `topology/validation.ts` (warnings)
  - `topology/energisation.ts` (source traversal groundwork)
- UI now supports a topology overlay to visualize detected nodes, branch edges, and floating terminals.
- Validation warnings are exposed in the debug panel and available to future inspector/panel routing.
