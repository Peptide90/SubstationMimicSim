import type { ConductorPath, DrawingDocument, ScenarioDefinition, ScenarioRestrictions } from '../drawing/model';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { templateLibrary } from '../templates';
import { createBaseDocument, fault } from '../templates/factory';
import { buildRun, link, type RunResult } from './exerciseLayout';
import { createScenarioFromDrawing, makeScenarioEvent, type ScenarioPackage } from './packageScenario';

/**
 * The Builder Challenges content, re-authored for the V2 engine.
 *
 * Each exercise keeps its legacy id in `legacyId` and is built from a *solved*
 * layout: the starting drawing is the solved one with the learner's work taken
 * away. That keeps fixtures and solution geometrically identical, and lets the
 * tests prove every exercise can actually be completed.
 *
 * Deliberate departures from the legacy content are noted inline.
 */

export interface PortedExercise {
  legacyId: string;
  build: () => ScenarioPackage;
  /** The drawing a correct learner ends up with. Build exercises only. */
  solvedDrawing?: () => DrawingDocument;
}

const drawing = (id: string, name: string, runs: Array<Pick<RunResult, 'symbols' | 'conductors'>>, extra: ConductorPath[] = []): DrawingDocument =>
  migrateDrawingDocument(createBaseDocument(id, name, {
    objects: { symbols: runs.flatMap((run) => run.symbols), conductors: [...runs.flatMap((run) => run.conductors), ...extra], busbars: [], labels: [], annotations: [] }
  }))!;

/** The starting drawing: only the fixtures survive, plus any fixture conductors. */
const fixturesOnly = (solved: DrawingDocument, fixtureIds: string[], fixtureConductorIds: string[] = []): DrawingDocument => ({
  ...solved,
  objects: {
    ...solved.objects,
    symbols: solved.objects.symbols.filter((symbol) => fixtureIds.includes(symbol.id)),
    conductors: solved.objects.conductors.filter((path) => fixtureConductorIds.includes(path.id)),
    busbars: []
  }
});

const buildRestrictions = (fixtures: string[], allowed: ScenarioRestrictions['allowedComponentTypes']): ScenarioRestrictions => ({
  disableDrawingTools: false,
  disablePlacement: false,
  disableDelete: false,
  disableInspectorEditing: true,
  allowedComponentTypes: allowed,
  lockedObjectIds: fixtures
});

const operateOnly: ScenarioRestrictions = { disableDrawingTools: true, disablePlacement: true, disableDelete: true, disableInspectorEditing: true };

const packageFor = (doc: DrawingDocument, scenario: Partial<ScenarioDefinition> & { id: string; name: string }): ScenarioPackage =>
  createScenarioFromDrawing({ ...doc, name: scenario.name }, { successRules: {}, ...scenario });

// ---------------------------------------------------------------------------
// Tutorial 1 — Connect the line (legacy "tutorial-1")
// ---------------------------------------------------------------------------

const lineSolved = () => drawing('ported-connect-line', 'Connect the line', [buildRun('cl', { x: 80, y: 220 }, [
  { kind: 'device', id: 'cl-source', type: 'source', label: 'GRID' },
  { kind: 'device', id: 'cl-ds1', type: 'disconnector', label: 'DS1' },
  { kind: 'device', id: 'cl-cb', type: 'circuit-breaker', label: 'CB' },
  { kind: 'device', id: 'cl-ds2', type: 'disconnector', label: 'DS2' },
  { kind: 'device', id: 'cl-load', type: 'load', label: 'LINE' }
])]);

