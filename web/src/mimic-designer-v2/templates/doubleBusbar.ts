import { busbar, conductor, createBaseDocument, symbol, type DrawingTemplate } from './factory';

function doubleBusTemplate(id: string, name: string, bayCount: number, includeCoupler = false, includeSection = false, notes?: string): DrawingTemplate {
  return {
    id,
    name,
    description: `${name} with selectable main/reserve busbar connections.`,
    category: 'template',
    tags: ['double-busbar', 'busbar', includeCoupler ? 'coupler' : 'bays', includeSection ? 'section' : ''],
    voltageLevels: [275, 132],
    notes,
    create: () => {
      const symbols = [
        symbol(`${id}-src`, 'source', 80, 110, '275kV SRC', 275),
        ...Array.from({ length: bayCount }, (_, index) => {
          const x = 180 + index * 120;
          return [
            symbol(`${id}-bay-${index + 1}-ds-a`, 'disconnector', x, 160, `B${index + 1} MAIN DS`, 275, 90, { operation: { switchState: 'closed' } }),
            symbol(`${id}-bay-${index + 1}-ds-b`, 'disconnector', x + 34, 250, `B${index + 1} RES DS`, 275, 90),
            symbol(`${id}-bay-${index + 1}-cb`, 'circuit-breaker', x, 300, `B${index + 1} CB`, 275, 90, { operation: { switchState: 'closed' } }),
            symbol(`${id}-bay-${index + 1}-load`, 'load', x, 390, `B${index + 1} FEEDER`, 132, 90)
          ];
        }).flat(),
        ...(includeCoupler ? [
          symbol(`${id}-coupler-ds1`, 'disconnector', 650, 160, 'BC DS1', 275, 90, { operation: { switchState: 'closed' } }),
          symbol(`${id}-coupler-cb`, 'circuit-breaker', 650, 230, 'BC CB', 275, 90, { operation: { switchState: 'closed' } }),
          symbol(`${id}-coupler-ds2`, 'disconnector', 650, 300, 'BC DS2', 275, 90, { operation: { switchState: 'closed' } })
        ] : []),
        ...(includeSection ? [
          symbol(`${id}-section-ct-a-left`, 'ct', 360, 110, 'MAIN CT L', 275, 0, { engineering: { ctPolarity: 'P1-left' } }),
          symbol(`${id}-section-cb-a`, 'circuit-breaker', 420, 110, 'MAIN SECTION CB', 275, 0, { operation: { switchState: 'closed' } }),
          symbol(`${id}-section-ct-a-right`, 'ct', 480, 110, 'MAIN CT R', 275, 0, { engineering: { ctPolarity: 'P1-right' } }),
          symbol(`${id}-section-ct-b-left`, 'ct', 360, 220, 'RES CT L', 275, 0, { engineering: { ctPolarity: 'P1-left' } }),
          symbol(`${id}-section-cb-b`, 'circuit-breaker', 420, 220, 'RES SECTION CB', 275, 0, { operation: { switchState: 'closed' } }),
          symbol(`${id}-section-ct-b-right`, 'ct', 480, 220, 'RES CT R', 275, 0, { engineering: { ctPolarity: 'P1-right' } })
        ] : [])
      ];
      const conductors = [
        conductor(`${id}-incoming`, [{ x: 120, y: 110 }, { x: 720, y: 110 }], 275),
        ...Array.from({ length: bayCount }, (_, index) => {
          const x = 180 + index * 120;
          return [
            conductor(`${id}-bay-${index + 1}-main-drop`, [{ x, y: 110 }, { x, y: 130 }, { x, y: 190 }, { x, y: 270 }, { x, y: 350 }], 275),
            conductor(`${id}-bay-${index + 1}-res-drop`, [{ x: x + 34, y: 220 }, { x: x + 34, y: 280 }, { x, y: 270 }], 275)
          ];
        }).flat(),
        ...(includeCoupler ? [conductor(`${id}-coupler-link`, [{ x: 650, y: 110 }, { x: 650, y: 130 }, { x: 650, y: 200 }, { x: 650, y: 270 }, { x: 650, y: 330 }, { x: 650, y: 220 }], 275)] : [])
      ];
      return createBaseDocument(id, name, {
        description: `${name} with selectable main/reserve busbar connections.`,
        tags: ['double-busbar', 'busbar'],
        voltageLevels: [275, 132],
        templateNotes: notes,
        objects: {
          symbols,
          busbars: [
            busbar(`${id}-main-bus`, includeSection ? [{ x: 120, y: 110 }, { x: 340, y: 110 }, { x: 380, y: 110 }, { x: 390, y: 110 }, { x: 450, y: 110 }, { x: 460, y: 110 }, { x: 500, y: 110 }, { x: 720, y: 110 }] : [{ x: 120, y: 110 }, { x: 720, y: 110 }], 275),
            busbar(`${id}-reserve-bus`, includeSection ? [{ x: 120, y: 220 }, { x: 340, y: 220 }, { x: 380, y: 220 }, { x: 390, y: 220 }, { x: 450, y: 220 }, { x: 460, y: 220 }, { x: 500, y: 220 }, { x: 720, y: 220 }] : [{ x: 120, y: 220 }, { x: 720, y: 220 }], 275)
          ],
          conductors,
          labels: [],
          annotations: []
        }
      });
    }
  };
}

export const doubleBusbarTemplates: DrawingTemplate[] = [
  doubleBusTemplate('template-double-busbar-4-bays', 'Double busbar with 4 bays', 4, false, false, 'Main and reserve busbar selection for four feeders.'),
  doubleBusTemplate('template-double-busbar-bus-coupler', 'Double busbar with bus coupler', 3, true, false, 'Includes a coupler path between main and reserve busbars.'),
  doubleBusTemplate('template-double-busbar-bus-section', 'Double busbar with bus section', 4, false, true, 'Shows bus section breakers on both busbars.'),
  doubleBusTemplate('template-double-busbar-wraparound', 'Double busbar wraparound arrangement', 4, true, true, 'Starter wraparound arrangement with coupler and sectioning switchgear.')
];
