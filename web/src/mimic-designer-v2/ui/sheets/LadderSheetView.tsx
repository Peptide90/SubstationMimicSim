import type { LearningTier } from '../../drawing/model';
import { secondaryConventions } from '../../secondary/conventions';
import type { ElementAction, LadderSheet, SheetCircuit, SheetElement } from '../../secondary/ladderSheet';

type Props = {
  sheet: LadderSheet;
  number: string;
  site: string;
  tier: LearningTier;
  onToggleMcb: (mcbId: string, closed: boolean) => void;
  onToggleSupply: (supplyId: string, healthy: boolean) => void;
  onAction: (action: ElementAction) => void;
};

const WIDTH = 980;
const POS_X = 90;
const NEG_X = WIDTH - 90;
const RUNG_GAP = 92;
const HEADER = 116;
const FIRST_ELEMENT_X = 190;
const ELEMENT_STEP = 165;
const COIL_X = NEG_X - 80;
const TITLE_BLOCK = { width: 300, height: 74 };

const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function Contact({ element, x, y, onAction }: { element: SheetElement; x: number; y: number; onAction: (action: ElementAction) => void }) {
  const clickable = Boolean(element.action);
  const title = `${element.code ? `${element.code} ` : ''}${element.name}${element.detail ? ` — ${element.detail}` : ''}: ${element.conducts ? 'closed' : 'open'}${element.action?.kind === 'toggle-local-remote' ? ' (select to switch Local/Remote)' : element.action?.kind === 'command' ? ` (select to issue a ${element.action.location} ${element.action.command})` : ''}`;
  return (
    <g
      className={`mimic-v2-ladder-contact ${element.conducts ? 'conducts' : 'open'} ${element.live ? 'live' : ''} ${clickable ? 'clickable' : ''}`}
      transform={`translate(${x},${y})`}
      onMouseDown={clickable ? (event) => { event.stopPropagation(); onAction(element.action!); } : undefined}
      role={clickable ? 'button' : undefined}
      aria-label={title}
    >
      <title>{title}</title>
      <rect className='hit' x={-34} y={-44} width={68} height={78} />
      <line className='bar' x1={-8} y1={-12} x2={-8} y2={12} />
      <line className='bar' x1={8} y1={-12} x2={8} y2={12} />
      {element.normally === 'closed' && <line className='nc' x1={-14} y1={14} x2={14} y2={-14} />}
      {element.conducts && <line className='bridge' x1={-8} y1={0} x2={8} y2={0} />}
      <text className='code' x={0} y={-22} textAnchor='middle'>{element.code ?? short(element.name, 18)}</text>
      {element.code && <text className='name' x={0} y={-34} textAnchor='middle'>{short(element.name, 22)}</text>}
      {element.detail && <text className='detail' x={0} y={28} textAnchor='middle'>{short(element.detail, 24)}</text>}
    </g>
  );
}

