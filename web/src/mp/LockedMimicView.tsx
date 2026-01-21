import { useCallback, useEffect, useMemo } from "react";
import type { Edge, Node } from "reactflow";

import type { AssetView, FieldLocation, Role } from "../../../shared/mpTypes";
import { computeEnergized } from "../core/energize";
import { computeGroundedVisual } from "../core/grounded";
import { normalizeNodes } from "../app/util/normalizeNodes";
import { flowToMimic } from "../ui/flowToMimic";
import { loadTemplateById } from "../templates/manifest";
import { EditorCanvas } from "../components/EditorCanvas";
import { JunctionNode } from "../ui/nodes/JunctionNode";
import { ScadaNode } from "../ui/nodes/ScadaNode";
import { InterfaceNode } from "../ui/nodes/InterfaceNode";

type TemplateProject = {
  nodes: Node[];
  edges: Edge[];
  interfaceMetaById?: Record<string, { enabled?: boolean; role?: "source" | "sink" | "neutral" }>;
};

type Props = {
  templateId?: string;
  assets: AssetView[];
  role: Role;
  fieldLocation?: FieldLocation;
  onToggleSwitch?: (assetId: string) => void;
  onCountsChange?: (counts: { energized: number; grounded: number }) => void;
};

function mapAssetState(status: AssetView["scada"]["status"]) {
  if (status === "closed") return "closed";
  if (status === "open") return "open";
  if (status === "tripped") return "open";
  return undefined;
}

function fieldMappedState(status: AssetView["scada"]["status"]) {
  if (status === "closed") return "closed";
  if (status === "open") return "open";
  if (status === "tripped") return "open";
  return undefined;
}

export function LockedMimicView({
  templateId,
  assets,
  role,
  fieldLocation,
  onToggleSwitch,
  onCountsChange,
}: Props) {
  const baseProject = useMemo<TemplateProject>(() => {
    const fallback = loadTemplateById(templateId ?? "test-line-bay") as TemplateProject | null;
    const nodes = fallback?.nodes ?? [];
    const edges = fallback?.edges ?? [];
    return { nodes: normalizeNodes(nodes), edges, interfaceMetaById: fallback?.interfaceMetaById };
  }, [templateId]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const fieldAssetId = fieldLocation?.startsWith("asset:") ? fieldLocation.slice("asset:".length) : null;

  const nodes = useMemo(() => {
    return baseProject.nodes.map((node) => {
      const data = node.data as any;
      const mimic = (data?.mimic ?? data) as { kind?: string; state?: string; moving?: boolean };
      if (!mimic?.kind) return node;

      if (mimic.kind === "cb" || mimic.kind === "ds" || mimic.kind === "es") {
        const asset = assetById.get(node.id);
        if (!asset) return node;

        let nextState: string | undefined;
        let moving = false;
        let lockout = false;

        if (role === "operator") {
          nextState = mapAssetState(asset.scada.status);
          moving = asset.scada.dbi;
          lockout = asset.scada.lockout;
        } else if (role === "field") {
          if (fieldAssetId === asset.id && asset.truth) {
            nextState = fieldMappedState(asset.truth.status);
            moving = false;
            lockout = asset.truth.lockout;
          } else {
            nextState = undefined;
            moving = true;
          }
        }

        return {
          ...node,
          data: {
            ...data,
            mimic: { ...mimic, state: nextState, moving },
            protection: { ...(data?.protection ?? {}), lockout },
          },
        };
      }

      return node;
    });
  }, [assetById, baseProject.nodes, fieldAssetId, role]);

  const nodeTypes = useMemo(
    () => ({
      junction: JunctionNode,
      scada: ScadaNode,
      iface: InterfaceNode,
    }),
    []
  );

  const { nodes: mimicNodes, edges: mimicEdges } = useMemo(() => flowToMimic(nodes, baseProject.edges), [nodes, baseProject.edges]);

  const energized = useMemo(() => {
    const nodesForEnergize = mimicNodes.map((n) => {
      if (n.kind !== "iface") return n;
      const meta = baseProject.interfaceMetaById?.[n.id];
      const enabled = meta?.enabled !== false;
      const role = meta?.role ?? "neutral";
      return { ...n, kind: "source", sourceOn: enabled && role === "source" };
    });
    return computeEnergized(nodesForEnergize as any, mimicEdges as any);
  }, [baseProject.interfaceMetaById, mimicEdges, mimicNodes]);

  const grounded = useMemo(() => computeGroundedVisual(mimicNodes as any, mimicEdges as any), [mimicNodes, mimicEdges]);

  useEffect(() => {
    if (!onCountsChange) return;
    onCountsChange({
      energized: energized.energizedEdgeIds.size,
      grounded: grounded.groundedEdgeIds.size,
    });
  }, [energized.energizedEdgeIds.size, grounded.groundedEdgeIds.size, onCountsChange]);

  const styledEdges = useMemo(() => {
    return baseProject.edges.map((edge) => {
      const isE = energized.energizedEdgeIds.has(edge.id);
      const isG = grounded.groundedEdgeIds.has(edge.id);
      const conflict = isE && isG;
      const base: Edge = { ...edge, type: "step", style: { strokeWidth: 6 } };
      if (conflict) return { ...base, style: { ...base.style, stroke: "#ff4d4d", strokeDasharray: "10 6" } };
      if (isG) return { ...base, style: { ...base.style, stroke: "#ffb020", strokeDasharray: "10 6" } };
      if (isE) return { ...base, style: { ...base.style, stroke: "#00e5ff" } };
      return { ...base, style: { ...base.style, stroke: "#64748b" } };
    });
  }, [baseProject.edges, energized.energizedEdgeIds, grounded.groundedEdgeIds]);

  const handleNodeDoubleClick = useCallback(
    (_evt: unknown, node: Node) => {
      if (!onToggleSwitch) return;
      const data = node.data as any;
      const mimic = (data?.mimic ?? data) as { kind?: string };
      if (mimic?.kind === "cb" || mimic?.kind === "ds" || mimic?.kind === "es") {
        onToggleSwitch(node.id);
      }
    },
    [onToggleSwitch]
  );

  return (
    <EditorCanvas
      nodes={nodes}
      edges={styledEdges}
      rawEdges={baseProject.edges}
      nodeTypes={nodeTypes}
      locked
      snapEnabled
      onToggleSnap={() => {}}
      onToggleLock={() => {}}
      onNodesChange={() => {}}
      onEdgesChange={() => {}}
      isValidConnection={() => false}
      onConnect={() => {}}
      onNodeClick={() => {}}
      onNodeDragStart={() => {}}
      onNodeDragStop={() => {}}
      onNodeDoubleClick={handleNodeDoubleClick}
      onEdgeClick={() => {}}
      onEdgeDoubleClick={() => {}}
      onDragOver={() => {}}
      onDrop={() => {}}
      onAddAtCenter={() => {}}
      setNodes={() => {}}
      setEdges={() => {}}
      onEdgeContextMenu={() => {}}
      onNodeContextMenu={() => {}}
      onPaneContextMenu={() => {}}
      onPaneClick={() => {}}
      showControls={false}
      showPalette={false}
    />
  );
}
