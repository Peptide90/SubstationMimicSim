import type { BreakerCommand, ControlLocation, DrawingDocument, OperationEvent } from '../drawing/model';
import { deriveOperationState, operateDevice, type OperationResult } from '../topology/operation';
import type { TopologyGraph } from '../topology/types';
import { coilEnergised, explainNoPath, resolveSecondary } from './ladder';

/**
 * A breaker command issued the way an operator issues it: through the close or
 * trip circuit. If the command energises the coil the breaker operates exactly
 * as a direct operation would — interlocks, lockouts and closing onto a fault
 * included. If not, nothing moves and the reason names what held the circuit
 * open.
 */
export function issueBreakerCommand(doc: DrawingDocument, graph: TopologyGraph, breakerId: string, command: BreakerCommand, location: ControlLocation = 'remote'): OperationResult {
  const breaker = doc.objects.symbols.find((symbol) => symbol.id === breakerId);
  if (!breaker || breaker.type !== 'circuit-breaker') return operateDevice(doc, graph, breakerId);
  const closed = breaker.operation?.switchState === 'closed' && !breaker.operation?.tripped;
  if ((command === 'close') === closed) {
    return { doc, state: deriveOperationState(doc, graph), reason: `Breaker already ${closed ? 'closed' : 'open'}`, refused: true };
  }
  const model = resolveSecondary(doc);
  if (!coilEnergised(doc, breakerId, command, { command: { breakerId, command, location } }, model)) {
    const reason = `${location === 'remote' ? 'Remote' : 'Local'} ${command} refused: ${explainNoPath(doc, breakerId, command, location, model)}`;
    return { doc: addEvent(doc, reason, breakerId), state: deriveOperationState(doc, graph), reason, refused: true };
  }
  return operateDevice(doc, graph, breakerId);
}

function addEvent(doc: DrawingDocument, message: string, targetObjectId: string): DrawingDocument {
  const event: OperationEvent = { id: `event-${Date.now()}-${Math.floor(Math.random() * 9999)}`, timestamp: new Date().toISOString(), message, targetObjectId, reason: message, severity: 'alarm', source: 'secondary' };
  return { ...doc, operationEvents: [...doc.operationEvents, event] };
}
