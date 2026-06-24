import { rotatePoint } from '../topology/connectivity';
import { SWITCH_TERMINAL_SPAN } from '../symbols/library';
import type { ElectricalSymbol } from '../drawing/model';
import type { Point } from '../drawing/model';
import {
  DEFAULT_DISPLAY_SCALE,
  EQUIPMENT_LABEL_STEP,
  type DisplayScale,
  equipmentLabelTextAnchor,
  scaledSize,
  equipmentLabelOffsetY
} from './displayMetrics';

const stroke = '#0f172a';
const live = '#16a34a';
const warning = '#f59e0b';
const bg = '#ffffff';

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function symbolGlyphSvg(symbol: ElectricalSymbol, symbolScale = 1): string {
  const selectedStroke = stroke;
  const w = (value: number) => scaledSize(value, symbolScale);
  const strokeW = w(2);
  if (symbol.type === 'cable-sealing-end') return `<polygon points="-14,-13 ${SWITCH_TERMINAL_SPAN},0 -14,13" fill="${bg}" stroke="${selectedStroke}" stroke-width="${strokeW}"/>`;
  if (symbol.type === 'source') return `<line x1="-30" y1="0" x2="-14" y2="0" stroke="${selectedStroke}" stroke-width="${strokeW}"/><polygon points="-14,-16 18,0 -14,16" fill="${bg}" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="18" y1="0" x2="40" y2="0" stroke="${selectedStroke}" stroke-width="${strokeW}"/>`;
  if (symbol.type === 'grid-connection') {
    const exporting = (symbol.powerFlow?.mw ?? 0) >= 0;
    return `<line x1="-${SWITCH_TERMINAL_SPAN}" y1="0" x2="-16" y2="0" stroke="${selectedStroke}" stroke-width="${strokeW}"/><circle cx="0" cy="0" r="14" fill="${bg}" stroke="${selectedStroke}" stroke-width="${strokeW}"/><polygon points="${exporting ? '6,-5 16,0 6,5' : '-6,-5 -16,0 -6,5'}" fill="${selectedStroke}"/><text x="0" y="4" text-anchor="middle" font-size="${w(9)}" fill="${selectedStroke}">G</text><line x1="16" y1="0" x2="${SWITCH_TERMINAL_SPAN}" y2="0" stroke="${selectedStroke}" stroke-width="${strokeW}"/>`;
  }
  if (symbol.type === 'load' || symbol.type === 'line-end') return `<line x1="-${SWITCH_TERMINAL_SPAN}" y1="0" x2="-18" y2="0" stroke="${selectedStroke}" stroke-width="${strokeW}"/><polygon points="18,-16 -18,0 18,16" fill="${bg}" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="18" y1="0" x2="${SWITCH_TERMINAL_SPAN}" y2="0" stroke="${selectedStroke}" stroke-width="${strokeW}"/>`;
  if (symbol.type === 'transformer') return `<circle cx="-9" cy="0" r="13" fill="none" stroke="${selectedStroke}" stroke-width="${strokeW}"/><circle cx="9" cy="0" r="13" fill="none" stroke="${selectedStroke}" stroke-width="${strokeW}"/>${symbol.symbolVariant === 'autotransformer' ? `<path d="M -1 -11 L 1 11" stroke="${selectedStroke}" stroke-width="${strokeW}"/>` : ''}${symbol.symbolVariant === 'neutral' ? `<path d="M 0 13 V28 M -8 28 H8 M -5 32 H5" stroke="${selectedStroke}" stroke-width="${strokeW}"/>` : ''}${symbol.symbolVariant === 'tertiary' ? `<path d="M -10 18 H10 L0 32 Z" fill="none" stroke="${selectedStroke}" stroke-width="${strokeW}"/>` : ''}`;
  if (symbol.type === 'ct') return `<line x1="-${SWITCH_TERMINAL_SPAN}" y1="0" x2="${SWITCH_TERMINAL_SPAN}" y2="0" stroke="${selectedStroke}" stroke-width="${strokeW}"/><circle cx="-8" cy="0" r="11" fill="none" stroke="${selectedStroke}" stroke-width="${strokeW}"/><circle cx="8" cy="0" r="11" fill="none" stroke="${selectedStroke}" stroke-width="${strokeW}"/>${symbol.symbolVariant === 'zero-flux' ? `<text x="0" y="25" text-anchor="middle" font-size="${w(8)}" fill="${selectedStroke}">ZF</text>` : ''}`;
  if (symbol.type === 'vt') return symbol.symbolVariant === 'voltage-divider'
    ? `<line x1="0" y1="-26" x2="0" y2="-8" stroke="${selectedStroke}" stroke-width="${strokeW}"/><path d="M -10 -5 H10 M -10 5 H10 M 0 -5 V5" stroke="${selectedStroke}" stroke-width="${strokeW}"/><text x="0" y="22" text-anchor="middle" font-size="${w(8)}" fill="${selectedStroke}">DIV</text><line x1="0" y1="18" x2="0" y2="28" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-9" y1="28" x2="9" y2="28" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-6" y1="32" x2="6" y2="32" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-3" y1="36" x2="3" y2="36" stroke="${selectedStroke}" stroke-width="${strokeW}"/>`
    : `<line x1="0" y1="-26" x2="0" y2="-8" stroke="${selectedStroke}" stroke-width="${strokeW}"/><circle cx="0" cy="5" r="13" fill="none" stroke="${selectedStroke}" stroke-width="${strokeW}"/><text x="0" y="9" text-anchor="middle" font-size="${w(10)}" fill="${selectedStroke}">${symbol.symbolVariant === 'cvt' ? 'C' : 'V'}</text><line x1="0" y1="18" x2="0" y2="28" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-9" y1="28" x2="9" y2="28" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-6" y1="32" x2="6" y2="32" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-3" y1="36" x2="3" y2="36" stroke="${selectedStroke}" stroke-width="${strokeW}"/>`;
  if (symbol.type === 'surge-arrester') return `<line x1="0" y1="-28" x2="0" y2="-12" stroke="${selectedStroke}" stroke-width="${strokeW}"/><path d="M -9 -12 H9 L-9 10 H9" fill="none" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="0" y1="10" x2="0" y2="26" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-9" y1="26" x2="9" y2="26" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-6" y1="30" x2="6" y2="30" stroke="${selectedStroke}" stroke-width="${strokeW}"/>`;
  if (symbol.type === 'circuit-breaker') {
    const fill = symbol.operation?.tripped ? warning : symbol.operation?.switchState === 'closed' ? live : bg;
    const stateText = symbol.operation?.tripped ? 'T' : symbol.operation?.switchState === 'closed' ? 'X' : 'O';
    return `<line x1="-${SWITCH_TERMINAL_SPAN}" y1="0" x2="-14" y2="0" stroke="${selectedStroke}" stroke-width="${strokeW}"/><rect x="-14" y="-14" width="28" height="28" fill="${fill}" stroke="${selectedStroke}" stroke-width="${strokeW}"/><text x="0" y="5" text-anchor="middle" font-size="${w(14)}" font-weight="800" fill="${selectedStroke}">${stateText}</text><line x1="14" y1="0" x2="${SWITCH_TERMINAL_SPAN}" y2="0" stroke="${selectedStroke}" stroke-width="${strokeW}"/>`;
  }
  if (symbol.type === 'disconnector') {
    const closed = symbol.operation?.switchState === 'closed' && !symbol.operation?.tripped;
    const hingeR = w(2.5);
    return `<line x1="-${SWITCH_TERMINAL_SPAN}" y1="0" x2="-8" y2="0" stroke="${selectedStroke}" stroke-width="${strokeW}"/><circle cx="-8" cy="0" r="${hingeR}" fill="${selectedStroke}"/><circle cx="12" cy="0" r="${hingeR}" fill="${selectedStroke}"/><line x1="12" y1="0" x2="${SWITCH_TERMINAL_SPAN}" y2="0" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-8" y1="0" x2="${closed ? 12 : 7}" y2="${closed ? 0 : -13}" stroke="${selectedStroke}" stroke-width="${strokeW}"/>`;
  }
  if (symbol.type === 'earth-switch') {
    const closed = symbol.operation?.switchState === 'closed' && !symbol.operation?.tripped;
    const hingeR = w(2.5);
    return `<circle cx="0" cy="0" r="${hingeR}" fill="${selectedStroke}"/><circle cx="0" cy="18" r="${hingeR}" fill="${selectedStroke}"/><line x1="0" y1="0" x2="${closed ? 0 : 13}" y2="${closed ? 18 : 8}" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="0" y1="18" x2="0" y2="28" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-9" y1="28" x2="9" y2="28" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-6" y1="32" x2="6" y2="32" stroke="${selectedStroke}" stroke-width="${strokeW}"/><line x1="-3" y1="36" x2="3" y2="36" stroke="${selectedStroke}" stroke-width="${strokeW}"/>`;
  }
  return `<rect x="-20" y="-14" width="40" height="28" fill="${bg}" stroke="${selectedStroke}" stroke-width="${strokeW}"/>`;
}

