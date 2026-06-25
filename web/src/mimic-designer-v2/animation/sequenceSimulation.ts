import type { DrawingDocument } from '../drawing/model';
import type { AnimationSequence, AnimationSequenceStep } from './sequence';
import { extractTopology } from '../topology/extractTopology';
import { operateDevice } from '../topology/operation';

export interface SequenceSnapshot {
  beginSeconds: number;
  endSeconds: number;
  doc: DrawingDocument;
}

function inferDesiredSwitchState(step: AnimationSequenceStep): 'open' | 'closed' | 'toggle' {
  if (step.actionType === 'close-circuit-breaker' || step.actionType === 'close-disconnector' || step.actionType === 'close-earth-switch') {
    return 'closed';
  }
  if (step.actionType === 'open-circuit-breaker' || step.actionType === 'open-disconnector' || step.actionType === 'open-earth-switch') {
    return 'open';
  }
  const name = step.name.toLowerCase();
  if (name.endsWith(' - closed') || name.includes(' closed')) return 'closed';
  if (name.endsWith(' - open') || name.includes(' open')) return 'open';
  return 'toggle';
}

export function applySequenceStep(doc: DrawingDocument, step: AnimationSequenceStep): DrawingDocument {
  if (step.actionType === 'wait' || !step.targetId) return doc;

  const topology = extractTopology(doc);
  const symbol = doc.objects.symbols.find((item) => item.id === step.targetId);
  if (!symbol) return doc;

  const desired = inferDesiredSwitchState(step);
  if (desired === 'toggle' || step.actionType === 'operate-switchgear') {
    return operateDevice(doc, topology, step.targetId).doc;
  }

  if (symbol.operation?.switchState === desired) return doc;
  if (symbol.operation?.switchState === (desired === 'open' ? 'closed' : 'open')) {
    return operateDevice(doc, topology, step.targetId).doc;
  }
  return doc;
}

export function buildSequenceSnapshots(doc: DrawingDocument, sequence: AnimationSequence): SequenceSnapshot[] {
  const enabledSteps = sequence.steps.filter((step) => step.enabled);
  if (!enabledSteps.length) {
    return [{ beginSeconds: 0, endSeconds: 0, doc }];
  }

  let currentDoc = doc;
  let elapsed = 0;
  const snapshots: SequenceSnapshot[] = [];

  enabledSteps.forEach((step) => {
    const beginSeconds = elapsed;
    currentDoc = applySequenceStep(currentDoc, step);
    elapsed += step.eventDurationSeconds + step.delayAfterSeconds;
    snapshots.push({ beginSeconds, endSeconds: elapsed, doc: currentDoc });
  });

  return snapshots;
}
