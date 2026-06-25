import type { DrawingDocument, ElectricalSymbol } from '../drawing/model';

export interface DisplayScale {
  busbar: number;
  text: number;
  symbol: number;
}

export const DEFAULT_DISPLAY_SCALE: DisplayScale = { busbar: 1, text: 2, symbol: 1 };

export const DISPLAY_SCALE_MIN = 0.5;
export const DISPLAY_SCALE_MAX = 3;

export const TEXT_DISPLAY_SCALE_MIN = 2;
export const TEXT_DISPLAY_SCALE_MAX = 6;
export const TEXT_DISPLAY_SCALE_DEFAULT = 2;
export const TEXT_LABEL_OFFSET_BASELINE_SCALE = TEXT_DISPLAY_SCALE_DEFAULT;

const SIDE_OFFSET_GROWTH = 0.22;
const SIDE_OFFSET_MAX = 8;

export function clampDisplayScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(DISPLAY_SCALE_MAX, Math.max(DISPLAY_SCALE_MIN, value));
}

export function clampTextDisplayScale(value: number): number {
  if (!Number.isFinite(value)) return TEXT_DISPLAY_SCALE_DEFAULT;
  return Math.min(TEXT_DISPLAY_SCALE_MAX, Math.max(TEXT_DISPLAY_SCALE_MIN, value));
}

export function resolveDisplayScale(uiState?: DrawingDocument['uiState']): DisplayScale {
  const raw = uiState?.displayScale;
  return {
    busbar: clampDisplayScale(raw?.busbar ?? DEFAULT_DISPLAY_SCALE.busbar),
    text: clampTextDisplayScale(raw?.text ?? DEFAULT_DISPLAY_SCALE.text),
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

/** Modest extra side clearance above the 200% text baseline so labels stay near equipment. */
export function equipmentLabelSideTextPadding(textScale: number): number {
  const scale = clampTextDisplayScale(textScale);
  if (scale <= TEXT_LABEL_OFFSET_BASELINE_SCALE) return 0;
  const grown = scaledSize(EQUIPMENT_LABEL_BASE_FONT, scale) - scaledSize(EQUIPMENT_LABEL_BASE_FONT, TEXT_LABEL_OFFSET_BASELINE_SCALE);
  return Math.min(grown * SIDE_OFFSET_GROWTH, SIDE_OFFSET_MAX);
}

export function equipmentLabelOffsetY(symbol: ElectricalSymbol, rotation: number, textScale = TEXT_DISPLAY_SCALE_DEFAULT): number {
  const side = isSideEquipmentLabel(rotation);
  let base = symbolLabelBaseY(symbol);
  if (side && (symbol.type === 'earth-switch' || symbol.type === 'surge-arrester' || symbol.type === 'vt')) {
    base = Math.max(base, 58);
  }
  if (!side) return base;
  return base + equipmentLabelSideTextPadding(textScale);
}

export function equipmentLabelRowStep(textScale: number): number {
  return scaledSize(EQUIPMENT_LABEL_BASE_FONT, clampTextDisplayScale(textScale)) * 1.35;
}

export function equipmentLabelTextAnchor(rotation: number): 'start' | 'middle' | 'end' {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90) return 'end';
  if (normalized === 270) return 'start';
  return 'middle';
}

export function displayScalePercent(scale: number, key?: keyof DisplayScale): number {
  if (key === 'text') return Math.round(clampTextDisplayScale(scale) * 100);
  return Math.round(clampDisplayScale(scale) * 100);
}

export function displayScaleFromPercent(percent: number, key?: keyof DisplayScale): number {
  if (key === 'text') return clampTextDisplayScale(percent / 100);
  return clampDisplayScale(percent / 100);
}
