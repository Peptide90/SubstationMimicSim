import React, { useMemo } from "react";
import { Handle, Position, useNodeId, useStore } from "reactflow";
import type { NodeProps, Edge } from "reactflow";

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

export function InterfaceNode(props: NodeProps) {
  const nodeId = useNodeId()!;
  const edges = useStore((s) => s.edges) as Edge[];

  const rfState = useStore((s: any) => s);
  const isConnecting =
    !!rfState.connectionNodeId ||
    !!rfState.connectionStartHandle ||
    !!rfState.connectionInProgress ||
    !!rfState.connectionHandleId;

  const orientation = useMemo(() => getOrientationForNode(nodeId, edges), [nodeId, edges]);

  const showH = isConnecting || orientation === "NONE" || orientation === "H";
  const showV = isConnecting || orientation === "NONE" || orientation === "V";

  const data = props.data as any;

  // Long label (vanity circuit name)
  const name: string = data?.label ?? props.id;

  // Short substation grouping label inside the diamond
  const substationId: string = data?.iface?.substationId ?? "SUB";
  const terminalId: string = data?.iface?.terminalId ?? "X";

  const onOpen = () => {
    // We pass a callback in node data for reliable modal open
    data?.onOpenPowerFlow?.(props.id);
  };

  const handleStyle: React.CSSProperties = { width: 10, height: 10, borderRadius: 2, opacity: 0.9 };
  const hiddenHandle: React.CSSProperties = { opacity: 0, pointerEvents: "none" };

  const stop = (e: any) => e.stopPropagation();

  return (
    <div style={{ position: "relative", width: 90, height: 60 }}>
      {/* Outer label (white, readable) */}
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 18,
          color: "#fff",
          fontSize: 12,
          whiteSpace: "nowrap",
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
          textShadow: "0 1px 1px rgba(0,0,0,0.6)",
          pointerEvents: "none",
        }}
      >
        {name}
      </div>

      {/* Diamond (substation side is LEFT, external side is RIGHT) */}
      <div
        style={{
          position: "absolute",
          left: 15,
          top: 10,
          width: 60,
          height: 40,
          background: "#0f172a",
          border: "2px solid #94a3b8",
          transform: "skewX(-20deg)",
          borderRadius: 6,
          boxSizing: "border-box",
        }}
      />

      {/* Inner short label */}
      <div
        style={{
          position: "absolute",
          left: 22,
          top: 22,
          color: "#fff",
          fontWeight: 800,
          fontSize: 12,
          textShadow: "0 1px 1px rgba(0,0,0,0.6)",
          pointerEvents: "none",
        }}
      >
        {substationId}:{terminalId}
      </div>

      {/* Handles: show 4 while connecting, otherwise lock to chosen axis */}
      {showH && (
        <>
          <Handle type="target" id="L" position={Position.Left} style={{ ...handleStyle, left: 0, top: 26 }} onClick={stop} />
          <Handle type="source" id="R" position={Position.Right} style={{ ...handleStyle, right: 0, top: 26 }} onClick={stop} />

          <Handle type="source" id="L" position={Position.Left} style={{ ...handleStyle, left: 0, top: 26, ...hiddenHandle }} onClick={stop} />
          <Handle type="target" id="R" position={Position.Right} style={{ ...handleStyle, right: 0, top: 26, ...hiddenHandle }} onClick={stop} />
        </>
      )}

      {showV && (
        <>
          <Handle type="target" id="T" position={Position.Top} style={{ ...handleStyle, left: 40, top: 0 }} onClick={stop} />
          <Handle type="source" id="B" position={Position.Bottom} style={{ ...handleStyle, left: 40, bottom: 0 }} onClick={stop} />

          <Handle type="source" id="T" position={Position.Top} style={{ ...handleStyle, left: 40, top: 0, ...hiddenHandle }} onClick={stop} />
          <Handle type="target" id="B" position={Position.Bottom} style={{ ...handleStyle, left: 40, bottom: 0, ...hiddenHandle }} onClick={stop} />
        </>
      )}
    </div>
  );
}