function Circuit({ circuit, top, onToggleMcb, onToggleSupply, onAction }: { circuit: SheetCircuit; top: number } & Omit<Props, 'sheet' | 'number' | 'site' | 'tier'>) {
  const railTop = top + HEADER - 16;
  const railBottom = top + HEADER + Math.max(circuit.rungs.length - 1, 0) * RUNG_GAP + 20;
  const live = circuit.supplied;
  const supplyLive = circuit.supply.healthy;
  return (
    <g className='mimic-v2-ladder-circuit'>
      <text className='mimic-v2-ladder-heading' x={30} y={top + 16}>{circuit.kind === 'trip' ? 'TRIP CIRCUIT' : 'CLOSE CIRCUIT'} · {circuit.name.toUpperCase()}</text>
      {/* Supply and MCB feeding the positive rail. */}
      <g className={`mimic-v2-ladder-supply ${supplyLive ? 'healthy' : 'failed'}`} transform={`translate(${POS_X - 50},${top + 54})`} onMouseDown={(event) => { event.stopPropagation(); onToggleSupply(circuit.supply.id, !circuit.supply.healthy); }} role='button' aria-label={`${circuit.supply.detail}: ${supplyLive ? 'healthy' : 'lost'}. Select to ${supplyLive ? 'fail' : 'restore'} it.`}>
        <title>{`${circuit.supply.detail}: ${supplyLive ? 'healthy' : 'lost'} — select to ${supplyLive ? 'fail' : 'restore'}`}</title>
        <rect className='hit' x={-14} y={-20} width={44} height={40} />
        <line x1={0} y1={-10} x2={0} y2={10} className='cell long' />
        <line x1={8} y1={-5} x2={8} y2={5} className='cell' />
        <text x={-6} y={-16} className='code'>{circuit.supply.code}</text>
        {!supplyLive && <text x={-6} y={30} className='fault'>LOST</text>}
      </g>
      <path className={`mimic-v2-ladder-wire ${supplyLive ? 'live' : ''}`} d={`M ${POS_X - 42} ${top + 54} H ${POS_X - 18}`} />
      <g className={`mimic-v2-ladder-mcb ${circuit.mcb.closed ? 'closed' : 'open'} clickable`} transform={`translate(${POS_X},${top + 54})`} onMouseDown={(event) => { event.stopPropagation(); onToggleMcb(circuit.mcb.id, !circuit.mcb.closed); }} role='button' aria-label={`${circuit.mcb.detail}: ${circuit.mcb.closed ? 'closed' : 'open'}. Select to ${circuit.mcb.closed ? 'open' : 'close'} it.`}>
        <title>{`${circuit.mcb.detail}: ${circuit.mcb.closed ? 'closed' : 'open'} — select to ${circuit.mcb.closed ? 'open' : 'close'}`}</title>
        <rect className='hit' x={-22} y={-24} width={44} height={60} />
        <circle cx={-18} cy={0} r={2.5} />
        {circuit.mcb.closed ? <line x1={-18} y1={0} x2={0} y2={0} className={supplyLive ? 'live' : ''} /> : <line x1={-18} y1={0} x2={-4} y2={-12} />}
        <line x1={0} y1={0} x2={0} y2={railTop - (top + 54)} className={live ? 'live' : ''} />
        <text x={8} y={-10} className='code'>{circuit.mcb.code}</text>
        <text x={8} y={4} className='detail'>{circuit.mcb.closed ? 'ON' : 'OFF'}</text>
      </g>
      <text className='mimic-v2-ladder-rail-label' x={POS_X - 14} y={railTop - 4} textAnchor='end'>+</text>
      <text className='mimic-v2-ladder-rail-label' x={NEG_X + 14} y={railTop - 4}>−</text>
      <line className={`mimic-v2-ladder-rail ${live ? 'live' : ''}`} x1={POS_X} y1={railTop} x2={POS_X} y2={railBottom} />
      <line className={`mimic-v2-ladder-rail ${supplyLive ? 'return' : ''}`} x1={NEG_X} y1={railTop} x2={NEG_X} y2={railBottom} />
      {circuit.rungs.map((rung, index) => {
        const y = top + HEADER + index * RUNG_GAP;
        const xs = rung.elements.map((_, elementIndex) => FIRST_ELEMENT_X + elementIndex * ELEMENT_STEP);
        const segments: { x1: number; x2: number; live: boolean }[] = [];
        let from = POS_X;
        rung.elements.forEach((element, elementIndex) => {
          segments.push({ x1: from, x2: xs[elementIndex] - 8, live: element.live });
          from = xs[elementIndex] + 8;
        });
        segments.push({ x1: from, x2: COIL_X - 18, live: rung.energised });
        return (
          <g key={rung.id} className='mimic-v2-ladder-rung'>
            {segments.map((segment, segmentIndex) => <line key={segmentIndex} className={`mimic-v2-ladder-wire ${segment.live ? 'live' : ''}`} x1={segment.x1} y1={y} x2={segment.x2} y2={y} />)}
            {rung.elements.map((element, elementIndex) => <Contact key={element.id} element={element} x={xs[elementIndex]} y={y} onAction={onAction} />)}
            <g className={`mimic-v2-ladder-coil ${rung.energised ? 'energised' : ''}`} transform={`translate(${COIL_X},${y})`}>
              <title>{`${rung.coil.code ? `${rung.coil.code} ` : ''}${rung.coil.name}: ${rung.energised ? 'energised' : 'not energised'}`}</title>
              <circle r={18} />
              <text y={4} textAnchor='middle' className='code'>{rung.coil.code ?? (rung.coil.role === 'trip-coil' ? 'TC' : 'CC')}</text>
              <text y={-26} textAnchor='middle' className='name'>{rung.coil.name}</text>
            </g>
            <line className={`mimic-v2-ladder-wire ${rung.energised ? 'live' : ''}`} x1={COIL_X + 18} y1={y} x2={NEG_X} y2={y} />
          </g>
        );
      })}
      {circuit.deadBecause && <text className='mimic-v2-ladder-dead' x={NEG_X} y={top + 18} textAnchor='end'>{circuit.deadBecause === 'supply' ? 'DC SUPPLY LOST — CIRCUIT DEAD' : 'MCB OFF — CIRCUIT DEAD'}</text>}
    </g>
  );
}

