import type { Node } from "reactflow";

import type { NodeKind, SwitchState } from "../../core/model";

type MimicData = {
  kind: NodeKind;
  state?: SwitchState;
  sourceOn?: boolean;
  label?: string;
};

const getMimicData = (n: Node): MimicData | null => {
  const d = n.data as any;
  const mimic = (d?.mimic ?? d) as MimicData | undefined;
  if (!mimic?.kind) return null;
  return mimic;
};

export function normalizeNodes(loaded: Node[]) {
  return loaded.map((n) => {
    const md = getMimicData(n) ?? (n.data as any)?.mimic ?? null;
    const kind = md?.kind;

    const type = kind === "junction" ? "junction" : kind === "iface" ? "iface" : "scada";

    return {
      ...n,
      type,
      selectable: n.selectable ?? true,
      draggable: n.draggable ?? type !== "junction",
      data: {
        ...(n.data as any),
        mimic: md ?? { kind: "ds", label: n.id },
        label: (n.data as any)?.label ?? md?.label ?? n.id,
      },
    };
  });
}
