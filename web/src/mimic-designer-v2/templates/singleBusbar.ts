import { busbar, conductor, createBaseDocument, feederChain, symbol, type DrawingTemplate } from './factory';

export const singleBusbarTemplates: DrawingTemplate[] = [
  {
    id: 'template-simple-radial-feeder',
    name: 'Simple radial feeder',
    description: 'Source, disconnectors, breaker, CT and load in a topology-valid radial feeder.',
    category: 'template',
    tags: ['radial', 'feeder', 'starter'],
    voltageLevels: [132],
    notes: 'A compact starter drawing for checking source to load energisation through a closed breaker.',
    create: () => {
      const chain = feederChain('radial', 180, 80, 'F1', 132, true);
      return createBaseDocument('template-simple-radial-feeder', 'Simple radial feeder', {
        description: 'Source, disconnectors, breaker, CT and load in a topology-valid radial feeder.',
        tags: ['radial', 'feeder', 'starter'],
        voltageLevels: [132],
        templateNotes: 'Operate the circuit breaker or disconnectors to see live colour stop and restart.',
        objects: { symbols: chain.symbols, busbars: chain.busbars, conductors: [], labels: [], annotations: [] }
      });
    }
  },
  {
    id: 'template-single-busbar-3-feeders',
    name: 'Single busbar with 3 feeder bays',
    description: 'One main busbar with three outgoing breaker/CT/load bays and an incomer.',
    category: 'template',
    tags: ['single-busbar', 'feeders', 'distribution'],
    voltageLevels: [132],
    create: () => {
      const symbols = [
        symbol('sb-src', 'source', 80, 120, '132kV INCOMER', 132),
        symbol('sb-vt', 'vt', 260, 100, 'VT1', 132),
        ...[0, 1, 2].flatMap((index) => {
          const x = 180 + index * 150;
          return [
            symbol(`sb-bay-${index + 1}-ds`, 'disconnector', x, 190, `F${index + 1} DS`, 132, 90, { operation: { switchState: 'closed' } }),
            symbol(`sb-bay-${index + 1}-cb`, 'circuit-breaker', x, 255, `F${index + 1} CB`, 132, 90, { operation: { switchState: 'closed' } }),
            symbol(`sb-bay-${index + 1}-ct`, 'ct', x, 310, `F${index + 1} CT`, 132, 90),
            symbol(`sb-bay-${index + 1}-load`, 'load', x, 380, `F${index + 1} LOAD`, 132, 90)
          ];
        })
      ];
      const conductors = [
        conductor('sb-incomer', [{ x: 120, y: 120 }, { x: 560, y: 120 }], 132),
        conductor('sb-vt-tap', [{ x: 260, y: 120 }, { x: 260, y: 120 }], 132),
        ...[0, 1, 2].flatMap((index) => {
          const x = 180 + index * 150;
          return [
            conductor(`sb-bay-${index + 1}-drop`, [{ x, y: 120 }, { x, y: 160 }, { x, y: 220 }, { x, y: 285 }, { x, y: 340 }], 132)
          ];
        })
      ];
      return createBaseDocument('template-single-busbar-3-feeders', 'Single busbar with 3 feeder bays', {
        description: 'One main busbar with three outgoing breaker/CT/load bays and an incomer.',
        tags: ['single-busbar', 'feeders', 'distribution'],
        voltageLevels: [132],
        objects: { symbols, busbars: [busbar('sb-main-bus', [{ x: 120, y: 120 }, { x: 560, y: 120 }], 132)], conductors, labels: [], annotations: [] }
      });
    }
  },
  {
    id: 'template-single-busbar-transformer-bay',
    name: 'Single busbar with transformer bay',
    description: 'A single busbar feeding a transformer bay through switchgear and metering.',
    category: 'template',
    tags: ['single-busbar', 'transformer', 'hv-lv'],
    voltageLevels: [132, 33],
    create: () => createBaseDocument('template-single-busbar-transformer-bay', 'Single busbar with transformer bay', {
      description: 'A single busbar feeding a transformer bay through switchgear and metering.',
      tags: ['single-busbar', 'transformer'],
      voltageLevels: [132, 33],
      objects: {
        symbols: [
          symbol('sbt-src', 'source', 80, 120, '132kV SRC', 132),
          symbol('sbt-ds', 'disconnector', 220, 190, 'T1 DS', 132, 90, { operation: { switchState: 'closed' } }),
          symbol('sbt-cb', 'circuit-breaker', 220, 255, 'T1 CB', 132, 90, { operation: { switchState: 'closed' } }),
          symbol('sbt-ct', 'ct', 220, 310, 'T1 CT', 132, 90),
          symbol('sbt-tx', 'transformer', 220, 390, 'T1', 132, 90, { engineering: { tertiaryVoltageKv: 11, hasTertiary: true } }),
          symbol('sbt-lv-load', 'load', 220, 500, '33kV BUS', 33, 90)
        ],
        busbars: [busbar('sbt-main-bus', [{ x: 120, y: 120 }, { x: 360, y: 120 }], 132)],
        conductors: [conductor('sbt-incomer', [{ x: 120, y: 120 }, { x: 360, y: 120 }], 132), conductor('sbt-drop', [{ x: 220, y: 120 }, { x: 220, y: 160 }, { x: 220, y: 220 }, { x: 220, y: 285 }, { x: 220, y: 350 }, { x: 220, y: 460 }], 132)],
        labels: [],
        annotations: []
      }
    })
  }
];
