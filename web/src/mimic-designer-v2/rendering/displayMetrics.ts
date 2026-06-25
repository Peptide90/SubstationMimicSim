import type { DrawingDocument, ElectricalSymbol } from '../drawing/model';

export interface DisplayScale {
  busbar: number;
  text: number;
  symbol: number;
}

export const DEFAULT_DISPLAY_SCALE: DisplayScale = { busbar: 1, text: 1, symbol: 1 };

export const DISPLAY_SCALE_MIN = 0.5;
export const DISPLAY_SCALE_MAX = 3;

export function clampDisplayScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(DISPLAY_SCALE_MAX, Math.max(DISPLAY_SCALE_MIN, value));
}

export function resolveDisplayScale(uiState?: DrawingDocument['uiState']): DisplayScale {
  const raw = uiState?.displayScale;
  return {
    busbar: clampDisplayScale(raw?.busbar ?? DEFAULT_DISPLAY_SCALE.busbar),
    text: clampDisplayScale(raw?.text ?? DEFAULT_DISPLAY_SCALE.text),
    symbol: clampDisplayScale(raw?.symbol ?? DEFAULT_DISPLAY_SCALE.symbol)
  };
}

export function scaledSize(base: number, scale: number): number {
  return base * scale;
}

export function symbolLabelBaseY(symbol: ElectricalSymbol): number {
  if (symbol.type === 'earth-switch' || symbol.type === 'vt' || symbol.type === 'surge-arrester') return 52;
  if (symbol.type === 'ct') return 44;
  return 38;
}

export function symbolLabelY(symbol: ElectricalSymbol): number {
  return symbolLabelBaseY(symbol);
}

/** Base equipment-label font size (pt) before display text scaling. */
export const EQUIPMENT_LABEL_BASE_FONT = 8;

/** Fixed gap between equipment name and operation-state label (pt); not scaled with text size. */
export const EQUIPMENT_LABEL_STEP = 11;

export function isSideEquipmentLabel(rotation: number): boolean {
  const normalized = ((rotation % 360) + 360) % 360;
  return normalized === 90 || normalized === 270;
}

/** Extra label offset on side-placed equipment as font size grows. */
export function equipmentLabelSideTextPadding(textScale: number): number {
  return Math.max(0, scaledSize(EQUIPMENT_LABEL_BASE_FONT, textScale) - EQUIPMENT_LABEL_BASE_FONT);
}

export function equipmentLabelOffsetY(symbol: ElectricalSymbol, rotation: number, textScale = 1): number {
  const side = isSideEquipmentLabel(rotation);
  let base = symbolLabelBaseY(symbol);
  if (side && (symbol.type === 'earth-switch' || symbol.type === 'surge-arrester' || symbol.type === 'vt')) {
    base = Math.max(base, 58);
  }
  if (!side) return base;
  return base + equipmentLabelSideTextPadding(textScale);
}

export function equipmentLabelRowStep(textScale: number): number {
  return scaledSize(EQUIPMENT_LABEL_BASE_FONT, textScale) * 1.35;
}

export function equipmentLabelTextAnchor(rotation: number): 'start' | 'middle' | 'end' {
  const normalized = ((rotation % 360) + 360) % 360;
  // Rotation 90 places the label to the left: pin the text edge nearest the symbol.
  if (normalized === 90) return 'end';
  if (normalized === 270) return 'start';
  return 'middle';
}

export function displayScalePercent(scale: number): number {
  return Math.round(clampDisplayScale(scale) * 100);
}

export function displayScaleFromPercent(percent: number): number {
  return clampDisplayScale(percent / 100);
}
