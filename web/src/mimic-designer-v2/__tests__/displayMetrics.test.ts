import { describe, expect, it } from 'vitest';
import { equipmentLabelTextAnchor, symbolLabelBaseY, symbolLabelY } from '../rendering/displayMetrics';
import type { ElectricalSymbol } from '../drawing/model';

const cb = { type: 'circuit-breaker' } as ElectricalSymbol;

describe('displayMetrics', () => {
  it('keeps equipment label offset fixed regardless of text scale', () => {
    expect(symbolLabelY(cb)).toBe(symbolLabelBaseY(cb));
  });

  it('anchors side labels so text grows away from equipment', () => {
    expect(equipmentLabelTextAnchor(90)).toBe('start');
    expect(equipmentLabelTextAnchor(270)).toBe('end');
    expect(equipmentLabelTextAnchor(0)).toBe('middle');
    expect(equipmentLabelTextAnchor(180)).toBe('middle');
  });
});
