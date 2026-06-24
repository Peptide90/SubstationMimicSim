import { createSequence, addStep, updateStep, duplicateStep, deleteStep, moveStep, totalDuration, findTargets, playSequence, DEFAULT_ANIMATION_SETTINGS } from './animatedSequence.js';
import { exportAnimatedSvg, getVideoExportCapabilities } from './animatedSequenceExport.js';
import { handleEscapeKey, toggleScenariosPanel } from './mimicDesignerV2Ui.js';

export class MimicDesignerV2 {
  constructor(drawing = { objects: [], state: {} }) { this.drawing = drawing; this.sequences = drawing.animatedSequences || []; this.activeSequence = null; this.sequencePanelOpen = false; this.uiState = { modalOpen: false, activeModal: null, activePanel: 'inspector' }; }
  openAnimatedSequenceMenu() { this.sequencePanelOpen = true; this.uiState = { ...this.uiState, modalOpen: true, activeModal: 'animated-sequence' }; if (!this.activeSequence) this.activeSequence = this.sequences[0] || createSequence(); if (!this.sequences.includes(this.activeSequence)) this.sequences.push(this.activeSequence); return this.activeSequence; }
  addSequenceStep(input) { this.activeSequence = addStep(this.activeSequence, input); this.#replaceActive(); return this.activeSequence; }
  updateSequenceStep(id, patch) { this.activeSequence = updateStep(this.activeSequence, id, patch); this.#replaceActive(); return this.activeSequence; }
  duplicateSequenceStep(id) { this.activeSequence = duplicateStep(this.activeSequence, id); this.#replaceActive(); return this.activeSequence; }
  deleteSequenceStep(id) { this.activeSequence = deleteStep(this.activeSequence, id); this.#replaceActive(); return this.activeSequence; }
  moveSequenceStep(id, direction) { this.activeSequence = moveStep(this.activeSequence, id, direction); this.#replaceActive(); return this.activeSequence; }
  getTotalDuration() { return totalDuration(this.activeSequence); }
  selectTargets(query) { return findTargets(this.drawing, query); }
  preview(applyFinalState = false) { return playSequence(this.activeSequence, this.drawing, { applyFinalState }); }
  resetToPreSequenceState(result) { this.drawing.state = result.initialState; }
  applyFinalState(result) { this.drawing.state = result.finalState; }
  exportAnimatedSvg(visualSettings) { return exportAnimatedSvg(this.activeSequence, this.drawing, visualSettings); }
  getExportCapabilities(env) { return getVideoExportCapabilities(env); }
  handleKeyDown(event) { this.uiState = handleEscapeKey(this.uiState, event); this.sequencePanelOpen = this.uiState.activeModal === 'animated-sequence'; return this.uiState; }
  toggleScenariosPanel() { this.uiState = toggleScenariosPanel(this.uiState); return this.uiState; }
  save() { return { ...this.drawing, animatedSequences: this.sequences }; }
  load(data) { this.drawing = data; this.sequences = data.animatedSequences || []; this.activeSequence = this.sequences[0] || null; }
  static get menuItems() { return ['Drawing','Simulation','Operate','Export','Settings','Animated Sequence']; }
  static get defaultAnimationSettings() { return DEFAULT_ANIMATION_SETTINGS; }
  #replaceActive(){ const idx = this.sequences.findIndex(s => s.id === this.activeSequence.id); if (idx >= 0) this.sequences[idx] = this.activeSequence; }
}
