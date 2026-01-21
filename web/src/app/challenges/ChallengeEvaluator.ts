import type { Edge, Node } from "reactflow";

import { computeEnergized } from "../../core/energize";
import type { NodeKind } from "../../core/model";
import { flowToMimicLocal, getMimicData } from "../mimic/graphUtils";
import type { ChallengeScenario, ScenarioObjective } from "./types";

type ObjectiveResult = {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
};

export type ChallengeEvaluation = {
  objectives: ObjectiveResult[];
  issues: string[];
  score: number;
  stars: 1 | 2 | 3 | 0;
  breakdown: {
    baseScore: number;
    penalties: Array<{ label: string; value: number }>;
    resilience?: Array<{ label: string; passed: boolean }>;
  };
};

function toEnergizeNodes(nodes: any[]) {
  return nodes.map((n) => {
    if (n.kind !== "iface") return n;
    const label = n.label ?? n.id;
    const isSource = n.id.startsWith("SRC") || String(label).toLowerCase().includes("source");
    return isSource ? { ...n, kind: "source", sourceOn: true } : n;
  });
}

function countByKind(nodes: Node[]) {
  const counts: Partial<Record<NodeKind, number>> = {};
  nodes.forEach((n) => {
    const md = getMimicData(n);
    if (!md) return;
    counts[md.kind] = (counts[md.kind] ?? 0) + 1;
  });
  return counts;
}

function computeStars(score: number, thresholds: { one: number; two: number; three: number }) {
  if (score >= thresholds.three) return 3;
  if (score >= thresholds.two) return 2;
  if (score >= thresholds.one) return 1;
  return 0;
}

function evaluateObjective(
  objective: ScenarioObjective,
  nodes: Node[],
  edges: Edge[],
  energizedIds: Set<string>
): ObjectiveResult {
  switch (objective.type) {
    case "energizeTerminal": {
      const terminalId = objective.params?.terminalId as string | undefined;
      const passed = terminalId ? energizedIds.has(terminalId) : false;
      return { id: objective.id, label: objective.label, passed };
    }
    case "connectBetween": {
      const from = objective.params?.from as string | undefined;
      const to = objective.params?.to as string | undefined;
      if (!from || !to) return { id: objective.id, label: objective.label, passed: false };
      const visited = new Set<string>();
      const adj = new Map<string, string[]>();
      edges.forEach((e) => {
        if (!adj.has(e.source)) adj.set(e.source, []);
        if (!adj.has(e.target)) adj.set(e.target, []);
        adj.get(e.source)!.push(e.target);
        adj.get(e.target)!.push(e.source);
      });
      const queue = [from];
      while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        if (id === to) return { id: objective.id, label: objective.label, passed: true };
        (adj.get(id) ?? []).forEach((next) => {
          if (!visited.has(next)) queue.push(next);
        });
      }
      return { id: objective.id, label: objective.label, passed: false };
    }
    case "includeComponent": {
      const kinds = (objective.params?.kinds ?? []) as NodeKind[];
      const requiredCount = Number(objective.params?.count ?? 1);
      const counts = countByKind(nodes);
      const passed = kinds.every((kind) => (counts[kind] ?? 0) >= requiredCount);
      return { id: objective.id, label: objective.label, passed };
    }
    case "noIllegalOperations": {
      const violations = Number(objective.params?.violations ?? 0);
      const expectViolation = objective.params?.expectViolation === true;
      const passed = expectViolation ? violations > 0 : violations === 0;
      return { id: objective.id, label: objective.label, passed };
    }
    default:
      return { id: objective.id, label: objective.label, passed: false };
  }
}

