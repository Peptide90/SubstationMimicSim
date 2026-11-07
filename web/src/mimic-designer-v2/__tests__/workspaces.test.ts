import { describe, expect, it } from 'vitest';
import type { LearningTier, ScenarioDefinition } from '../drawing/model';
import { learningTierOrder } from '../learning/tiers';
import { modes, resolveWorkspace, workspaceForScenario, workspaceOrder, workspaces, type OperateView, type WorkspaceId, type WorkspaceState } from '../workspaces';

const tiers = learningTierOrder;
const state = (workspace: WorkspaceId, operateView: OperateView = 'substation', learn = false, studio = false): WorkspaceState => ({ workspace, operateView, modes: { learn, studio } });
const allStates = workspaceOrder.flatMap((workspace) => (workspace === 'operate' ? (['substation', 'control-room'] as OperateView[]).map((view) => state(workspace, view)) : [state(workspace)]));

describe('workspaces', () => {
  it('are three, in order', () => {
    expect(workspaceOrder).toEqual(['design', 'protect', 'operate']);
    expect([...workspaceOrder].sort()).toEqual(Object.keys(workspaces).sort());
  });

  it('each show a different canvas, so they look different', () => {
    const canvases = allStates.map((s) => resolveWorkspace(s, 'Apprentice').canvas);
    expect(new Set(canvases).size).toBe(canvases.length);
  });

  it('give a usable tool and at least one panel at every tier', () => {
    for (const s of allStates) {
      for (const tier of tiers) {
        const resolved = resolveWorkspace(s, tier);
        expect(resolved.tools, `${s.workspace}/${s.operateView}/${tier}`).toContain(resolved.tool);
        expect(resolved.panels.length, `${s.workspace}/${s.operateView}/${tier}`).toBeGreaterThan(0);
      }
    }
  });

  it('keep editing to Design', () => {
    expect(resolveWorkspace(state('design'), 'Apprentice').mode).toBe('edit');
    for (const s of allStates.filter((item) => item.workspace !== 'design')) {
      const resolved = resolveWorkspace(s, 'Engineer');
      expect(resolved.mode).toBe('operate');
      expect(resolved.tools).not.toContain('conductor');
      expect(resolved.panels).not.toContain('palette');
    }
  });
});

describe('Operate views', () => {
  it('shows truth in the substation view and only reports in the control room view', () => {
    const substation = resolveWorkspace(state('operate', 'substation'), 'Engineer');
    const room = resolveWorkspace(state('operate', 'control-room'), 'Engineer');
    expect(substation.canvas).toBe('live-diagram');
    expect(room.canvas).toBe('hmi');
    expect(substation.panels).toContain('powerFlow');
    expect(room.panels).not.toContain('powerFlow');
    expect(room.panels).toContain('alarmList');
  });

  it('cannot create faults from the control room', () => {
    expect(resolveWorkspace(state('operate', 'substation'), 'Engineer').tools).toContain('fault');
    expect(resolveWorkspace(state('operate', 'control-room'), 'Engineer').tools).not.toContain('fault');
  });
});

describe('Protect at every tier', () => {
  it('lets a beginner in, with only the plain-language account', () => {
    const junior = resolveWorkspace(state('protect'), 'Junior');
    expect(junior.panels).toContain('tripExplain');
    expect(junior.panels).not.toContain('relayManager');
  });

  it('adds depth as the tier rises, never removing the explanation', () => {
    const depth = tiers.map((tier) => resolveWorkspace(state('protect'), tier).panels.length);
    expect(depth).toEqual([...depth].sort((a, b) => a - b));
    for (const tier of tiers) expect(resolveWorkspace(state('protect'), tier).panels).toContain('tripExplain');
  });

  it('reserves scheme logic for commissioning', () => {
    for (const tier of tiers) expect(resolveWorkspace(state('protect'), tier).panels.includes('schemeLogic'), tier).toBe(tier === 'Commissioning Engineer');
  });
});

describe('modes', () => {
  it('add their panels to any workspace without changing its canvas', () => {
    for (const s of allStates) {
      const plain = resolveWorkspace(s, 'Apprentice');
      const learning = resolveWorkspace({ ...s, modes: { learn: true, studio: false } }, 'Apprentice');
      const filming = resolveWorkspace({ ...s, modes: { learn: false, studio: true } }, 'Apprentice');
      expect(learning.canvas).toBe(plain.canvas);
      expect(learning.panels).toContain('scenarioBrief');
      expect(filming.panels).toContain('sequenceSteps');
      expect(plain.panels).not.toContain('scenarioBrief');
    }
  });

  it('tier-gate mode panels too', () => {
    expect(resolveWorkspace(state('operate', 'substation', true), 'Junior').panels).not.toContain('switchingSheet');
    expect(resolveWorkspace(state('operate', 'substation', true), 'Apprentice').panels).toContain('switchingSheet');
    expect(modes.learn.panels.map((panel) => panel.id)).toContain('switchingSheet');
  });
});

describe('tier and scenario context', () => {
  it('withholds fault tools below Student and drawing tools below Apprentice', () => {
    expect(resolveWorkspace(state('operate'), 'Junior').tools).not.toContain('fault');
    expect(resolveWorkspace(state('operate'), 'Student').tools).toContain('fault');
    expect(resolveWorkspace(state('design'), 'Student').tools).not.toContain('conductor');
    expect(resolveWorkspace(state('design'), 'Apprentice').tools).toContain('conductor');
  });

  it('opens the fault panel for a Student when the scenario needs it, but not for a Junior', () => {
    const scenario = { tags: ['protection'] } as unknown as ScenarioDefinition;
    expect(resolveWorkspace(state('operate'), 'Student', scenario).panels).toContain('faults');
    expect(resolveWorkspace(state('operate'), 'Junior' as LearningTier, scenario).panels).not.toContain('faults');
  });

  it('opens scenarios in Operate by default, and honours a locked view', () => {
    expect(workspaceForScenario({} as ScenarioDefinition)).toEqual({ workspace: 'operate', operateView: 'substation', viewLocked: false });
    const locked = { restrictions: { operateView: 'control-room' }, preferredOperateView: 'substation' } as unknown as ScenarioDefinition;
    expect(workspaceForScenario(locked)).toEqual({ workspace: 'operate', operateView: 'control-room', viewLocked: true });
  });
});
