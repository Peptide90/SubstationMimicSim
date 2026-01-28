import type { Edge, Node } from "reactflow";

import type { NodeKind } from "../../core/model";
import { getMimicData } from "../mimic/graphUtils";
import { getChallengeEnergized } from "./energizeUtils";
import type { ChallengeScenario, ScenarioObjective } from "./types";
import type { TutorialActionLog } from "./tutorialRunner";

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
      const shouldBeEnergized = objective.params?.shouldBeEnergized !== false;
      const isEnergized = terminalId ? energizedIds.has(terminalId) : false;
      const passed = shouldBeEnergized ? isEnergized : !isEnergized;
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
    case "buildBay": {
      const from = objective.params?.from as string | undefined;
      const to = objective.params?.to as string | undefined;
      const requiredCounts = (objective.params?.requiredCounts ?? {}) as Partial<Record<NodeKind, number>>;
      const counts = countByKind(nodes);
      const hasCounts = Object.entries(requiredCounts).every(([kind, required]) => (counts[kind as NodeKind] ?? 0) >= required);
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
        if (id === to) return { id: objective.id, label: objective.label, passed: hasCounts };
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
    case "tagIsolation": {
      const count = Number(objective.params?.count ?? 1);
      const kinds = (objective.params?.kinds ?? []) as NodeKind[];
      const tagged = nodes.filter((n) => {
        if ((n.data as any)?.isolationTag !== true) return false;
        if (kinds.length === 0) return true;
        const md = getMimicData(n);
        return md ? kinds.includes(md.kind) : false;
      }).length;
      return { id: objective.id, label: objective.label, passed: tagged >= count };
    }
    case "noFailedComponents": {
      const kinds = (objective.params?.kinds ?? []) as NodeKind[];
      const failed = nodes.filter((n) => {
        const data = n.data as any;
        if (!data || data.health === "ok" || data.health === undefined) return false;
        if (kinds.length === 0) return true;
        const md = getMimicData(n);
        return md ? kinds.includes(md.kind) : false;
      });
      return { id: objective.id, label: objective.label, passed: failed.length === 0 };
    }
    default:
      return { id: objective.id, label: objective.label, passed: false };
  }
}

function buildInitialNodes(scenario: ChallengeScenario, nodes: Node[]) {
  const initialMap = new Map<string, Node>();
  scenario.initialGraph.locked.nodes.forEach((n) => initialMap.set(n.id, n));
  scenario.initialGraph.player?.nodes.forEach((n) => initialMap.set(n.id, n));
  return nodes.map((n) => {
    const md = getMimicData(n);
    const initial = initialMap.get(n.id);
    const initialMd = initial ? getMimicData(initial) : null;
    if (!md) return n;
    const initialState =
      initialMd?.state ?? ((md.kind === "cb" || md.kind === "ds" || md.kind === "es") ? "open" : md.state);
    return {
      ...n,
      data: { ...(n.data as any), mimic: { ...md, state: initialState } },
    };
  });
}

function evaluateSequenceObjective(
  objective: ScenarioObjective,
  scenario: ChallengeScenario,
  nodes: Node[],
  edges: Edge[],
  actionLog?: TutorialActionLog
): ObjectiveResult {
  const switchIds = (objective.params?.switchIds ?? []) as string[];
  const earthIds = (objective.params?.earthIds ?? []) as string[];
  const switchKindCounts = (objective.params?.switchKindCounts ?? {}) as Partial<Record<NodeKind, number>>;
  const earthKindCounts = (objective.params?.earthKindCounts ?? {}) as Partial<Record<NodeKind, number>>;
  const terminalId = objective.params?.terminalId as string | undefined;
  const mode = objective.params?.mode as "energize" | "isolate" | undefined;
  const requirePriorEnergize = objective.params?.requirePriorEnergize === true;

  const simulatedNodes = buildInitialNodes(scenario, nodes);
  const toggles = actionLog?.toggles ?? [];

  const hasState = (ids: string[], kindCounts: Partial<Record<NodeKind, number>>, state: string) => {
    if (ids.length > 0) {
      return ids.every((id) => {
        const node = simulatedNodes.find((n) => n.id === id);
        const md = node ? getMimicData(node) : null;
        return md?.state === state;
      });
    }
    return Object.entries(kindCounts).every(([kind, count]) => {
      const countInState = simulatedNodes.filter((n) => {
        const md = getMimicData(n);
        return md?.kind === kind && md?.state === state;
      }).length;
      return countInState >= count;
    });
  };

  const isLoadEnergized = () => {
    if (!terminalId) return false;
    return getChallengeEnergized(simulatedNodes, edges).energizedNodeIds.has(terminalId);
  };

  const meetsEnergize = () =>
    isLoadEnergized() &&
    hasState(switchIds, switchKindCounts, "closed") &&
    hasState(earthIds, earthKindCounts, "open");
  const meetsIsolate = () =>
    !isLoadEnergized() &&
    hasState(switchIds, switchKindCounts, "open") &&
    hasState(earthIds, earthKindCounts, "closed");

  let energizedSeen = meetsEnergize();
  let isolateSeen = !requirePriorEnergize && meetsIsolate();

  toggles.forEach((toggle) => {
    const node = simulatedNodes.find((n) => n.id === toggle.nodeId);
    const md = node ? getMimicData(node) : null;
    if (node && md && (md.kind === "cb" || md.kind === "ds" || md.kind === "es")) {
      node.data = { ...(node.data as any), mimic: { ...md, state: toggle.to } };
    }
    if (!energizedSeen && meetsEnergize()) energizedSeen = true;
    if (!isolateSeen && energizedSeen && meetsIsolate()) isolateSeen = true;
  });

  const passed = mode === "isolate" ? isolateSeen : energizedSeen;
  return { id: objective.id, label: objective.label, passed };
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
  options?: {
    noIllegalOperationsViolations?: number;
    actionLog?: TutorialActionLog;
    extraPenalties?: Array<{ label: string; value: number }>;
  }
): ChallengeEvaluation {
  const energized = getChallengeEnergized(nodes, edges);
  const objectiveResults = scenario.objectives.map((objective) => {
    if (objective.type === "noIllegalOperations") {
      return evaluateObjective(
        { ...objective, params: { ...objective.params, violations: options?.noIllegalOperationsViolations ?? 0 } },
        nodes,
        edges,
        energized.energizedNodeIds
      );
    }
    if (objective.type === "sequence") {
      return evaluateSequenceObjective(objective, scenario, nodes, edges, options?.actionLog);
    }
    return evaluateObjective(objective, nodes, edges, energized.energizedNodeIds);
  });

  const issues = objectiveResults.filter((o) => !o.passed).map((o) => o.label);

  const baseScore = Math.round((objectiveResults.filter((o) => o.passed).length / objectiveResults.length) * 100);
  const penalties: Array<{ label: string; value: number }> = [];
  const counts = countByKind(nodes);
  const targetCounts = scenario.scoring.targetCounts ?? {};
  const penaltyWeights = scenario.scoring.penalties ?? {};
  const failedComponents = nodes.filter((n) => {
    const data = n.data as any;
    if (!data) return false;
    return data.health && data.health !== "ok";
  });

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

  if (failedComponents.length > 0) {
    const failedPenalty = failedComponents.length * (penaltyWeights.failedComponents ?? 15);
    penalties.push({ label: "Failed components", value: failedPenalty });
    issues.push("Failed components present.");
  }
  if (options?.extraPenalties?.length) {
    penalties.push(...options.extraPenalties);
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
      const energizedCloned = getChallengeEnergized(clonedNodes, clonedEdges);
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
