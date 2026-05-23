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
          symbol('sbt-es1', 'earth-switch', 220, 170, 'T1 ES1', 132, 90),
          symbol('sbt-ds1', 'disconnector', 220, 220, 'T1 DS1', 132, 90, { operation: { switchState: 'closed' } }),
          symbol('sbt-cb', 'circuit-breaker', 220, 275, 'T1 CB', 132, 90, { operation: { switchState: 'closed' } }),
          symbol('sbt-hv-ct', 'ct', 220, 330, 'T1 HV CT', 132, 90),
          symbol('sbt-ds2', 'disconnector', 220, 385, 'T1 DS2', 132, 90, { operation: { switchState: 'closed' } }),
          symbol('sbt-es2', 'earth-switch', 220, 440, 'T1 ES2', 132, 90),
          symbol('sbt-tx', 'transformer', 220, 510, 'T1', 132, 90, { engineering: { tertiaryVoltageKv: 11, hasTertiary: true } }),
          symbol('sbt-lv-ct', 'ct', 220, 590, 'T1 LV CT', 33, 90, { engineering: { ctPolarity: 'P1-left' } }),
          symbol('sbt-lv-load', 'load', 220, 680, '33kV BUS', 33, 90)
        ],
        busbars: [busbar('sbt-main-bus', [{ x: 120, y: 120 }, { x: 360, y: 120 }], 132)],
        conductors: [
          conductor('sbt-incomer', [{ x: 120, y: 120 }, { x: 360, y: 120 }], 132),
          conductor('sbt-hv-drop', [{ x: 220, y: 120 }, { x: 220, y: 170 }, { x: 220, y: 190 }, { x: 220, y: 245 }, { x: 220, y: 305 }, { x: 220, y: 310 }, { x: 220, y: 350 }, { x: 220, y: 355 }, { x: 220, y: 415 }, { x: 220, y: 440 }, { x: 220, y: 470 }], 132),
          conductor('sbt-lv-side', [{ x: 220, y: 550 }, { x: 220, y: 570 }, { x: 220, y: 610 }, { x: 220, y: 640 }], 33)
        ],
        labels: [],
        annotations: []
      }
    })
  }
];
