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

/** Fixed gap between equipment name and operation-state label (pt); not scaled with text size. */
export const EQUIPMENT_LABEL_STEP = 11;

export function equipmentLabelTextAnchor(rotation: number): 'start' | 'middle' | 'end' {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90) return 'start';
  if (normalized === 270) return 'end';
  return 'middle';
}

export function displayScalePercent(scale: number): number {
  return Math.round(clampDisplayScale(scale) * 100);
}

export function displayScaleFromPercent(percent: number): number {
  return clampDisplayScale(percent / 100);
}