const connectLine: PortedExercise = {
  legacyId: 'tutorial-1',
  solvedDrawing: lineSolved,
  build: () => packageFor(fixturesOnly(lineSolved(), ['cl-source', 'cl-load']), {
    id: 'built-in-ported-connect-the-line',
    name: 'Build: connect the line',
    description: 'Build the simplest bay there is — disconnector, breaker, disconnector — between the grid and a line.',
    mode: 'lesson',
    difficulty: 'intro',
    tags: ['build', 'bay-layout'],
    minTier: 'Apprentice',
    recommendedTier: 'Apprentice',
    learningObjectives: [
      'Know why a bay has a disconnector on each side of its breaker.',
      'Wire equipment so that the grid connects to the line.',
      'Energise the line by closing disconnectors before the breaker.'
    ],
    explanationVariants: {
      Apprentice: 'The breaker makes and breaks current. The disconnectors either side give a visible gap so the breaker can be worked on safely.',
      Engineer: 'DS-CB-DS lets the breaker be isolated from both the busbar and the line, so it can be maintained while both remain energised.'
    },
    restrictions: buildRestrictions(['cl-source', 'cl-load'], ['disconnector', 'circuit-breaker']),
    objectives: [
      { id: 'place-ds', text: 'Place two disconnectors', type: 'include-component', componentTypes: ['disconnector'], count: 2, hint: 'One disconnector on each side of the breaker.' },
      { id: 'place-cb', text: 'Place a circuit breaker', type: 'include-component', componentTypes: ['circuit-breaker'], count: 1, hint: 'The breaker sits between the two disconnectors.' },
      { id: 'connect', text: 'Connect the grid to the line', type: 'connect-between', targetObjectId: 'cl-source', secondaryObjectId: 'cl-load', requires: ['place-ds', 'place-cb'], hint: 'Draw conductors from the grid, through each device, to the line.' },
      { id: 'energise', text: 'Energise the line', type: 'restore-supply-to-load', targetObjectId: 'cl-load', targetState: 'live', requires: ['connect'], latch: true, hint: 'Close both disconnectors first, then the breaker.' }
    ],
    teachingSteps: [
      { id: 's1', title: 'Place the switchgear', body: 'Place a disconnector, a circuit breaker, then a second disconnector between the grid and the line.', waitFor: 'objective-complete', objectiveId: 'place-cb' },
      { id: 's2', title: 'Wire the bay', body: 'Draw conductors joining the grid, DS1, the breaker, DS2 and the line.', waitFor: 'objective-complete', objectiveId: 'connect' },
      { id: 's3', title: 'Energise', body: 'Close both disconnectors while no current can flow, then close the breaker to make the circuit.', waitFor: 'objective-complete', objectiveId: 'energise' }
    ]
  })
};

// ---------------------------------------------------------------------------
// Tutorial 3 — Isolate then earth (legacy "tutorial-3")
//
// Departure: the legacy tutorial earthed *both* sides of the bay, including the
// side still connected to the source. The V2 engine — correctly — arcs that
// earth. This version isolates the line and earths it on the line side only.
// ---------------------------------------------------------------------------

const radial = () => migrateDrawingDocument(templateLibrary.find((template) => template.id === 'template-simple-radial-feeder')!.create())!;

const isolateThenEarth: PortedExercise = {
  legacyId: 'tutorial-3',
  build: () => packageFor(radial(), {
    id: 'built-in-ported-isolate-then-earth',
    name: 'Switching programme: isolate then earth',
    description: 'Control has issued a switching instruction sheet. Carry out each line in order, lock and caution the points of isolation, earth the line, and read back the line-end colours.',
    mode: 'lesson',
    difficulty: 'standard',
    tags: ['switching-programme', 'isolation', 'earthing'],
    minTier: 'Apprentice',
    recommendedTier: 'Apprentice',
    learningObjectives: [
      'Work a switching instruction sheet strictly in order.',
      'Lock and caution disconnectors as points of isolation.',
      'Earth only equipment that is proven isolated.',
      'Read back line-end colours to prove you are on the right circuit.'
    ],
    explanationVariants: {
      Apprentice: 'Isolation makes it impossible for the line to be re-energised; earthing makes it safe if it somehow is. You need both, in that order.',
      Engineer: 'Points of isolation are secured before earths are applied, and earths are applied only on the dead side of the isolation boundary.'
    },
    restrictions: operateOnly,
    switchingSheets: [{
      id: 'sheet-isolate-f1',
      title: 'F1 line — isolate and earth',
      lineEndColours: { 'radial-load': ['red', 'yellow', 'blue'] },
      instructions: [
        { id: 'l1', verb: 'open', targetObjectId: 'radial-cb', notes: 'Interrupt load current with the breaker first.' },
        { id: 'l2', verb: 'open-lock-caution', targetObjectId: 'radial-ds2', notes: 'Line-side point of isolation.' },
        { id: 'l3', verb: 'open-lock-caution', targetObjectId: 'radial-ds1', notes: 'Source-side point of isolation.' },
        { id: 'l4', verb: 'close-earth-lock', targetObjectId: 'radial-es2', notes: 'Earth the line side. ES1 is on the live source side: do not close it.' },
        { id: 'l5', verb: 'check-open-lock-caution', targetObjectId: 'radial-ds2', notes: 'Read the line-end colours and report them to control.', report: { kind: 'line-end-colours', targetObjectId: 'radial-load' } }
      ]
    }],
    objectives: [
      { id: 'tags', text: 'Lock and caution both disconnectors', type: 'tag-isolation', componentTypes: ['disconnector'], count: 2, hint: 'Open each disconnector, then apply a point of isolation.' },
      { id: 'isolated', text: 'Isolate and earth the line', type: 'isolate-target', targetObjectId: 'radial-load', targetState: 'isolated', hint: 'Close and lock ES2 once both disconnectors are locked open.' },
      { id: 'sheet', text: 'Complete the switching sheet', type: 'complete-switching-sheet', sheetId: 'sheet-isolate-f1', hint: 'The last line asks you to read back the line-end colours.' }
    ],
    teachingSteps: [
      { id: 's1', title: 'Secure the isolation', body: 'Open the breaker, then open and lock each disconnector in the order the sheet gives.', waitFor: 'objective-complete', objectiveId: 'tags' },
      { id: 's2', title: 'Apply the earth', body: 'Close and lock ES2. It is on the line side of DS2, so it is dead. ES1 is on the source side and still live.', waitFor: 'objective-complete', objectiveId: 'isolated' },
      { id: 's3', title: 'Report to control', body: 'Read the colours at the line end and report them to complete the sheet.', waitFor: 'objective-complete', objectiveId: 'sheet' }
    ]
  })
};

