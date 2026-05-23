import { busbar, conductor, createBaseDocument, symbol, type DrawingTemplate } from './factory';

export const meshCornerTemplates: DrawingTemplate[] = [
  {
    id: 'template-mesh-corner',
    name: 'Mesh corner arrangement',
    description: 'Four-corner mesh starter showing adjacent breakers and corner feeders.',
    category: 'template',
    tags: ['mesh', 'transmission', 'corner'],
    voltageLevels: [400],
    notes: 'Use this as a starting point for mesh protection and switching discussions.',
    create: () => createBaseDocument('template-mesh-corner', 'Mesh corner arrangement', {
      description: 'Four-corner mesh starter showing adjacent breakers and corner feeders.',
      tags: ['mesh', 'transmission', 'corner'],
      voltageLevels: [400],
      objects: {
        symbols: [
          symbol('mesh-src-a', 'source', 90, 120, '400kV SRC A', 400),
          symbol('mesh-cb-a', 'circuit-breaker', 210, 120, 'MESH CB A', 400, 0, { operation: { switchState: 'closed' } }),
          symbol('mesh-cb-b', 'circuit-breaker', 420, 120, 'MESH CB B', 400, 0, { operation: { switchState: 'closed' } }),
          symbol('mesh-cb-c', 'circuit-breaker', 420, 300, 'MESH CB C', 400, 90, { operation: { switchState: 'closed' } }),
          symbol('mesh-cb-d', 'circuit-breaker', 210, 300, 'MESH CB D', 400, 0, { operation: { switchState: 'closed' } }),
          symbol('mesh-load-a', 'load', 560, 120, 'LINE A', 400),
          symbol('mesh-load-b', 'load', 420, 420, 'LINE B', 400, 90)
        ],
        busbars: [
          busbar('mesh-top', [{ x: 130, y: 120 }, { x: 180, y: 120 }, { x: 240, y: 120 }, { x: 390, y: 120 }, { x: 450, y: 120 }, { x: 520, y: 120 }], 400),
          busbar('mesh-right', [{ x: 420, y: 150 }, { x: 420, y: 270 }, { x: 420, y: 360 }], 400),
          busbar('mesh-bottom', [{ x: 240, y: 300 }, { x: 390, y: 300 }], 400)
        ],
        conductors: [conductor('mesh-left-drop', [{ x: 240, y: 120 }, { x: 240, y: 300 }], 400)],
        labels: [],
        annotations: []
      }
    })
  }
];
