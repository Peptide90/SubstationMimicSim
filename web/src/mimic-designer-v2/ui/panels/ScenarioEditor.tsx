import { useMemo } from 'react';
import type { DrawingDocument, ElectricalSymbol, LearningTier, LineEndColour, ScenarioDefinition, ScenarioObjective, SwitchingVerb } from '../../drawing/model';
import { learningTierOrder } from '../../learning/tiers';
import { lineEndColourOrder, switchingVerbLabels } from '../../scenarios/switchingSheet';
import type { ScenarioPackage } from '../../scenarios/packageScenario';
import {
  addInstruction, addObjective, addSwitchingSheet, addTeachingStep, captureStartingState, isBuildExercise, moveInstruction, moveObjective,
  moveTeachingStep, objectiveFields, objectiveTypeLabels, packageDraft, removeInstruction, removeObjective, removeSwitchingSheet,
  removeTeachingStep, setBuildExercise, setLineEndColours, setTierExplanation, stepsFromObjectives, toggleAllowedComponent, toggleFixture,
  updateInstruction, updateObjective, updateScenario, updateSwitchingSheet, updateTeachingStep, useScenarioAuthoring, validateScenario,
  type AuthoringIssue,
  type AuthoringTab
} from '../../authoring';

type Props = {
  doc: DrawingDocument;
  /** The object selected on the canvas, offered as a quick way to pick a target. */
  selectedId?: string;
  onSave: (pkg: ScenarioPackage) => void;
  onTryIt: (pkg: ScenarioPackage) => void;
  onExport: (pkg: ScenarioPackage) => void;
};

type Tab = AuthoringTab;
const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'objectives', label: 'Objectives' },
  { id: 'steps', label: 'Steps' },
  { id: 'sheets', label: 'Switching' },
  { id: 'rules', label: 'Rules' }
];
const buildableTypes: ElectricalSymbol['type'][] = ['disconnector', 'circuit-breaker', 'earth-switch', 'ct', 'vt', 'transformer', 'surge-arrester'];
const objectiveTypes = Object.keys(objectiveTypeLabels) as Array<NonNullable<ScenarioObjective['type']>>;

