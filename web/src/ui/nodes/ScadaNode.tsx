import React, { useMemo } from "react";
import { Handle, Position, useNodeId, useStore } from "reactflow";
import type { NodeProps, Edge } from "reactflow";
import type { NodeKind } from "../../core/model";

type MimicData = {
  kind: NodeKind;
  state?: "open" | "closed";
  sourceOn?: boolean;
  label?: string;
  moving?: boolean; // true -> DBI
};

type Orientation = "NONE" | "H" | "V";

function getOrientationForNode(nodeId: string, edges: Edge[]): Orientation {
  const used = new Set<string>();

  for (const e of edges) {
    if (e.source === nodeId && e.sourceHandle) used.add(e.sourceHandle);
    if (e.target === nodeId && e.targetHandle) used.add(e.targetHandle);
  }

  const hasH = used.has("L") || used.has("R");
  const hasV = used.has("T") || used.has("B");

  if (hasH) return "H";
  if (hasV) return "V";
  return "NONE";
}

export function ScadaNode(props: NodeProps) {
  const data = props.data as any;
  const mimic: MimicData = (data?.mimic ?? data) as MimicData;
  const kind = mimic.kind;

  const label: string = data?.label ?? mimic.label ?? props.id;

  const isSwitch = kind === "cb" || kind === "ds" || kind === "es";
  const isClosed = mimic.state === "closed";
  const status = mimic.moving ? "DBI" : isSwitch ? (isClosed ? "CLOSED" : "OPEN") : "";

  const border = isSwitch ? (isClosed ? "2px solid #b00000" : "2px solid #2e7d32") : "2px solid #444";
  const bg = "#ffffff";

  const stopClick = (e: any) => e.stopPropagation();

  // Access edges from store to decide which handles to show
  const nodeId = useNodeId()!;
  const edges = useStore((s) => s.edges) as Edge[];

  // Robust connecting detection across React Flow versions
  const rfState = useStore((s: any) => s);
  const isConnecting =
    !!rfState.connectionNodeId ||
    !!rfState.connectionStartHandle ||
    !!rfState.connectionInProgress ||
    !!rfState.connectionHandleId;

  const orientation = useMemo(() => getOrientationForNode(nodeId, edges), [nodeId, edges]);

  // ---- Geometry (20px grid) ----
  // CB: 3x3 squares = 60x60
  // DS/ES: 6x2 squares = 120x40
  const dims = useMemo(() => {
    if (kind === "cb") return { w: 60, h: 60 };
    if (kind === "ds" || kind === "es") return { w: 120, h: 40 };
    return { w: 120, h: 48 };
  }, [kind]);

  // Show all four directions while connecting; otherwise lock to chosen axis
  const showH = isConnecting || orientation === "NONE" || orientation === "H";
  const showV = isConnecting || orientation === "NONE" || orientation === "V";

  const baseHandle: React.CSSProperties = { width: 10, height: 10, borderRadius: 2, opacity: 0.9 };
  const hiddenHandle: React.CSSProperties = { opacity: 0, pointerEvents: "none" };

  // L/R vertical alignment:
  // CB is 60 high -> centre y=30
  // DS/ES are 40 high -> we want L/R at y=30 (lower square centre) when top-aligned with CB
  const lrTop = kind === "ds" || kind === "es" ? 30 : dims.h / 2;

  const AxisHandles = () => (
    <>
      {showH && (
        <>
          <Handle
            type="target"
            id="L"
            position={Position.Left}
            style={{ ...baseHandle, left: -6, top: lrTop, transform: "translateY(-50%)" }}
            onClick={stopClick}
          />
          <Handle
            type="source"
            id="R"
            position={Position.Right}
            style={{ ...baseHandle, right: -6, top: lrTop, transform: "translateY(-50%)" }}
            onClick={stopClick}
          />

          {/* Hidden opposite direction handles (must not intercept) */}
          <Handle
            type="source"
            id="L"
            position={Position.Left}
            style={{ ...baseHandle, left: -6, top: lrTop, transform: "translateY(-50%)", ...hiddenHandle }}
            onClick={stopClick}
          />
          <Handle
            type="target"
            id="R"
            position={Position.Right}
            style={{ ...baseHandle, right: -6, top: lrTop, transform: "translateY(-50%)", ...hiddenHandle }}
            onClick={stopClick}
          />
        </>
      )}

      {showV && (
        <>
          <Handle
            type="target"
            id="T"
            position={Position.Top}
            style={{ ...baseHandle, top: -6 }}
            onClick={stopClick}
          />
          <Handle
            type="source"
            id="B"
            position={Position.Bottom}
            style={{ ...baseHandle, bottom: -6 }}
            onClick={stopClick}
          />

          {/* Hidden opposite direction handles */}
          <Handle
            type="source"
            id="T"
            position={Position.Top}
            style={{ ...baseHandle, top: -6, ...hiddenHandle }}
            onClick={stopClick}
          />
          <Handle
            type="target"
            id="B"
            position={Position.Bottom}
            style={{ ...baseHandle, bottom: -6, ...hiddenHandle }}
            onClick={stopClick}
          />
        </>
      )}
    </>
  );

  const renderHandles = () => {
    // Switchgear uses axis handles (ES is single-connection enforced in isValidConnection)
    if (kind === "cb" || kind === "ds" || kind === "es") return <AxisHandles />;

    // Default
    return <AxisHandles />;
  };

  // Text sizing: tighten for DS/ES
  const pad = kind === "ds" || kind === "es" ? 4 : 8;
  const typeFont = kind === "ds" || kind === "es" ? 11 : 12;
  const labelFont = kind === "ds" || kind === "es" ? 11 : 12;
  const statusFont = kind === "ds" || kind === "es" ? 11 : 12;

  return (
    <div
      style={{
        width: dims.w,
        height: dims.h,
        padding: pad,
        borderRadius: 8,
        border,
        background: bg,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        lineHeight: 1.05,
        userSelect: "none",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {renderHandles()}

      {/* Row 1: type (left) + label (right) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <div style={{ fontWeight: 900, color: "#111", fontSize: typeFont }}>
          {kind.toUpperCase()}
        </div>

        <div
          style={{
            color: "#111",
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
            fontSize: labelFont,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: dims.w - 44,
            textAlign: "right",
          }}
          title={label}
        >
          {label}
        </div>
      </div>

      {/* Row 2: status */}
      {isSwitch && (
        <div
          style={{
            marginTop: 2,
            fontWeight: 900,
            fontSize: statusFont,
            color: status === "CLOSED" ? "#b00000" : status === "OPEN" ? "#2e7d32" : "#111",
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
