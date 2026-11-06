import { describe, expect, it } from 'vitest';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { PARALLEL_FAULT_TARGET, portedExercises } from '../scenarios/portedChallenges';
import { extractTopology } from '../topology/extractTopology';
import { operateDevice } from '../topology/operation';
import { buildRun } from '../scenarios/exerciseLayout';
import { Play } from './helpers/play';

const exercise = (legacyId: string) => portedExercises.find((item) => item.legacyId === legacyId)!;
const play = (legacyId: string) => new Play(exercise(legacyId).build());

describe('every ported exercise', () => {
  it.each(portedExercises.map((item) => [item.legacyId]))('%s starts unsolved and packages cleanly', (legacyId) => {
    const game = play(legacyId);
    expect(game.result.success).toBe(false);
    expect(game.result.failed).toBe(false);
    expect(game.scenario.objectives.length).toBeGreaterThan(0);
  });

  it('gives every build exercise fixtures that are present in the starting drawing', () => {
    for (const item of portedExercises.filter((entry) => entry.solvedDrawing)) {
      const pkg = item.build();
      const ids = new Set(pkg.drawing.objects.symbols.map((symbol) => symbol.id));
      for (const fixture of pkg.scenario.restrictions?.lockedObjectIds ?? []) expect(ids.has(fixture), `${item.legacyId}: ${fixture}`).toBe(true);
    }
  });
});

describe('connect the line (tutorial-1)', () => {
  it('is solved by building DS-CB-DS and closing disconnectors before the breaker', () => {
    const game = play('tutorial-1').build(exercise('tutorial-1').solvedDrawing!());
    expect(game.completed('connect')).toBe(true);
    expect(game.completed('energise')).toBe(false);
    game.operateAll('cl-ds1', 'cl-ds2', 'cl-cb');
    expect(game.result.success).toBe(true);
    expect(game.scenario.wrongOperationCount).toBe(0);
  });

  it('counts energising with a disconnector as a wrong operation', () => {
    const game = play('tutorial-1').build(exercise('tutorial-1').solvedDrawing!());
    game.operateAll('cl-ds1', 'cl-cb', 'cl-ds2');
    expect(game.scenario.wrongOperationCount).toBe(1);
  });
});

describe('isolate then earth (tutorial-3)', () => {
  const work = (game: Play) => {
    game.operate('radial-cb');
    game.operate('radial-ds2').lock('radial-ds2');
    game.operate('radial-ds1').lock('radial-ds1');
    game.operate('radial-es2').lock('radial-es2', 'point-of-earthing');
    return game;
  };

  it('is solved by working the sheet in order and reading back the colours', () => {
    const game = work(play('tutorial-3'));
    expect(game.result.success).toBe(false);
    game.readback('sheet-isolate-f1', 'l5', ['red', 'yellow', 'blue']);
    expect(game.result.success).toBe(true);
    expect(game.scenario.wrongOperationCount).toBe(0);
  });

  it('does not punish opening DS1 off load, even though its source side is live', () => {
    const game = play('tutorial-3');
    game.operate('radial-cb');
    expect(game.live('radial-ds1')).toBe(true);
    game.operate('radial-ds1');
    expect(game.scenario.wrongOperationCount).toBe(0);
  });

  it('fails the learner who closes the source-side earth', () => {
    const game = play('tutorial-3');
    game.operateAll('radial-cb', 'radial-ds2', 'radial-es1');
    expect(game.result.failed).toBe(true);
  });
});

describe('CT and VT basics (tutorial-ct)', () => {
  it('is solved by a bay with a series CT and a teed VT', () => {
    const game = play('tutorial-ct').build(exercise('tutorial-ct').solvedDrawing!());
    expect(game.result.success).toBe(true);
  });
});

describe('connect the customer transformer (level-1)', () => {
  it('is solved by building, energising, then isolating, earthing and locking off', () => {
    const game = play('level-1').build(exercise('level-1').solvedDrawing!());
    expect(game.completed('bay')).toBe(true);
    game.operateAll('cx-ds1', 'cx-ds2', 'cx-cb');
    expect(game.completed('energise')).toBe(true);
    game.operateAll('cx-cb', 'cx-ds2', 'cx-ds1');
    game.lock('cx-ds1').lock('cx-ds2');
    game.operate('cx-es2');
    expect(game.result.success).toBe(true);
    expect(game.scenario.wrongOperationCount).toBe(0);
  });

  it('does not accept isolating a bay that was never energised', () => {
    const game = play('level-1').build(exercise('level-1').solvedDrawing!());
    game.lock('cx-ds1').lock('cx-ds2');
    game.operate('cx-es2');
    expect(game.completed('isolate')).toBe(false);
    expect(game.completed('lock')).toBe(false);
  });
});

