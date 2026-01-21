import type { Node } from "reactflow";

import type { NodeKind } from "../../core/model";

export type PaletteConfig = {
  enabled: boolean;
  allowedKinds?: NodeKind[];
};

export type EditorModeConfig = {
  id: "sandbox" | "challenge";
  label: string;
  palette: PaletteConfig;
  lockedNodeIds: Set<string>;
  lockedEdgeIds: Set<string>;
  disableSaveLoad: boolean;
  disableLabelling: boolean;
  disableInterlocking: boolean;
  disablePowerFlow: boolean;
  fixedViewport?: boolean;
  buildZones?: Array<{ x: number; y: number; width: number; height: number }>;
  allowNodePlacement?: (kind: NodeKind, position: { x: number; y: number }, nodes: Node[]) => boolean;
  allowConnections?: boolean;
};

export function makeSandboxConfig(): EditorModeConfig {
  return {
    id: "sandbox",
    label: "Solo: Substation Mimic Builder",
    palette: { enabled: true },
    lockedNodeIds: new Set(),
    lockedEdgeIds: new Set(),
    disableSaveLoad: false,
    disableLabelling: false,
    disableInterlocking: false,
    disablePowerFlow: false,
    allowConnections: true,
  };
}
