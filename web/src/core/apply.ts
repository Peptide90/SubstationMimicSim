import type { MimicNode, Rule, SwitchState } from './model';
import type { SwitchAction, ValidationResult } from './interlocks';
import { validateAction } from './interlocks';

export type ApplyResult =
  | { ok: true; nodes: MimicNode[] }
  | { ok: false; nodes: MimicNode[]; validation: ValidationResult };

export function setSwitchState(nodes: MimicNode[], nodeId: string, to: SwitchState): MimicNode[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, state: to } : n));
}

export function toggleSwitchState(nodes: MimicNode[], nodeId: string): { nodeId: string; to: SwitchState } {
  const node = nodes.find((n) => n.id === nodeId);
  const current = node?.state ?? 'open';
  const to: SwitchState = current === 'closed' ? 'open' : 'closed';
  return { nodeId, to };
}

export function applySwitchAction(nodes: MimicNode[], rules: Rule[], action: SwitchAction): ApplyResult {
  const validation = validateAction(nodes, rules, action);
  if (!validation.ok) return { ok: false, nodes, validation };

  return { ok: true, nodes: setSwitchState(nodes, action.nodeId, action.to) };
}

// Useful later for “buttons that operate tags”
export function applySequence(
  nodes: MimicNode[],
  rules: Rule[],
  actions: SwitchAction[],
): { ok: true; nodes: MimicNode[] } | { ok: false; nodes: MimicNode[]; failedAt: number; validation: ValidationResult } {
  let current = nodes;

  for (let i = 0; i < actions.length; i++) {
    const res = applySwitchAction(current, rules, actions[i]);
    if (!res.ok) return { ok: false, nodes: current, failedAt: i, validation: res.validation };
    current = res.nodes;
  }

  return { ok: true, nodes: current };
}