// ---------------------------------------------------------------------------
// Tutorial 4 — CT/VT basics (legacy "tutorial-ct")
//
// Departure: the legacy version only checked a CT and VT existed somewhere on
// the canvas. This version requires them to be part of the connected bay.
// ---------------------------------------------------------------------------

const metering = () => drawing('ported-ct-vt', 'CT and VT basics', [buildRun('mt', { x: 80, y: 220 }, [
  { kind: 'device', id: 'mt-source', type: 'source', label: 'GRID' },
  { kind: 'device', id: 'mt-ds1', type: 'disconnector', label: 'DS1' },
  { kind: 'device', id: 'mt-cb', type: 'circuit-breaker', label: 'CB' },
  { kind: 'device', id: 'mt-ct', type: 'ct', label: 'CT' },
  { kind: 'device', id: 'mt-ds2', type: 'disconnector', label: 'DS2' },
  { kind: 'tap', id: 'mt-vt', type: 'vt', label: 'VT' },
  { kind: 'device', id: 'mt-load', type: 'load', label: 'LINE' }
])]);

const ctVtBasics: PortedExercise = {
  legacyId: 'tutorial-ct',
  solvedDrawing: metering,
  build: () => packageFor(fixturesOnly(metering(), ['mt-source', 'mt-load']), {
    id: 'built-in-ported-ct-vt-basics',
    name: 'Build: CT and VT basics',
    description: 'Add a current transformer in series with the bay and a voltage transformer on the line, so protection has something to measure.',
    mode: 'lesson',
    difficulty: 'intro',
    tags: ['build', 'measurement'],
    minTier: 'Apprentice',
    recommendedTier: 'Apprentice',
    learningObjectives: [
      'A CT sits in series: all the current passes through it.',
      'A VT is teed off the circuit: it measures voltage without carrying load.',
      'Protection relays see the circuit only through these transformers.'
    ],
    restrictions: buildRestrictions(['mt-source', 'mt-load'], ['disconnector', 'circuit-breaker', 'ct', 'vt']),
    objectives: [
      { id: 'bay', text: 'Build a bay with a CT in series and a VT on the line', type: 'build-bay', targetObjectId: 'mt-source', secondaryObjectId: 'mt-load', requiredCounts: { ct: 1, vt: 1, 'circuit-breaker': 1, disconnector: 2 }, hint: 'The CT goes in line with the breaker; the VT hangs off the conductor.' }
    ],
    teachingSteps: [
      { id: 's1', title: 'Measure the circuit', body: 'Build DS, CB, CT, DS between the grid and the line, then tee a VT off the line side.', waitFor: 'objective-complete', objectiveId: 'bay' }
    ]
  })
};

