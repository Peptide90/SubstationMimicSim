import type { LearningTier } from '../../drawing/model';
import { secondaryConventions } from '../../secondary/conventions';
import { columnTitles, layoutBlockDiagram, type DiagramBlock, type PlacedBlock, type ProtectionBlockDiagram } from '../../secondary/protectionBlockDiagram';

type Props = {
  diagram: ProtectionBlockDiagram;
  site: string;
  tier: LearningTier;
  selectedBlockId?: string;
  onSelectBlock: (block: DiagramBlock | undefined) => void;
};

const TITLE_BLOCK = { width: 300, height: 74 };

/**
 * Protect's first sheet: the protection block diagram, laid out as an
 * engineering drawing with a frame and title block. Generated, never drawn.
 */
export function ProtectionSheet({ diagram, site, tier, selectedBlockId, onSelectBlock }: Props) {
  const layout = layoutBlockDiagram(diagram);
  const byId = new Map(layout.blocks.map((block) => [block.id, block]));
  const sheetWidth = Math.max(layout.width + 40, 900);
  const sheetHeight = layout.height + TITLE_BLOCK.height + 60;

  if (!diagram.blocks.length) {
    return (
      <div className='mimic-v2-sheet-viewer'>
        <div className='mimic-v2-sheet-empty'>
          <h3>No protection on this drawing</h3>
          <p>Protect shows the secondary systems that measure the plant, decide to trip, and act on it. This drawing has no relays yet.</p>
          <p>Open an example with protection from Menu › Drawing library › Examples (for instance “earth fault trip” or “breaker fail / backup trip”), or add a relay with the relay manager in the panel on the right.</p>
        </div>
      </div>
    );
  }

  const link = (from: PlacedBlock, to: PlacedBlock) => {
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const mid = x1 + (x2 - x1) / 2;
    return `M ${x1} ${y1} H ${mid} V ${y2} H ${x2 - 6}`;
  };

  return (
    <div className='mimic-v2-sheet-viewer' onMouseDown={(event) => { if (event.target === event.currentTarget) onSelectBlock(undefined); }}>
      <svg className='mimic-v2-sheet' viewBox={`0 0 ${sheetWidth} ${sheetHeight}`} width={sheetWidth} height={sheetHeight} role='img' aria-label='Protection block diagram'>
        <defs>
          <marker id='sheet-arrow' markerWidth='8' markerHeight='8' refX='6' refY='4' orient='auto'><path d='M0 0 L8 4 L0 8 z' className='mimic-v2-sheet-arrowhead' /></marker>
          <marker id='sheet-arrow-active' markerWidth='8' markerHeight='8' refX='6' refY='4' orient='auto'><path d='M0 0 L8 4 L0 8 z' className='mimic-v2-sheet-arrowhead active' /></marker>
        </defs>
        <rect className='mimic-v2-sheet-paper' x={0} y={0} width={sheetWidth} height={sheetHeight} onMouseDown={() => onSelectBlock(undefined)} />
        <rect className='mimic-v2-sheet-frame' x={10} y={10} width={sheetWidth - 20} height={sheetHeight - 20} />
        {layout.columns.map(({ column, x, width }) => (
          <text key={column} className='mimic-v2-sheet-column-title' x={x + width / 2} y={42} textAnchor='middle'>{(diagram.detail === 'simple' ? columnTitles[column].simple : columnTitles[column].full).toUpperCase()}</text>
        ))}
        {diagram.links.map((item) => {
          const from = byId.get(item.from);
          const to = byId.get(item.to);
          if (!from || !to) return null;
          return <path key={`${item.from}->${item.to}`} className={`mimic-v2-sheet-link ${item.active ? 'active' : ''}`} d={link(from, to)} markerEnd={`url(#${item.active ? 'sheet-arrow-active' : 'sheet-arrow'})`} />;
        })}
        {layout.blocks.map((block) => (
          <g key={block.id} className={`mimic-v2-sheet-block ${block.column} ${block.state} ${selectedBlockId === block.id ? 'selected' : ''}`} transform={`translate(${block.x},${block.y})`} onMouseDown={(event) => { event.stopPropagation(); onSelectBlock(block); }} role='button' aria-label={`${block.label}${block.detail ? `, ${block.detail}` : ''}`}>
            <title>{block.objectId ? `${block.label} — select to find it on the single-line diagram` : block.label}</title>
            <rect width={block.width} height={block.height} rx={block.column === 'relay' ? 2 : 6} />
            <text className='mimic-v2-sheet-label' x={10} y={20}>{block.label}</text>
            {block.detail && <text className='mimic-v2-sheet-detail' x={10} y={38}>{block.detail.length > 34 ? `${block.detail.slice(0, 33)}…` : block.detail}</text>}
          </g>
        ))}
        <g className='mimic-v2-sheet-titleblock' transform={`translate(${sheetWidth - TITLE_BLOCK.width - 20},${sheetHeight - TITLE_BLOCK.height - 20})`}>
          <rect width={TITLE_BLOCK.width} height={TITLE_BLOCK.height} />
          <line x1={0} y1={26} x2={TITLE_BLOCK.width} y2={26} />
          <line x1={0} y1={50} x2={TITLE_BLOCK.width} y2={50} />
          <line x1={180} y1={26} x2={180} y2={TITLE_BLOCK.height} />
          <text x={8} y={18} className='strong'>PROTECTION BLOCK DIAGRAM</text>
          <text x={8} y={42}><title>{site}</title>{site.length > 26 ? `${site.slice(0, 25).toUpperCase()}…` : site.toUpperCase()}</text>
          <text x={8} y={66}>SHEET P-01 · GENERATED</text>
          <text x={188} y={42}>{secondaryConventions[diagram.convention].label.toUpperCase()}</text>
          <text x={188} y={66}>{tier.toUpperCase()}</text>
        </g>
      </svg>
      {diagram.notes.length > 0 && <aside className='mimic-v2-sheet-notes'><strong>Notes</strong><ul>{diagram.notes.map((note) => <li key={note}>{note}</li>)}</ul></aside>}
    </div>
  );
}
