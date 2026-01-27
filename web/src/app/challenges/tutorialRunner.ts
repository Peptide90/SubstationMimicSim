import type { Edge, Node } from "reactflow";

import type { ScenarioTutorialStep } from "./types";
import { getMimicData } from "../mimic/graphUtils";
import type { SwitchState } from "../../core/model";

export type TutorialState = {
  stepIndex: number;
  steps: ScenarioTutorialStep[];
};

export type TutorialProgress = {
  canAdvance: boolean;
  currentStep?: ScenarioTutorialStep;
};

export function evaluateTutorialStep(
  state: TutorialState,
  nodes: Node[],
  edges: Edge[],
  recentActions: TutorialActionLog
): TutorialProgress {
  const currentStep = state.steps[state.stepIndex];
  if (!currentStep) return { canAdvance: false };
  if (!currentStep.requires) return { canAdvance: true, currentStep };

  const { type, params } = currentStep.requires;
  if (type === "place") {
    const kind = params?.kind as string | undefined;
    const count = Number(params?.count ?? 1);
    const placed = nodes.filter((n) => getMimicData(n)?.kind === kind).length;
    return { canAdvance: placed >= count, currentStep };
  }

  if (type === "connect") {
    const from = params?.from as string | undefined;
    const to = params?.to as string | undefined;
    if (!from || !to) return { canAdvance: false, currentStep };
    const adj = new Map<string, string[]>();
    edges.forEach((e) => {
      if (!adj.has(e.source)) adj.set(e.source, []);
      if (!adj.has(e.target)) adj.set(e.target, []);
      adj.get(e.source)!.push(e.target);
      adj.get(e.target)!.push(e.source);
    });
    const visited = new Set<string>();
    const queue = [from];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (id === to) return { canAdvance: true, currentStep };
      (adj.get(id) ?? []).forEach((next) => {
        if (!visited.has(next)) queue.push(next);
      });
    }
    return { canAdvance: false, currentStep };
  }

  if (type === "toggle") {
    const nodeId = params?.nodeId as string | undefined;
    const nodeIds = (params?.nodeIds as string[]) ?? (nodeId ? [nodeId] : []);
    const targetState = params?.to as SwitchState | undefined;
    const satisfied = nodeIds.every((id) => {
      const node = nodes.find((n) => n.id === id);
      const md = node ? getMimicData(node) : null;
      return md && (!targetState || md.state === targetState);
    });
    const recentToggle = nodeIds.some((id) => recentActions.toggles.some((t) => t.nodeId === id));
    return { canAdvance: satisfied && recentToggle, currentStep };
  }

  if (type === "isolation") {
    const nodeId = params?.nodeId as string | undefined;
    const nodeIds = (params?.nodeIds as string[]) ?? (nodeId ? [nodeId] : []);
    const applied = params?.applied as boolean | undefined;
    const satisfied = nodeIds.every((id) => {
      const node = nodes.find((n) => n.id === id);
      const tagged = (node?.data as any)?.isolationTag === true;
      return applied === undefined ? tagged : applied ? tagged : !tagged;
    });
    const recentTag = nodeIds.some((id) => recentActions.isolationTags.some((t) => t.nodeId === id));
    return { canAdvance: satisfied && recentTag, currentStep };
  }

  if (type === "check") {
    return { canAdvance: recentActions.checks > 0, currentStep };
  }

  return { canAdvance: false, currentStep };
}

export type TutorialActionLog = {
  placements: Array<{ nodeId: string; kind: string }>;
  toggles: Array<{ nodeId: string; to: SwitchState } >;
  isolationTags: Array<{ nodeId: string; applied: boolean }>;
  checks: number;
};

export function createTutorialActionLog(): TutorialActionLog {
  return { placements: [], toggles: [], isolationTags: [], checks: 0 };
}