/** In-app scenario authoring: a lesson becomes a file you make, not a commit. */
export function ScenarioEditor({ doc, selectedId, onSave, onTryIt, onExport }: Props) {
  const { draft, apply, undo, close, dirty, history, tab, setTab } = useScenarioAuthoring();
  const issues = useMemo(() => (draft ? validateScenario(draft, doc) : []), [draft, doc]);
  if (!draft) return null;

  const errors = issues.filter((issue) => issue.severity === 'error');
  const objects = [
    ...doc.objects.symbols.map((symbol) => ({ id: symbol.id, label: `${symbol.label?.text?.trim() || symbol.id} (${symbol.type.replace(/-/g, ' ')})` })),
    ...doc.objects.busbars.map((path) => ({ id: path.id, label: `${path.label?.text?.trim() || path.id} (busbar)` })),
    ...doc.objects.conductors.map((path) => ({ id: path.id, label: `${path.label?.text?.trim() || path.id} (conductor)` }))
  ];
  const switchgear = doc.objects.symbols.filter((symbol) => ['circuit-breaker', 'disconnector', 'earth-switch', 'busbar-coupler'].includes(symbol.type));
  const tabIssues = (id: Tab) => issues.filter((issue) => issue.area === id).length;

  const issueList = (list: AuthoringIssue[]) => list.length ? (
    <ul className='mimic-v2-issue-list'>{list.map((issue, index) => <li key={index} className={issue.severity}>{issue.message}</li>)}</ul>
  ) : null;

  return (
    <section className='mimic-v2-scenario-editor' aria-label='Scenario editor'>
      <header>
        <input className='mimic-v2-editor-title' value={draft.name} aria-label='Scenario name' onChange={(event) => apply((s) => updateScenario(s, { name: event.target.value }))} />
        <div className='mimic-v2-voltage-row'>
          <button type='button' className='mimic-v2-chip' disabled={!history.length} onClick={undo}>Undo</button>
          <button type='button' className='mimic-v2-chip' disabled={errors.length > 0} title={errors.length ? 'Fix the errors before trying it' : 'Play the scenario as a learner'} onClick={() => onTryIt(packageDraft(draft, doc))}>Try it</button>
          <button type='button' className='mimic-v2-chip' onClick={() => onExport(packageDraft(draft, doc))}>Export pack</button>
          <button type='button' className='mimic-v2-chip active' onClick={() => onSave(packageDraft(draft, doc))}>{dirty ? 'Save' : 'Saved'}</button>
          <button type='button' className='mimic-v2-chip' onClick={close}>Close</button>
        </div>
        <p className={`mimic-v2-editor-status ${errors.length ? 'error' : issues.length ? 'warning' : 'ok'}`}>
          {errors.length ? `${errors.length} error${errors.length === 1 ? '' : 's'} to fix before learners can complete this.` : issues.length ? `${issues.length} suggestion${issues.length === 1 ? '' : 's'}.` : 'Ready to play.'}
        </p>
      </header>

      <nav className='mimic-v2-editor-tabs'>
        {tabs.map((item) => <button key={item.id} type='button' className={`mimic-v2-chip ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)}>{item.label}{tabIssues(item.id) ? ` (${tabIssues(item.id)})` : ''}</button>)}
      </nav>

      {tab === 'overview' && <div className='mimic-v2-editor-body'>
        {issueList(issues.filter((issue) => issue.area === 'overview'))}
        <label>Description<textarea value={draft.description ?? ''} onChange={(event) => apply((s) => updateScenario(s, { description: event.target.value }))} /></label>
        <div className='mimic-v2-editor-grid'>
          <label>Kind<select value={draft.mode ?? 'lesson'} onChange={(event) => apply((s) => updateScenario(s, { mode: event.target.value as ScenarioDefinition['mode'] }))}><option value='lesson'>Lesson (guided)</option><option value='challenge'>Challenge (graded)</option><option value='sandbox'>Sandbox</option></select></label>
          <label>Difficulty<select value={draft.difficulty ?? 'intro'} onChange={(event) => apply((s) => updateScenario(s, { difficulty: event.target.value as ScenarioDefinition['difficulty'] }))}><option value='intro'>Intro</option><option value='standard'>Standard</option><option value='advanced'>Advanced</option></select></label>
          {(['minTier', 'recommendedTier', 'maxTier'] as const).map((field) => (
            <label key={field}>{field === 'minTier' ? 'Lowest tier' : field === 'maxTier' ? 'Highest tier' : 'Recommended'}
              <select value={draft[field] ?? ''} onChange={(event) => apply((s) => updateScenario(s, { [field]: (event.target.value || undefined) as LearningTier | undefined }))}>
                <option value=''>Any</option>{learningTierOrder.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
              </select>
            </label>
          ))}
        </div>
        <label>Learning objectives (one per line)<textarea value={(draft.learningObjectives ?? []).join('\n')} onChange={(event) => apply((s) => updateScenario(s, { learningObjectives: event.target.value.split('\n') }))} /></label>
        <h5>What this teaches, at each tier</h5>
        <p className='mimic-v2-editor-hint'>Write the same idea for each audience. Empty tiers are flagged so gaps are easy to see.</p>
        {learningTierOrder.map((tier) => (
          <label key={tier}>{tier}<textarea value={draft.explanationVariants?.[tier] ?? ''} onChange={(event) => apply((s) => setTierExplanation(s, tier, event.target.value))} /></label>
        ))}
      </div>}

      {tab === 'objectives' && <div className='mimic-v2-editor-body'>
        {issueList(issues.filter((issue) => issue.area === 'objectives' && !issue.itemId))}
        {draft.objectives.map((objective, index) => {
          const type = objective.type ?? 'operate-switchgear';
          const fields = objectiveFields(type);
          const earlier = draft.objectives.slice(0, index);
          return (
            <article key={objective.id} className='mimic-v2-editor-card'>
              <div className='mimic-v2-editor-card-head'>
                <b>{index + 1}</b>
                <input value={objective.text} aria-label='Objective text' onChange={(event) => apply((s) => updateObjective(s, objective.id, { text: event.target.value }))} />
                <button type='button' className='mimic-v2-chip' onClick={() => apply((s) => moveObjective(s, objective.id, -1))}>Up</button>
                <button type='button' className='mimic-v2-chip' onClick={() => apply((s) => moveObjective(s, objective.id, 1))}>Down</button>
                <button type='button' className='mimic-v2-chip' onClick={() => apply((s) => removeObjective(s, objective.id))}>Remove</button>
              </div>
              <label>What the learner must do<select value={type} onChange={(event) => apply((s) => updateObjective(s, objective.id, { type: event.target.value as typeof type }))}>{objectiveTypes.map((item) => <option key={item} value={item}>{objectiveTypeLabels[item]}</option>)}</select></label>
              {fields.target && <label>{fields.secondary ? 'From' : 'Target'}{!fields.targetRequired && ' (optional)'}<ObjectPicker selectedId={selectedId} options={objects} value={objective.targetObjectId} onChange={(id) => apply((s) => updateObjective(s, objective.id, { targetObjectId: id }))} /></label>}
              {fields.secondary && <label>To<ObjectPicker selectedId={selectedId} options={objects} value={objective.secondaryObjectId} onChange={(id) => apply((s) => updateObjective(s, objective.id, { secondaryObjectId: id }))} /></label>}
              {fields.switchState && <label>State<select value={objective.targetState ?? 'open'} onChange={(event) => apply((s) => updateObjective(s, objective.id, { targetState: event.target.value as 'open' | 'closed' }))}><option value='open'>Open</option><option value='closed'>Closed</option></select></label>}
              {fields.isolatedState && <label>Required<select value={objective.targetState ?? 'isolated'} onChange={(event) => apply((s) => updateObjective(s, objective.id, { targetState: event.target.value as 'dead' | 'isolated' }))}><option value='dead'>Dead</option><option value='isolated'>Dead and earthed</option></select></label>}
              {fields.isolationKind && <label>Kind of lock<select value={objective.isolationKind ?? 'point-of-isolation'} onChange={(event) => apply((s) => updateObjective(s, objective.id, { isolationKind: event.target.value as 'point-of-isolation' | 'point-of-earthing' }))}><option value='point-of-isolation'>Point of isolation</option><option value='point-of-earthing'>Point of earthing</option></select></label>}
              {fields.componentTypes && <div className='mimic-v2-editor-checks'><span>Equipment</span>{buildableTypes.map((item) => <label key={item}><input type='checkbox' checked={objective.componentTypes?.includes(item) ?? false} onChange={() => apply((s) => updateObjective(s, objective.id, { componentTypes: objective.componentTypes?.includes(item) ? objective.componentTypes.filter((t) => t !== item) : [...(objective.componentTypes ?? []), item] }))} />{item.replace(/-/g, ' ')}</label>)}<label>At least<input type='number' min={1} value={objective.count ?? 1} onChange={(event) => apply((s) => updateObjective(s, objective.id, { count: Math.max(1, Number(event.target.value) || 1) }))} /></label></div>}
              {fields.requiredCounts && type === 'build-bay' && <div className='mimic-v2-editor-checks'><span>Bay must contain</span>{buildableTypes.map((item) => <label key={item}>{item.replace(/-/g, ' ')}<input type='number' min={0} value={objective.requiredCounts?.[item] ?? 0} onChange={(event) => apply((s) => updateObjective(s, objective.id, { requiredCounts: { ...(objective.requiredCounts ?? {}), [item]: Math.max(0, Number(event.target.value) || 0) } }))} /></label>)}</div>}
              {fields.sheet && <label>Sheet<select value={objective.sheetId ?? ''} onChange={(event) => apply((s) => updateObjective(s, objective.id, { sheetId: event.target.value || undefined }))}><option value=''>Choose…</option>{(draft.switchingSheets ?? []).map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.title}</option>)}</select></label>}
              <label>Hint<input value={objective.hint ?? ''} onChange={(event) => apply((s) => updateObjective(s, objective.id, { hint: event.target.value }))} /></label>
              <div className='mimic-v2-editor-checks'>
                <label title='Once achieved, stays achieved — for sequences like energise then isolate'><input type='checkbox' checked={objective.latch ?? false} onChange={(event) => apply((s) => updateObjective(s, objective.id, { latch: event.target.checked }))} />Stays done once achieved</label>
                {earlier.length > 0 && <span>Only after:</span>}
                {earlier.map((other) => <label key={other.id}><input type='checkbox' checked={objective.requires?.includes(other.id) ?? false} onChange={(event) => apply((s) => updateObjective(s, objective.id, { requires: event.target.checked ? [...(objective.requires ?? []), other.id] : (objective.requires ?? []).filter((id) => id !== other.id) }))} />{draft.objectives.indexOf(other) + 1}</label>)}
              </div>
              {issueList(issues.filter((issue) => issue.itemId === objective.id))}
            </article>
          );
        })}
        <button type='button' className='mimic-v2-chip active' onClick={() => apply((s) => addObjective(s, 'restore-supply-to-load', selectedId))}>Add objective</button>
      </div>}

      {tab === 'steps' && <div className='mimic-v2-editor-body'>
        <p className='mimic-v2-editor-hint'>Steps guide a learner through a lesson. Each waits for something before moving on.</p>
        <button type='button' className='mimic-v2-chip' disabled={!draft.objectives.length} onClick={() => apply(stepsFromObjectives)}>One step per objective</button>
        {(draft.teachingSteps ?? []).map((step, index) => (
          <article key={step.id} className='mimic-v2-editor-card'>
            <div className='mimic-v2-editor-card-head'>
              <b>{index + 1}</b>
              <input value={step.title} aria-label='Step title' onChange={(event) => apply((s) => updateTeachingStep(s, step.id, { title: event.target.value }))} />
              <button type='button' className='mimic-v2-chip' onClick={() => apply((s) => moveTeachingStep(s, step.id, -1))}>Up</button>
              <button type='button' className='mimic-v2-chip' onClick={() => apply((s) => moveTeachingStep(s, step.id, 1))}>Down</button>
              <button type='button' className='mimic-v2-chip' onClick={() => apply((s) => removeTeachingStep(s, step.id))}>Remove</button>
            </div>
            <label>What to tell the learner<textarea value={step.body} onChange={(event) => apply((s) => updateTeachingStep(s, step.id, { body: event.target.value }))} /></label>
            <label>Move on when<select value={step.waitFor ?? 'manual'} onChange={(event) => apply((s) => updateTeachingStep(s, step.id, { waitFor: event.target.value as typeof step.waitFor }))}>
              <option value='objective-complete'>An objective is complete</option>
              <option value='correct-state'>A device reaches a state</option>
              <option value='target-energised'>Something becomes live</option>
              <option value='fault-clearance'>A fault is cleared</option>
              <option value='manual'>Never (final step)</option>
            </select></label>
            {step.waitFor === 'objective-complete' && <label>Objective<select value={step.objectiveId ?? ''} onChange={(event) => apply((s) => updateTeachingStep(s, step.id, { objectiveId: event.target.value || undefined }))}><option value=''>Choose…</option>{draft.objectives.map((objective, i) => <option key={objective.id} value={objective.id}>{i + 1}. {objective.text}</option>)}</select></label>}
            {(step.waitFor === 'correct-state' || step.waitFor === 'target-energised') && <label>Device<ObjectPicker selectedId={selectedId} options={objects} value={step.expectedObjectId ?? step.targetObjectId} onChange={(id) => apply((s) => updateTeachingStep(s, step.id, { expectedObjectId: id, targetObjectId: id }))} /></label>}
            {step.waitFor === 'correct-state' && <label>State<select value={step.expectedState ?? 'open'} onChange={(event) => apply((s) => updateTeachingStep(s, step.id, { expectedState: event.target.value as 'open' | 'closed' }))}><option value='open'>Open</option><option value='closed'>Closed</option></select></label>}
            {issueList(issues.filter((issue) => issue.itemId === step.id))}
          </article>
        ))}
        <button type='button' className='mimic-v2-chip active' onClick={() => apply((s) => addTeachingStep(s))}>Add step</button>
      </div>}

      {tab === 'sheets' && <div className='mimic-v2-editor-body'>
        <p className='mimic-v2-editor-hint'>A switching sheet is worked strictly in order. Select a device on the diagram, then add a line for it.</p>
        {(draft.switchingSheets ?? []).map((sheet) => (
          <article key={sheet.id} className='mimic-v2-editor-card'>
            <div className='mimic-v2-editor-card-head'>
              <input value={sheet.title} aria-label='Sheet title' onChange={(event) => apply((s) => updateSwitchingSheet(s, sheet.id, { title: event.target.value }))} />
              <button type='button' className='mimic-v2-chip' onClick={() => apply((s) => removeSwitchingSheet(s, sheet.id))}>Remove sheet</button>
            </div>
            {issueList(issues.filter((issue) => issue.itemId === sheet.id))}
            <ol className='mimic-v2-editor-lines'>
              {sheet.instructions.map((line) => (
                <li key={line.id}>
                  <select value={line.verb} aria-label='Instruction' onChange={(event) => apply((s) => updateInstruction(s, sheet.id, line.id, { verb: event.target.value as SwitchingVerb }))}>{(Object.keys(switchingVerbLabels) as SwitchingVerb[]).map((verb) => <option key={verb} value={verb}>{switchingVerbLabels[verb]}</option>)}</select>
                  <ObjectPicker selectedId={selectedId} value={line.targetObjectId} options={switchgear.map((symbol) => ({ id: symbol.id, label: symbol.label?.text?.trim() || symbol.id }))} onChange={(id) => apply((s) => updateInstruction(s, sheet.id, line.id, { targetObjectId: id ?? '' }))} />
                  <input placeholder='Note to the operator' value={line.notes ?? ''} onChange={(event) => apply((s) => updateInstruction(s, sheet.id, line.id, { notes: event.target.value }))} />
                  <label><input type='checkbox' checked={Boolean(line.report)} onChange={(event) => apply((s) => updateInstruction(s, sheet.id, line.id, { report: event.target.checked ? { kind: 'line-end-colours', targetObjectId: line.report?.targetObjectId ?? '' } : undefined }))} />Report line-end colours from</label>
                  {line.report && <ObjectPicker selectedId={selectedId} options={objects} value={line.report.targetObjectId} onChange={(id) => apply((s) => updateInstruction(s, sheet.id, line.id, { report: { kind: 'line-end-colours', targetObjectId: id ?? '' } }))} />}
                  <span className='mimic-v2-voltage-row'>
                    <button type='button' className='mimic-v2-chip' onClick={() => apply((s) => moveInstruction(s, sheet.id, line.id, -1))}>Up</button>
                    <button type='button' className='mimic-v2-chip' onClick={() => apply((s) => moveInstruction(s, sheet.id, line.id, 1))}>Down</button>
                    <button type='button' className='mimic-v2-chip' onClick={() => apply((s) => removeInstruction(s, sheet.id, line.id))}>Remove</button>
                  </span>
                  {issueList(issues.filter((issue) => issue.itemId === line.id))}
                </li>
              ))}
            </ol>
            <button type='button' className='mimic-v2-chip active' onClick={() => apply((s) => addInstruction(s, sheet.id, doc.objects.symbols.find((symbol) => symbol.id === selectedId)))}>Add line{selectedId ? ' for selected device' : ''}</button>
            {[...new Set(sheet.instructions.map((line) => line.report?.targetObjectId).filter(Boolean) as string[])].map((objectId) => (
              <ColourEditor key={objectId} name={objects.find((item) => item.id === objectId)?.label ?? objectId} colours={sheet.lineEndColours?.[objectId] ?? []} onChange={(colours) => apply((s) => setLineEndColours(s, sheet.id, objectId, colours))} />
            ))}
          </article>
        ))}
        <button type='button' className='mimic-v2-chip active' onClick={() => apply((s) => addSwitchingSheet(s))}>Add switching sheet</button>
      </div>}

      {tab === 'rules' && <div className='mimic-v2-editor-body'>
        {issueList(issues.filter((issue) => issue.area === 'rules'))}
        <label><input type='checkbox' checked={isBuildExercise(draft)} onChange={(event) => apply((s) => setBuildExercise(s, event.target.checked))} />Build exercise: the learner places and wires equipment</label>
        {isBuildExercise(draft) ? <>
          <p className='mimic-v2-editor-hint'>Fixtures are what the learner starts with. Everything else on the canvas is your worked solution and is not shipped.</p>
          <div className='mimic-v2-editor-checks'><span>Fixtures</span>{doc.objects.symbols.map((symbol) => <label key={symbol.id}><input type='checkbox' checked={draft.restrictions?.lockedObjectIds?.includes(symbol.id) ?? false} onChange={() => apply((s) => toggleFixture(s, symbol.id))} />{symbol.label?.text?.trim() || symbol.id}</label>)}</div>
          <div className='mimic-v2-editor-checks'><span>Palette offers</span>{buildableTypes.map((type) => <label key={type}><input type='checkbox' checked={draft.restrictions?.allowedComponentTypes?.includes(type) ?? false} onChange={() => apply((s) => toggleAllowedComponent(s, type))} />{type.replace(/-/g, ' ')}</label>)}</div>
        </> : <>
          <p className='mimic-v2-editor-hint'>The learner operates the drawing as it is. Set the switches on the diagram the way the lesson should begin, then capture them.</p>
          <button type='button' className='mimic-v2-chip' onClick={() => apply((s) => captureStartingState(s, doc))}>Use the diagram's current switch states as the start</button>
        </>}
        <label>Fail after this many wrong operations<input type='number' min={0} value={draft.failureRules?.maxWrongOperations ?? 3} onChange={(event) => apply((s) => updateScenario(s, { failureRules: { ...(s.failureRules ?? {}), maxWrongOperations: Math.max(0, Number(event.target.value) || 0) } }))} /></label>
        <label><input type='checkbox' checked={draft.failureRules?.requireNoLiveEarthConflict ?? false} onChange={(event) => apply((s) => updateScenario(s, { failureRules: { ...(s.failureRules ?? {}), requireNoLiveEarthConflict: event.target.checked } }))} />Fail if live equipment is earthed</label>
      </div>}
    </section>
  );
}

type PickerOption = { id: string; label: string };

/** Choose an object on the drawing, or take whatever is selected on the canvas. */
function ObjectPicker({ value, onChange, options, selectedId, placeholder = 'Choose…' }: { value?: string; onChange: (id: string | undefined) => void; options: PickerOption[]; selectedId?: string; placeholder?: string }) {
  return (
    <span className='mimic-v2-picker'>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value=''>{placeholder}</option>
        {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <button type='button' className='mimic-v2-chip' disabled={!selectedId || !options.some((item) => item.id === selectedId)} title='Use the object selected on the diagram' onClick={() => onChange(selectedId)}>Use selected</button>
    </span>
  );
}

function ColourEditor({ name, colours, onChange }: { name: string; colours: LineEndColour[]; onChange: (colours: LineEndColour[]) => void }) {
  return (
    <div className='mimic-v2-editor-colours'>
      <span>Line-end colours at {name}: <b>{colours.length ? colours.join(', ') : 'none yet'}</b></span>
      <div className='mimic-v2-colour-row'>
        {lineEndColourOrder.map((colour) => <button key={colour} type='button' className={`mimic-v2-colour-chip ${colour}`} onClick={() => onChange([...colours, colour])}>{colour}</button>)}
        <button type='button' className='mimic-v2-chip' disabled={!colours.length} onClick={() => onChange([])}>Clear</button>
      </div>
    </div>
  );
}
