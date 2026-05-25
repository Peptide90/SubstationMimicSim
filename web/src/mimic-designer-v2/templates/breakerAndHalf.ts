import { busbar, conductor, createBaseDocument, symbol, type DrawingTemplate } from './factory';

export const breakerAndHalfTemplates: DrawingTemplate[] = [
  {
    id: 'template-breaker-and-half-starter',
    name: 'Breaker-and-a-half starter arrangement',
    description: 'Two circuits sharing a middle breaker between two busbars.',
    category: 'template',
    tags: ['breaker-and-a-half', 'transmission', 'busbar'],
    voltageLevels: [400],
    notes: 'Starter arrangement for future bay ownership, interlocking, and busbar protection work.',
    create: () => {
      const symbols = [
        symbol('bah-src', 'source', 70, 100, '400kV SRC', 400),
        symbol('bah-cb-a', 'circuit-breaker', 220, 165, 'CB A', 400, 90, { operation: { switchState: 'closed' } }),
        symbol('bah-cb-mid', 'circuit-breaker', 320, 235, 'CB MID', 400, 90, { operation: { switchState: 'closed' } }),
        symbol('bah-cb-b', 'circuit-breaker', 420, 165, 'CB B', 400, 90, { operation: { switchState: 'closed' } }),
        symbol('bah-ct-a', 'ct', 220, 310, 'CCT A CT', 400, 90),
        symbol('bah-ct-b', 'ct', 420, 310, 'CCT B CT', 400, 90),
        symbol('bah-line-a', 'load', 220, 390, 'LINE A', 400, 90),
        symbol('bah-line-b', 'load', 420, 390, 'LINE B', 400, 90)
      ];
      return createBaseDocument('template-breaker-and-half-starter', 'Breaker-and-a-half starter arrangement', {
        description: 'Two circuits sharing a middle breaker between two busbars.',
        tags: ['breaker-and-a-half', 'transmission'],
        voltageLevels: [400],
        objects: {
          symbols,
          busbars: [busbar('bah-bus-a', [{ x: 110, y: 100 }, { x: 540, y: 100 }], 400), busbar('bah-bus-b', [{ x: 110, y: 250 }, { x: 540, y: 250 }], 400)],
          conductors: [
            conductor('bah-incomer', [{ x: 110, y: 100 }, { x: 540, y: 100 }], 400),
            conductor('bah-string-a', [{ x: 220, y: 100 }, { x: 220, y: 135 }, { x: 220, y: 195 }, { x: 320, y: 205 }, { x: 320, y: 265 }, { x: 220, y: 280 }, { x: 220, y: 350 }], 400),
            conductor('bah-string-b', [{ x: 420, y: 100 }, { x: 420, y: 135 }, { x: 420, y: 195 }, { x: 320, y: 205 }, { x: 320, y: 265 }, { x: 420, y: 280 }, { x: 420, y: 350 }], 400)
          ],
          labels: [],
          annotations: []
        }
      });
    }
  }
];
