import type { DrawingDocument } from '../drawing/model';
import { deriveOperationState } from './operation';
import type { TopologyGraph, TopologyWarning } from './types';

export function validateTopology(doc: DrawingDocument, graph: TopologyGraph): TopologyWarning[] {
  const warnings: TopologyWarning[] = [];

  graph.terminals.forEach((t) => {
    if (!t.connectedNodeIds.length) {
      warnings.push({ id: `floating:${t.id}`, severity: 'warning', code: 'FLOATING_TERMINAL', message: `Terminal ${t.id} is not connected.`, objectId: t.parentObjectId });
    }
  });

  doc.objects.busbars.forEach((b) => {
    const used = graph.branches.some((br) => br.objectId === b.id);
    if (!used) warnings.push({ id: `busbar:${b.id}`, severity: 'warning', code: 'UNUSED_BUSBAR', message: `Busbar ${b.id} has no electrical connections.`, objectId: b.id });
  });

  const labels = doc.objects.symbols.map((s) => s.label?.text).filter(Boolean) as string[];
  const seen = new Set<string>();
  labels.forEach((l) => {
    if (seen.has(l)) warnings.push({ id: `label:${l}`, severity: 'warning', code: 'DUPLICATE_LABEL', message: `Duplicate label ${l}.` });
    seen.add(l);
  });

  doc.objects.symbols.forEach((s) => {
    if (s.type === 'transformer') {
      const hv = s.terminals.find((t) => t.name === 'hv');
      const lv = s.terminals.find((t) => t.name === 'lv');
      if (!hv || !lv) warnings.push({ id: `xf:${s.id}`, severity: 'warning', code: 'TRANSFORMER_SIDE_MISSING', message: `Transformer ${s.id} is missing HV or LV terminal.`, objectId: s.id });
    }
  });

  const operation = deriveOperationState(doc, graph);
  operation.voltageConflictNodeIds.forEach((nodeId) => {
    const voltages = [...(operation.nodeVoltageKv.get(nodeId) ?? [])].sort((a, b) => a - b);
    warnings.push({
      id: `voltage-node:${nodeId}`,
      severity: 'error',
      code: 'VOLTAGE_MISMATCH_NODE',
      message: `Node ${nodeId} has incompatible live voltage systems${voltages.length ? ` (${voltages.join('/')} kV)` : ''}. Use a transformer or converter boundary.`,
    });
  });
  operation.voltageConflictBranchIds.forEach((branchId) => {
    const branch = graph.branches.find((item) => item.id === branchId);
    const voltages = [...(operation.branchVoltageKv.get(branchId) ?? [])].sort((a, b) => a - b);
    warnings.push({
      id: `voltage-branch:${branchId}`,
      severity: 'error',
      code: 'VOLTAGE_MISMATCH_BRANCH',
      message: `Branch ${branchId} is energised by incompatible voltage metadata${voltages.length ? ` (${voltages.join('/')} kV)` : ''}.`,
      objectId: branch?.objectId
    });
  });

  return warnings;
}
