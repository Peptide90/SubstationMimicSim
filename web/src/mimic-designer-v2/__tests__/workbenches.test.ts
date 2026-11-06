import { describe, expect, it } from 'vitest';
import type { LearningTier, ScenarioDefinition } from '../drawing/model';
import { learningTierOrder } from '../learning/tiers';
import { resolveWorkbench, workbenchOrder, workbenches } from '../workbenches';

const tiers = learningTierOrder;

describe('workbench registry', () => {
  it('orders every workbench exactly once', () => {
    expect([...workbenchOrder].sort()).toEqual(Object.keys(workbenches).sort());
  });

  it('gives every workbench a usable tool at every tier', () => {
    for (const id of workbenchOrder) {
      for (const tier of tiers) {
        const resolved = resolveWorkbench(id, tier);
        expect(resolved.tools.length, `${id}/${tier}`).toBeGreaterThan(0);
        expect(resolved.tools, `${id}/${tier}`).toContain(resolved.tool);
      }
    }
  });

  it('never resolves a workbench with no panels at all', () => {
    for (const id of workbenchOrder) {
      for (const tier of tiers) {
        expect(resolveWorkbench(id, tier).panels.length, `${id}/${tier}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('tier gating', () => {
  it('lets a beginner reach protection, but only the plain-language account', () => {
    const junior = resolveWorkbench('protect', 'Junior');
    expect(junior.panels).toContain('tripExplain');
    expect(junior.panels).not.toContain('relayManager');
    expect(junior.panels).not.toContain('curves');
  });

  it('adds relay depth as the tier rises, without ever removing the explanation', () => {
    const depth = tiers.map((tier) => resolveWorkbench('protect', tier).panels.length);
    expect(depth).toEqual([...depth].sort((a, b) => a - b));
    for (const tier of tiers) {
      expect(resolveWorkbench('protect', tier).panels, tier).toContain('tripExplain');
    }
  });

  it('reserves scheme logic for the commissioning tier', () => {
    for (const tier of tiers) {
      const hasScheme = resolveWorkbench('protect', tier).panels.includes('schemeLogic');
      expect(hasScheme, tier).toBe(tier === 'Commissioning Engineer');
    }
  });

  it('withholds fault tools below Student and drawing tools below Apprentice', () => {
    expect(resolveWorkbench('operate', 'Junior').tools).not.toContain('fault');
    expect(resolveWorkbench('operate', 'Student').tools).toContain('fault');
    expect(resolveWorkbench('draw', 'Student').tools).not.toContain('conductor');
    expect(resolveWorkbench('draw', 'Apprentice').tools).toContain('conductor');
  });

  it('reports what a tier is not yet ready for rather than dropping it silently', () => {
    const junior = resolveWorkbench('protect', 'Junior');
    expect(junior.hiddenPanels).toContain('relayManager');
    const all = [...junior.panels, ...junior.hiddenPanels].sort();
    expect(all).toEqual(workbenches.protect.panels.map((p) => p.id).sort());
  });
});

describe('scenario context', () => {
  it('opens the fault panel for a Student because a scenario needs it', () => {
    const scenario = { tags: ['protection'] } as unknown as ScenarioDefinition;
    const resolved = resolveWorkbench('operate', 'Student', scenario);
    expect(resolved.panels).toContain('faults');
  });

  it('keeps the fault panel shut for a Junior even so', () => {
    const scenario = { tags: ['protection'] } as unknown as ScenarioDefinition;
    const resolved = resolveWorkbench('operate', 'Junior' as LearningTier, scenario);
    expect(resolved.panels).not.toContain('faults');
  });
});
