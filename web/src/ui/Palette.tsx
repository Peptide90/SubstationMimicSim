import type { DragEvent } from 'react';
import React from 'react';
import type { NodeKind } from '../core/model';

type PaletteItem = {
  kind: NodeKind;
  title: string;
};

const ITEMS: PaletteItem[] = [
  { kind: "iface", title: "Interface" },
  { kind: 'ds', title: 'Disconnector (DS)' },
  { kind: 'cb', title: 'Circuit Breaker (CB)' },
  { kind: 'es', title: 'Earth Switch (ES)' },
  { kind: 'xfmr', title: 'Transformer (XFMR)' }
];

export type PaletteProps = {
  onAddAtCenter: (kind: NodeKind) => void;
};

export function Palette({ onAddAtCenter }: PaletteProps) {
  const onDragStart = (evt: DragEvent<HTMLDivElement>, kind: NodeKind) => {
    evt.dataTransfer.setData('application/mimic-node-kind', kind);
    evt.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      style={{
        width: 240,
        padding: 10,
        border: '1px solid #1f2937',
        background: '#0b1220',
        borderRadius: 8,
        color: '#fff'
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 8, color: '#fff' }}>Components</div>
      <div style={{ color: '#cbd5e1', fontSize: 12, marginBottom: 10 }}>
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
              border: '1px solid #334155',
              borderRadius: 8,
              cursor: 'grab',
              userSelect: 'none',
              background: '#0f172a',
              color: '#fff'
            }}
            title="Drag to place, or click to add at centre"
          >
            {it.title}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: '#cbd5e1' }}>
        Tip: Drag a terminal onto a busbar to tee in. Double-click a busbar to delete it.
      </div>
    </div>
  );
}
