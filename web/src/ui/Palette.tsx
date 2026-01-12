import type { DragEvent } from 'react';
import React from 'react';
import type { NodeKind } from '../core/model';

type PaletteItem = {
  kind: NodeKind;
  title: string;
};

const ITEMS: PaletteItem[] = [
  { kind: 'source', title: 'Source' },
  { kind: 'load', title: 'Load' },
  { kind: 'bus', title: 'Bus' },
  { kind: 'ds', title: 'Disconnector (DS)' },
  { kind: 'es', title: 'Earth Switch (ES)' },
  { kind: 'cb', title: 'Circuit Breaker (CB)' },
  { kind: 'xfmr', title: 'Transformer (XFMR)' },
];

export type PaletteProps = {
  onAddAtCenter: (kind: NodeKind) => void;
};

export function Palette({ onAddAtCenter }: PaletteProps) {
  const onDragStart = (evt: DragEvent<HTMLDivElement>, kind: NodeKind) => {
    evt.dataTransfer.setData('application/mimic-node-kind', kind);
    evt.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 20,
        width: 220,
        padding: 10,
        border: '1px solid #ddd',
        background: 'white',
        borderRadius: 6,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Components</div>
      <div style={{ color: '#666', fontSize: 12, marginBottom: 10 }}>
        Drag onto canvas, or click to drop at centre.
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {ITEMS.map((it) => (
          <div
            key={it.kind}
            draggable
            onDragStart={(e) => onDragStart(e, it.kind)}
            onClick={() => onAddAtCenter(it.kind)}
            role="button"
            tabIndex={0}
            style={{
              padding: '8px 10px',
              border: '1px solid #eee',
              borderRadius: 6,
              cursor: 'grab',
              userSelect: 'none',
              background: '#fafafa',
            }}
            title="Drag to place, or click to add at centre"
          >
            {it.title}
          </div>
        ))}
      </div>
    </div>
  );
}
