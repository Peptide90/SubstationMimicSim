import { describe, expect, it } from 'vitest';
import {
  equipmentLabelOffsetY,
  equipmentLabelSideTextPadding,
  equipmentLabelTextAnchor,
  symbolLabelBaseY,
  symbolLabelY
} from '../rendering/displayMetrics';
import type { ElectricalSymbol } from '../drawing/model';

const cb = { type: 'circuit-breaker' } as ElectricalSymbol;
const es = { type: 'earth-switch' } as ElectricalSymbol;

describe('displayMetrics', () => {
  it('keeps below-label offset fixed regardless of text scale', () => {
    expect(symbolLabelY(cb)).toBe(symbolLabelBaseY(cb));
    expect(equipmentLabelOffsetY(cb, 0, 2)).toBe(symbolLabelBaseY(cb));
  });

  it('anchors side labels so text grows away from equipment', () => {
    expect(equipmentLabelTextAnchor(90)).toBe('end');
    expect(equipmentLabelTextAnchor(270)).toBe('start');
    expect(equipmentLabelTextAnchor(0)).toBe('middle');
    expect(equipmentLabelTextAnchor(180)).toBe('middle');
  });

  it('adds side clearance as label text scales up', () => {
    expect(equipmentLabelSideTextPadding(1)).toBe(0);
    expect(equipmentLabelSideTextPadding(2)).toBe(8);
    expect(equipmentLabelOffsetY(cb, 90, 2)).toBe(symbolLabelBaseY(cb) + 8);
  });

  it('gives tall vertical glyphs extra side offset', () => {
    expect(equipmentLabelOffsetY(es, 90, 1)).toBe(58);
  });
});