export function symbolLabelOffset(symbol: ElectricalSymbol, textScale = DEFAULT_DISPLAY_SCALE.text): Point {
  return rotatePoint({ x: 0, y: equipmentLabelOffsetY(symbol, symbol.rotation, textScale) }, symbol.rotation);
}

export function symbolLabelWorldPosition(symbol: ElectricalSymbol, position: Point, textScale = DEFAULT_DISPLAY_SCALE.text): Point {
  const offset = symbolLabelOffset(symbol, textScale);
  return { x: position.x + offset.x, y: position.y + offset.y };
}

function equipmentLabelSvgAttributes(symbol: ElectricalSymbol, anchor: Point, fontSize: number): string {
  const textAnchor = equipmentLabelTextAnchor(symbol.rotation);
  const rotation = symbol.rotation ? ` transform="rotate(${-symbol.rotation} ${anchor.x} ${anchor.y})"` : '';
  return `x="${anchor.x}" y="${anchor.y}" text-anchor="${textAnchor}" font-size="${fontSize}"${rotation}`;
}

export function symbolLabelSvgWorld(
  symbol: ElectricalSymbol,
  position: Point,
  text = symbol.label?.text ?? '',
  display: DisplayScale = DEFAULT_DISPLAY_SCALE
): string {
  if (!text) return '';
  const anchor = symbolLabelWorldPosition(symbol, position, display.text);
  return `<text ${equipmentLabelSvgAttributes(symbol, anchor, scaledSize(8, display.text))}>${escapeXml(text)}</text>`;
}

export function operationLabelSvgWorld(symbol: ElectricalSymbol, position: Point, display: DisplayScale = DEFAULT_DISPLAY_SCALE): string {
  let state: string | undefined;
  if (symbol.type === 'circuit-breaker' || symbol.type === 'disconnector' || symbol.type === 'earth-switch') {
    state = symbol.operation?.tripped ? 'Trip' : symbol.operation?.switchState === 'closed' ? 'Closed' : 'Open';
  } else if (symbol.type === 'source' || symbol.type === 'grid-connection') {
    state = symbol.operation?.sourceOn === false ? 'Off' : 'On';
  }
  if (!state) return '';
  const base = symbolLabelWorldPosition(symbol, position, display.text);
  const anchor = rotatePoint({ x: 0, y: EQUIPMENT_LABEL_STEP }, symbol.rotation);
  const operationAnchor = { x: base.x + anchor.x, y: base.y + anchor.y };
  return `<text ${equipmentLabelSvgAttributes(symbol, operationAnchor, scaledSize(8, display.text))}>${state}</text>`;
}
