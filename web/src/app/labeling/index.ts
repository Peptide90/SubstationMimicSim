import type { Edge, Node } from "reactflow";

import { getMimicData } from "../mimic/graphUtils";

import {
  ansiFunctionForKind,
  computeAnsiIecLabel,
  computeBp109Label,
  defaultAnsiIecMeta,
} from "./bp109";
import { resolveBp109Meta } from "./inferBp109";
import type { AnsiIecMeta, BayType, BP109Meta, LabelMode, LabelScheme } from "./types";

export type LabelComputeInput = {
  labelScheme: LabelScheme;
  labelMode: LabelMode;
  labelOverrides: Record<string, string>;
  bayTypeOverrides: Record<string, BayType>;
  bp109MetaById: Record<string, Partial<BP109Meta>>;
  ansiIecMetaById: Record<string, Partial<AnsiIecMeta>>;
  substationVoltageKv?: number;
  nodes: Node[];
  edges: Edge[];
};

function mergeAnsiMeta(base: AnsiIecMeta, overrides?: Partial<AnsiIecMeta>): AnsiIecMeta {
  if (!overrides) return base;
  return { ...base, ...overrides };
}

export function inferAnsiIecMeta(
  nodes: Node[],
  userOverrides: Record<string, Partial<AnsiIecMeta>> = {}
): Record<string, AnsiIecMeta> {
  const labelable = nodes.filter((n) => {
    const kind = getMimicData(n)?.kind;
    return kind === "cb" || kind === "ds" || kind === "es";
  });

  const sorted = [...labelable].sort((a, b) => a.position.x - b.position.x);
  const result: Record<string, AnsiIecMeta> = {};
  sorted.forEach((node, index) => {
    const kind = getMimicData(node)!.kind!;
    const inferred = defaultAnsiIecMeta(kind);
    inferred.bayNumber = index + 1;
    inferred.functionCode = ansiFunctionForKind(kind);
    result[node.id] = mergeAnsiMeta(inferred, userOverrides[node.id]);
  });
  return result;
}

export function computeAutoLabelForNode(
  nodeId: string,
  nodeById: Map<string, Node>,
  input: LabelComputeInput,
  resolvedBp109: Record<string, BP109Meta>,
  resolvedAnsi: Record<string, AnsiIecMeta>
): string {
  const node = nodeById.get(nodeId);
  if (!node) return nodeId;
  const md = getMimicData(node);
  if (!md || md.kind === "junction") return nodeId;

  const base = (node.data as { label?: string })?.label ?? nodeId;

  if (input.labelScheme === "DEFAULT") return base;
  if (input.labelScheme === "NG_BP109") {
    const meta = resolvedBp109[nodeId];
    if (!meta?.enabled) return base;
    return computeBp109Label(meta);
  }
  if (input.labelScheme === "ANSI_IEC") {
    const meta = resolvedAnsi[nodeId];
    if (!meta?.enabled) return base;
    return computeAnsiIecLabel(meta);
  }
  return base;
}

export function resolveLabelMaps(input: LabelComputeInput): {
  bp109: Record<string, BP109Meta>;
  ansiIec: Record<string, AnsiIecMeta>;
} {
  return {
    bp109: resolveBp109Meta(
      input.nodes,
      input.edges,
      input.bayTypeOverrides,
      input.bp109MetaById,
      input.substationVoltageKv
    ),
    ansiIec: inferAnsiIecMeta(input.nodes, input.ansiIecMetaById),
  };
}

export function getDisplayLabel(
  nodeId: string,
  nodeById: Map<string, Node>,
  input: LabelComputeInput,
  resolvedBp109: Record<string, BP109Meta>,
  resolvedAnsi: Record<string, AnsiIecMeta>
): string {
  if (input.labelMode === "FREEFORM") {
    const override = (input.labelOverrides[nodeId] ?? "").trim();
    if (override.length > 0) return override;
  }
  return computeAutoLabelForNode(nodeId, nodeById, input, resolvedBp109, resolvedAnsi);
}