// ---------------------------------------------------------------------------
// Level 1 — Connect the customer transformer (legacy "level-1")
// ---------------------------------------------------------------------------

const customerBay = () => buildRun('cx', { x: 80, y: 240 }, [
  { kind: 'device', id: 'cx-source', type: 'source', label: 'GRID' },
  { kind: 'tap', id: 'cx-es1', type: 'earth-switch', label: 'ES1' },
  { kind: 'device', id: 'cx-ds1', type: 'disconnector', label: 'DS1' },
  { kind: 'device', id: 'cx-cb', type: 'circuit-breaker', label: 'CB' },
  { kind: 'device', id: 'cx-ds2', type: 'disconnector', label: 'DS2' },
  { kind: 'tap', id: 'cx-es2', type: 'earth-switch', label: 'ES2' },
  { kind: 'device', id: 'cx-tx', type: 'transformer', label: 'CUSTOMER TX' },
  { kind: 'device', id: 'cx-load', type: 'load', label: '33kV CUSTOMER', kv: 33 }
]);
const customerSolved = () => drawing('ported-customer-transformer', 'Connect the customer transformer', [customerBay()]);
const customerFixtures = ['cx-source', 'cx-tx', 'cx-load'];
const customerFixtureConductors = () => {
  const run = customerBay();
  const lv = run.points['cx-tx:out'];
  return run.conductors.filter((path) => path.vertices[0].x === lv.x && path.vertices[0].y === lv.y).map((path) => path.id);
};

const customerTransformer: PortedExercise = {
  legacyId: 'level-1',
  solvedDrawing: customerSolved,
  build: () => packageFor(fixturesOnly(customerSolved(), customerFixtures, customerFixtureConductors()), {
    id: 'built-in-ported-customer-transformer',
    name: 'Challenge: connect the customer transformer',
    description: 'A generation customer has installed their own transformer. Build the grid bay that connects it, energise it, then take it back out of service safely.',
    mode: 'challenge',
    difficulty: 'standard',
    tags: ['build', 'bay-layout', 'isolation'],
    minTier: 'Apprentice',
    recommendedTier: 'Apprentice',
    learningObjectives: [
      'Build a DS-CB-DS bay with an earth switch on each side of the breaker.',
      'Energise by closing disconnectors before the breaker.',
      'Isolate, earth and lock off the bay after de-energising.'
    ],
    restrictions: buildRestrictions(customerFixtures, ['disconnector', 'circuit-breaker', 'earth-switch']),
    objectives: [
      { id: 'bay', text: 'Build a DS-CB-DS bay with two earth switches', type: 'build-bay', targetObjectId: 'cx-source', secondaryObjectId: 'cx-tx', requiredCounts: { 'circuit-breaker': 1, disconnector: 2, 'earth-switch': 2 }, hint: 'Earth switches are teed off the conductor either side of the breaker.' },
      { id: 'energise', text: 'Energise the customer', type: 'restore-supply-to-load', targetObjectId: 'cx-load', targetState: 'live', requires: ['bay'], latch: true, hint: 'Close the disconnectors, then the breaker.' },
      { id: 'isolate', text: 'Isolate and earth the transformer', type: 'isolate-target', targetObjectId: 'cx-tx', targetState: 'isolated', requires: ['energise'], hint: 'Breaker first, then both disconnectors, then the transformer-side earth.' },
      { id: 'lock', text: 'Lock and caution both disconnectors', type: 'tag-isolation', componentTypes: ['disconnector'], count: 2, requires: ['energise'], hint: 'Apply a point of isolation to each open disconnector.' }
    ]
  })
};

// ---------------------------------------------------------------------------
// Level 2 — Twin radial feeder (legacy "level-2")
//
// Departure: the legacy level required 2 transformers, 6 breakers, 14
// disconnectors and 12 earth switches without saying what design those numbers
// described. This version states the design — an HV and an LV bay per
// transformer plus a DS-CB-DS coupler — and requires exactly what it needs.
// ---------------------------------------------------------------------------

