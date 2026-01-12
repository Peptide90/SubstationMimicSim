import type { MimicNode, Rule, SwitchState } from './model';

export type SwitchAction = {
  nodeId: string;
  to: SwitchState;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string; blockedBy?: Rule };

function nodeState(nodesById: Map<string, MimicNode>, nodeId: string): SwitchState | undefined {
  return nodesById.get(nodeId)?.state;
}

function matchesAction(ruleAction: { nodeId: string; to: SwitchState }, action: SwitchAction): boolean {
  return ruleAction.nodeId === action.nodeId && ruleAction.to === action.to;
}

export function validateAction(nodes: MimicNode[], rules: Rule[], action: SwitchAction): ValidationResult {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  for (const rule of rules) {
    if (rule.type === 'requires') {
      if (!matchesAction(rule.action, action)) continue;

      for (const req of rule.requires) {
        const s = nodeState(nodesById, req.nodeId);
        if (s !== req.state) {
          return {
            ok: false,
            reason: `Interlock: ${action.nodeId} cannot ${action.to} unless ${req.nodeId} is ${req.state}.`,
            blockedBy: rule,
          };
        }
      }
    }

    if (rule.type === 'forbids') {
      if (!matchesAction(rule.action, action)) continue;

      for (const fb of rule.forbids) {
        const s = nodeState(nodesById, fb.nodeId);
        if (s === fb.state) {
          return {
            ok: false,
            reason: `Interlock: ${action.nodeId} cannot ${action.to} while ${fb.nodeId} is ${fb.state}.`,
            blockedBy: rule,
          };
        }
      }
    }

    if (rule.type === 'mutex') {
      // MVP interpretation:
      // if action would CLOSE a node, prevent it if any other node in the mutex set is already closed
      if (action.to !== 'closed') continue;
      if (!rule.nodes.includes(action.nodeId)) continue;

      for (const otherId of rule.nodes) {
        if (otherId === action.nodeId) continue;
        const s = nodeState(nodesById, otherId);
        if (s === 'closed') {
          return {
            ok: false,
            reason: `Interlock: ${action.nodeId} cannot close because ${otherId} is already closed (mutual exclusion).`,
            blockedBy: rule,
          };
        }
      }
    }
  }

  return { ok: true };
}