/**
 * A breaker's trip and close circuits as a ladder: positive rail on the left,
 * negative on the right, each rung a chain of contacts to a coil. Live wiring
 * is drawn as far as current actually reaches.
 */
export function LadderSheetView({ sheet, number, site, tier, ...handlers }: Props) {
  const heights = sheet.circuits.map((circuit) => HEADER + Math.max(circuit.rungs.length - 1, 0) * RUNG_GAP + 60);
  const tops = heights.map((_, index) => 40 + heights.slice(0, index).reduce((sum, height) => sum + height, 0));
  const sheetHeight = 40 + heights.reduce((sum, height) => sum + height, 0) + TITLE_BLOCK.height + 30;
  return (
    <div className='mimic-v2-sheet-viewer'>
      <svg className='mimic-v2-sheet mimic-v2-ladder' viewBox={`0 0 ${WIDTH} ${sheetHeight}`} width={WIDTH} height={sheetHeight} role='img' aria-label={`${sheet.breakerName} trip and close circuits`}>
        <rect className='mimic-v2-sheet-paper' x={0} y={0} width={WIDTH} height={sheetHeight} />
        <rect className='mimic-v2-sheet-frame' x={10} y={10} width={WIDTH - 20} height={sheetHeight - 20} />
        {sheet.circuits.map((circuit, index) => <Circuit key={circuit.id} circuit={circuit} top={tops[index]} {...handlers} />)}
        <g className='mimic-v2-sheet-titleblock' transform={`translate(${WIDTH - TITLE_BLOCK.width - 20},${sheetHeight - TITLE_BLOCK.height - 20})`}>
          <rect width={TITLE_BLOCK.width} height={TITLE_BLOCK.height} />
          <line x1={0} y1={26} x2={TITLE_BLOCK.width} y2={26} />
          <line x1={0} y1={50} x2={TITLE_BLOCK.width} y2={50} />
          <line x1={180} y1={26} x2={180} y2={TITLE_BLOCK.height} />
          <text x={8} y={18} className='strong'>{short(`TRIP & CLOSE · ${sheet.breakerName.toUpperCase()}`, 36)}</text>
          <text x={8} y={42}><title>{site}</title>{short(site.toUpperCase(), 26)}</text>
          <text x={8} y={66}>SHEET {number} · GENERATED</text>
          <text x={188} y={42}>{secondaryConventions[sheet.convention].label.toUpperCase()}</text>
          <text x={188} y={66}>{tier.toUpperCase()}</text>
        </g>
      </svg>
      {sheet.notes.length > 0 && <aside className='mimic-v2-sheet-notes'><strong>Notes</strong><ul>{sheet.notes.map((note) => <li key={note}>{note}</li>)}</ul></aside>}
    </div>
  );
}
