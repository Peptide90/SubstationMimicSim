import React from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';

export function JunctionNode(_props: NodeProps) {
  const stopClick = (e: any) => e.stopPropagation();

  return (
    <div
      title="Junction"
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        border: '2px solid #555',
        background: '#fff',
        boxSizing: 'border-box',
      }}
    >
      <Handle
        className="junction-handle"
        type="source"
        id="j-s"
        position={Position.Right}
        style={{ width: 12, height: 12, right: -6 }}
        onClick={stopClick}
        onDoubleClick={stopClick}
      />
      <Handle
        className="junction-handle"
        type="target"
        id="j-t"
        position={Position.Left}
        style={{ width: 12, height: 12, left: -6 }}
        onClick={stopClick}
        onDoubleClick={stopClick}
      />
    </div>
  );
}
