import { useMemo } from "react";
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

  const name: string = data?.label ?? props.id; // vanity name (can be long)
  const substationId: string = data?.iface?.substationId ?? "SUB";
  const terminalId: string = data?.iface?.terminalId ?? "X1";

  // 3x3 grid box
  const W = 60;
  const H = 60;

  const handleStyle: React.CSSProperties = { width: 10, height: 10, borderRadius: 2, opacity: 0.9 };
  const hiddenHandle: React.CSSProperties = { opacity: 0, pointerEvents: "none" };

  // Centreline is exactly y=30 for left/right handles
  const lrTop = 30;

  return (
    <div style={{ position: "relative", width: W, height: H }}>
      {/* External label (optional): keep it readable and not affecting geometry */}
      <div
        style={{
          position: "absolute",
          left: W + 10,
          top: 22,
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

      {/* Diamond fills the full 60x60 box */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          transform: "rotate(45deg) scale(0.72)", // 0.72 fits the diamond inside without clipping
          transformOrigin: "center",
          background: "#0f172a",
          border: "2px solid #94a3b8",
          borderRadius: 6,
          boxSizing: "border-box",
          pointerEvents: "none",
        }}
      />

      {/* Inner short label (fits inside 60x60) */}
      <div
        style={{
          position: "absolute",
          left: 6,
          right: 6,
          top: 18,
          textAlign: "center",
          color: "#fff",
          fontWeight: 900,
          fontSize: 11,
          lineHeight: 1.05,
          textShadow: "0 1px 1px rgba(0,0,0,0.6)",
          pointerEvents: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={`${substationId}:${terminalId}`}
      >
        {substationId}:{terminalId}
      </div>

      {/* Handles: show 4 while connecting, then axis-lock */}
      {showH && (
        <>
          {/* L/R visible */}
          <Handle
            type="target"
            id="L"
            position={Position.Left}
            style={{ ...handleStyle, left: -6, top: lrTop, transform: "translateY(-50%)" }}
          />
          <Handle
            type="source"
            id="R"
            position={Position.Right}
            style={{ ...handleStyle, right: -6, top: lrTop, transform: "translateY(-50%)" }}
          />

          {/* hidden opposite direction */}
          <Handle
            type="source"
            id="L"
            position={Position.Left}
            style={{ ...handleStyle, left: -6, top: lrTop, transform: "translateY(-50%)", ...hiddenHandle }}
          />
          <Handle
            type="target"
            id="R"
            position={Position.Right}
            style={{ ...handleStyle, right: -6, top: lrTop, transform: "translateY(-50%)", ...hiddenHandle }}
          />
        </>
      )}

	  {showV && (
	    <>
	  	  <Handle type="target" id="T" position={Position.Top} style={{ ...handleStyle, top: -6 }} />
		  <Handle type="source" id="B" position={Position.Bottom} style={{ ...handleStyle, bottom: -6 }} />

		  <Handle type="source" id="T" position={Position.Top} style={{ ...handleStyle, top: -6, ...hiddenHandle }} />
		  <Handle type="target" id="B" position={Position.Bottom} style={{ ...handleStyle, bottom: -6, ...hiddenHandle }} />
	    </>
	  )}
    </div>
  );
}
