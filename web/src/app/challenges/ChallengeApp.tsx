import { useCallback, useMemo, useRef, useState } from "react";
import { addEdge, useEdgesState, useNodesState, useReactFlow, useStore } from "reactflow";
import type { Connection, Edge, Node } from "reactflow";

import { CHALLENGE_SCENARIOS, getScenarioById } from "./scenarios";
import type { ChallengeScenario } from "./types";
import { evaluateChallenge } from "./ChallengeEvaluator";
import { createTutorialActionLog, evaluateTutorialStep } from "./tutorialRunner";
import { loadChallengeProgress, updateChallengeProgress } from "./storage";
import { makeSandboxConfig } from "../mimic/EditorModeConfig";
import { getMimicData, makeBusbarEdge, makeNode } from "../mimic/graphUtils";
import type { NodeKind, SwitchState } from "../../core/model";
import { EditorCanvas } from "../../components/EditorCanvas";
import { TopToolbar } from "../../components/TopToolbar";
import { ChallengePanel } from "../../components/ChallengePanel";
import { getChallengeEnergized, getChallengeLoadIds } from "./energizeUtils";

import { JunctionNode } from "../../ui/nodes/JunctionNode";
import { ScadaNode } from "../../ui/nodes/ScadaNode";
import { InterfaceNode } from "../../ui/nodes/InterfaceNode";
import { FaultNode } from "../../ui/nodes/FaultNode";

const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;

type ChallengeView = "levels" | "runner";

type TutorialState = {
  stepIndex: number;
};

type ArcEffect = {
  id: string;
  nodeId: string;
  kind: "ds_arc" | "cb_arc";
  startedAt: number;
  durationMs: number;
};

type Props = {
  buildTag: string;
  onExit: () => void;
};

function buildNodesFromScenario(scenario: ChallengeScenario) {
  const lockedNodes = scenario.initialGraph.locked.nodes.map((n) => ({
    ...n,
    draggable: false,
    data: { ...(n.data as any), locked: true },
  }));
  const playerNodes = scenario.initialGraph.player?.nodes ?? [];
  return [...lockedNodes, ...playerNodes];
}

function buildEdgesFromScenario(scenario: ChallengeScenario) {
  const lockedEdges = scenario.initialGraph.locked.edges.map((e) => ({
    ...e,
    data: { ...(e.data as any), locked: true },
  }));
  const playerEdges = scenario.initialGraph.player?.edges ?? [];
  return [...lockedEdges, ...playerEdges];
}

function getNodeDimensions(kind: NodeKind) {
  if (kind === "cb") return { w: 60, h: 60 };
  if (kind === "ds" || kind === "es") return { w: 100, h: 40 };
  if (kind === "tx") return { w: 100, h: 80 };
  if (kind === "iface") return { w: 60, h: 60 };
  return { w: 120, h: 48 };
}

function isConducting(kind: NodeKind, state?: SwitchState, sourceOn?: boolean): boolean {
  if (kind === "source") return sourceOn === true;
  if (kind === "cb" || kind === "ds") return state === "closed";
  if (kind === "es") return false;
  return true;
}

function computeGroundedVisual(nodes: Node[], edges: Edge[]) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, Array<{ other: string; edgeId: string }>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push({ other: e.target, edgeId: e.id });
    adj.get(e.target)!.push({ other: e.source, edgeId: e.id });
  }

  const groundedNodeIds = new Set<string>();
  const groundedEdgeIds = new Set<string>();
  const queue: string[] = nodes
    .filter((n) => {
      const md = getMimicData(n);
      return md?.kind === "es" && md.state === "closed";
    })
    .map((n) => n.id);

  while (queue.length) {
    const id = queue.shift()!;
    if (groundedNodeIds.has(id)) continue;
    const node = nodeById.get(id);
    const md = node ? getMimicData(node) : null;
    if (!node || !md || md.kind === "source") continue;

    groundedNodeIds.add(id);

    for (const { other, edgeId } of adj.get(id) ?? []) {
      const otherNode = nodeById.get(other);
      const otherMd = otherNode ? getMimicData(otherNode) : null;
      if (!otherNode || !otherMd) continue;

      groundedEdgeIds.add(edgeId);
      if (otherMd.kind === "source") continue;

      if (otherMd.kind === "es") {
        groundedNodeIds.add(otherNode.id);
        continue;
      }
      if ((otherMd.kind === "ds" || otherMd.kind === "cb") && otherMd.state !== "closed") {
        groundedNodeIds.add(otherNode.id);
        continue;
      }
      if (isConducting(otherMd.kind, otherMd.state, otherMd.sourceOn)) queue.push(other);
    }
  }

  return { groundedNodeIds, groundedEdgeIds };
}

