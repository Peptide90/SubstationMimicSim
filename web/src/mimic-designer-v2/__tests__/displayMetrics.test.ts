import { describe, expect, it } from 'vitest';
import {
  equipmentLabelOffsetY,
  equipmentLabelSideTextPadding,
  equipmentLabelTextAnchor,
  symbolLabelBaseY,
  symbolLabelY,
  TEXT_DISPLAY_SCALE_DEFAULT
} from '../rendering/displayMetrics';
import type { ElectricalSymbol } from '../drawing/model';

const cb = { type: 'circuit-breaker' } as ElectricalSymbol;
const es = { type: 'earth-switch' } as ElectricalSymbol;

describe('displayMetrics', () => {
  it('keeps below-label offset fixed regardless of text scale', () => {
    expect(symbolLabelY(cb)).toBe(symbolLabelBaseY(cb));
    expect(equipmentLabelOffsetY(cb, 0, 4)).toBe(symbolLabelBaseY(cb));
  });

  it('anchors side labels so text grows away from equipment', () => {
    expect(equipmentLabelTextAnchor(90)).toBe('end');
    expect(equipmentLabelTextAnchor(270)).toBe('start');
    expect(equipmentLabelTextAnchor(0)).toBe('middle');
    expect(equipmentLabelTextAnchor(180)).toBe('middle');
  });

  it('adds modest side clearance only above the 200% baseline', () => {
    expect(equipmentLabelSideTextPadding(TEXT_DISPLAY_SCALE_DEFAULT)).toBe(0);
    expect(equipmentLabelSideTextPadding(3)).toBeLessThan(3);
    expect(equipmentLabelOffsetY(cb, 90, 3)).toBeGreaterThan(symbolLabelBaseY(cb));
    expect(equipmentLabelOffsetY(cb, 90, 6)).toBeLessThan(symbolLabelBaseY(cb) + 12);
  });

  it('gives tall vertical glyphs extra side offset', () => {
    expect(equipmentLabelOffsetY(es, 90, TEXT_DISPLAY_SCALE_DEFAULT)).toBe(58);
  });
});
