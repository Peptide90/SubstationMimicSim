import type { Edge, Node } from "reactflow";

import type { NodeKind, SwitchState } from "../../core/model";

export type MimicData = {
  kind: NodeKind;
  state?: SwitchState;
  sourceOn?: boolean;
  label?: string;
};

type MakeNodeOptions = {
  state?: SwitchState;
  sourceOn?: boolean;
  label?: string;
  iface?: { substationId: string; terminalId: string; linkTo?: string };
  locked?: boolean;
};

export function getMimicData(n: Node): MimicData | null {
  const d = n.data as any;
  const mimic = (d?.mimic ?? d) as MimicData | undefined;
  if (!mimic?.kind) return null;
  return mimic;
}

export function flowToMimicLocal(nodes: Node[], edges: Edge[]) {
  const mimicNodes = nodes
    .map((n) => {
      const md = getMimicData(n);
      if (!md) return null;
      return { id: n.id, kind: md.kind, label: md.label ?? (n.data as any)?.label, state: md.state, sourceOn: md.sourceOn };
    })
    .filter(Boolean) as any[];

  const mimicEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    kind: (e.data as any)?.kind,
    busbarId: (e.data as any)?.busbarId,
  }));

  return { nodes: mimicNodes, edges: mimicEdges };
}

export function makeBusbarEdge(
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
  busbarId?: string,
  id?: string
): Edge {
  const bbid = busbarId ?? `bb-${crypto.randomUUID().slice(0, 6)}`;
  const edgeId = id ?? `${bbid}-${crypto.randomUUID().slice(0, 4)}`;
  return {
    id: edgeId,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: "busbar",
    style: { strokeWidth: 6, stroke: "#64748b" },
    data: { kind: "busbar", busbarId: bbid },
  };
}

export function makeNode(kind: NodeKind, id: string, x: number, y: number, options: MakeNodeOptions = {}): Node {
  const mimic = { kind, state: options.state, sourceOn: options.sourceOn, label: options.label ?? id };

  const iface =
    kind === "iface"
      ? {
          substationId: options.iface?.substationId ?? "SUB",
          terminalId: options.iface?.terminalId ?? "X1",
          linkTo: options.iface?.linkTo ?? "",
        }
      : undefined;

  return {
    id,
    type: kind === "junction" ? "junction" : kind === "iface" ? "iface" : "scada",
    position: { x, y },
    data: {
      label: options.label ?? id,
      mimic,
      ...(iface ? { iface } : {}),
      ...(options.locked ? { locked: true } : {}),
    },
    draggable: kind !== "junction" && !options.locked,
    selectable: true,
  };
}
