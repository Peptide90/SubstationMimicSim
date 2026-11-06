import type {
  DrawingDocument,
  ElectricalSymbol,
  LineEndColour,
  ScenarioDefinition,
  SwitchingInstruction,
  SwitchingInstructionProgress,
  SwitchingSheet,
  SwitchingVerb
} from '../drawing/model';

/**
 * Formal switching instruction sheets.
 *
 * Control issues numbered instructions; the operator carries them out *in
 * order* and reads back the checks. This module models the three habits that
 * matter:
 *
 * 1. Sequence. An operation on anything other than the next instruction's
 *    target is out of sequence, and is reported as such.
 * 2. Actions complete themselves. When the next instruction is an action
 *    ("open DS1") and the equipment reaches that state, the line is done.
 * 3. Checks and reports are read back. A "check open" line, or one asking for
 *    line-end colours, completes only when the learner confirms it — and a
 *    confirmation that does not match the equipment is a false readback.
 */

export const switchingVerbLabels: Record<SwitchingVerb, string> = {
  open: 'Open',
  close: 'Close',
  'check-open': 'Check open',
  'check-closed': 'Check closed',
  'open-lock-caution': 'Open, lock and caution',
  'check-open-lock-caution': 'Check open, locked and cautioned',
  'close-earth': 'Close earth',
  'close-earth-lock': 'Close and lock earth',
  'open-earth': 'Open earth',
  'remove-lock-caution': 'Remove lock and caution'
};

export const lineEndColourOrder: LineEndColour[] = ['red', 'yellow', 'blue', 'green', 'black'];

/** Lines the learner must confirm by hand rather than by operating equipment. */
export function requiresReadback(instruction: SwitchingInstruction): boolean {
  return instruction.verb.startsWith('check-') || Boolean(instruction.report);
}

/** Whether the equipment is in the state this line asks for. */
export function instructionSatisfied(instruction: SwitchingInstruction, doc: DrawingDocument): boolean {
  const symbol = doc.objects.symbols.find((item) => item.id === instruction.targetObjectId);
  if (!symbol) return false;
  const state = symbol.operation?.switchState;
  const tag = symbol.operation?.isolation?.kind;
  switch (instruction.verb) {
    case 'open':
    case 'check-open':
    case 'open-earth':
      return state === 'open';
    case 'close':
    case 'check-closed':
    case 'close-earth':
      return state === 'closed';
    case 'open-lock-caution':
    case 'check-open-lock-caution':
      return state === 'open' && tag === 'point-of-isolation';
    case 'close-earth-lock':
      return state === 'closed' && tag === 'point-of-earthing';
    case 'remove-lock-caution':
      return !tag;
  }
}

export function progressFor(scenario: ScenarioDefinition, sheetId: string): SwitchingInstructionProgress[] {
  return scenario.switchingProgress?.[sheetId] ?? [];
}

export function nextInstruction(sheet: SwitchingSheet, progress: SwitchingInstructionProgress[]): SwitchingInstruction | undefined {
  return sheet.instructions[progress.length];
}

export function sheetComplete(sheet: SwitchingSheet, progress: SwitchingInstructionProgress[]): boolean {
  return progress.length >= sheet.instructions.length;
}

/** The first sheet still in progress. Sheets are worked one at a time, in the order issued. */
export function activeSheet(scenario: ScenarioDefinition): SwitchingSheet | undefined {
  return (scenario.switchingSheets ?? []).find((sheet) => !sheetComplete(sheet, progressFor(scenario, sheet.id)));
}

function withProgress(scenario: ScenarioDefinition, sheetId: string, progress: SwitchingInstructionProgress[]): ScenarioDefinition {
  return { ...scenario, switchingProgress: { ...(scenario.switchingProgress ?? {}), [sheetId]: progress } };
}

function confirmation(instruction: SwitchingInstruction, atMs: number, now: number): SwitchingInstructionProgress {
  return { instructionId: instruction.id, confirmedAt: new Date(now).toISOString(), atMs };
}

/**
 * Complete every action line, in order, whose equipment has reached the asked
 * state. Stops at the first unmet line or the first readback line.
 */
