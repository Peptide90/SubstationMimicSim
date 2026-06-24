import { describe, expect, it } from 'vitest';
import { SWITCH_TERMINAL_SPAN } from '../symbols/library';
import { symbolGlyphSvg } from '../rendering/symbolGlyphs';
import type { ElectricalSymbol } from '../drawing/model';

const cb: ElectricalSymbol = {
  id: 'cb-1',
  type: 'circuit-breaker',
  position: { x: 0, y: 0 },
  rotation: 0,
  phaseApplicability: ['A', 'B', 'C'],
  terminals: [],
  operation: { switchState: 'open' }
};

describe('symbolGlyphSvg', () => {
  it('thickens strokes without lengthening terminal connection spans', () => {
    const scaled = symbolGlyphSvg(cb, 2);
    expect(scaled).toContain(`x1="-${SWITCH_TERMINAL_SPAN}"`);
    expect(scaled).toContain(`x2="${SWITCH_TERMINAL_SPAN}"`);
    expect(scaled).toContain('stroke-width="4"');
    expect(scaled).not.toContain('transform="scale');
  });
});
