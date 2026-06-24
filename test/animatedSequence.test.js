import test from 'node:test';
import assert from 'node:assert/strict';
import { MimicDesignerV2 } from '../src/mimicDesignerV2.js';
import { renderPreviewScene, assertRendererSettingsShared } from '../src/animatedSequenceExport.js';

const drawing = { width: 800, height: 600, objects: [{ id: 'CB1', label: 'Main CB', type: 'circuit-breaker' }, { id: 'BUS1', label: 'Bus A', type: 'busbar' }], state: {} };

test('Animated Sequence menu opens and supports step editing', () => {
  const app = new MimicDesignerV2(structuredClone(drawing));
  assert.ok(MimicDesignerV2.menuItems.includes('Animated Sequence'));
  const seq = app.openAnimatedSequenceMenu();
  assert.equal(app.sequencePanelOpen, true);
  app.addSequenceStep({ name: 'Close main', actionType: 'close-circuit-breaker', targetId: 'CB1', targetLabel: 'Main CB', eventDurationSeconds: 0.5, delayAfterSeconds: 0.25 });
  assert.equal(seq.steps.length + 1, app.activeSequence.steps.length);
  app.updateSequenceStep(app.activeSequence.steps[0].id, { eventDurationSeconds: 1.5, delayAfterSeconds: 0.5 });
  assert.equal(app.getTotalDuration(), 2);
});

test('target selection, move, duplicate, delete', () => {
  const app = new MimicDesignerV2(structuredClone(drawing)); app.openAnimatedSequenceMenu();
  assert.equal(app.selectTargets('Main')[0].id, 'CB1');
  app.addSequenceStep({ name:'A', actionType:'wait' }); app.addSequenceStep({ name:'B', actionType:'wait' });
  const first = app.activeSequence.steps[0].id; app.moveSequenceStep(first, 1); assert.equal(app.activeSequence.steps[1].id, first);
  app.duplicateSequenceStep(first); assert.equal(app.activeSequence.steps.length, 3);
  app.deleteSequenceStep(first); assert.equal(app.activeSequence.steps.length, 2);
});

test('preview applies order and reset/apply are deterministic', () => {
  const app = new MimicDesignerV2(structuredClone(drawing)); app.openAnimatedSequenceMenu();
  app.addSequenceStep({ actionType:'close-circuit-breaker', targetId:'CB1', eventDurationSeconds:0.25, delayAfterSeconds:0 });
  app.addSequenceStep({ actionType:'apply-fault', targetId:'BUS1', eventDurationSeconds:0.25, delayAfterSeconds:0 });
  const result = app.preview(false);
  assert.deepEqual(result.drawingState, {});
  assert.equal(result.finalState.objects.CB1.energised, true);
  assert.equal(result.finalState.objects.BUS1.faulted, true);
  app.applyFinalState(result); assert.equal(app.drawing.state.objects.CB1.energised, true);
  app.resetToPreSequenceState(result); assert.deepEqual(app.drawing.state, {});
});

test('settings toggles and animated SVG export use shared visual settings', () => {
  const app = new MimicDesignerV2(structuredClone(drawing)); app.openAnimatedSequenceMenu();
  app.activeSequence.settings.trimLineEnergisation = true; app.activeSequence.settings.highlightOperatedLabels = true;
  app.addSequenceStep({ name:'Energise bus', actionType:'energise-path', targetId:'BUS1', eventDurationSeconds:1, delayAfterSeconds:0 });
  const visual = { busbarThickness: 11, cableStrokeWidth: 4, textSize: 18, componentSymbolSize: 40, labelSize: 16, phaseSpacing: 10, theme: 'dark' };
  assert.equal(assertRendererSettingsShared(renderPreviewScene(app.drawing, visual), visual), true);
  const { svg } = app.exportAnimatedSvg(visual);
  assert.match(svg, /Animated Sequence/); assert.match(svg, /<animate /); assert.match(svg, /data-busbar-thickness="11"/); assert.match(svg, /filter/);
});

test('WebM and MP4 capabilities are honest', () => {
  const app = new MimicDesignerV2(structuredClone(drawing));
  const caps = app.getExportCapabilities({ MediaRecorder: function(){} });
  assert.equal(caps.webm, true); assert.equal(caps.mp4, false); assert.match(caps.mp4Reason, /MP4/); assert.equal(caps.frameSequence, true);
});

test('sequence save/load preserves steps and settings', () => {
  const app = new MimicDesignerV2(structuredClone(drawing)); app.openAnimatedSequenceMenu();
  app.activeSequence.settings.includeGrid = true; app.addSequenceStep({ actionType:'open-disconnector', targetId:'CB1', eventDurationSeconds:0.75, delayAfterSeconds:0.1 });
  const saved = app.save(); const app2 = new MimicDesignerV2(); app2.load(saved);
  assert.equal(app2.sequences[0].steps[0].eventDurationSeconds, 0.75); assert.equal(app2.sequences[0].settings.includeGrid, true);
});