export function advanceSwitchingSheets(scenario: ScenarioDefinition, doc: DrawingDocument, atMs = scenario.elapsedMs ?? 0, now = Date.now()): ScenarioDefinition {
  let next = scenario;
  for (const sheet of scenario.switchingSheets ?? []) {
    const progress = [...progressFor(next, sheet.id)];
    let instruction = nextInstruction(sheet, progress);
    while (instruction && !requiresReadback(instruction) && instructionSatisfied(instruction, doc)) {
      progress.push(confirmation(instruction, atMs, now));
      instruction = nextInstruction(sheet, progress);
    }
    next = withProgress(next, sheet.id, progress);
    // A later sheet cannot start until this one is finished.
    if (!sheetComplete(sheet, progress)) break;
  }
  return next;
}

export type SequenceCheck =
  | { ok: true }
  | { ok: false; expected: SwitchingInstruction; reason: string };

const nameOf = (doc: DrawingDocument, id: string) => {
  const symbol: ElectricalSymbol | undefined = doc.objects.symbols.find((item) => item.id === id);
  return symbol?.label?.text?.trim() || id;
};

/**
 * Is operating this object the next thing the sheet asks for? Call before the
 * operation is applied. With no sheet in progress, anything is in sequence.
 */
export function checkSequence(scenario: ScenarioDefinition, doc: DrawingDocument, objectId: string): SequenceCheck {
  const sheet = activeSheet(scenario);
  if (!sheet) return { ok: true };
  const expected = nextInstruction(sheet, progressFor(scenario, sheet.id));
  if (!expected || expected.targetObjectId === objectId) return { ok: true };
  return {
    ok: false,
    expected,
    reason: `Out of sequence: the sheet's next line is "${switchingVerbLabels[expected.verb]} ${nameOf(doc, expected.targetObjectId)}", not ${nameOf(doc, objectId)}.`
  };
}

export interface ReadbackResult {
  scenario: ScenarioDefinition;
  ok: boolean;
  reason: string;
}

const sameColours = (a: LineEndColour[] = [], b: LineEndColour[] = []) => a.length === b.length && a.every((colour, index) => colour === b[index]);

/**
 * The learner reads back the next line. A readback that does not match the
 * equipment — or the line-end colours actually painted there — is refused and
 * reported as a false readback, which callers should count as a wrong
 * operation.
 */
export function confirmReadback(
  scenario: ScenarioDefinition,
  doc: DrawingDocument,
  sheetId: string,
  instructionId: string,
  reportedColours?: LineEndColour[],
  atMs = scenario.elapsedMs ?? 0,
  now = Date.now()
): ReadbackResult {
  const sheet = (scenario.switchingSheets ?? []).find((item) => item.id === sheetId);
  if (!sheet) return { scenario, ok: false, reason: `No switching sheet ${sheetId}` };
  const progress = progressFor(scenario, sheetId);
  const expected = nextInstruction(sheet, progress);
  if (!expected) return { scenario, ok: false, reason: `${sheet.title} is already complete.` };
  if (expected.id !== instructionId) {
    return { scenario, ok: false, reason: `Out of sequence: confirm line ${progress.length + 1} first.` };
  }
  const target = nameOf(doc, expected.targetObjectId);
  if (!instructionSatisfied(expected, doc)) {
    return { scenario, ok: false, reason: `False readback: ${target} is not "${switchingVerbLabels[expected.verb].toLowerCase()}". Check the equipment before reporting.` };
  }
  if (expected.report?.kind === 'line-end-colours') {
    const painted = sheet.lineEndColours?.[expected.report.targetObjectId];
    if (!sameColours(reportedColours, painted)) {
      return { scenario, ok: false, reason: `False readback: the colours reported for ${nameOf(doc, expected.report.targetObjectId)} do not match the line end.` };
    }
  }
  return {
    scenario: withProgress(scenario, sheetId, [...progress, confirmation(expected, atMs, now)]),
    ok: true,
    reason: `Line ${progress.length + 1} confirmed: ${switchingVerbLabels[expected.verb]} ${target}.`
  };
}