const twinRow = (side: 'a' | 'b', y: number) => buildRun(`tw${side}`, { x: 80, y }, [
  { kind: 'device', id: `tw${side}-source`, type: 'source', label: `INCOMER ${side.toUpperCase()}` },
  { kind: 'tap', id: `tw${side}-es1`, type: 'earth-switch', label: 'ES1' },
  { kind: 'device', id: `tw${side}-hv-ds1`, type: 'disconnector', label: 'HV DS1', closed: true },
  { kind: 'device', id: `tw${side}-hv-cb`, type: 'circuit-breaker', label: 'HV CB', closed: true },
  { kind: 'device', id: `tw${side}-hv-ds2`, type: 'disconnector', label: 'HV DS2', closed: true },
  { kind: 'tap', id: `tw${side}-es2`, type: 'earth-switch', label: 'ES2' },
  { kind: 'device', id: `tw${side}-tx`, type: 'transformer', label: `T${side === 'a' ? 1 : 2}` },
  { kind: 'device', id: `tw${side}-lv-ds1`, type: 'disconnector', label: 'LV DS1', closed: true, kv: 33 },
  { kind: 'device', id: `tw${side}-lv-cb`, type: 'circuit-breaker', label: 'LV CB', closed: true },
  { kind: 'device', id: `tw${side}-lv-ds2`, type: 'disconnector', label: 'LV DS2', closed: true },
  { kind: 'tee', id: `tw${side}-coupler-tee` },
  { kind: 'device', id: `tw${side}-load`, type: 'load', label: `GRID OUT ${side.toUpperCase()}` }
]);

const twinSolved = () => {
  const a = twinRow('a', 140);
  const b = twinRow('b', 640);
  const tee = a.points['twa-coupler-tee'];
  const coupler = buildRun('twc', { x: tee.x, y: tee.y - 60 }, [
    { kind: 'tee', id: 'twc-top' },
    { kind: 'device', id: 'twc-ds1', type: 'disconnector', label: 'BC DS1', kv: 33 },
    { kind: 'device', id: 'twc-cb', type: 'circuit-breaker', label: 'BUS COUPLER' },
    { kind: 'device', id: 'twc-ds2', type: 'disconnector', label: 'BC DS2' }
  ], { axis: 'y', kv: 33 });
  return drawing('ported-twin-radial', 'Twin radial feeder', [a, b, coupler], [link('twc-to-b', coupler.points['twc-ds2:out'], b.points['twb-coupler-tee'], 33)]);
};
const twinFixtures = ['twa-source', 'twb-source', 'twa-load', 'twb-load'];

const twinRadial: PortedExercise = {
  legacyId: 'level-2',
  solvedDrawing: twinSolved,
  build: () => packageFor(fixturesOnly(twinSolved(), twinFixtures), {
    id: 'built-in-ported-twin-radial',
    name: 'Challenge: twin radial feeder for a windfarm',
    description: 'Two incoming circuits feed two transformers. Build both circuits with a bus coupler between them, so one transformer can be taken out while both outputs stay in service.',
    mode: 'challenge',
    difficulty: 'advanced',
    tags: ['build', 'transformer', 'resilience'],
    minTier: 'Engineer',
    recommendedTier: 'Engineer',
    learningObjectives: [
      'Give each transformer a switchgear bay on both its HV and LV side.',
      'Add a bus coupler so either transformer can supply both outputs.',
      'Take one transformer out of service without losing either output.'
    ],
    briefing: {
      initialCondition: 'Two incomers and two grid outputs are installed. Everything between them is yours to build.',
      winConditions: [
        'Each circuit: HV bay (DS, CB, DS, two earth switches), transformer, LV bay (DS, CB, DS).',
        'A DS-CB-DS bus coupler between the two LV sides.',
        'Transformer 1 isolated and earthed while both outputs remain live.'
      ]
    },
    restrictions: buildRestrictions(twinFixtures, ['transformer', 'disconnector', 'circuit-breaker', 'earth-switch']),
    objectives: [
      { id: 'kit', text: 'Install two transformers with HV and LV bays and a coupler', type: 'include-component', requiredCounts: { transformer: 2, 'circuit-breaker': 5, disconnector: 10, 'earth-switch': 4 }, hint: 'Per circuit: DS-CB-DS and two earths on HV, DS-CB-DS on LV. Then DS-CB-DS for the coupler.' },
      { id: 'circuit-a', text: 'Connect incomer A to output A', type: 'connect-between', targetObjectId: 'twa-source', secondaryObjectId: 'twa-load' },
      { id: 'circuit-b', text: 'Connect incomer B to output B', type: 'connect-between', targetObjectId: 'twb-source', secondaryObjectId: 'twb-load' },
      { id: 'coupler', text: 'Couple the two LV sides', type: 'connect-between', targetObjectId: 'twa-load', secondaryObjectId: 'twb-load' },
      { id: 'out-a', text: 'Keep output A live', type: 'restore-supply-to-load', targetObjectId: 'twa-load', targetState: 'live', requires: ['kit', 'circuit-a', 'circuit-b', 'coupler'] },
      { id: 'out-b', text: 'Keep output B live', type: 'restore-supply-to-load', targetObjectId: 'twb-load', targetState: 'live', requires: ['kit', 'circuit-a', 'circuit-b', 'coupler'] },
      { id: 'maintain-t1', text: 'Isolate and earth transformer 1 with both outputs live', type: 'isolate-target', targetObjectId: 'twa-tx', targetState: 'isolated', requires: ['out-a', 'out-b'], hint: 'Close the coupler first so output A can be fed from transformer 2.' }
    ]
  })
};

