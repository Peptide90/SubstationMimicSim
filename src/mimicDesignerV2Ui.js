export function getOperationLabelPosition(component, visualSettings = {}) {
  const gap = visualSettings.labelGap ?? 8;
  const labelHeight = visualSettings.labelSize ?? 13;
  const rotation = normaliseRotation(component.rotation ?? 0);
  if (rotation === 90 || rotation === 270 || component.orientation === 'vertical') {
    return { x: component.x ?? 0, y: (component.y ?? 0) + ((component.height ?? 0) / 2) + gap + labelHeight, anchor: 'middle', placement: 'below' };
  }
  return { x: (component.x ?? 0) + ((component.width ?? 0) / 2) + gap, y: component.y ?? 0, anchor: 'start', placement: 'right' };
}

export function getScaledComponentGeometry(component, visualSettings = {}) {
  const scale = visualSettings.componentSymbolScale ?? 1;
  const strokeScale = visualSettings.componentStrokeScale ?? scale;
  const baseWidth = component.baseWidth ?? component.width ?? 32;
  const baseHeight = component.baseHeight ?? component.height ?? 32;
  const preserveConnectionLength = visualSettings.preserveConnectionLength ?? true;
  const rotation = normaliseRotation(component.rotation ?? 0);
  const alongBusAxis = rotation === 90 || rotation === 270 ? 'height' : 'width';
  return {
    width: preserveConnectionLength && alongBusAxis === 'width' ? baseWidth : baseWidth * scale,
    height: preserveConnectionLength && alongBusAxis === 'height' ? baseHeight : baseHeight * scale,
    strokeWidth: (component.strokeWidth ?? visualSettings.componentStrokeWidth ?? 2) * strokeScale,
    symbolScale: scale
  };
}

export function handleEscapeKey(uiState, event) {
  if (event.key !== 'Escape' || !uiState.modalOpen) return uiState;
  return { ...uiState, modalOpen: false, activeModal: null };
}

export function getVoltageSelectHeader() {
  return 'Voltage (kV)';
}

export function getPrimaryNavbarItems() {
  return [];
}

export function toggleScenariosPanel(uiState) {
  const isOpen = uiState.activePanel === 'scenarios';
  return { ...uiState, activePanel: isOpen ? 'inspector' : 'scenarios' };
}

function normaliseRotation(value) {
  const normalised = Number(value) % 360;
  return normalised < 0 ? normalised + 360 : normalised;
}
