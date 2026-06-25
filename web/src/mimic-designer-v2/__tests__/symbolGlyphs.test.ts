import { describe, expect, it } from 'vitest';
import { SWITCH_TERMINAL_SPAN } from '../symbols/library';
import { symbolGlyphSvg } from '../rendering/symbolGlyphs';
import type { ElectricalSymbol } from '../drawing/model';

const cb = (patch: Partial<ElectricalSymbol> = {}): ElectricalSymbol => ({
  id: 'cb-1',
  type: 'circuit-breaker',
  position: { x: 0, y: 0 },
  rotation: 0,
  phaseApplicability: ['A', 'B', 'C'],
  terminals: [],
  operation: { switchState: 'open' },
  ...patch
});

describe('symbolGlyphSvg', () => {
  it('thickens strokes without lengthening terminal connection spans', () => {
    const scaled = symbolGlyphSvg(cb(), 2);
    expect(scaled).toContain(`x1="-${SWITCH_TERMINAL_SPAN}"`);
    expect(scaled).toContain(`x2="${SWITCH_TERMINAL_SPAN}"`);
    expect(scaled).toContain('stroke-width="4"');
    expect(scaled).not.toContain('transform="scale');
  });

  it('colors open breakers red and live closed breakers green', () => {
    const openSvg = symbolGlyphSvg(cb(), 1, 'open');
    const liveSvg = symbolGlyphSvg(cb({ operation: { switchState: 'closed' } }), 1, 'closed-live');
    expect(openSvg).toContain('fill="#dc2626"');
    expect(liveSvg).toContain('fill="#16a34a"');
  });

  it('colors disconnector blades red when open and green when live', () => {
    const disconnector: ElectricalSymbol = {
      ...cb({ id: 'ds-1', type: 'disconnector' }),
      operation: { switchState: 'open' }
    };
    const openSvg = symbolGlyphSvg(disconnector, 1, 'open');
    const liveSvg = symbolGlyphSvg({ ...disconnector, operation: { switchState: 'closed' } }, 1, 'closed-live');
    expect(openSvg).toContain('stroke="#dc2626"');
    expect(liveSvg).toContain('stroke="#16a34a"');
  });
});
