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
  const isPending = !!mimic.moving; // canonical DBI flag for now
  const status = isPending ? "DBI" : isSwitch ? (isClosed ? "CLOSED" : "OPEN") : "";

  // ---- Geometry (20px grid) ----
  // CB: 3×3 = 60×60
  // DS/ES: 5×2 = 100×40
  // TX: 5×4 = 100×80
  const dims = useMemo(() => {
    if (kind === "cb") return { w: 60, h: 60 };
    if (kind === "ds" || kind === "es") return { w: 100, h: 40 };
    if (kind === "tx") return { w: 100, h: 80 };
    return { w: 120, h: 48 };
  }, [kind]);

  // ---- Visual state colours (muted) ----
  // Open/Closed colours should not be “alarm” bright.
  const SW_OPEN_BG = "#cfead6";   // muted light green
  const SW_CLOSED_BG = "#f0c9c9"; // muted light red
  const SW_DBI_BG = "#e5e7eb";    // light grey (unknown/in transit)
  const SW_LOCKOUT_BG = "#fde68a"; // muted yellow (DAR lockout)
  const SW_FAIL_BG = "#111827";    // near-black (CB fail)

  const TX_BG = "#e5e7eb";        // transformer base grey
  const TX_FAULT_BG = "#fde68a";  // muted yellow (faulted/failed isolation)

  // If in future you flag a transformer as faulted, set data.faulted = true
  const isFaulted = data?.faulted === true;
  const isLockout = data?.protection?.lockout === true;
  const isDestroyed = data?.destroyed === true;

  const bg = useMemo(() => {
    if (kind === "tx") return isFaulted ? TX_FAULT_BG : TX_BG;
    if (!isSwitch) return "#ffffff";
    if (isDestroyed) return SW_FAIL_BG;
    if (isLockout) return SW_LOCKOUT_BG;
    if (isPending) return SW_DBI_BG;
    return isClosed ? SW_CLOSED_BG : SW_OPEN_BG;
  }, [kind, isSwitch, isPending, isClosed, isFaulted, isDestroyed, isLockout]);

  const border = useMemo(() => {
    if (kind === "tx") return "2px solid #64748b";
    if (!isSwitch) return "2px solid #444";
    if (isDestroyed) return "2px solid #0f172a";
    if (isLockout) return "2px solid #b45309";
    if (isPending) return "2px solid #64748b";
    return isClosed ? "2px solid #7f2a2a" : "2px solid #1f6b3f";
  }, [kind, isSwitch, isPending, isClosed, isDestroyed, isLockout]);

  // All text black (as requested)
  const textPrimary = isDestroyed ? "#f8fafc" : "#111111";

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

  // Show all four directions while connecting; otherwise lock to chosen axis
  const showH = isConnecting || orientation === "NONE" || orientation === "H";
  const showV = isConnecting || orientation === "NONE" || orientation === "V";

  const baseHandle: React.CSSProperties = { width: 10, height: 10, borderRadius: 2, opacity: 0.9 };
  const hiddenHandle: React.CSSProperties = { opacity: 0, pointerEvents: "none" };

  // L/R vertical alignment:
  // CB is 60 high -> centre y=30
  // DS/ES are 40 high -> lower square centre is y=30 when top-aligned
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

          {/* Hidden opposite direction handles */}
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
          <Handle type="target" id="T" position={Position.Top} style={{ ...baseHandle, top: -6 }} onClick={stopClick} />
          <Handle type="source" id="B" position={Position.Bottom} style={{ ...baseHandle, bottom: -6 }} onClick={stopClick} />

          <Handle type="source" id="T" position={Position.Top} style={{ ...baseHandle, top: -6, ...hiddenHandle }} onClick={stopClick} />
          <Handle type="target" id="B" position={Position.Bottom} style={{ ...baseHandle, bottom: -6, ...hiddenHandle }} onClick={stopClick} />
        </>
      )}
    </>
  );

  // Transformer: 4 terminals (primary/secondary/tertiary/neutral) centered, no manual left offsets.
  const txHandles = () => (
    <>
      {/* L/R aligned to the same centreline as CB/DS chains */}
      {/* Visible target handles */}
      <Handle
        type="target"
        id="L"
        position={Position.Left}
        style={{ ...baseHandle, left: -6, top: 30, transform: "translateY(-50%)" }}
        onClick={stopClick}
      />
      <Handle
        type="target"
        id="R"
        position={Position.Right}
        style={{ ...baseHandle, right: -6, top: 30, transform: "translateY(-50%)" }}
        onClick={stopClick}
      />

      {/* Invisible-but-active source handles at same positions (bidirectional terminals) */}
      <Handle
        type="source"
        id="L"
        position={Position.Left}
        style={{ ...baseHandle, left: -6, top: 30, transform: "translateY(-50%)", opacity: 0 }}
        onClick={stopClick}
      />
      <Handle
        type="source"
        id="R"
        position={Position.Right}
        style={{ ...baseHandle, right: -6, top: 30, transform: "translateY(-50%)", opacity: 0 }}
        onClick={stopClick}
      />

      {/* T/B terminals (bidirectional) */}
      <Handle type="target" id="T" position={Position.Top} style={{ ...baseHandle, top: -6 }} onClick={stopClick} />
      <Handle type="target" id="B" position={Position.Bottom} style={{ ...baseHandle, bottom: -6 }} onClick={stopClick} />

      <Handle type="source" id="T" position={Position.Top} style={{ ...baseHandle, top: -6, opacity: 0 }} onClick={stopClick} />
      <Handle type="source" id="B" position={Position.Bottom} style={{ ...baseHandle, bottom: -6, opacity: 0 }} onClick={stopClick} />
    </>
  );


  const renderHandles = () => {
    if (kind === "tx") return <txHandles />;
    if (kind === "cb" || kind === "ds" || kind === "es") return <AxisHandles />;
    return <AxisHandles />;
  };

  // Text sizing: DS/ES tighter
  const pad = kind === "ds" || kind === "es" ? 4 : 8;
  const typeFont = kind === "ds" || kind === "es" ? 11 : 12;
  const labelFont = kind === "ds" || kind === "es" ? 10 : 12;
  const statusFont = kind === "ds" || kind === "es" ? 11 : 12;

  // Transformer abbreviation
  const kindShort = kind === "tx" ? "TX" : kind.toUpperCase();

  return (
    <div
      style={{
        width: dims.w,
        height: dims.h,
        padding: pad,
        borderRadius: 8,
        border,
        background: bg,
        boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
        lineHeight: 1.05,
        userSelect: "none",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        color: textPrimary,
      }}
    >
      {renderHandles()}

      {/* TEXT LAYOUT:
          - CB: stacked (CB / label / status)
          - DS/ES: compact (type left + label right / status)
          - TX: stacked (TX / label / optional line)
      */}
      {kind === "cb" ? (
        <>
          <div style={{ fontWeight: 900, fontSize: typeFont }}>{kindShort}</div>

          <div
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={label}
          >
            {label}
          </div>

          <div style={{ fontWeight: 900, fontSize: statusFont }}>{status}</div>
        </>
      ) : kind === "tx" ? (
        <>
          <div style={{ fontWeight: 900, fontSize: 12 }}>{kindShort}</div>

          <div
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={label}
          >
            {label}
          </div>

          {/* Placeholder for ratio / vector group later */}
          <div style={{ fontWeight: 700, fontSize: 11, color: "#374151" }}> </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: typeFont }}>{kindShort}</div>

            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
                fontSize: labelFont,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: dims.w - 36,
                textAlign: "right",
              }}
              title={label}
            >
              {label}
            </div>
          </div>

          {isSwitch && <div style={{ marginTop: 2, fontWeight: 900, fontSize: statusFont }}>{status}</div>}
        </>
      )}
    </div>
  );
}