// ---------------------------------------------------------------------------
// Level 4 — Parallel circuits and a fault (legacy "phase1_overload_transfer")
//
// Departure: the legacy level was graded only on "no illegal operations". This
// version grades each stage, and makes the backfeed explicit: opening circuit
// A's breaker does not make its line dead while circuit B still feeds the load
// end through DS-A2.
// ---------------------------------------------------------------------------

const parallelSolved = () => {
  const a = buildRun('pa', { x: 80, y: 160 }, [
    { kind: 'device', id: 'pf-source', type: 'source', label: 'GRID' },
    { kind: 'tee', id: 'pa-split' },
    { kind: 'device', id: 'pa-ds1', type: 'disconnector', label: 'A DS1' },
    { kind: 'device', id: 'pa-cb', type: 'circuit-breaker', label: 'A CB' },
    { kind: 'tap', id: 'pa-es', type: 'earth-switch', label: 'A ES' },
    { kind: 'device', id: 'pa-ds2', type: 'disconnector', label: 'A DS2' },
    { kind: 'tee', id: 'pa-join' },
    { kind: 'device', id: 'pf-load', type: 'load', label: 'LOAD' }
  ]);
  const b = buildRun('pb', { x: a.points['pa-split'].x - 60, y: 400 }, [
    { kind: 'tee', id: 'pb-split' },
    { kind: 'device', id: 'pb-ds1', type: 'disconnector', label: 'B DS1' },
    { kind: 'device', id: 'pb-cb', type: 'circuit-breaker', label: 'B CB' },
    { kind: 'device', id: 'pb-ds2', type: 'disconnector', label: 'B DS2' },
    { kind: 'tee', id: 'pb-join' }
  ]);
  const joinA = a.points['pa-join'];
  const joinB = b.points['pb-join'];
  // Bring circuit B's far end up to the same busbar point as circuit A's.
  const bJoin = link('pb-to-load', joinB, { x: joinA.x, y: joinB.y });
  const busRiser = link('pf-load-bus', { x: joinA.x, y: joinB.y }, joinA);
  return drawing('ported-parallel-circuits', 'Parallel circuits and a fault', [a, b], [
    link('pf-split-bus', a.points['pa-split'], b.points['pb-split']),
    bJoin,
    busRiser
  ]);
};

/** Circuit A's conductor between its breaker and DS-A2 — the faulted section. */
export const PARALLEL_FAULT_TARGET = 'pa-c2';

