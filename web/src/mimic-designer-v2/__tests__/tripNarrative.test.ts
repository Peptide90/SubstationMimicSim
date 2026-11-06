import { describe, expect, it } from 'vitest';
import type { DrawingDocument, LearningTier, RelaySettings } from '../drawing/model';
import { createBaseDocument } from '../templates/factory';
import { buildTripNarrative, idleProtectionSummary, latestTrippedRelay } from '../protection/tripNarrative';

const relay = (over: Partial<RelaySettings> = {}): RelaySettings => ({
  id: 'relay-1',
  name: 'F1 OC',
  type: 'overcurrent',
  enabled: true,
  phases: ['A', 'B', 'C'],
  pickupCurrentA: 800,
  timeDelayMs: 300,
  directional: false,
  tripTargetBreakerIds: ['cb-1'],
  backupTripTargetBreakerIds: [],
  breakerFailEnabled: false,
  breakerFailDelayMs: 200,
  state: 'tripped',
  trippedAt: '2026-01-01T00:00:01.000Z',
  ...over,
});

function docWith(relays: RelaySettings[]): DrawingDocument {
  const doc = createBaseDocument('doc-test', 'Trip narrative fixture');
  return {
    ...doc,
    relays,
    objects: {
      ...doc.objects,
      symbols: [
        { id: 'cb-1', type: 'circuit-breaker', label: { text: 'F1 CB' } },
        { id: 'line-1', type: 'line-end', label: { text: 'Feeder 1' } },
      ] as unknown as DrawingDocument['objects']['symbols'],
    },
  };
}

describe('latestTrippedRelay', () => {
  it('ignores relays that have not tripped', () => {
    expect(latestTrippedRelay(docWith([relay({ state: 'idle', trippedAt: undefined })]))).toBeUndefined();
  });

  it('picks the most recent trip', () => {
    const doc = docWith([
      relay({ id: 'old', trippedAt: '2026-01-01T00:00:00.000Z' }),
      relay({ id: 'new', trippedAt: '2026-01-01T00:00:05.000Z' }),
    ]);
    expect(latestTrippedRelay(doc)?.id).toBe('new');
  });
});

describe('buildTripNarrative', () => {
  const tiers: LearningTier[] = ['Junior', 'Student', 'Apprentice', 'Engineer', 'Commissioning Engineer'];

  it('produces a narrative at every tier', () => {
    for (const tier of tiers) {
      const n = buildTripNarrative(docWith([relay()]), tier);
      expect(n, tier).toBeDefined();
      expect(n!.headline.length, tier).toBeGreaterThan(0);
      expect(n!.cause.length, tier).toBeGreaterThan(0);
      expect(n!.outcome.length, tier).toBeGreaterThan(0);
    }
  });

  it('keeps settings and jargon away from the youngest tiers', () => {
    for (const tier of ['Junior', 'Student'] as LearningTier[]) {
      const n = buildTripNarrative(docWith([relay()]), tier)!;
      expect(n.detail, tier).toEqual([]);
      expect(n.headline, tier).not.toMatch(/relay|pickup/i);
    }
  });

  it('names the relay and its settings from Apprentice upward', () => {
    const n = buildTripNarrative(docWith([relay()]), 'Apprentice')!;
    expect(n.headline).toContain('F1 OC');
    expect(n.headline).toContain('F1 CB');
    expect(n.detail.join(' ')).toContain('800 A');
    expect(n.detail.join(' ')).toContain('300 ms');
  });

  it('adds grading and breaker-fail context only for engineers', () => {
    const r = relay({ breakerFailEnabled: true, zoneId: 'zone-1', role: 'feeder-protection' });
    expect(buildTripNarrative(docWith([r]), 'Apprentice')!.detail.join(' ')).not.toMatch(/breaker-fail/i);
    const eng = buildTripNarrative(docWith([r]), 'Engineer')!.detail.join(' ');
    expect(eng).toMatch(/Breaker-fail armed at 200 ms/);
    expect(eng).toContain('zone-1');
  });

  it('deepens monotonically with tier', () => {
    const counts = tiers.map((t) => buildTripNarrative(docWith([relay()]), t)!.detail.length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('describes an earth fault differently from an overcurrent', () => {
    const n = buildTripNarrative(docWith([relay({ type: 'earth-fault', earthFaultPickupA: 40 })]), 'Apprentice')!;
    expect(n.cause).toMatch(/Earth fault/);
    expect(n.detail.join(' ')).toContain('40 A');
  });
});

describe('idleProtectionSummary', () => {
  it('still teaches when nothing has tripped', () => {
    const text = idleProtectionSummary(docWith([relay({ state: 'idle', trippedAt: undefined })]), 'Junior');
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/undefined/);
  });

  it('says so plainly when no relays exist', () => {
    expect(idleProtectionSummary(docWith([]), 'Engineer')).toMatch(/No protection relays/);
  });
});
