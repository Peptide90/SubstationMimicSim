import test from 'node:test';
import assert from 'node:assert/strict';
import { MimicDesignerV2 } from '../src/mimicDesignerV2.js';
import { getOperationLabelPosition, getPrimaryNavbarItems, getScaledComponentGeometry, getVoltageSelectHeader, toggleScenariosPanel } from '../src/mimicDesignerV2Ui.js';

test('rotated vertical operation state label is placed below the equipment name area', () => {
  const position = getOperationLabelPosition({ x: 100, y: 50, height: 40, rotation: 90 }, { labelGap: 6, labelSize: 14 });
  assert.equal(position.placement, 'below');
  assert.equal(position.anchor, 'middle');
  assert.equal(position.y, 90);
});

test('component icon scaling thickens symbols without lengthening their busbar connection span', () => {
  const horizontal = getScaledComponentGeometry({ width: 30, height: 20, strokeWidth: 2, rotation: 0 }, { componentSymbolScale: 2, preserveConnectionLength: true });
  assert.equal(horizontal.width, 30);
  assert.equal(horizontal.height, 40);
  assert.equal(horizontal.strokeWidth, 4);
  const vertical = getScaledComponentGeometry({ width: 30, height: 20, strokeWidth: 2, rotation: 90 }, { componentSymbolScale: 2, preserveConnectionLength: true });
  assert.equal(vertical.width, 60);
  assert.equal(vertical.height, 20);
});

test('escape closes the active Animated Sequence modal', () => {
  const app = new MimicDesignerV2();
  app.openAnimatedSequenceMenu();
  assert.equal(app.sequencePanelOpen, true);
  app.handleKeyDown({ key: 'Escape' });
  assert.equal(app.sequencePanelOpen, false);
  assert.equal(app.uiState.activeModal, null);
});

test('voltage selector has kV header and empty stub navbar is removed', () => {
  assert.equal(getVoltageSelectHeader(), 'Voltage (kV)');
  assert.deepEqual(getPrimaryNavbarItems(), []);
});

test('clicking scenarios navbar button again returns to inspector', () => {
  assert.deepEqual(toggleScenariosPanel({ activePanel: 'inspector' }), { activePanel: 'scenarios' });
  assert.deepEqual(toggleScenariosPanel({ activePanel: 'scenarios' }), { activePanel: 'inspector' });
});