const parallelCircuits: PortedExercise = {
  legacyId: 'phase1_overload_transfer',
  build: () => {
    const doc = parallelSolved();
    const faultLocation = doc.objects.conductors.find((path) => path.id === PARALLEL_FAULT_TARGET)!.vertices[0];
    return packageFor(doc, {
      id: 'built-in-ported-parallel-circuits',
      name: 'Lesson: parallel circuits and a fault',
      description: 'Energise a load through circuit A, parallel circuit B, then deal with a fault on circuit A without losing supply.',
      mode: 'lesson',
      difficulty: 'standard',
      tags: ['switching', 'fault', 'backfeed'],
      minTier: 'Apprentice',
      recommendedTier: 'Apprentice',
      learningObjectives: [
        'Close disconnectors before a breaker; open the breaker before disconnectors.',
        'A second circuit in parallel keeps the load supplied when one is lost.',
        'Opening a breaker does not isolate a circuit that can be back-fed from its far end.'
      ],
      explanationVariants: {
        Student: 'Two roads lead to the same town. If one is blocked, traffic can still arrive by the other.',
        Apprentice: 'With both circuits closed, the load is fed twice. Opening one breaker leaves the load on the other circuit.',
        Engineer: 'The faulted circuit is back-fed through DS-A2 from the load busbar until that disconnector is opened.'
      },
      restrictions: operateOnly,
      initialSwitchStates: { 'pa-ds1': 'open', 'pa-cb': 'open', 'pa-ds2': 'open', 'pa-es': 'open', 'pb-ds1': 'open', 'pb-cb': 'open', 'pb-ds2': 'open' },
      failureRules: { maxWrongOperations: 3 },
      faults: [],
      events: [makeScenarioEvent('scheduled-fault', 24 * 60 * 60 * 1000, {
        id: 'fault-circuit-a',
        fault: fault('fault-circuit-a', PARALLEL_FAULT_TARGET, 'phase-to-earth', faultLocation),
        message: 'Fault on circuit A between its breaker and DS-A2.'
      })],
      objectives: [
        { id: 'energise-a', text: 'Energise the load through circuit A', type: 'restore-supply-to-load', targetObjectId: 'pf-load', targetState: 'live', latch: true, hint: 'Close A DS1 and A DS2, then A CB.' },
        { id: 'parallel-b', text: 'Put circuit B in parallel', type: 'operate-switchgear', targetObjectId: 'pb-cb', targetState: 'closed', requires: ['energise-a'], latch: true, hint: 'Close B DS1 and B DS2, then B CB.' },
        { id: 'fault-dead', text: 'Make the faulted section dead', type: 'isolate-target', targetObjectId: PARALLEL_FAULT_TARGET, targetState: 'dead', requires: ['parallel-b'], hint: 'Opening A CB is not enough: the load busbar back-feeds it through A DS2.' },
        { id: 'fault-earthed', text: 'Earth the faulted section', type: 'isolate-target', targetObjectId: PARALLEL_FAULT_TARGET, targetState: 'isolated', requires: ['fault-dead'], hint: 'Close A ES only once the section is dead.' },
        { id: 'supply', text: 'Keep the load supplied throughout', type: 'restore-supply-to-load', targetObjectId: 'pf-load', targetState: 'live', requires: ['parallel-b'] },
        { id: 'no-ds-load', text: 'Never open or close a disconnector on load', type: 'avoid-disconnector-under-load', targetObjectId: 'pa-ds1' }
      ],
      teachingSteps: [
        { id: 's1', title: 'Prepare and energise circuit A', body: 'Close A DS1 and A DS2 first — disconnectors are not made to switch load. Then close A CB.', waitFor: 'objective-complete', objectiveId: 'energise-a' },
        { id: 's2', title: 'Parallel circuit B', body: 'Close B DS1 and B DS2, then B CB. The load is now fed by both circuits.', waitFor: 'objective-complete', objectiveId: 'parallel-b' },
        { id: 's3', title: 'Fault on circuit A', body: 'A fault has appeared on circuit A. Open A CB to interrupt the fault current — circuit B keeps the load supplied.', waitFor: 'correct-state', expectedObjectId: 'pa-cb', expectedState: 'open', eventIdToTrigger: 'fault-circuit-a' },
        { id: 's4', title: 'Look for the backfeed', body: 'Circuit A is still live from the load end through A DS2. Open both disconnectors to make it dead.', waitFor: 'objective-complete', objectiveId: 'fault-dead' },
        { id: 's5', title: 'Apply the earth', body: 'Now the section is dead, close A ES.', waitFor: 'objective-complete', objectiveId: 'fault-earthed' }
      ]
    });
  }
};

export const portedExercises: PortedExercise[] = [connectLine, isolateThenEarth, ctVtBasics, customerTransformer, twinRadial, parallelCircuits];

export const portedScenarioPackages = (): ScenarioPackage[] => portedExercises.map((exercise) => exercise.build());
