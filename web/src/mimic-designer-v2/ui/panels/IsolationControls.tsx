import type { ElectricalSymbol, IsolationKind } from '../../drawing/model';
import { canApplyIsolation, isolationKindFor, isolationLabels } from '../../safety/isolation';

type Props = {
  symbol: ElectricalSymbol;
  disabled?: boolean;
  onApply: (kind: IsolationKind) => void;
  onRemove: () => void;
};

/** Apply or remove a point of isolation or earthing on the selected device. */
export function IsolationControls({ symbol, disabled, onApply, onRemove }: Props) {
  const kind = isolationKindFor(symbol);
  if (!kind) return null;
  const tag = symbol.operation?.isolation;

  if (tag) {
    return (
      <div className='mimic-v2-isolation-controls'>
        <p className='mimic-v2-isolation-status applied'>Locked: {isolationLabels[tag.kind]}</p>
        <button type='button' className='mimic-v2-chip' disabled={disabled} onClick={onRemove}>Remove lock</button>
      </div>
    );
  }

  const check = canApplyIsolation(symbol, kind);
  return (
    <div className='mimic-v2-isolation-controls'>
      <button
        type='button'
        className='mimic-v2-chip'
        disabled={disabled || !check.ok}
        title={check.ok ? isolationLabels[kind] : check.reason}
        onClick={() => onApply(kind)}
      >
        {kind === 'point-of-isolation' ? 'Lock open and caution' : 'Lock earth closed'}
      </button>
      {!check.ok && <p className='mimic-v2-isolation-hint'>{check.reason}</p>}
    </div>
  );
}

/** Upright badge drawn on a locked device. Lives inside the symbol's rotated group. */
export function IsolationBadge({ kind, rotation }: { kind: IsolationKind; rotation: number }) {
  const label = kind === 'point-of-isolation' ? 'LOCKED OPEN' : 'LOCKED EARTH';
  return (
    <g className={`mimic-v2-isolation-badge ${kind}`} transform={`rotate(${-rotation})`} aria-label={isolationLabels[kind]}>
      <title>{isolationLabels[kind]}</title>
      <rect x={-34} y={-46} width={68} height={14} rx={3} />
      <text x={0} y={-36} textAnchor='middle'>{label}</text>
    </g>
  );
}