function countUnusedComponents(nodes: Node[], edges: Edge[], energizedNodes: Set<string>) {
  const adjacency = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    if (!adjacency.has(e.target)) adjacency.set(e.target, []);
    adjacency.get(e.source)!.push(e.target);
    adjacency.get(e.target)!.push(e.source);
  });

  const visited = new Set<string>();
  const queue: string[] = Array.from(energizedNodes);
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    (adjacency.get(id) ?? []).forEach((next) => {
      if (!visited.has(next)) queue.push(next);
    });
  }

  return nodes.filter((n) => {
    const md = getMimicData(n);
    if (!md) return false;
    if (md.kind === "junction" || md.kind === "iface") return false;
    return !visited.has(n.id);
  }).length;
}

export function evaluateChallenge(
  scenario: ChallengeScenario,
  nodes: Node[],
  edges: Edge[],
  options?: { noIllegalOperationsViolations?: number }
): ChallengeEvaluation {
  const { nodes: mimicNodes, edges: mimicEdges } = flowToMimicLocal(nodes, edges);
  const energized = computeEnergized(toEnergizeNodes(mimicNodes as any[]), mimicEdges as any);
  const objectiveResults = scenario.objectives.map((objective) => {
    if (objective.type === "noIllegalOperations") {
      return evaluateObjective(
        { ...objective, params: { ...objective.params, violations: options?.noIllegalOperationsViolations ?? 0 } },
        nodes,
        edges,
        energized.energizedNodeIds
      );
    }
    return evaluateObjective(objective, nodes, edges, energized.energizedNodeIds);
  });

  const issues = objectiveResults.filter((o) => !o.passed).map((o) => o.label);

  const baseScore = Math.round((objectiveResults.filter((o) => o.passed).length / objectiveResults.length) * 100);
  const penalties: Array<{ label: string; value: number }> = [];
  const counts = countByKind(nodes);
  const targetCounts = scenario.scoring.targetCounts ?? {};
  const penaltyWeights = scenario.scoring.penalties ?? {};

  Object.entries(targetCounts).forEach(([kind, target]) => {
    const actual = counts[kind as NodeKind] ?? 0;
    if (actual > target) {
      const penalty = (actual - target) * (penaltyWeights.excessComponents ?? 0);
      if (penalty > 0) penalties.push({ label: `Excess ${kind.toUpperCase()}`, value: penalty });
    }
  });

  if (penaltyWeights.unusedComponents) {
    const unused = countUnusedComponents(nodes, edges, energized.energizedNodeIds);
    if (unused > 0) penalties.push({ label: "Unused components", value: unused * penaltyWeights.unusedComponents });
  }

  let score = baseScore - penalties.reduce((acc, p) => acc + p.value, 0);
  score = Math.max(0, Math.min(100, score));

  const resilience = scenario.scoring.resilienceTests?.map((test) => {
    if (test.type === "tripDevice") {
      const clonedNodes = nodes.map((n) => ({ ...n, data: { ...(n.data as any) } }));
      const clonedEdges = edges.map((e) => ({ ...e }));
      const target = test.deviceId
        ? clonedNodes.find((n) => n.id === test.deviceId)
        : clonedNodes.find((n) => getMimicData(n)?.kind === test.kind);
      if (target) {
        const md = getMimicData(target);
        if (md && (md.kind === "cb" || md.kind === "ds" || md.kind === "es")) {
          target.data = { ...(target.data as any), mimic: { ...md, state: "open" } };
        }
      }
      const { nodes: mimicNodesCloned, edges: mimicEdgesCloned } = flowToMimicLocal(clonedNodes, clonedEdges);
      const energizedCloned = computeEnergized(toEnergizeNodes(mimicNodesCloned as any[]), mimicEdgesCloned as any);
      const required = test.requiredEnergized ?? [];
      const passed = required.every((id) => energizedCloned.energizedNodeIds.has(id));
      return { label: `Trip ${test.deviceId ?? test.kind ?? "device"}`, passed };
    }
    return { label: `Test ${test.type}`, passed: false };
  });

  return {
    objectives: objectiveResults,
    issues,
    score,
    stars: computeStars(score, scenario.scoring.starThresholds),
    breakdown: { baseScore, penalties, resilience },
  };
}
