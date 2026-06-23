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
  if (symbol.type === 'earth-switch' || symbol.type === 'vt') return 52;
  if (symbol.type === 'ct') return 44;
  return 38;
}

export function symbolLabelY(symbol: ElectricalSymbol, textScale = 1): number {
  return symbolLabelBaseY(symbol) * textScale;
}

export function displayScalePercent(scale: number): number {
  return Math.round(clampDisplayScale(scale) * 100);
}

export function displayScaleFromPercent(percent: number): number {
  return clampDisplayScale(percent / 100);
}