describe('twin radial feeder (level-2)', () => {
  it('is solved by taking transformer 1 out while the coupler keeps output A live', () => {
    const game = play('level-2').build(exercise('level-2').solvedDrawing!());
    expect(game.completed('kit')).toBe(true);
    expect(game.completed('coupler')).toBe(true);
    expect(game.live('twa-load') && game.live('twb-load')).toBe(true);

    game.operateAll('twc-ds1', 'twc-ds2', 'twc-cb');
    game.operateAll('twa-lv-cb', 'twa-hv-cb', 'twa-lv-ds1', 'twa-hv-ds2');
    game.operate('twa-es2');
    expect(game.live('twa-load')).toBe(true);
    expect(game.result.success).toBe(true);
    expect(game.scenario.wrongOperationCount).toBe(0);
  });

  it('loses output A if transformer 1 is taken out before the coupler is closed', () => {
    const game = play('level-2').build(exercise('level-2').solvedDrawing!());
    game.operateAll('twa-lv-cb');
    expect(game.live('twa-load')).toBe(false);
  });
});

describe('parallel circuits and a fault (phase1_overload_transfer)', () => {
  it('faults exactly the conductor between circuit A breaker and DS-A2', () => {
    const pkg = exercise('phase1_overload_transfer').build();
    const conductor = pkg.drawing.objects.conductors.find((path) => path.id === PARALLEL_FAULT_TARGET)!;
    const cb = pkg.drawing.objects.symbols.find((symbol) => symbol.id === 'pa-cb')!;
    const ds2 = pkg.drawing.objects.symbols.find((symbol) => symbol.id === 'pa-ds2')!;
    expect(conductor.vertices[0]).toEqual({ x: cb.position.x + 40, y: cb.position.y });
    expect(conductor.vertices[conductor.vertices.length - 1]).toEqual({ x: ds2.position.x - 40, y: ds2.position.y });
  });

  it('is solved by clearing the fault, breaking the backfeed and earthing, with supply kept on', () => {
    const game = play('phase1_overload_transfer');
    game.operateAll('pa-ds1', 'pa-ds2', 'pa-cb');
    expect(game.completed('energise-a')).toBe(true);
    game.operateAll('pb-ds1', 'pb-ds2', 'pb-cb');
    expect(game.doc.faults.some((item) => item.id === 'fault-circuit-a' && item.active)).toBe(true);

    game.operate('pa-cb');
    // The lesson: the breaker is open, but the load busbar still back-feeds circuit A.
    expect(game.live(PARALLEL_FAULT_TARGET)).toBe(true);
    expect(game.completed('fault-dead')).toBe(false);

    game.operate('pa-ds2');
    expect(game.completed('fault-dead')).toBe(true);
    game.operate('pa-ds1');
    game.operate('pa-es');
    expect(game.live('pf-load')).toBe(true);
    expect(game.result.success).toBe(true);
    expect(game.scenario.wrongOperationCount).toBe(0);
  });

  it('only injects the fault once the lesson reaches it', () => {
    const game = play('phase1_overload_transfer');
    game.operateAll('pa-ds1', 'pa-ds2', 'pa-cb');
    expect(game.doc.faults.some((item) => item.id === 'fault-circuit-a')).toBe(false);
  });
});

describe('switching with a fault on the network', () => {
  const faulted = () => {
    const game = play('phase1_overload_transfer');
    game.operateAll('pa-ds1', 'pa-ds2', 'pa-cb', 'pb-ds1', 'pb-ds2', 'pb-cb');
    return game;
  };

  it('lets an isolated faulted section be earthed', () => {
    const game = faulted();
    game.operateAll('pa-cb', 'pa-ds2', 'pa-ds1');
    const result = operateDevice(game.doc, extractTopology(game.doc), 'pa-es');
    expect(result.reason).not.toMatch(/arced/);
  });

  it('still arcs an earth closed onto the live faulted section', () => {
    const game = faulted();
    game.operate('pa-cb');
    const result = operateDevice(game.doc, extractTopology(game.doc), 'pa-es');
    expect(result.reason).toMatch(/arced/);
  });

  it('does not let an uncleared fault interlock switchgear on a separate network', () => {
    const game = faulted();
    const separate = buildRun('sep', { x: 80, y: 900 }, [
      { kind: 'device', id: 'sep-source', type: 'source', label: 'OTHER GRID' },
      { kind: 'device', id: 'sep-ds', type: 'disconnector', label: 'DS' },
      { kind: 'device', id: 'sep-load', type: 'load', label: 'OTHER LOAD' }
    ]);
    const doc = migrateDrawingDocument({ ...game.doc, objects: { ...game.doc.objects, symbols: [...game.doc.objects.symbols, ...separate.symbols], conductors: [...game.doc.objects.conductors, ...separate.conductors] } })!;
    const result = operateDevice(doc, extractTopology(doc), 'sep-ds');
    expect(result.refused).toBeFalsy();
    expect(result.reason).not.toMatch(/tripped|arced|interlocked/);
  });

  it('still trips a breaker closed back onto an isolated fault', () => {
    const game = faulted();
    game.operateAll('pa-cb', 'pa-ds2');
    const result = operateDevice(game.doc, extractTopology(game.doc), 'pa-cb');
    expect(result.reason).toMatch(/tripped/);
  });
});
