import { useState } from 'react';
import type { DrawingDocument, LineEndColour, SwitchingInstructionProgress, SwitchingSheet } from '../../drawing/model';
import { lineEndColourOrder, nextInstruction, requiresReadback, sheetComplete, switchingVerbLabels } from '../../scenarios/switchingSheet';

type Props = {
  sheet: SwitchingSheet;
  progress: SwitchingInstructionProgress[];
  doc: DrawingDocument;
  /** Reference shown in the header, as a control room would issue it. */
  reference: string;
  message?: string;
  onReadback: (instructionId: string, colours?: LineEndColour[]) => void;
};

const formatAt = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * A switching instruction sheet as issued by network control. Lines complete in
 * order; check and report lines need the learner to read back what they found.
 */
export function SwitchingSheetPanel({ sheet, progress, doc, reference, message, onReadback }: Props) {
  const [colours, setColours] = useState<LineEndColour[]>([]);
  const nameOf = (id: string) => doc.objects.symbols.find((symbol) => symbol.id === id)?.label?.text?.trim() || id;
  const next = nextInstruction(sheet, progress);
  const confirmed = new Map(progress.map((item) => [item.instructionId, item]));
  const complete = sheetComplete(sheet, progress);

  return (
    <section className='mimic-v2-switching-sheet' aria-label='Switching instruction sheet'>
      <header>
        <strong>Network control instructions</strong>
        <span>{sheet.title}</span>
        <small>Ref {reference}</small>
      </header>
      <ol>
        {sheet.instructions.map((line, index) => {
          const done = confirmed.get(line.id);
          const isNext = line.id === next?.id;
          return (
            <li key={line.id} className={done ? 'done' : isNext ? 'next' : 'pending'}>
              <span className='mimic-v2-sheet-number'>{index + 1}</span>
              <div>
                <b>{switchingVerbLabels[line.verb]} {nameOf(line.targetObjectId)}</b>
                {line.notes && <p>{line.notes}</p>}
              </div>
              <span className='mimic-v2-sheet-status'>{done ? `Done ${formatAt(done.atMs)}` : isNext ? 'Next' : ''}</span>
            </li>
          );
        })}
      </ol>
      {complete && <p className='mimic-v2-sheet-complete'>Sheet complete. All lines confirmed with control.</p>}
      {next && requiresReadback(next) && (
        <div className='mimic-v2-sheet-readback'>
          <strong>Report back to control: line {sheet.instructions.indexOf(next) + 1}</strong>
          {next.report?.kind === 'line-end-colours' ? (
            <>
              <p>Select {nameOf(next.report.targetObjectId)} on the diagram to read its line-end colours, then report them in order.</p>
              <div className='mimic-v2-colour-row'>
                {lineEndColourOrder.map((colour) => (
                  <button key={colour} type='button' className={`mimic-v2-colour-chip ${colour}`} onClick={() => setColours((prev) => [...prev, colour])}>{colour}</button>
                ))}
              </div>
              <p className='mimic-v2-colour-sequence'>Reporting: {colours.length ? colours.join(', ') : 'nothing yet'}</p>
              <div className='mimic-v2-voltage-row'>
                <button type='button' className='mimic-v2-chip' disabled={!colours.length} onClick={() => setColours([])}>Clear</button>
                <button type='button' className='mimic-v2-chip active' disabled={!colours.length} onClick={() => { onReadback(next.id, colours); setColours([]); }}>Report to control</button>
              </div>
            </>
          ) : (
            <>
              <p>Check {nameOf(next.targetObjectId)} on the diagram, then confirm.</p>
              <button type='button' className='mimic-v2-chip active' onClick={() => onReadback(next.id)}>Confirm: {switchingVerbLabels[next.verb].toLowerCase()}</button>
            </>
          )}
        </div>
      )}
      {message && <p className='mimic-v2-sheet-message'>{message}</p>}
    </section>
  );
}
