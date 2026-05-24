import type { Label } from '../drawing/model';
import { busbar, conductor, createBaseDocument, symbol, type DrawingTemplate } from './factory';

type BayKind = 'line' | 'transformer-hv';

const kindCode: Record<BayKind, number> = {
  line: 0,
  'transformer-hv': 1
};

function circuitNumber(kind: BayKind, ordinal: number, side: 'main-1' | 'main-2') {
  const base = side === 'main-1' ? ordinal * 2 - 1 : ordinal * 2;
  return `${base}${kindCode[kind]}`;
}

function label(id: string, x: number, y: number, text: string): Label {
  return { id, type: 'label', position: { x, y }, text };
}

function bay(prefix: string, x: number, side: 'main-1' | 'main-2', ordinal: number, kind: BayKind = 'line') {
  const number = circuitNumber(kind, ordinal, side);
  const name = kind === 'line' ? 'LINE' : 'TX HV';
  const loadType = kind === 'line' ? 'load' : 'transformer';
  const loadLabel = kind === 'line' ? `${number} OHL` : `${number} T1`;
  return {
    symbols: [
      symbol(`${prefix}-main-ds`, 'disconnector', x - 24, 142, `${number} MAIN DS`, 275, 90, { operation: { switchState: side === 'main-1' ? 'closed' : 'open' } }),
      symbol(`${prefix}-reserve-ds`, 'disconnector', x + 24, 232, `${number} RES DS`, 275, 90, { operation: { switchState: side === 'main-2' ? 'closed' : 'open' } }),
      symbol(`${prefix}-cb`, 'circuit-breaker', x, 324, `${number} CB`, 275, 90, { operation: { switchState: 'closed' } }),
      symbol(`${prefix}-ct`, 'ct', x, 384, `${number} CT`, 275, 90),
      symbol(`${prefix}-line-ds`, 'disconnector', x, 448, `${number} LINE DS`, 275, 90, { operation: { switchState: 'closed' } }),
      symbol(`${prefix}-line-es`, 'earth-switch', x, 512, `${number} ES`, 275, 90),
      symbol(`${prefix}-vt`, 'vt', x + 42, 534, `${number} VT`, 275),
      symbol(`${prefix}-end`, loadType, x, 604, `${loadLabel}`, kind === 'line' ? 275 : 132, 90)
    ],
    conductors: [
      conductor(`${prefix}-main-bus-to-ds`, [{ x: x - 24, y: 112 }, { x: x - 24, y: 122 }], 275),
      conductor(`${prefix}-main-ds-to-node`, [{ x: x - 24, y: 172 }, { x: x - 24, y: 270 }, { x, y: 270 }], 275),
      conductor(`${prefix}-reserve-bus-to-ds`, [{ x: x + 24, y: 202 }, { x: x + 24, y: 202 }], 275),
      conductor(`${prefix}-reserve-ds-to-node`, [{ x: x + 24, y: 262 }, { x: x + 24, y: 270 }, { x, y: 270 }], 275),
      conductor(`${prefix}-node-to-cb`, [{ x, y: 270 }, { x, y: 294 }], 275),
      conductor(`${prefix}-cb-to-ct`, [{ x, y: 354 }, { x, y: 364 }], 275),
      conductor(`${prefix}-ct-to-line-ds`, [{ x, y: 404 }, { x, y: 418 }], 275),
      conductor(`${prefix}-line-ds-to-es`, [{ x, y: 478 }, { x, y: 512 }], 275),
      conductor(`${prefix}-es-to-line`, [{ x, y: 512 }, { x, y: 564 }], 275),
      conductor(`${prefix}-vt-tap`, [{ x, y: 514 }, { x: x + 42, y: 514 }], 275)
    ],
    labels: [label(`${prefix}-circuit-label`, x - 22, 640, `${number} ${name}`)]
  };
}

