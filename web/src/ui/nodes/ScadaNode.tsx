import React, { useMemo } from 'react';
import { Handle, Position, useNodeId, useStore } from 'reactflow';
import type { NodeProps, Edge } from 'reactflow';
import type { NodeKind } from '../../core/model';

type MimicData = {
  kind: NodeKind;
  state?: 'open' | 'closed';
  sourceOn?: boolean;
  label?: string;
};

type Orientation = 'NONE' | 'H' | 'V';

function getOrientationForNode(nodeId: string, edges: Edge[]): Orientation {
  const used = new Set<string>();

  for (const e of edges) {
    if (e.source === nodeId && e.sourceHandle) used.add(e.sourceHandle);
    if (e.target === nodeId && e.targetHandle) used.add(e.targetHandle);
  }

  const hasH = used.has('L') || used.has('R');
  const hasV = used.has('T') || used.has('B');

  if (hasH) return 'H';
  if (hasV) return 'V';
  return 'NONE';
}

export function ScadaNode(props: NodeProps) {
  const data = props.data as any;
  const mimic: MimicData = (data?.mimic ?? data) as MimicData;
  const kind = mimic.kind;

  const label: string = data?.label ?? mimic.label ?? props.id;

  const isSwitch = kind === 'cb' || kind === 'ds' || kind === 'es';
  const isClosed = mimic.state === 'closed';

  const border = isSwitch ? (isClosed ? '2px solid #b00000' : '2px solid #2e7d32') : '2px solid #444';
  const bg =
    kind === 'source'
      ? (mimic.sourceOn ? '#ecfff1' : '#fff0f0')
      : kind === 'load'
        ? '#f7fbff'
        : '#ffffff';

  const stopClick = (e: any) => e.stopPropagation();

  // Access edges from store to decide which handles to show
  const nodeId = useNodeId()!;
  const edges = useStore((s) => s.edges) as Edge[];

  const orientation = useMemo(() => getOrientationForNode(nodeId, edges), [nodeId, edges]);

  const handleStyleBase: React.CSSProperties = { width: 10, height: 10, borderRadius: 2, opacity: 0.9 };

  const showH = orientation === 'NONE' || orientation === 'H';
  const showV = orientation === 'NONE' || orientation === 'V';

  // For “pass-through” devices we provide both a target and source per handle
  // so connections can be created in either direction. This is fine as long as
  // App.tsx uses isValidConnection / onConnect to enforce axis rules.
  const AxisHandles = () => (
    <>
      {/* Horizontal pair */}
      {showH && (
        <>
          <Handle type="target" id="L" position={Position.Left} style={{ ...handleStyleBase, left: -6 }} onClick={stopClick} />
          <Handle type="source" id="R" position={Position.Right} style={{ ...handleStyleBase, right: -6 }} onClick={stopClick} />
          {/* Opposite direction support */}
          <Handle type="source" id="L" position={Position.Left} style={{ ...handleStyleBase, left: -6, opacity: 0 }} onClick={stopClick} />
          <Handle type="target" id="R" position={Position.Right} style={{ ...handleStyleBase, right: -6, opacity: 0 }} onClick={stopClick} />
        </>
      )}

      {/* Vertical pair */}
      {showV && (
        <>
          <Handle type="target" id="T" position={Position.Top} style={{ ...handleStyleBase, top: -6 }} onClick={stopClick} />
          <Handle type="source" id="B" position={Position.Bottom} style={{ ...handleStyleBase, bottom: -6 }} onClick={stopClick} />
          {/* Opposite direction support */}
          <Handle type="source" id="T" position={Position.Top} style={{ ...handleStyleBase, top: -6, opacity: 0 }} onClick={stopClick} />
          <Handle type="target" id="B" position={Position.Bottom} style={{ ...handleStyleBase, bottom: -6, opacity: 0 }} onClick={stopClick} />
        </>
      )}
    </>
  );

  const renderHandles = () => {
    // Source: allow any orientation out of the box, but typically right output.
    if (kind === 'source') {
      return (
        <>
          <Handle type="source" id="R" position={Position.Right} style={{ ...handleStyleBase, right: -6 }} onClick={stopClick} />
          <Handle type="source" id="B" position={Position.Bottom} style={{ ...handleStyleBase, bottom: -6, opacity: 0 }} onClick={stopClick} />
          <Handle type="source" id="T" position={Position.Top} style={{ ...handleStyleBase, top: -6, opacity: 0 }} onClick={stopClick} />
          <Handle type="source" id="L" position={Position.Left} style={{ ...handleStyleBase, left: -6, opacity: 0 }} onClick={stopClick} />
        </>
      );
    }

    // Load: allow any orientation in, default left.
    if (kind === 'load') {
      return (
        <>
          <Handle type="target" id="L" position={Position.Left} style={{ ...handleStyleBase, left: -6 }} onClick={stopClick} />
          <Handle type="target" id="T" position={Position.Top} style={{ ...handleStyleBase, top: -6, opacity: 0 }} onClick={stopClick} />
          <Handle type="target" id="B" position={Position.Bottom} style={{ ...handleStyleBase, bottom: -6, opacity: 0 }} onClick={stopClick} />
          <Handle type="target" id="R" position={Position.Right} style={{ ...handleStyleBase, right: -6, opacity: 0 }} onClick={stopClick} />
        </>
      );
    }

    // ES: single terminal (top) only
    if (kind === 'es') {
      return <Handle type="target" id="T" position={Position.Top} style={{ ...handleStyleBase, top: -6 }} onClick={stopClick} />;
    }

    // Default pass-through device with axis locking
    return <AxisHandles />;
  };

  return (
    <div
      style={{
        minWidth: 110,
        padding: '10px 10px',
        borderRadius: 8,
        border,
        background: bg,
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        fontSize: 13,
        lineHeight: 1.2,
        userSelect: 'none',
      }}
    >
      {renderHandles()}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontWeight: 800, letterSpacing: 0.3 }}>{kind.toUpperCase()}</div>
        <div style={{ color: '#444', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace' }}>
          {label}
        </div>
      </div>

      {isSwitch && (
        <div style={{ marginTop: 6, color: isClosed ? '#b00000' : '#2e7d32', fontWeight: 800 }}>
          {isClosed ? 'CLOSED' : 'OPEN'}
        </div>
      )}

      {kind === 'source' && (
        <div style={{ marginTop: 6, color: mimic.sourceOn ? '#2e7d32' : '#b00000', fontWeight: 800 }}>
          {mimic.sourceOn ? 'ON' : 'OFF'}
        </div>
      )}
    </div>
  );
}
