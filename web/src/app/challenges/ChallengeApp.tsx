import { useCallback, useMemo, useRef, useState } from "react";
import { addEdge, useEdgesState, useNodesState, useReactFlow } from "reactflow";
import type { Connection, Edge, Node } from "reactflow";

import { CHALLENGE_SCENARIOS, getScenarioById } from "./scenarios";
import type { ChallengeScenario } from "./types";
import { evaluateChallenge } from "./ChallengeEvaluator";
import { createTutorialActionLog, evaluateTutorialStep } from "./tutorialRunner";
import { loadChallengeProgress, updateChallengeProgress } from "./storage";
import { makeSandboxConfig } from "../mimic/EditorModeConfig";
import { flowToMimicLocal, getMimicData, makeBusbarEdge, makeNode } from "../mimic/graphUtils";
import { computeEnergized } from "../../core/energize";
import type { NodeKind, SwitchState } from "../../core/model";
import { EditorCanvas } from "../../components/EditorCanvas";
import { TopToolbar } from "../../components/TopToolbar";
import { ChallengePanel } from "../../components/ChallengePanel";

import { JunctionNode } from "../../ui/nodes/JunctionNode";
import { ScadaNode } from "../../ui/nodes/ScadaNode";
import { InterfaceNode } from "../../ui/nodes/InterfaceNode";
import { FaultNode } from "../../ui/nodes/FaultNode";
import { styleEdgesByEnergization } from "../../ui/energizedStyling";

const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;

type ChallengeView = "levels" | "runner";

type TutorialState = {
  stepIndex: number;
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
  const [panelTab, setPanelTab] = useState("Instructions");

  const scenario = activeScenarioId ? getScenarioById(activeScenarioId) : undefined;
  const initialNodes = scenario ? buildNodesFromScenario(scenario) : [];
  const initialEdges = scenario ? buildEdgesFromScenario(scenario) : [];

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [liveIssues, setLiveIssues] = useState<string[]>([]);
  const [tutorialState, setTutorialState] = useState<TutorialState>({ stepIndex: 0 });
  const [tutorialViolations, setTutorialViolations] = useState(0);
  const tutorialActionLog = useRef(createTutorialActionLog());
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

  const { nodes: mimicNodes, edges: mimicEdges } = useMemo(() => flowToMimicLocal(nodes, edges), [nodes, edges]);
  const energized = useMemo(() => {
    const nodesForEnergize = mimicNodes.map((n: any) => {
      if (n.kind !== "iface") return n;
      const label = n.label ?? n.id;
      const isSource = n.id.startsWith("SRC") || String(label).toLowerCase().includes("source");
      return isSource ? { ...n, kind: "source", sourceOn: true } : n;
    });
    return computeEnergized(nodesForEnergize as any, mimicEdges as any);
  }, [mimicEdges, mimicNodes]);
  const styledEdges = useMemo(() => styleEdgesByEnergization(edges, energized.energizedEdgeIds), [edges, energized.energizedEdgeIds]);

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
      tutorialActionLog.current = createTutorialActionLog();
      setPanelTab("Instructions");
    },
    [setEdges, setNodes]
  );

  const startScenario = useCallback(
    (scenarioToStart: ChallengeScenario) => {
      setActiveScenarioId(scenarioToStart.id);
      resetScenario(scenarioToStart);
      setView("runner");
    },
    [resetScenario]
  );

  const onNodesChangeSnapped = useCallback(
    (changes: any) => {
      const filtered = (changes as Array<{ id?: string; type?: string }>).filter((change) => {
        if (!change.id) return true;
        if (scenarioConfig.lockedNodeIds.has(change.id) && change.type === "remove") return false;
        return true;
      });
      onNodesChangeBase(filtered);
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

  const scenarioConfig = useMemo(() => {
    if (!scenario) return makeSandboxConfig();
    const { nodes: lockedNodes, edges: lockedEdges } = computeLockedSets(scenario);
    return {
      ...makeSandboxConfig(),
      id: "challenge",
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

  const onNodeClick = useCallback(
    (_evt: any, node: Node) => {
      const md = getMimicData(node);
      if (!md || md.kind === "junction") return;
      if (scenarioConfig.lockedNodeIds.has(node.id)) return;
      if ((node.data as any)?.challengeFailed) return;
      if (md.kind === "cb" || md.kind === "ds" || md.kind === "es") {
        const current = md.state ?? "open";
        const to: SwitchState = current === "closed" ? "open" : "closed";
        setNodes((ns) =>
          ns.map((n) => {
            if (n.id !== node.id) return n;
            return { ...n, data: { ...(n.data as any), mimic: { ...md, state: to } } };
          })
        );
        tutorialActionLog.current.toggles.push({ nodeId: node.id, to });

        if (scenario?.type === "tutorial" && md.kind === "ds" && current === "closed") {
          const energizedNodes = energized.energizedNodeIds;
          const hasLoadEnergized = nodes.some((n) => n.id.startsWith("LOAD") && energizedNodes.has(n.id));
          const dsEnergized = energizedNodes.has(node.id);
          if (hasLoadEnergized && dsEnergized) {
            setTutorialViolations((v) => v + 1);
            setLiveIssues((prev) =>
              prev.includes("Disconnectors are not designed to break load current.")
                ? prev
                : [...prev, "Disconnectors are not designed to break load current."]
            );
            setNodes((ns) =>
              ns.map((n) => {
                if (n.id !== node.id) return n;
                return { ...n, data: { ...(n.data as any), challengeFailed: true, mimic: { ...md, state: to } } };
              })
            );
          }
        }
      }
    },
    [energized.energizedNodeIds, nodes, scenario, scenarioConfig.lockedNodeIds, setNodes]
  );

  const onNodeDoubleClick = useCallback(
    (_evt: any, node: Node) => {
      onNodeClick(null, node);
    },
    [onNodeClick]
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
    setPanelTab("Results");
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

  const unlockedScenarios = useMemo(() => {
    const unlocked = new Set<string>();
    CHALLENGE_SCENARIOS.forEach((scenarioItem, index) => {
      if (index === 0) {
        unlocked.add(scenarioItem.id);
        return;
      }
      const prev = CHALLENGE_SCENARIOS[index - 1];
      if (progress[prev.id]?.completed) unlocked.add(scenarioItem.id);
    });
    return unlocked;
  }, [progress]);

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

      <div style={{ display: "flex", height: "100vh", paddingTop: 52 }}>
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
          onNodeContextMenu={() => null}
          onPaneContextMenu={() => null}
          onPaneClick={() => null}
          modeConfig={scenarioConfig}
        />

        <ChallengePanel
          title={scenario.title}
          description={scenario.description}
          activeTab={panelTab}
          onSelectTab={setPanelTab}
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
        />
      </div>
    </div>
  );
}