function doubleBusTemplate(id: string, name: string, bayCount: number, includeCoupler = false, includeSection = false, notes?: string): DrawingTemplate {
  return {
    id,
    name,
    description: `${name} with correctly isolated main/reserve busbar selector disconnectors.`,
    category: 'template',
    tags: ['double-busbar', 'busbar', includeCoupler ? 'coupler' : 'bays', includeSection ? 'section' : ''],
    voltageLevels: [275, 132],
    notes,
    create: () => {
      const leftCount = includeSection ? Math.ceil(bayCount / 2) : bayCount;
      const rightCount = includeSection ? bayCount - leftCount : 0;
      const leftXs = Array.from({ length: leftCount }, (_, index) => 180 + index * 150);
      const rightXs = Array.from({ length: rightCount }, (_, index) => 560 + index * 150);
      const bayGroups = [
        ...leftXs.map((x, index) => bay(`${id}-bay-m1-${index + 1}`, x, 'main-1' as const, index + 1, index === leftXs.length - 1 ? 'transformer-hv' : 'line')),
        ...rightXs.map((x, index) => bay(`${id}-bay-m2-${index + 1}`, x, 'main-2' as const, index + 1, 'line'))
      ];
      const sectionX = 480;
      const main1Points = [130, ...leftXs.map((x) => x - 24), ...(includeSection ? [sectionX - 86] : [900])].sort((a, b) => a - b);
      const reserve1Points = [130, ...leftXs.map((x) => x + 24), ...(includeSection ? [sectionX - 86] : [900])].sort((a, b) => a - b);
      const main2Points = [sectionX + 86, ...rightXs.map((x) => x - 24), 900].sort((a, b) => a - b);
      const reserve2Points = [sectionX + 86, ...rightXs.map((x) => x + 24), 900].sort((a, b) => a - b);
      const symbols = [
        symbol(`${id}-src`, 'source', 70, 112, '275kV SRC', 275),
        ...bayGroups.flatMap((group) => group.symbols),
        ...(includeCoupler ? [
          symbol(`${id}-coupler-ds-main`, 'disconnector', sectionX + 260, 142, '03 MAIN DS', 275, 90, { operation: { switchState: 'closed' } }),
          symbol(`${id}-coupler-cb`, 'circuit-breaker', sectionX + 260, 188, '03 BC CB', 275, 90, { operation: { switchState: 'closed' } }),
          symbol(`${id}-coupler-ds-res`, 'disconnector', sectionX + 260, 232, '03 RES DS', 275, 90, { operation: { switchState: 'closed' } })
        ] : []),
        ...(includeSection ? [
          symbol(`${id}-main-section-ct-1`, 'ct', sectionX - 56, 112, '02 MAIN CT1', 275),
          symbol(`${id}-main-section-cb`, 'circuit-breaker', sectionX, 112, '02 MAIN SEC CB', 275, 0, { operation: { switchState: 'closed' } }),
          symbol(`${id}-main-section-ct-2`, 'ct', sectionX + 56, 112, '02 MAIN CT2', 275),
          symbol(`${id}-reserve-section-ct-1`, 'ct', sectionX - 56, 202, '02 RES CT1', 275),
          symbol(`${id}-reserve-section-cb`, 'circuit-breaker', sectionX, 202, '02 RES SEC CB', 275, 0, { operation: { switchState: 'closed' } }),
          symbol(`${id}-reserve-section-ct-2`, 'ct', sectionX + 56, 202, '02 RES CT2', 275)
        ] : [])
      ];
      const conductors = [
        conductor(`${id}-source-to-main`, [{ x: 110, y: 112 }, { x: 130, y: 112 }], 275),
        ...bayGroups.flatMap((group) => group.conductors),
        ...(includeCoupler ? [
          conductor(`${id}-coupler-main-feed`, [{ x: sectionX + 260, y: 112 }, { x: sectionX + 260, y: 112 }], 275),
          conductor(`${id}-coupler-main-ds-to-cb`, [{ x: sectionX + 260, y: 172 }, { x: sectionX + 260, y: 158 }], 275),
          conductor(`${id}-coupler-cb-to-res-ds`, [{ x: sectionX + 260, y: 218 }, { x: sectionX + 260, y: 202 }], 275)
        ] : [])
      ];
      const labels = [
        label(`${id}-main-1-label`, 122, 88, 'Main 1'),
        label(`${id}-reserve-1-label`, 122, 178, 'Reserve 1'),
        ...(includeSection ? [label(`${id}-main-2-label`, sectionX + 86, 88, 'Main 2'), label(`${id}-reserve-2-label`, sectionX + 86, 178, 'Reserve 2')] : []),
        ...bayGroups.flatMap((group) => group.labels)
      ];
      return createBaseDocument(id, name, {
        description: `${name} with correctly isolated main/reserve busbar selector disconnectors.`,
        tags: ['double-busbar', 'busbar'],
        voltageLevels: [275, 132],
        templateNotes: notes,
        objects: {
          symbols,
          busbars: [
            busbar(`${id}-main-bus-1`, main1Points.map((x) => ({ x, y: 112 })), 275),
            busbar(`${id}-reserve-bus-1`, reserve1Points.map((x) => ({ x, y: 202 })), 275),
            ...(includeSection ? [
              busbar(`${id}-main-bus-2`, main2Points.map((x) => ({ x, y: 112 })), 275),
              busbar(`${id}-reserve-bus-2`, reserve2Points.map((x) => ({ x, y: 202 })), 275)
            ] : [])
          ],
          conductors,
          labels,
          annotations: []
        }
      });
    }
  };
}

export const doubleBusbarTemplates: DrawingTemplate[] = [
  doubleBusTemplate('template-double-busbar-4-bays', 'Double busbar with 4 bays', 4, false, false, 'Selector disconnectors choose main or reserve busbar without bypassing switchgear.'),
  doubleBusTemplate('template-double-busbar-bus-coupler', 'Double busbar with bus coupler', 3, true, false, 'Includes a bus coupler path between main and reserve busbars.'),
  doubleBusTemplate('template-double-busbar-bus-section', 'Double busbar with bus section', 4, false, true, 'Labels Main 1/Reserve 1 and Main 2/Reserve 2 with section CTs on both sides.'),
  doubleBusTemplate('template-double-busbar-wraparound', 'Double busbar wraparound arrangement', 4, true, true, 'Starter wraparound arrangement with selector disconnectors, coupler, and sectioning switchgear.')
];
