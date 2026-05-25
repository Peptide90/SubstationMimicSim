import { busbar, conductor, createBaseDocument, fault, feederChain, hotJoint, protection, relay, symbol, type DrawingTemplate } from './factory';

export const teachingExamples: DrawingTemplate[] = [
  {
    id: 'example-normal-energisation',
    name: 'Example: normal energisation',
    description: 'Closed radial feeder with source power entered for immediate live tracing.',
    category: 'example',
    tags: ['energisation', 'normal'],
    voltageLevels: [132],
    create: () => {
      const chain = feederChain('ex-normal', 180, 80, 'NORM', 132, true);
      return createBaseDocument('example-normal-energisation', 'Example: normal energisation', { drawingType: 'example', tags: ['energisation'], voltageLevels: [132], objects: { symbols: chain.symbols, busbars: chain.busbars, conductors: [], labels: [], annotations: [] } });
    }
  },
  {
    id: 'example-source-single-busbar',
    name: 'Example: source feeding single busbar',
    description: 'A source feeding a single busbar and two outgoing loads.',
    category: 'example',
    tags: ['source', 'single-busbar'],
    voltageLevels: [132],
    create: () => createBaseDocument('example-source-single-busbar', 'Example: source feeding single busbar', {
      drawingType: 'example',
      tags: ['source', 'single-busbar'],
      voltageLevels: [132],
      objects: {
        symbols: [symbol('ex-sb-src', 'source', 80, 120, 'SRC', 132), symbol('ex-sb-load1', 'load', 280, 220, 'LOAD 1', 132, 90), symbol('ex-sb-load2', 'load', 420, 220, 'LOAD 2', 132, 90)],
        busbars: [
          busbar('ex-sb-bus', [{ x: 120, y: 120 }, { x: 500, y: 120 }], 132),
          busbar('ex-sb-l1', [{ x: 280, y: 120 }, { x: 280, y: 180 }], 132),
          busbar('ex-sb-l2', [{ x: 420, y: 120 }, { x: 420, y: 180 }], 132)
        ],
        conductors: [],
        labels: [],
        annotations: []
      }
    })
  },
  {
    id: 'example-bus-coupler-operation',
    name: 'Example: bus coupler operation',
    description: 'Two busbars with a closed coupler path.',
    category: 'example',
    tags: ['bus-coupler', 'operation'],
    voltageLevels: [275],
    create: () => createBaseDocument('example-bus-coupler-operation', 'Example: bus coupler operation', {
      drawingType: 'example',
      tags: ['bus-coupler', 'operation'],
      voltageLevels: [275],
      objects: {
        symbols: [
          symbol('ex-bc-src', 'source', 80, 110, 'SRC', 275),
          symbol('ex-bc-ds1', 'disconnector', 340, 140, 'BC DS1', 275, 90, { operation: { switchState: 'closed' } }),
          symbol('ex-bc-cb', 'circuit-breaker', 340, 240, 'BC CB', 275, 90, { operation: { switchState: 'closed' } }),
          symbol('ex-bc-ds2', 'disconnector', 340, 340, 'BC DS2', 275, 90, { operation: { switchState: 'closed' } })
        ],
        busbars: [
          busbar('ex-bc-main', [{ x: 120, y: 110 }, { x: 560, y: 110 }], 275),
          busbar('ex-bc-reserve', [{ x: 120, y: 370 }, { x: 560, y: 370 }], 275),
          busbar('ex-bc-ds1-to-cb', [{ x: 340, y: 170 }, { x: 340, y: 210 }], 275),
          busbar('ex-bc-cb-to-ds2', [{ x: 340, y: 270 }, { x: 340, y: 310 }], 275)
        ],
        conductors: [],
        labels: [],
        annotations: []
      }
    })
  },
  {
    id: 'example-transformer-lv-busbar',
    name: 'Example: transformer feeding LV busbar',
    description: 'HV source through transformer into an LV busbar.',
    category: 'example',
    tags: ['transformer', 'lv-busbar'],
    voltageLevels: [132, 33],
    create: () => createBaseDocument('example-transformer-lv-busbar', 'Example: transformer feeding LV busbar', {
      drawingType: 'example',
      tags: ['transformer', 'lv'],
      voltageLevels: [132, 33],
      objects: {
        symbols: [symbol('ex-tx-src', 'source', 80, 140, '132kV SRC', 132), symbol('ex-tx-cb', 'circuit-breaker', 200, 140, 'HV CB', 132, 0, { operation: { switchState: 'closed' } }), symbol('ex-tx', 'transformer', 310, 140, 'T1', 132), symbol('ex-tx-load', 'load', 500, 140, '33kV LOAD', 33)],
        busbars: [busbar('ex-tx-lv-bus', [{ x: 350, y: 140 }, { x: 460, y: 140 }], 33)],
        conductors: [conductor('ex-tx-hv', [{ x: 120, y: 140 }, { x: 170, y: 140 }, { x: 230, y: 140 }, { x: 270, y: 140 }], 132)],
        labels: [],
        annotations: []
      }
    })
  },
  {
    id: 'example-phase-specific-vt-ct',
    name: 'Example: phase-specific VT/CT',
    description: 'Three-phase drawing with a phase-B VT and phase-A CT.',
    category: 'example',
    tags: ['phase-specific', 'measurement'],
    voltageLevels: [132],
    create: () => {
      const chain = feederChain('ex-phase', 180, 80, 'PH', 132, true);
      chain.symbols.push(symbol('ex-phase-vt-b', 'vt', 260, 200, 'VT-B', 132, 0, { phaseApplicability: ['B'] }));
      return createBaseDocument('example-phase-specific-vt-ct', 'Example: phase-specific VT/CT', { drawingType: 'example', activeView: 'three-phase', tags: ['phase-specific', 'measurement'], voltageLevels: [132], objects: { symbols: chain.symbols, busbars: chain.busbars, conductors: [], labels: [], annotations: [] } });
    }
  },
  ...(['A-E', 'A-B'] as const).map((faultType) => ({
    id: `example-${faultType === 'A-E' ? 'phase-earth' : 'phase-phase'}-fault`,
    name: `Example: ${faultType === 'A-E' ? 'phase-to-earth fault' : 'phase-to-phase fault'}`,
    description: `Radial feeder with an active ${faultType} fault on the busbar.`,
    category: 'example' as const,
    tags: ['fault', faultType],
    voltageLevels: [132],
    create: () => {
      const chain = feederChain(`ex-${faultType.toLowerCase()}`, 180, 80, 'FLT', 132, true);
      return createBaseDocument(`example-${faultType === 'A-E' ? 'phase-earth' : 'phase-phase'}-fault`, `Example: ${faultType} fault`, { drawingType: 'example', tags: ['fault'], voltageLevels: [132], objects: { symbols: chain.symbols, busbars: chain.busbars, conductors: [], labels: [], annotations: [] }, faults: [fault('ex-fault-1', chain.busbars[0].id, faultType, { x: 260, y: 180 })] });
    }
  })),
  {
    id: 'example-hot-joint-thermal',
    name: 'Example: hot joint / thermal diagnostic',
    description: 'Radial feeder with an active hot joint on phase B.',
    category: 'example',
    tags: ['thermal', 'hot-joint'],
    voltageLevels: [132],
    create: () => {
      const chain = feederChain('ex-hot', 180, 80, 'HOT', 132, true);
      return createBaseDocument('example-hot-joint-thermal', 'Example: hot joint / thermal diagnostic', { drawingType: 'example', tags: ['thermal'], voltageLevels: [132], objects: { symbols: chain.symbols, busbars: chain.busbars, conductors: [], labels: [], annotations: [] }, hotJoints: [hotJoint('ex-hot-joint-1', chain.busbars[0].id)] });
    }
  },
  ...(['overcurrent', 'earth-fault'] as const).map((relayType) => ({
    id: `example-${relayType}-trip`,
    name: `Example: ${relayType === 'overcurrent' ? 'overcurrent trip' : 'earth fault trip'}`,
    description: `Protection zone and ${relayType} relay configured to trip the feeder breaker.`,
    category: 'example' as const,
    tags: ['protection', relayType],
    voltageLevels: [132],
    create: () => {
      const chain = feederChain(`ex-${relayType}`, 180, 80, 'PROT', 132, true);
      const assigned = chain.symbols.map((item) => item.id).concat(chain.busbars.map((item) => item.id));
      const zoneId = `ex-${relayType}-zone`;
      return createBaseDocument(`example-${relayType}-trip`, `Example: ${relayType} trip`, {
        drawingType: 'example',
        tags: ['protection'],
        voltageLevels: [132],
        objects: { symbols: chain.symbols, busbars: chain.busbars, conductors: [], labels: [], annotations: [] },
        protectionZones: [{ id: zoneId, name: 'Feeder protection zone', assignedObjectIds: assigned, ctInputIds: [`ex-${relayType}-ct`], vtInputIds: [], vertices: [{ x: 120, y: 130 }, { x: 330, y: 130 }, { x: 330, y: 230 }, { x: 120, y: 230 }], color: '#22c55e', visible: true }],
        relays: [relay(`ex-${relayType}-relay`, relayType === 'overcurrent' ? 'OC Relay' : 'EF Relay', relayType, zoneId, `ex-${relayType}-cb`)],
        protection: [protection(`ex-${relayType}-element`, relayType, chain.busbars[0].id, `ex-${relayType}-cb`)]
      });
    }
  })),
  {
    id: 'example-breaker-fail-backup',
    name: 'Example: breaker fail / backup trip',
    description: 'Relay configuration includes breaker fail and backup target metadata.',
    category: 'example',
    tags: ['protection', 'breaker-fail'],
    voltageLevels: [132],
    create: () => {
      const chain = feederChain('ex-bf', 180, 80, 'BF', 132, true);
      const backup = symbol('ex-bf-backup-cb', 'circuit-breaker', 20, 180, 'BACKUP CB', 132, 0, { operation: { switchState: 'closed' } });
      const zoneId = 'ex-bf-zone';
      return createBaseDocument('example-breaker-fail-backup', 'Example: breaker fail / backup trip', {
        drawingType: 'example',
        tags: ['protection', 'breaker-fail'],
        voltageLevels: [132],
        objects: { symbols: [backup, ...chain.symbols], busbars: chain.busbars, conductors: [], labels: [], annotations: [] },
        protectionZones: [{ id: zoneId, name: 'Breaker fail zone', assignedObjectIds: chain.symbols.map((item) => item.id), ctInputIds: ['ex-bf-ct'], vtInputIds: [], vertices: [{ x: 80, y: 130 }, { x: 360, y: 130 }, { x: 360, y: 230 }, { x: 80, y: 230 }], color: '#ef4444', visible: true }],
        relays: [{ ...relay('ex-bf-relay', 'BF Relay', 'overcurrent', zoneId, 'ex-bf-cb'), backupTripTargetBreakerIds: ['ex-bf-backup-cb'], breakerFailEnabled: true }]
      });
    }
  }
];
