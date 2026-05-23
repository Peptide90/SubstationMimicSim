import { describe, expect, it } from 'vitest';
import { computeEnergized } from './energize';
import type { MimicEdge, MimicNode } from './model';

describe('computeEnergized', () => {
  it('propagates along split busbar sections that share a busbar id', () => {
    const nodes: MimicNode[] = [
      { id: 'src', kind: 'source', sourceOn: true },
      { id: 'cb', kind: 'cb', state: 'closed' },
      { id: 'tap-a', kind: 'junction' },
      { id: 'tap-b', kind: 'junction' },
      { id: 'load', kind: 'junction' }
    ];
    const edges: MimicEdge[] = [
      { id: 'source-cb', source: 'src', target: 'cb', kind: 'busbar', busbarId: 'incoming' },
      { id: 'bus-a', source: 'cb', target: 'tap-a', kind: 'busbar', busbarId: 'main-bus' },
      { id: 'bus-b', source: 'tap-b', target: 'load', kind: 'busbar', busbarId: 'main-bus' }
    ];

    const energized = computeEnergized(nodes, edges);

    expect(energized.energizedEdgeIds.has('bus-a')).toBe(true);
    expect(energized.energizedEdgeIds.has('bus-b')).toBe(true);
    expect(energized.energizedNodeIds.has('load')).toBe(true);
  });
});