function computeLockedSets(scenario: ChallengeScenario) {
  return {
    nodes: new Set([...(scenario.buildRules.lockedNodes ?? [])]),
    edges: new Set([...(scenario.buildRules.lockedEdges ?? [])]),
  };
}

function canPlaceInZones(position: { x: number; y: number }, zones?: Array<{ x: number; y: number; width: number; height: number }>) {
  if (!zones || zones.length === 0) return true;
  return zones.some((z) => position.x >= z.x && position.x <= z.x + z.width && position.y >= z.y && position.y <= z.y + z.height);
}

export function ChallengeApp({ buildTag, onExit }: Props) {
  const [view, setView] = useState<ChallengeView>("levels");
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [progress, setProgress] = useState(loadChallengeProgress());

  const scenario = activeScenarioId ? getScenarioById(activeScenarioId) : undefined;
  const initialNodes = scenario ? buildNodesFromScenario(scenario) : [];
  const initialEdges = scenario ? buildEdgesFromScenario(scenario) : [];

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [liveIssues, setLiveIssues] = useState<string[]>([]);
  const [tutorialCallouts, setTutorialCallouts] = useState<string[]>([]);
  const [arcEffects, setArcEffects] = useState<ArcEffect[]>([]);
  const [tutorialState, setTutorialState] = useState<TutorialState>({ stepIndex: 0 });
  const [tutorialViolations, setTutorialViolations] = useState(0);
  const tutorialActionLog = useRef(createTutorialActionLog());
  const [interlockOverrides, setInterlockOverrides] = useState<Set<string>>(() => new Set());
  const { screenToFlowPosition } = useReactFlow();

  const nodeTypes = useMemo(
    () => ({
      junction: JunctionNode,
      scada: ScadaNode,
      iface: InterfaceNode,
      fault: FaultNode,
    }),
    []
  );

  const energized = useMemo(() => getChallengeEnergized(nodes, edges), [edges, nodes]);
  const grounded = useMemo(() => computeGroundedVisual(nodes, edges), [edges, nodes]);
  const styledEdges = useMemo(
    () =>
      edges.map((edge) => {
        const energizedEdge = energized.energizedEdgeIds.has(edge.id);
        const groundedEdge = grounded.groundedEdgeIds.has(edge.id);
        const conflict = energizedEdge && groundedEdge;
        const baseStroke = conflict ? "#ff4d4d" : groundedEdge ? "#ffb020" : energizedEdge ? "#00e5ff" : "#64748b";
        const baseStyle = conflict || groundedEdge ? { strokeDasharray: "10 6" } : {};
        return {
          ...edge,
          style: {
            ...(edge.style as any),
            stroke: baseStroke,
            strokeWidth: energizedEdge || groundedEdge ? 4 : 3,
            ...baseStyle,
          },
          animated: energizedEdge,
        };
      }),
    [edges, energized.energizedEdgeIds, grounded.groundedEdgeIds]
  );

  const resetScenario = useCallback(
    (nextScenario: ChallengeScenario) => {
      const nextNodes = buildNodesFromScenario(nextScenario);
      const nextEdges = buildEdgesFromScenario(nextScenario);
      setNodes(nextNodes);
      setEdges(nextEdges);
      setEvaluation(null);
      setIssues([]);
      setTutorialState({ stepIndex: 0 });
      setTutorialViolations(0);
      setLiveIssues([]);
      setTutorialCallouts([]);
      setArcEffects([]);
      setInterlockOverrides(new Set());
      tutorialActionLog.current = createTutorialActionLog();
    },
    [setEdges, setInterlockOverrides, setNodes]
  );

  const resetTutorialStep = useCallback(() => {
    if (!scenario) return;
    const nextNodes = buildNodesFromScenario(scenario);
    const nextEdges = buildEdgesFromScenario(scenario);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setEvaluation(null);
    setIssues([]);
    setTutorialViolations(0);
    setLiveIssues([]);
    setTutorialCallouts([]);
    setArcEffects([]);
    setInterlockOverrides(new Set());
    tutorialActionLog.current = createTutorialActionLog();
  }, [scenario, setEdges, setInterlockOverrides, setNodes]);

  const startScenario = useCallback(
    (scenarioToStart: ChallengeScenario) => {
      setActiveScenarioId(scenarioToStart.id);
      resetScenario(scenarioToStart);
      setView("runner");
    },
    [resetScenario]
  );

  const scenarioConfig = useMemo<import("../mimic/EditorModeConfig").EditorModeConfig>(() => {
    if (!scenario) return makeSandboxConfig();
    const { nodes: lockedNodes, edges: lockedEdges } = computeLockedSets(scenario);
    return {
      ...makeSandboxConfig(),
      id: "challenge" as const,
      label: "Solo: Substation Builder Challenges",
      palette: {
        enabled: scenario.buildRules.allowedPalette.length > 0,
        allowedKinds: scenario.buildRules.allowedPalette,
      },
      lockedNodeIds: lockedNodes,
      lockedEdgeIds: lockedEdges,
      disableInterlocking: true,
      disableLabelling: true,
      disableSaveLoad: true,
      disablePowerFlow: true,
      buildZones: scenario.buildRules.buildZones,
      allowConnections: true,
    };
  }, [scenario]);

  const onNodesChangeSnapped = useCallback(
    (changes: any) => {
      const filtered = (changes as Array<{ id?: string; type?: string }>).filter((change) => {
        if (!change.id) return true;
        if (scenarioConfig.lockedNodeIds.has(change.id) && change.type === "remove") return false;
        return true;
      });
      onNodesChangeBase(filtered as any);
      const movedIds = new Set<string>();
      for (const change of filtered as Array<{ id?: string; type?: string; dragging?: boolean }>) {
        if (!change?.id) continue;
        if (change.type === "position" && change.dragging) movedIds.add(change.id);
      }
      if (movedIds.size === 0) return;
      setNodes((ns) =>
        ns.map((n) =>
          movedIds.has(n.id)
            ? { ...n, position: { x: snap(n.position.x), y: snap(n.position.y) } }
            : n
        )
      );
    },
    [onNodesChangeBase, scenarioConfig.lockedNodeIds, setNodes]
  );

  const enforcePlacementRules = useCallback(
    (kind: NodeKind, pos: { x: number; y: number }) => {
      if (!scenario) return false;
      if (!scenario.buildRules.allowedPalette.includes(kind)) return false;
      const counts = nodes.reduce((acc, n) => {
        const md = getMimicData(n);
        if (!md) return acc;
        acc[md.kind] = (acc[md.kind] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const max = scenario.buildRules.maxCounts?.[kind];
      if (max && (counts[kind] ?? 0) >= max) return false;
      if (!canPlaceInZones(pos, scenario.buildRules.buildZones)) return false;
      return true;
    },
    [nodes, scenario]
  );

  const handleAddNode = useCallback(
    (kind: NodeKind, pos: { x: number; y: number }) => {
      if (!scenario) return;
      if (!enforcePlacementRules(kind, pos)) return;
      const id = `${kind}-${crypto.randomUUID().slice(0, 6)}`;
      setNodes((ns) => ns.concat(makeNode(kind, id, pos.x, pos.y, { state: kind === "cb" || kind === "ds" || kind === "es" ? "open" : undefined })));
      tutorialActionLog.current.placements.push({ nodeId: id, kind });
    },
    [enforcePlacementRules, scenario, setNodes]
  );

  const onDragOver = useCallback((evt: React.DragEvent) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (evt: React.DragEvent) => {
      evt.preventDefault();
      const kind = evt.dataTransfer.getData("application/mimic-node-kind") as NodeKind;
      if (!kind) return;
      const pos = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
      const snapped = { x: snap(pos.x), y: snap(pos.y) };
      handleAddNode(kind, snapped);
    },
    [handleAddNode, screenToFlowPosition]
  );

  const onAddAtCenter = useCallback(
    (kind: NodeKind) => {
      handleAddNode(kind, { x: 260, y: 160 });
    },
    [handleAddNode]
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!scenario) return;
      if (!c.source || !c.target) return;
      const newEdge = makeBusbarEdge(c.source, c.target, c.sourceHandle ?? undefined, c.targetHandle ?? undefined);
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [scenario, setEdges]
  );

  const addCallout = useCallback((message: string) => {
    setTutorialCallouts((prev) => (prev.includes(message) ? prev : [...prev, message]));
  }, []);

  const triggerArc = useCallback((nodeId: string, kind: ArcEffect["kind"], durationMs: number) => {
    const id = `arc-${crypto.randomUUID().slice(0, 6)}`;
    const startedAt = Date.now();
    setArcEffects((prev) => prev.concat({ id, nodeId, kind, startedAt, durationMs }));
    window.setTimeout(() => {
      setArcEffects((prev) => prev.filter((effect) => effect.id !== id));
    }, durationMs);
  }, []);

  const isSwitchCarryingLoad = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      const md = node ? getMimicData(node) : null;
      if (!node || !md || (md.kind !== "cb" && md.kind !== "ds" && md.kind !== "es")) return false;
      if ((md.state ?? "open") !== "closed") return false;

      const energizedBefore = getChallengeEnergized(nodes, edges);
      if (!energizedBefore.energizedNodeIds.has(nodeId)) return false;
      const loadIds = getChallengeLoadIds(nodes);
      const energizedLoads = loadIds.filter((id) => energizedBefore.energizedNodeIds.has(id));
      if (energizedLoads.length === 0) return false;

      const nextNodes = nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const nextData = { ...(n.data as any) };
        const mimic = getMimicData(n);
        if (!mimic) return n;
        return { ...n, data: { ...nextData, mimic: { ...mimic, state: "open" } } };
      });

      const energizedAfter = getChallengeEnergized(nextNodes, edges);
      return energizedLoads.some((loadId) => !energizedAfter.energizedNodeIds.has(loadId));
    },
    [edges, nodes]
  );

  const onNodeClick = useCallback(
    (_evt: any, node: Node) => {
      const md = getMimicData(node);
      if (!md || md.kind === "junction") return;
      if (scenarioConfig.lockedNodeIds.has(node.id) && md.kind !== "cb" && md.kind !== "ds" && md.kind !== "es") {
        return;
      }

      const health = (node.data as any)?.health ?? "ok";
      if (health !== "ok") {
        addCallout((node.data as any)?.lockoutReason ?? "This device is locked out due to damage.");
        return;
      }

      if (md.kind === "cb" || md.kind === "ds" || md.kind === "es") {
        const current = md.state ?? "open";
        const to: SwitchState = current === "closed" ? "open" : "closed";

        const isChallengeTutorial = scenarioConfig.id === "challenge" && scenario?.type === "tutorial";
        const opening = to === "open";
        const underLoad = opening && isChallengeTutorial ? isSwitchCarryingLoad(node.id) : false;

        tutorialActionLog.current.toggles.push({ nodeId: node.id, to });

        if (opening && isChallengeTutorial && md.kind === "ds" && underLoad) {
          triggerArc(node.id, "ds_arc", 1200);
          setTutorialViolations((v) => v + 1);
          const lockoutMessage =
            "Disconnectors are not designed to interrupt load current. With no alternate path, the air gap forces a fierce arc.";
          addCallout(lockoutMessage);
          setNodes((ns) =>
            ns.map((n) => {
              if (n.id !== node.id) return n;
              return {
                ...n,
                data: {
                  ...(n.data as any),
                  mimic: { ...md, state: "open" },
                },
              };
            })
          );
          window.setTimeout(() => {
            setNodes((ns) =>
              ns.map((n) => {
                if (n.id !== node.id) return n;
                return {
                  ...n,
                  data: {
                    ...(n.data as any),
                    health: "failed",
                    lockoutReason: lockoutMessage,
                    lastFaultAt: Date.now(),
                    mimic: { ...md, state: "open" },
                  },
                };
              })
            );
          }, 1200);
          return;
        }

        if (opening && isChallengeTutorial && md.kind === "cb" && underLoad) {
          triggerArc(node.id, "cb_arc", 600);
          addCallout("Circuit breakers are designed to interrupt load current and safely quench arcs.");
        }

        if (to === "closed" && isChallengeTutorial && md.kind === "cb") {
          const closedEarths = nodes.filter((n) => {
            const data = getMimicData(n);
            return data?.kind === "es" && data.state === "closed";
          });
          if (closedEarths.length > 0 && !interlockOverrides.has("CB-3")) {
            addCallout("Interlock: CB-3 is blocked while an earth switch is closed.");
            return;
          }
        }

        setNodes((ns) =>
          ns.map((n) => {
            if (n.id !== node.id) return n;
            return { ...n, data: { ...(n.data as any), mimic: { ...md, state: to } } };
          })
        );

        if (to === "closed" && isChallengeTutorial && md.kind === "cb" && interlockOverrides.has("CB-3")) {
          addCallout("CB-3 closed with earths applied. An earth fault trips the breaker immediately.");
          window.setTimeout(() => {
            setNodes((ns) =>
              ns.map((n) => {
                if (n.id !== node.id) return n;
                return { ...n, data: { ...(n.data as any), mimic: { ...md, state: "open" } } };
              })
            );
          }, 500);
        }
      }
    },
    [
      addCallout,
      interlockOverrides,
      isSwitchCarryingLoad,
      nodes,
      scenario,
      scenarioConfig.id,
      scenarioConfig.lockedNodeIds,
      setNodes,
      triggerArc,
    ]
  );

  const onNodeDoubleClick = useCallback(
    (_evt: any, node: Node) => {
      onNodeClick(null, node);
    },
    [onNodeClick]
  );

  const onNodeContextMenu = useCallback(
    (node: Node, _pos: { x: number; y: number }) => {
      const md = getMimicData(node);
      if (!md || md.kind !== "es") return;
      setInterlockOverrides((prev) => {
        const next = new Set(prev);
        if (next.has("CB-3")) {
          next.delete("CB-3");
          addCallout("Interlock enabled for CB-3.");
        } else {
          next.add("CB-3");
          addCallout("Interlock override applied: CB-3 can be operated.");
        }
        return next;
      });
    },
    [addCallout]
  );

  const onEdgeDoubleClick = useCallback(
    (_evt: any, edge: Edge) => {
      if (scenarioConfig.lockedEdgeIds.has(edge.id)) return;
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    },
    [scenarioConfig.lockedEdgeIds, setEdges]
  );

  const onEdgesChangeLocked = useCallback(
    (changes: any) => {
      const filtered = (changes as Array<{ id?: string; type?: string }>).filter((change) => {
        if (!change.id) return true;
        if (scenarioConfig.lockedEdgeIds.has(change.id) && change.type === "remove") return false;
        return true;
      });
      onEdgesChange(filtered as any);
    },
    [onEdgesChange, scenarioConfig.lockedEdgeIds]
  );

  const onCheckSolution = useCallback(() => {
    if (!scenario) return;
    const evaluationResult = evaluateChallenge(scenario, nodes, edges, {
      noIllegalOperationsViolations: tutorialViolations,
    });
    setEvaluation(evaluationResult);
    setIssues(evaluationResult.issues);
    const completed = scenario.type === "tutorial" ? evaluationResult.objectives.every((o) => o.passed) : evaluationResult.stars > 0;
    const nextProgress = updateChallengeProgress(scenario.id, evaluationResult.stars, completed);
    setProgress(nextProgress);
    tutorialActionLog.current.checks += 1;
  }, [edges, nodes, scenario, tutorialViolations]);

  const onRetry = useCallback(() => {
    if (!scenario) return;
    resetScenario(scenario);
  }, [resetScenario, scenario]);

  const onNext = useCallback(() => {
    if (!scenario) return;
    const currentIndex = CHALLENGE_SCENARIOS.findIndex((s) => s.id === scenario.id);
    const next = CHALLENGE_SCENARIOS[currentIndex + 1];
    if (next) startScenario(next);
  }, [scenario, startScenario]);

  const tutorialProgress = useMemo(() => {
    if (!scenario?.tutorialSteps) return { canAdvance: false, currentStep: undefined };
    return evaluateTutorialStep(
      { stepIndex: tutorialState.stepIndex, steps: scenario.tutorialSteps },
      nodes,
      edges,
      tutorialActionLog.current
    );
  }, [edges, nodes, scenario?.tutorialSteps, tutorialState.stepIndex]);

  const onAdvanceTutorial = useCallback(() => {
    if (!scenario?.tutorialSteps) return;
    if (!tutorialProgress.canAdvance) return;
    setTutorialState((s) => ({ stepIndex: Math.min(s.stepIndex + 1, scenario.tutorialSteps!.length) }));
  }, [scenario?.tutorialSteps, tutorialProgress.canAdvance]);

  const unlockedScenarios = useMemo(() => new Set(CHALLENGE_SCENARIOS.map((scenarioItem) => scenarioItem.id)), []);

  if (view === "levels") {
    return (
      <div style={{ width: "100vw", height: "100vh", background: "#060b12", color: "#e2e8f0" }}>
        <TopToolbar
          buildTag={buildTag}
          onOpenMenu={onExit}
          onOpenHelp={() => null}
          disableInterlocking
          disableLabelling
          disableSaveLoad
          disablePowerFlow
        />
        <div style={{ paddingTop: 64, paddingInline: 32 }}>
          <h1 style={{ marginBottom: 8 }}>Solo: Substation Builder Challenges</h1>
          <p style={{ color: "#94a3b8", marginTop: 0 }}>
            Learn substation fundamentals through guided tutorials and graded build challenges.
          </p>
          <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
            {CHALLENGE_SCENARIOS.map((scenarioItem) => {
              const unlocked = unlockedScenarios.has(scenarioItem.id);
              const progressEntry = progress[scenarioItem.id];
              const stars = progressEntry?.stars ?? 0;
              return (
                <div
                  key={scenarioItem.id}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: "1px solid #1f2937",
                    background: "#0b1220",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    alignItems: "center",
                    opacity: unlocked ? 1 : 0.4,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{scenarioItem.title}</div>
                    <div style={{ fontSize: 13, color: "#94a3b8" }}>{scenarioItem.description}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                      {scenarioItem.type === "tutorial" ? "Tutorial" : `Level ${scenarioItem.difficulty}`}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                    <div style={{ fontSize: 12, color: "#fcd34d" }}>{"★".repeat(stars)}</div>
                    <button
                      disabled={!unlocked}
                      onClick={() => startScenario(scenarioItem)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: "1px solid #334155",
                        background: unlocked ? "#38bdf8" : "#1e293b",
                        color: "#0f172a",
                        fontWeight: 700,
                        cursor: unlocked ? "pointer" : "not-allowed",
                      }}
                    >
                      {unlocked ? "Start" : "Locked"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!scenario) return null;

  const tutorialStep = scenario.tutorialSteps?.[tutorialState.stepIndex];
  const combinedIssues = Array.from(new Set([...(liveIssues ?? []), ...(issues ?? [])]));
  const combinedCallouts = Array.from(new Set([...(tutorialCallouts ?? [])]));

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#060b12" }}>
      <TopToolbar
        buildTag={buildTag}
        onOpenMenu={onExit}
        onOpenHelp={() => null}
        disableInterlocking
        disableLabelling
        disableSaveLoad
        disablePowerFlow
      />

      <div style={{ display: "flex", height: "100vh", paddingTop: 52, position: "relative" }}>
        <EditorCanvas
          nodes={nodes}
          edges={styledEdges}
          rawEdges={edges}
          setNodes={setNodes}
          setEdges={setEdges}
          nodeTypes={nodeTypes}
          locked={false}
          snapEnabled
          onToggleSnap={() => null}
          onToggleLock={() => null}
          onNodesChange={onNodesChangeSnapped}
          onEdgesChange={onEdgesChangeLocked}
          isValidConnection={() => true}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeDragStart={() => null}
          onNodeDragStop={() => null}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onAddAtCenter={onAddAtCenter}
          onEdgeClick={() => null}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeContextMenu={() => null}
          onNodeContextMenu={onNodeContextMenu}
          onPaneContextMenu={() => null}
          onPaneClick={() => null}
          modeConfig={scenarioConfig}
        />

        <ChallengePanel
          title={scenario.title}
          description={scenario.description}
          objectives={scenario.objectives}
          evaluation={evaluation}
          tutorialStep={tutorialStep}
          tutorialStepIndex={tutorialState.stepIndex}
          tutorialStepCount={scenario.tutorialSteps?.length ?? 0}
          canAdvanceTutorial={tutorialProgress.canAdvance}
          onAdvanceTutorial={onAdvanceTutorial}
          onCheckSolution={onCheckSolution}
          onRetry={onRetry}
          onNext={onNext}
          issues={combinedIssues}
          callouts={combinedCallouts}
          showResetTutorial={scenarioConfig.id === "challenge" && scenario.type === "tutorial"}
          onResetTutorialStep={resetTutorialStep}
        />
        <ArcOverlay effects={arcEffects} nodes={nodes} />
      </div>
    </div>
  );
}

function ArcOverlay({ effects, nodes }: { effects: ArcEffect[]; nodes: Node[] }) {
  const transform = useStore((s) => s.transform) as [number, number, number];
  const [translateX, translateY, zoom] = transform;
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <style>
        {`
        @keyframes arcFlicker {
          0%, 100% { opacity: 0.2; transform: scale(0.9); }
          30% { opacity: 0.9; transform: scale(1.05); }
          60% { opacity: 0.4; transform: scale(0.95); }
        }
        `}
      </style>
      {effects.map((effect) => {
        const node = nodeById.get(effect.nodeId);
        if (!node) return null;
        const md = getMimicData(node);
        const kind = md?.kind ?? "cb";
        const { w, h } = getNodeDimensions(kind);
        const x = node.position.x * zoom + translateX + (w * zoom) / 2;
        const y = node.position.y * zoom + translateY + (h * zoom) / 2;
        const isDisconnectorArc = effect.kind === "ds_arc";
        const size = isDisconnectorArc ? 56 : 40;
        const color = isDisconnectorArc ? "#f97316" : "#38bdf8";
        const glow = isDisconnectorArc ? "0 0 18px #fb923c, 0 0 32px #f97316" : "0 0 12px #60a5fa";

        return (
          <div
            key={effect.id}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
              boxShadow: glow,
              animation: "arcFlicker 0.2s infinite",
            }}
          />
        );
      })}
    </div>
  );
}
