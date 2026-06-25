import type { DrawingDocument } from '../drawing/model';
import type { AnimationSequence, AnimationSequenceStep } from './sequence';
import { extractTopology } from '../topology/extractTopology';
import { operateDevice } from '../topology/operation';

export const SEQUENCE_INTRO_SECONDS = 0.75;

export interface SequenceSnapshot {
  beginSeconds: number;
  endSeconds: number;
  doc: DrawingDocument;
  previousDoc: DrawingDocument;
  stepIndex: number;
}

export function cloneDrawingDocument(doc: DrawingDocument): DrawingDocument {
  return JSON.parse(JSON.stringify(doc)) as DrawingDocument;
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

function setSymbolSwitchState(
  doc: DrawingDocument,
  symbolId: string,
  switchState: 'open' | 'closed'
): DrawingDocument {
  return {
    ...doc,
    objects: {
      ...doc.objects,
      symbols: doc.objects.symbols.map((symbol) =>
        symbol.id === symbolId
          ? { ...symbol, operation: { ...symbol.operation, switchState, tripped: false } }
          : symbol
      )
    }
  };
}

function toggleGridEndpoint(doc: DrawingDocument, symbolId: string): DrawingDocument {
  return {
    ...doc,
    objects: {
      ...doc.objects,
      symbols: doc.objects.symbols.map((symbol) =>
        symbol.id === symbolId
          ? { ...symbol, operation: { ...symbol.operation, sourceOn: symbol.operation?.sourceOn === false } }
          : symbol
      )
    }
  };
}

export function applySequenceStep(doc: DrawingDocument, step: AnimationSequenceStep): DrawingDocument {
  if (step.actionType === 'wait' || !step.targetId) return doc;

  const symbol = doc.objects.symbols.find((item) => item.id === step.targetId);
  if (!symbol) return doc;

  if (step.actionType === 'toggle-source' || symbol.type === 'source' || symbol.type === 'grid-connection') {
    return toggleGridEndpoint(doc, step.targetId);
  }

  const desired = inferDesiredSwitchState(step);
  if (desired === 'toggle' || step.actionType === 'operate-switchgear') {
    const topology = extractTopology(doc);
    return operateDevice(doc, topology, step.targetId).doc;
  }

  if (symbol.operation?.switchState === desired) return doc;
  return setSymbolSwitchState(doc, step.targetId, desired);
}

export function rewindSequenceStep(doc: DrawingDocument, step: AnimationSequenceStep): DrawingDocument {
  if (step.actionType === 'wait' || !step.targetId) return doc;

  const symbol = doc.objects.symbols.find((item) => item.id === step.targetId);
  if (!symbol) return doc;

  if (step.actionType === 'toggle-source' || symbol.type === 'source' || symbol.type === 'grid-connection') {
    return toggleGridEndpoint(doc, step.targetId);
  }

  const desired = inferDesiredSwitchState(step);
  if (desired === 'toggle' || step.actionType === 'operate-switchgear') {
    const topology = extractTopology(doc);
    return operateDevice(doc, topology, step.targetId).doc;
  }

  const inverse = desired === 'open' ? 'closed' : 'open';
  if (symbol.operation?.switchState === inverse) return doc;
  return setSymbolSwitchState(doc, step.targetId, inverse);
}

export function buildInitialDocForSequence(finalDoc: DrawingDocument, sequence: AnimationSequence): DrawingDocument {
  const enabledSteps = sequence.steps.filter((step) => step.enabled);
  let initialDoc = cloneDrawingDocument(finalDoc);
  for (let index = enabledSteps.length - 1; index >= 0; index -= 1) {
    initialDoc = rewindSequenceStep(initialDoc, enabledSteps[index]);
  }
  return initialDoc;
}

export function buildSequenceSnapshots(finalDoc: DrawingDocument, sequence: AnimationSequence): SequenceSnapshot[] {
  const enabledSteps = sequence.steps.filter((step) => step.enabled);
  if (!enabledSteps.length) {
    const cloned = cloneDrawingDocument(finalDoc);
    return [{ beginSeconds: 0, endSeconds: 0, doc: cloned, previousDoc: cloned, stepIndex: -1 }];
  }

  const initialDoc = buildInitialDocForSequence(finalDoc, sequence);
  const snapshots: SequenceSnapshot[] = [{
    beginSeconds: 0,
    endSeconds: SEQUENCE_INTRO_SECONDS,
    doc: cloneDrawingDocument(initialDoc),
    previousDoc: cloneDrawingDocument(initialDoc),
    stepIndex: -1
  }];

  let elapsed = SEQUENCE_INTRO_SECONDS;
  let previousDoc = initialDoc;

  enabledSteps.forEach((step, stepIndex) => {
    const beginSeconds = elapsed;
    const nextDoc = applySequenceStep(previousDoc, step);
    elapsed += step.eventDurationSeconds + step.delayAfterSeconds;
    snapshots.push({
      beginSeconds,
      endSeconds: elapsed,
      doc: cloneDrawingDocument(nextDoc),
      previousDoc: cloneDrawingDocument(previousDoc),
      stepIndex
    });
    previousDoc = nextDoc;
  });

  return snapshots;
}

export function sequenceExportDuration(sequence: AnimationSequence): number {
  const enabledSteps = sequence.steps.filter((step) => step.enabled);
  if (!enabledSteps.length) return 0;
  return SEQUENCE_INTRO_SECONDS + enabledSteps.reduce(
    (sum, step) => sum + step.eventDurationSeconds + step.delayAfterSeconds,
    0
  );
}
