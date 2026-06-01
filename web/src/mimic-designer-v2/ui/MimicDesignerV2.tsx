import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BusbarSegment, ConductorPath, DrawingDocument, ElectricalSymbol, FaultType, LearningTier, OperationEvent, Phase, Point, PowerFlowMetadata, RelayFunctionType, RelayInputSourceType, RelayLogicCondition, RelayMeasuredQuantity, RelayOutputActionType, RelayOutputTargetType, RelayRole, RelaySettings, ScenarioEventSeverity, ScenarioEventType, ScenarioMode, ScenarioObjective } from '../drawing/model';
import { SYMBOL_LIBRARY } from '../symbols/library';
import { extractTopology } from '../topology/extractTopology';
import { generateLabels, resolveLabelScheme } from '../nomenclature/engine';
import { LABEL_SCHEMES } from '../../app/labeling/schemes';
import type { LabelScheme } from '../../app/labeling/types';
import { loadDocument } from '../storage/documentStore';
import { rotatePoint } from '../topology/connectivity';
import { deriveOperationState, operateDevice } from '../topology/operation';
import { computePowerFlow, MIMIC_DESIGNER_V2_SCHEMA_VERSION, migrateDrawingDocument } from '../schema/documentSchema';
import { addFault, clearFault, createFault, expireTransientFaults } from '../faults/faults';
import { renderBusbarsForView, renderConductorsForView, renderSymbolsForView } from '../rendering/phaseExpansion';
import { applyProtectionStep, deriveSimulationState, mergePhaseValues } from '../simulation/powerFlow';
import { applyRelayProtectionStep, loadScenario } from '../simulation/protection';
import { builtInExamples, builtInTemplates, createDrawingFromTemplate, insertTemplateIntoDrawing, type DrawingTemplate } from '../templates';
import { activeDrawingId, clearDraft, deleteDrawing, duplicateDrawing, listDrawings, loadDraft, loadDrawing, renameDrawing, saveDraft, saveDrawing, saveDrawingAs, type DrawingSummary } from '../persistence/drawingStore';
import { downloadDrawingJson, exportDrawingJson, importDrawingJson } from '../persistence/importExport';
import { builtInScenarioPackages } from '../scenarios/builtInScenarios';
import { createScenarioFromDrawing, type ScenarioPackage, updateScenarioPackage } from '../scenarios/packageScenario';
import { deleteScenarioPackage, duplicateScenario, listScenarioPackages, saveScenarioPackage } from '../scenarios/scenarioStore';
import { evaluateScenario, nextScenarioHint, recordScenarioOperation, resetScenario, startScenario, tickScenario } from '../scenarios/runner';
import { adaptScenarioForTier, eventExplanation, explain, featureVisibilityForTier, isScenarioAvailableForTier, learnMore, learningTierOrder, learningTiers, tierBadgeForScenario } from '../learning';
import { loadChallengeProgress } from '../../app/challenges/storage';
import '../theme/tokens.css';
import '../canvas/editor.css';

type Tool = 'select' | 'operate' | 'conductor' | 'fault' | 'pan';
type ConductorToolKind = 'busbar' | 'cable' | 'overhead-line';
type RenderMode = 'symbols' | 'nodes';
type OverlayMode = 'none' | 'power' | 'topology' | 'thermal' | 'protection';
type ManagerView = 'inspector' | 'scenario';
type ModalView = 'power' | 'protection' | null;
type PowerFlowTab = 'inputs' | 'phases' | 'outputs' | 'assumptions';
type ProtectionTab = 'relays' | 'inputs' | 'functions' | 'outputs' | 'events';
type SelectionBox = { start: Point; current: Point } | null;
type DragState = {
  initialDoc: DrawingDocument;
  moved: boolean;
  start: Point;
  symbolPositions: Map<string, Point>;
  conductorVertices: Map<string, Point[]>;
  busbarVertices: Map<string, Point[]>;
};
type ScenarioOutcome = {
  status: 'success' | 'failed';
  title: string;
  message: string;
  score?: number;
  stars?: number;
} | null;

const phasesAll = ['A', 'B', 'C'] as Phase[];
const standardVoltages = [11, 33, 66, 132, 275, 400, 525];
const defaultPhaseSpacingPx = 150;
const phaseColour = (phase?: Phase) => {
  if (phase === 'A') return 'var(--md2-phase-a)';
  if (phase === 'B') return 'var(--md2-phase-b)';
  if (phase === 'C') return 'var(--md2-phase-c)';
  return 'var(--md2-text)';
};
const snap = (value: number, grid: number) => Math.round(value / grid) * grid;
const hasAllPhases = (p: Phase[]) => ['A', 'B', 'C'].every((ph) => p.includes(ph as Phase));
const pointKey = (p: Point) => `${p.x}:${p.y}`;
const isSwitchingDevice = (type: ElectricalSymbol['type']) => type === 'circuit-breaker' || type === 'disconnector' || type === 'earth-switch';

const createEmpty = (): DrawingDocument => ({
  id: `doc-${Date.now()}`,
  version: 2,
  schemaVersion: MIMIC_DESIGNER_V2_SCHEMA_VERSION,
  name: 'Untitled Mimic Drawing',
  description: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  drawingType: 'user',
  tags: [],
  voltageLevels: [],
  activeView: 'single-line',
  objects: { symbols: [], conductors: [], busbars: [], labels: [], annotations: [] },
  faults: [],
  hotJoints: [],
  protectionZones: [],
  relays: [],
  protection: [],
  scenarios: [],
  operationEvents: [],
  simulationState: { running: false, speed: 1, overlay: 'none' },
  uiState: { gridSize: 20, snapToGrid: true, snapToTerminals: true, snapToIntersections: true },
  history: { undoStack: [], redoStack: [] }
});

type Props = {
  onRequestMenu?: () => void;
  initialPlatformView?: ScenarioMode | 'scenarios';
};

export function MimicDesignerV2({ onRequestMenu, initialPlatformView }: Props): React.ReactElement {
  const [doc, setDoc] = useState<DrawingDocument>(() => loadDocument() ?? createEmpty());
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mode, setMode] = useState<'edit' | 'operate'>(initialPlatformView === 'challenge' || initialPlatformView === 'lesson' ? 'operate' : 'edit');
  const [learningTier, setLearningTier] = useState<LearningTier>(initialPlatformView === 'scenarios' || initialPlatformView === 'challenge' || initialPlatformView === 'lesson' ? 'Junior' : 'Apprentice');
  const [tool, setTool] = useState<Tool>('select');
  const [conductorToolKind, setConductorToolKind] = useState<ConductorToolKind>('busbar');
  const renderMode = 'symbols' as RenderMode;
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<Phase | undefined>();
  const [selectedVoltage, setSelectedVoltage] = useState<number>(132);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [draftPath, setDraftPath] = useState<Point[]>([]);
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox>(null);
  const [undoStack, setUndoStack] = useState<DrawingDocument[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingDocument[]>([]);
  const [showTopologyOverlay, setShowTopologyOverlay] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('none');
  const [managerView, setManagerView] = useState<ManagerView>(initialPlatformView === 'scenarios' || initialPlatformView === 'challenge' || initialPlatformView === 'lesson' ? 'scenario' : 'inspector');
  const [modalView, setModalView] = useState<ModalView>(null);
  const [powerFlowTab, setPowerFlowTab] = useState<PowerFlowTab>('inputs');
  const [powerFlowTargetId, setPowerFlowTargetId] = useState<string>('');
  const [balancedPowerFlow, setBalancedPowerFlow] = useState(true);
  const [protectionTab, setProtectionTab] = useState<ProtectionTab>('relays');
  const [selectedRelayId, setSelectedRelayId] = useState<string>('');
  const [lastOperationReason, setLastOperationReason] = useState('No operation yet');
  const [faultType, setFaultType] = useState<FaultType>('A-E');
  const [faultTransient, setFaultTransient] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<'drawings' | 'templates' | 'examples'>('drawings');
  const [drawingSummaries, setDrawingSummaries] = useState<DrawingSummary[]>(() => listDrawings());
  const [dirty, setDirty] = useState(false);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(() => loadDraft() ? 'Unsaved draft recovery is available.' : null);
  const [jsonPreview, setJsonPreview] = useState<string>('');
  const [scenarioPackages, setScenarioPackages] = useState<ScenarioPackage[]>(() => listScenarioPackages());
  const [activeScenarioPackage, setActiveScenarioPackage] = useState<ScenarioPackage | null>(null);
  const [scenarioMessage, setScenarioMessage] = useState<string>('No scenario running');
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const [scenarioOutcome, setScenarioOutcome] = useState<ScenarioOutcome>(null);
  const [scenarioLaunchPackage, setScenarioLaunchPackage] = useState<ScenarioPackage | null>(() => initialPlatformView === 'challenge' || initialPlatformView === 'lesson' ? builtInScenarioPackages.find((pkg) => pkg.scenario.mode === initialPlatformView) ?? builtInScenarioPackages[0] ?? null : null);
  const [scenarioCatalogueOpen, setScenarioCatalogueOpen] = useState(initialPlatformView === 'scenarios' || initialPlatformView === 'challenge' || initialPlatformView === 'lesson');
  const [eventLogFilter, setEventLogFilter] = useState<ScenarioEventSeverity | 'all'>('all');
  const [challengeProgress, setChallengeProgress] = useState(() => loadChallengeProgress());
  const svgRef = useRef<SVGSVGElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<Point | null>(null);

  const topology = useMemo(() => extractTopology(doc), [doc]);
  const renderedSymbols = useMemo(() => renderSymbolsForView(doc), [doc]);
  const renderedConductors = useMemo(() => renderConductorsForView(doc), [doc]);
  const renderedBusbars = useMemo(() => renderBusbarsForView(doc), [doc]);
  const selectedSymbols = doc.objects.symbols.filter((s) => selected.includes(s.id));
  const selectedObject = selectedSymbols[0];
  const selectedPath = doc.objects.conductors.find((path) => selected.includes(path.id)) ?? doc.objects.busbars.find((path) => selected.includes(path.id));

  const terminalByPosition = useMemo(() => {
    const map = new Map<string, string[]>();
    topology.terminals.forEach((terminal) => {
      const key = pointKey({ x: Math.round(terminal.worldPosition.x), y: Math.round(terminal.worldPosition.y) });
      map.set(key, [...(map.get(key) ?? []), terminal.id]);
    });
    return map;
  }, [topology.terminals]);

  const busbarConnectedTerminalIds = useMemo(() => {
    const busbarNodeIds = new Set<string>();
    topology.branches.forEach((branch) => {
      if (branch.kind !== 'busbar') return;
      busbarNodeIds.add(branch.fromNodeId);
      busbarNodeIds.add(branch.toNodeId);
    });
    return new Set(
      topology.terminals
        .filter((terminal) => terminal.connectedNodeIds.some((nodeId) => busbarNodeIds.has(nodeId)))
        .map((terminal) => terminal.id)
    );
  }, [topology]);

  const commit = useCallback((next: DrawingDocument) => {
    setUndoStack((prev) => [...prev, doc]);
    setRedoStack([]);
    setDoc({ ...next, updatedAt: new Date().toISOString() });
    setDirty(true);
  }, [doc]);

  const refreshDrawingSummaries = () => setDrawingSummaries(listDrawings());
  const refreshScenarioPackages = () => setScenarioPackages(listScenarioPackages());

  const replaceDocument = (next: DrawingDocument, options: { dirty?: boolean; notice?: string | null } = {}) => {
    setDoc(next);
    setSelected([]);
    setSelectedPhase(undefined);
    setDraftPath([]);
    setCursorPoint(null);
    setUndoStack([]);
    setRedoStack([]);
    setDirty(options.dirty ?? false);
    setMigrationNotice(options.notice ?? null);
  };

  const confirmDiscard = () => !dirty || window.confirm('This drawing has unsaved changes. Continue and discard them?');

  const saveCurrentDrawing = () => {
    const saved = saveDrawing(doc);
    replaceDocument(saved, { dirty: false });
    refreshDrawingSummaries();
  };

  const saveCurrentDrawingAs = () => {
    const name = window.prompt('Save drawing as', doc.name);
    if (!name) return;
    const saved = saveDrawingAs(doc, name);
    replaceDocument(saved, { dirty: false });
    refreshDrawingSummaries();
  };

  const createNewDrawing = () => {
    if (!confirmDiscard()) return;
    replaceDocument(createEmpty(), { dirty: true });
  };

  const openStoredDrawing = (id: string) => {
    if (!confirmDiscard()) return;
    const result = loadDrawing(id);
    if (!result) return;
    replaceDocument(result.doc, {
      dirty: false,
      notice: result.migrated ? `Drawing migrated from schema ${result.fromSchemaVersion} to ${MIMIC_DESIGNER_V2_SCHEMA_VERSION}.` : null
    });
    refreshDrawingSummaries();
    setLibraryOpen(false);
  };

  const duplicateStoredDrawing = (id: string) => {
    const source = drawingSummaries.find((item) => item.id === id);
    const name = window.prompt('Duplicate drawing as', `${source?.name ?? 'Drawing'} copy`);
    if (!name) return;
    duplicateDrawing(id, name);
    refreshDrawingSummaries();
  };

  const renameStoredDrawing = (id: string) => {
    const source = drawingSummaries.find((item) => item.id === id);
    const name = window.prompt('Rename drawing', source?.name ?? '');
    if (!name) return;
    const renamed = renameDrawing(id, name);
    if (renamed && renamed.id === doc.id) replaceDocument(renamed, { dirty: false });
    refreshDrawingSummaries();
  };

  const deleteStoredDrawing = (id: string) => {
    const source = drawingSummaries.find((item) => item.id === id);
    if (!window.confirm(`Delete "${source?.name ?? id}"? This cannot be undone.`)) return;
    deleteDrawing(id);
    refreshDrawingSummaries();
  };

  const createFromTemplate = (template: DrawingTemplate) => {
    if (!confirmDiscard()) return;
    replaceDocument(createDrawingFromTemplate(template), { dirty: true });
    setLibraryOpen(false);
  };

  const insertTemplateAtCanvasCenter = (template: DrawingTemplate) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const center = rect ? snappedPoint(worldPointFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2)) : { x: 120, y: 120 };
    const raw = window.prompt('Insert template at x,y', `${center.x},${center.y}`);
    if (!raw) return;
    const [x, y] = raw.split(',').map((value) => Number(value.trim()));
    const point = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : center;
    commit(insertTemplateIntoDrawing(doc, template, snappedPoint(point)));
    setLibraryOpen(false);
  };

  const resetToTemplate = () => {
    if (!confirmDiscard()) return;
    replaceDocument(createDrawingFromTemplate(builtInTemplates[0]), { dirty: true });
  };

  const recoverDraft = () => {
    const draft = loadDraft();
    if (!draft || !confirmDiscard()) return;
    replaceDocument(draft.result.doc, {
      dirty: true,
      notice: draft.result.migrated ? `Draft migrated from schema ${draft.result.fromSchemaVersion}.` : null
    });
    clearDraft();
    setDraftNotice(null);
  };

  const exportJsonToPreview = () => setJsonPreview(exportDrawingJson(doc));

  const importJsonText = (json: string) => {
    if (!confirmDiscard()) return;
    const result = importDrawingJson(json);
    replaceDocument({ ...result.doc, drawingType: 'user' }, {
      dirty: true,
      notice: result.migrated ? `Imported drawing migrated from schema ${result.fromSchemaVersion}.` : null
    });
    setLibraryOpen(false);
  };

  const importJsonFile = (file: File | undefined) => {
    if (!file) return;
    file.text().then(importJsonText);
  };

  const saveCurrentAsScenario = () => {
    const name = window.prompt('Scenario title', `${doc.name} scenario`);
    if (!name) return;
    const description = window.prompt('Scenario description', doc.description ?? '') ?? '';
    const learningObjective = window.prompt('Primary learning objective', 'Operate the schematic safely and complete the objectives.') ?? '';
    const pkg = createScenarioFromDrawing(doc, { name, description, learningObjectives: [learningObjective], tags: doc.tags, difficulty: 'intro' });
    saveScenarioPackage(pkg);
    setActiveScenarioPackage(pkg);
    refreshScenarioPackages();
    setScenarioMessage(`Saved scenario: ${name}`);
  };

  const duplicateScenarioPackageById = (id: string) => {
    const source = [...scenarioPackages, ...builtInScenarioPackages].find((item) => item.id === id);
    const name = window.prompt('Duplicate scenario as', `${source?.title ?? 'Scenario'} copy`);
    if (!name) return;
    const newId = `scenario-${Date.now()}`;
    const duplicated = source && scenarioPackages.some((item) => item.id === id) ? duplicateScenario(id, name) : source ? saveScenarioPackage({ ...source, id: newId, title: name, scenario: { ...source.scenario, id: newId, name }, drawing: { ...source.drawing, name, scenarios: [{ ...source.scenario, id: newId, name }], activeScenarioId: newId } }) : null;
    if (duplicated) setActiveScenarioPackage(duplicated);
    refreshScenarioPackages();
  };

  const deleteScenarioById = (id: string) => {
    const source = scenarioPackages.find((item) => item.id === id);
    if (!source || !window.confirm(`Delete scenario "${source.title}"?`)) return;
    deleteScenarioPackage(id);
    if (activeScenarioPackage?.id === id) setActiveScenarioPackage(null);
    refreshScenarioPackages();
  };

  const loadScenarioPackageIntoEditor = (pkg: ScenarioPackage) => {
    if (!confirmDiscard()) return;
    replaceDocument(pkg.drawing, { dirty: false });
    if (pkg.scenario.activeView === 'thermal') setOverlayMode('thermal');
    if (pkg.scenario.activeView === 'topology') setShowTopologyOverlay(true);
    setActiveScenarioPackage(pkg);
    setScenarioMessage(`Loaded scenario: ${pkg.title}`);
  };

  const openScenarioLaunch = (pkg: ScenarioPackage) => {
    setActiveScenarioPackage(pkg);
    setScenarioLaunchPackage(pkg);
    setScenarioCatalogueOpen(false);
    setManagerView('scenario');
  };

  const returnToScenarioSelector = () => {
    setActiveScenarioPackage(null);
    setScenarioLaunchPackage(null);
    setScenarioMenuOpen(false);
    setScenarioOutcome(null);
    setScenarioCatalogueOpen(true);
    setMode('edit');
    setTool('select');
    setOverlayMode('none');
    setShowTopologyOverlay(false);
    replaceDocument(createEmpty(), { dirty: false });
    setScenarioMessage('No scenario running');
  };

  const startActiveScenario = (pkg = activeScenarioPackage, practice = false) => {
    if (!pkg) return;
    const tierScenario = adaptScenarioForTier(pkg.scenario, learningTier);
    const launchPackage = practice
      ? {
          ...pkg,
          scenario: {
            ...tierScenario,
            mode: 'lesson' as const,
            restrictions: {
              ...pkg.scenario.restrictions,
              disableDrawingTools: false,
              disablePlacement: false,
              disableDelete: false,
              disableTopologyOverlay: false,
              disableInspectorEditing: false
            }
          }
        }
      : { ...pkg, scenario: tierScenario };
    const result = startScenario(launchPackage.drawing, launchPackage.scenario);
    replaceDocument(result.doc, { dirty: true });
    if (pkg.scenario.activeView === 'thermal' || pkg.scenario.tags?.includes('thermal')) setOverlayMode('thermal');
    if (pkg.scenario.activeView === 'topology') setShowTopologyOverlay(true);
    setMode('operate');
    setTool('operate');
    setManagerView('scenario');
    setScenarioLaunchPackage(null);
    setScenarioMenuOpen(false);
    setScenarioOutcome(null);
    setActiveScenarioPackage({ ...launchPackage, scenario: result.scenario, drawing: result.doc });
    setScenarioMessage(result.messages.join(' '));
  };

  const resetActiveScenario = () => {
    if (!activeScenarioPackage) return;
    const resetDoc = resetScenario(activeScenarioPackage.drawing, activeScenarioPackage.scenario);
    replaceDocument(resetDoc, { dirty: true });
    setScenarioMessage(`Scenario reset: ${activeScenarioPackage.title}`);
  };

  const tickActiveScenario = () => {
    if (!activeScenarioPackage) return;
    const elapsed = (activeScenarioPackage.scenario.elapsedMs ?? 0) + 1000;
    const result = tickScenario(doc, activeScenarioPackage.scenario, elapsed);
    replaceDocument(result.doc, { dirty: true });
    setActiveScenarioPackage({ ...activeScenarioPackage, scenario: result.scenario, drawing: result.doc });
    setScenarioMessage(result.messages.join(' '));
  };

  const showNextScenarioHint = () => {
    if (!activeScenarioPackage) return;
    const next = nextScenarioHint(activeScenarioPackage.scenario);
    setActiveScenarioPackage({ ...activeScenarioPackage, scenario: next.scenario });
    setScenarioMessage(next.hint ?? 'No scenario hints configured.');
  };

  const openScenarioOutcome = (result: ReturnType<typeof evaluateScenario>) => {
    if (!result.success && !result.failed) return;
    const faultMessage = result.failed
      ? result.doc.operationEvents.slice().reverse().find((event) => event.message.toLowerCase().includes('earth switch') || event.message.toLowerCase().includes('arced'))?.message
      : undefined;
    setScenarioOutcome({
      status: result.success ? 'success' : 'failed',
      title: result.success ? 'Scenario complete' : 'Scenario failed',
      message: faultMessage ?? result.messages.join(' '),
      score: result.scenario.scoring?.score,
      stars: result.scenario.scoring?.stars
    });
  };

  const evaluateActiveScenario = () => {
    if (!activeScenarioPackage) return;
    const result = evaluateScenario(doc, activeScenarioPackage.scenario);
    setActiveScenarioPackage({ ...activeScenarioPackage, scenario: result.scenario, drawing: result.doc });
    setScenarioMessage(result.messages.join(' '));
    openScenarioOutcome(result);
  };

  const markActionAllowed = Boolean(activeScenarioPackage?.scenario.objectives.some((objective) =>
    (objective.type === 'identify-faulted-component' || objective.type === 'identify-hot-joint') &&
    (objective.targetObjectId === selectedObject?.id || objective.targetObjectId === selectedPath?.id || objective.targetTopologyBranchId === selectedPath?.id)
  ));

  const markSelectedAsIdentified = () => {
    const targetId = selectedObject?.id ?? selectedPath?.id;
    const targetLabel = selectedObject?.label?.text ?? selectedPath?.label?.text ?? targetId;
    if (!targetId || !markActionAllowed) return;
    const nextDoc = migrateDrawingDocument({
      ...doc,
      objects: {
        ...doc.objects,
        symbols: doc.objects.symbols.map((symbol) => symbol.id === targetId ? { ...symbol, simulation: { ...symbol.simulation, identified: true } } : symbol)
      },
      operationEvents: [...doc.operationEvents, { id: `event-${Date.now()}`, timestamp: new Date().toISOString(), message: `Marked ${targetLabel} as faulted`, targetObjectId: targetId, severity: 'scenario' as const }]
    })!;
    setDoc(nextDoc);
    setDirty(true);
    if (activeScenarioPackage) {
      const result = evaluateScenario(nextDoc, activeScenarioPackage.scenario);
      setActiveScenarioPackage({ ...activeScenarioPackage, scenario: result.scenario, drawing: result.doc });
      setScenarioMessage(result.messages.join(' '));
      openScenarioOutcome(result);
    }
  };

  const renameActiveScenario = () => {
    if (!activeScenarioPackage) return;
    const name = window.prompt('Scenario title', activeScenarioPackage.title);
    if (!name) return;
    const updated = updateScenarioPackage(activeScenarioPackage, { name });
    setActiveScenarioPackage(saveScenarioPackage(updated));
    refreshScenarioPackages();
  };

  const editActiveScenarioMetadata = () => {
    if (!activeScenarioPackage) return;
    const description = window.prompt('Scenario description', activeScenarioPackage.description) ?? activeScenarioPackage.description;
    const learningObjectives = (window.prompt('Learning objectives, separated by semicolons', activeScenarioPackage.scenario.learningObjectives?.join('; ') ?? '') ?? '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);
    const difficultyInput = window.prompt('Difficulty: intro, standard, advanced', activeScenarioPackage.difficulty) ?? activeScenarioPackage.difficulty;
    const tags = (window.prompt('Tags, comma separated', activeScenarioPackage.tags.join(', ')) ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const difficulty = difficultyInput === 'advanced' || difficultyInput === 'standard' ? difficultyInput : 'intro';
    const updated = updateScenarioPackage(activeScenarioPackage, { description, learningObjectives, difficulty, tags });
    setActiveScenarioPackage(saveScenarioPackage(updated));
    refreshScenarioPackages();
  };

  const addScenarioObjective = () => {
    if (!activeScenarioPackage) return;
    const text = window.prompt('Objective text', 'Energise target busbar');
    if (!text) return;
    const type = window.prompt('Objective type', 'energise-target-busbar') as NonNullable<ScenarioObjective['type']>;
    const targetObjectId = window.prompt('Target object id', selected[0] ?? '') ?? undefined;
    const hint = window.prompt('Hint', '') ?? undefined;
    const objective = { id: `objective-${Date.now()}`, text, type, targetObjectId, hint };
    const updated = updateScenarioPackage(activeScenarioPackage, { objectives: [...activeScenarioPackage.scenario.objectives, objective] });
    setActiveScenarioPackage(saveScenarioPackage(updated));
    refreshScenarioPackages();
  };

  const addScenarioEvent = () => {
    if (!activeScenarioPackage) return;
    const type = window.prompt('Event type', 'operator-prompt') as ScenarioEventType;
    const atMs = Number(window.prompt('Fire at milliseconds', '1000') ?? '1000');
    const message = window.prompt('Message / hint text', 'Check the next switching step.') ?? '';
    const event = { id: `scenario-event-${Date.now()}`, type, atMs: Number.isFinite(atMs) ? atMs : 1000, message };
    const updated = updateScenarioPackage(activeScenarioPackage, { events: [...(activeScenarioPackage.scenario.events ?? []), event] });
    setActiveScenarioPackage(saveScenarioPackage(updated));
    refreshScenarioPackages();
  };

  const snappedPoint = useCallback((p: Point): Point => {
    if (!doc.uiState.snapToGrid) return p;
    return { x: snap(p.x, doc.uiState.gridSize), y: snap(p.y, doc.uiState.gridSize) };
  }, [doc.uiState.gridSize, doc.uiState.snapToGrid]);

  const worldPointFromClient = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - pan.x) / scale, y: (clientY - rect.top - pan.y) / scale };
  }, [pan.x, pan.y, scale]);

  const zoomAtClientPoint = useCallback((clientX: number, clientY: number, factor: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      setScale((current) => Math.max(0.4, Math.min(3, current * factor)));
      return;
    }
    const nextScale = Math.max(0.4, Math.min(3, scale * factor));
    if (nextScale === scale) return;
    const world = worldPointFromClient(clientX, clientY);
    setScale(nextScale);
    setPan({
      x: clientX - rect.left - world.x * nextScale,
      y: clientY - rect.top - world.y * nextScale
    });
  }, [scale, worldPointFromClient]);

  const zoomFromCanvasCenter = useCallback((factor: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      setScale((current) => Math.max(0.4, Math.min(3, current * factor)));
      return;
    }
    zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }, [zoomAtClientPoint]);

  const eventPoint = (event: React.MouseEvent<SVGSVGElement | SVGGElement | SVGPolylineElement | SVGRectElement>) =>
    worldPointFromClient(event.clientX, event.clientY);

  const terminalWorldPosition = (symbol: ElectricalSymbol, terminalId: string): Point | null => {
    const terminal = symbol.terminals.find((t) => t.id === terminalId);
    if (!terminal) return null;
    const rotated = rotatePoint(terminal.offset, symbol.rotation);
    return { x: symbol.position.x + rotated.x, y: symbol.position.y + rotated.y };
  };

  const nearestTerminalPoint = (symbol: ElectricalSymbol, point: Point): Point => {
    let best = symbol.position;
    let bestDistance = Number.POSITIVE_INFINITY;
    symbol.terminals.forEach((terminal) => {
      const candidate = terminalWorldPosition(symbol, terminal.id);
      if (!candidate) return;
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    });
    return snappedPoint(best);
  };

  const createSymbol = useCallback((type: ElectricalSymbol['type'], position: Point, overrideTerminals?: ElectricalSymbol['terminals']): ElectricalSymbol | null => {
    const template = SYMBOL_LIBRARY.find((x) => x.type === type);
    if (!template) return null;
    const id = `symbol-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const phases = doc.activeView === 'single-line' ? phasesAll : [...template.defaultPhases];
    const terminals = overrideTerminals ?? template.defaultTerminals.map((d, i) => ({
      id: `t-${i}`,
      name: d.name,
      offset: { x: d.x, y: d.y },
      phaseApplicability: phases
    }));

    return {
      id,
      type: template.type,
      position,
      rotation: 0,
      terminals,
      phaseApplicability: phases,
      voltageLevelKv: selectedVoltage,
      phaseMode: phases.length > 1 ? 'three-phase' : 'single-phase',
      renderExpansion: 'per-phase-symbols',
      phaseSpacingPx: defaultPhaseSpacingPx,
      powerFlow: { direction: 'unknown' },
      engineering: type === 'ct' ? { ctPolarity: 'P1-left' } : type === 'transformer' ? { transformerPolarity: 'hv-left', hasTertiary: false, transformerExpansion: 'single-symbol' } : undefined,
      simulation: {},
      operation: {
        sourceOn: type === 'source' ? true : undefined,
        switchState: isSwitchingDevice(type) ? 'open' : undefined,
        tripped: false
      },
      viewMetadata: { 'single-line': { visible: true }, 'three-phase': { visible: true } }
    };
  }, [doc.activeView, selectedVoltage]);

  const operateState = useMemo(() => deriveOperationState(doc, topology), [doc, topology]);
  const simulationState = useMemo(() => deriveSimulationState(doc, topology, operateState), [doc, topology, operateState]);
  const activeScenario = activeScenarioPackage?.scenario;
  const learningVisibility = useMemo(() => featureVisibilityForTier(learningTier, activeScenario), [activeScenario, learningTier]);
  const scenarioRestrictions = activeScenario?.restrictions ?? {};
  const activeScenarioLoaded = mode === 'operate' && Boolean(activeScenarioPackage) && Boolean(doc.activeScenarioId);
  const focusedOperateMode = activeScenarioLoaded && activeScenario?.mode !== 'sandbox';
  const scenarioSelectorOnly = scenarioCatalogueOpen && !activeScenarioLoaded;
  const buildingScenario = Boolean(activeScenario?.tags?.some((tag) => tag === 'build' || tag.includes('build')));
  const editingToolsDisabled = !learningVisibility.allowDrawingTools || (focusedOperateMode && scenarioRestrictions.disableDrawingTools);
  const placementDisabled = !learningVisibility.allowDrawingTools || (focusedOperateMode && (scenarioRestrictions.disablePlacement || scenarioRestrictions.disableDrawingTools));
  const deleteDisabled = focusedOperateMode && scenarioRestrictions.disableDelete;
  const inspectorEditingDisabled = focusedOperateMode && scenarioRestrictions.disableInspectorEditing;
  const topologyOverlayDisabled = !learningVisibility.showTopologyOverlay || (focusedOperateMode && scenarioRestrictions.disableTopologyOverlay);
  const activeTeachingStep = activeScenario?.teachingSteps?.[activeScenario.currentStepIndex ?? 0];
  const focusObjectIds = useMemo(() => {
    const teachingTargets = [activeTeachingStep?.targetObjectId].filter(Boolean) as string[];
    if (teachingTargets.length) return new Set(teachingTargets);
    return new Set((activeScenario?.objectives ?? [])
      .filter((objective) => !objective.completed && !objective.failed && objective.type !== 'identify-faulted-component' && objective.type !== 'identify-hot-joint')
      .map((objective) => objective.targetObjectId)
      .filter(Boolean) as string[]);
  }, [activeScenario, activeTeachingStep]);

  const operateSymbol = (symbol: ElectricalSymbol) => {
    const disconnectorLiveOperation = symbol.type === 'disconnector' && symbol.operation?.switchState === 'closed' && topology.terminals
      .filter((terminal) => terminal.parentObjectId === symbol.id)
      .flatMap((terminal) => terminal.connectedNodeIds)
      .some((nodeId) => operateState.liveNodeIds.has(nodeId));
    const result = operateDevice(doc, topology, symbol.id);
    const nextDoc = migrateDrawingDocument(result.doc)!;
    setDoc(nextDoc);
    setUndoStack((prev) => [...prev, doc]);
    setRedoStack([]);
    setLastOperationReason(result.reason);
    setDirty(true);
    if (activeScenarioPackage) {
      const event = nextDoc.operationEvents[nextDoc.operationEvents.length - 1];
      if (event) {
        const recorded = recordScenarioOperation(activeScenarioPackage.scenario, event, disconnectorLiveOperation || event.message.toLowerCase().includes('arced'));
        const evaluated = evaluateScenario(nextDoc, recorded);
        setActiveScenarioPackage({ ...activeScenarioPackage, scenario: evaluated.scenario, drawing: evaluated.doc });
        setScenarioMessage(evaluated.messages.join(' '));
        openScenarioOutcome(evaluated);
      }
    }
  };

  const placeSymbol = (type: ElectricalSymbol['type'], position: Point = { x: 200, y: 200 }) => {
    if (placementDisabled) return;
    if (scenarioRestrictions.allowedComponentTypes?.length && !scenarioRestrictions.allowedComponentTypes.includes(type)) return;
    const symbol = createSymbol(type, snappedPoint(position));
    if (!symbol) return;
    commit(generateLabels({ ...doc, objects: { ...doc.objects, symbols: [...doc.objects.symbols, symbol] } }));
  };

  const pointOnSegment = (point: Point, a: Point, b: Point): boolean => {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
    return Math.abs(cross) < 0.001 && point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  };

  const pointTouchesBusbar = useCallback((point: Point): boolean =>
    doc.objects.busbars.some((busbar) =>
      busbar.vertices.some((vertex) => vertex.x === point.x && vertex.y === point.y) ||
      busbar.vertices.slice(0, -1).some((vertex, index) => pointOnSegment(point, vertex, busbar.vertices[index + 1]))
    ), [doc.objects.busbars]);

  const finishPath = useCallback((points: Point[] = draftPath) => {
    if (points.length < 2) return;
    const id = `${tool}-${Date.now()}`;
    const cleanPoints = points.filter((point, index) => index === 0 || pointKey(point) !== pointKey(points[index - 1]));
    if (cleanPoints.length < 2) return;

    const drawingBusbar = conductorToolKind === 'busbar';
    const pathObj = {
      id,
      type: drawingBusbar ? 'busbar-segment' : 'conductor-path',
      conductorStyle: drawingBusbar ? undefined : conductorToolKind,
      rotation: 0,
      phaseApplicability: phasesAll,
      phaseMode: 'three-phase',
      renderExpansion: 'per-phase-symbols',
      phaseSpacingPx: defaultPhaseSpacingPx,
      powerFlow: { direction: 'unknown' },
      vertices: cleanPoints,
      orthogonal: true,
      connectionPoints: cleanPoints.map((pt, i) => ({ id: `${id}-cp-${i}`, position: pt }))
    } as ConductorPath | BusbarSegment;

    let next = drawingBusbar
      ? { ...doc, objects: { ...doc.objects, busbars: [...doc.objects.busbars, { ...(pathObj as BusbarSegment), width: 8 }] } }
      : { ...doc, objects: { ...doc.objects, conductors: [...doc.objects.conductors, pathObj as ConductorPath] } };

    if (!drawingBusbar) {
      const sealingEnds = [cleanPoints[0], cleanPoints[cleanPoints.length - 1]]
        .filter((point): point is Point => Boolean(point))
        .filter((point) => pointTouchesBusbar(point))
        .map((point) => createSymbol('cable-sealing-end', point, [{ id: 't-0', name: 'line', offset: { x: 0, y: 0 }, phaseApplicability: phasesAll }]))
        .filter((symbol): symbol is ElectricalSymbol => Boolean(symbol));
      if (sealingEnds.length) next = generateLabels({ ...next, objects: { ...next.objects, symbols: [...next.objects.symbols, ...sealingEnds] } });
    }

    commit(next);
    setDraftPath([]);
    setCursorPoint(null);
  }, [commit, conductorToolKind, createSymbol, doc, draftPath, pointTouchesBusbar, tool]);

  const addPathPoint = useCallback((point: Point, finish = false) => {
    const nextPoint = snappedPoint(point);
    const nextPath = [...draftPath, nextPoint];
    setCursorPoint(nextPoint);
    if (finish && nextPath.length >= 2) finishPath(nextPath);
    else setDraftPath(nextPath);
  }, [draftPath, finishPath, snappedPoint]);

  const selectionBounds = (box: NonNullable<SelectionBox>) => ({
    x1: Math.min(box.start.x, box.current.x),
    x2: Math.max(box.start.x, box.current.x),
    y1: Math.min(box.start.y, box.current.y),
    y2: Math.max(box.start.y, box.current.y)
  });

  const idsInBox = (box: NonNullable<SelectionBox>) => {
    const bounds = selectionBounds(box);
    const contains = (p: Point) => p.x >= bounds.x1 && p.x <= bounds.x2 && p.y >= bounds.y1 && p.y <= bounds.y2;
    return [
      ...doc.objects.symbols.filter((symbol) => contains(symbol.position)).map((symbol) => symbol.id),
      ...doc.objects.conductors.filter((path) => path.vertices.some(contains)).map((path) => path.id),
      ...doc.objects.busbars.filter((path) => path.vertices.some(contains)).map((path) => path.id)
    ];
  };

  const beginDragSelected = (start: Point, id: string) => {
    const ids = selected.includes(id) ? selected : [id];
    setSelected(ids);
    dragRef.current = {
      initialDoc: doc,
      moved: false,
      start,
      symbolPositions: new Map(doc.objects.symbols.filter((symbol) => ids.includes(symbol.id)).map((symbol) => [symbol.id, symbol.position])),
      conductorVertices: new Map(doc.objects.conductors.filter((path) => ids.includes(path.id)).map((path) => [path.id, path.vertices])),
      busbarVertices: new Map(doc.objects.busbars.filter((path) => ids.includes(path.id)).map((path) => [path.id, path.vertices]))
    };
  };

  const moveSelection = (point: Point) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = snappedPoint({ x: point.x - drag.start.x, y: 0 }).x;
    const dy = snappedPoint({ x: 0, y: point.y - drag.start.y }).y;
    if (dx === 0 && dy === 0) return;
    drag.moved = true;
    const draggedTerminalMoves = doc.objects.symbols
      .filter((symbol) => drag.symbolPositions.has(symbol.id))
      .flatMap((symbol) => symbol.terminals.map((terminal) => {
        const originalSymbolPosition = drag.symbolPositions.get(symbol.id)!;
        const rotated = rotatePoint(terminal.offset, symbol.rotation);
        return {
          from: { x: originalSymbolPosition.x + rotated.x, y: originalSymbolPosition.y + rotated.y },
          to: { x: originalSymbolPosition.x + rotated.x + dx, y: originalSymbolPosition.y + rotated.y + dy }
        };
      }));
    const stretchAttachedVertices = (vertices: Point[]) => vertices.map((vertex) => {
      const move = draggedTerminalMoves.find((terminal) => pointKey(terminal.from) === pointKey(vertex));
      return move ? move.to : vertex;
    });
    const pathWithConnectionPoints = <T extends ConductorPath | BusbarSegment>(path: T, vertices: Point[]): T => ({
      ...path,
      vertices,
      connectionPoints: vertices.map((position, index) => ({ id: `${path.id}-cp-${index}`, position }))
    });
    setDoc((prev) => ({
      ...prev,
      objects: {
        ...prev.objects,
        symbols: prev.objects.symbols.map((symbol) => {
          const original = drag.symbolPositions.get(symbol.id);
          return original ? { ...symbol, position: { x: original.x + dx, y: original.y + dy } } : symbol;
        }),
        conductors: prev.objects.conductors.map((path) => {
          const original = drag.conductorVertices.get(path.id);
          if (original) return pathWithConnectionPoints(path, original.map((p) => ({ x: p.x + dx, y: p.y + dy })));
          return pathWithConnectionPoints(path, stretchAttachedVertices(path.vertices));
        }),
        busbars: prev.objects.busbars.map((path) => {
          const original = drag.busbarVertices.get(path.id);
          if (original) return pathWithConnectionPoints(path, original.map((p) => ({ x: p.x + dx, y: p.y + dy })));
          return pathWithConnectionPoints(path, stretchAttachedVertices(path.vertices));
        })
      }
    }));
  };

  const onMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
    const point = eventPoint(event);
    if (event.button === 1 || tool === 'pan' || (event.button === 0 && event.shiftKey && mode === 'edit')) {
      panRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
      return;
    }
    if (editingToolsDisabled && tool === 'conductor') return;
    if (tool === 'conductor') {
      addPathPoint(point);
      return;
    }
    if (tool === 'select') {
      setSelected([]);
      setSelectedPhase(undefined);
      setSelectionBox({ start: snappedPoint(point), current: snappedPoint(point) });
    }
  };

  const onMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const point = eventPoint(event);
    if (panRef.current) setPan({ x: event.clientX - panRef.current.x, y: event.clientY - panRef.current.y });
    if (tool === 'conductor') setCursorPoint(snappedPoint(point));
    if (selectionBox) setSelectionBox({ ...selectionBox, current: snappedPoint(point) });
    if (dragRef.current) moveSelection(point);
  };

  const onMouseUp = () => {
    if (selectionBox) setSelected(idsInBox(selectionBox));
    const drag = dragRef.current;
    if (drag?.moved) {
      setUndoStack((prev) => [...prev, drag.initialDoc]);
      setRedoStack([]);
    }
    panRef.current = null;
    dragRef.current = null;
    setSelectionBox(null);
  };

  const applyLabelScheme = (scheme: LabelScheme) => {
    commit(generateLabels(doc, scheme));
  };

  const onSymbolMouseDown = (event: React.MouseEvent<SVGGElement>, symbol: ElectricalSymbol, phase?: Phase) => {
    event.stopPropagation();
    setSelectedPhase(phase);
    const point = eventPoint(event);
    if (mode === 'operate') {
      if (tool === 'fault') {
        applyFault(symbol.id, point, phase);
        return;
      }
      if (tool === 'pan') return;
      const operateSwitchgear = tool === 'operate' || tool === 'select';
      if (!operateSwitchgear) return;
      if (!isSwitchingDevice(symbol.type) && symbol.type !== 'source') {
        setSelected([symbol.id]);
        return;
      }
      if (selected.includes(symbol.id) && selectedPhase === phase) {
        setSelected([symbol.id]);
        return;
      }
      if (scenarioRestrictions.allowedOperationObjectIds?.length && !scenarioRestrictions.allowedOperationObjectIds.includes(symbol.id)) {
        setScenarioMessage(`Operation blocked by scenario restrictions: ${symbol.label?.text ?? symbol.id}`);
        return;
      }
      operateSymbol(symbol);
      setSelected([symbol.id]);
      return;
    }
    if (editingToolsDisabled && tool === 'conductor') return;
    if (tool === 'conductor') {
      addPathPoint(nearestTerminalPoint(symbol, point), draftPath.length > 0);
      return;
    }
    if (tool !== 'select') return;
    if (event.shiftKey) setSelected((prev) => prev.includes(symbol.id) ? prev.filter((id) => id !== symbol.id) : [...prev, symbol.id]);
    else beginDragSelected(snappedPoint(point), symbol.id);
  };

  const onPathMouseDown = (event: React.MouseEvent<SVGPolylineElement>, id: string, phase?: Phase) => {
    event.stopPropagation();
    setSelectedPhase(phase);
    if (mode === 'operate' && tool === 'fault') {
      applyFault(id, eventPoint(event), phase);
      return;
    }
    if (mode === 'operate' && tool === 'select') {
      setSelected([id]);
      return;
    }
    if (tool !== 'select') return;
    const point = snappedPoint(eventPoint(event));
    if (event.shiftKey) setSelected((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
    else beginDragSelected(point, id);
  };

  const applyFault = (targetObjectId: string, location?: Point, phase?: Phase) => {
    if (faultType === 'hot-joint') {
      const jointPhase = phase ?? selectedPhase ?? 'A';
      const hotJoint = {
        id: `hot-joint-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        targetObjectId,
        phase: jointPhase,
        addedResistanceOhms: 0.08,
        thermalMassFactor: 1,
        ambientTemperatureC: 20,
        warningTemperatureC: 70,
        dangerTemperatureC: 100,
        intermittent: false,
        active: true,
        label: `Hot joint ${jointPhase}`
      };
      setDoc(migrateDrawingDocument({
        ...doc,
        hotJoints: [...doc.hotJoints, hotJoint],
        operationEvents: [...doc.operationEvents, { id: `event-${Date.now()}`, timestamp: new Date().toISOString(), message: `Hot joint applied: ${jointPhase}`, targetObjectId }]
      })!);
      setUndoStack((prev) => [...prev, doc]);
      setRedoStack([]);
      setLastOperationReason(`Hot joint applied: ${jointPhase}`);
      return;
    }
    const fault = createFault(targetObjectId, faultType, location, { transient: faultTransient });
    if (phase) {
      fault.phases = [phase];
      fault.targetPhase = phase;
      fault.label = `${fault.type} ${phase}`;
    }
    const next = addFault(doc, fault);
    setDoc(migrateDrawingDocument(next)!);
    setUndoStack((prev) => [...prev, doc]);
    setRedoStack([]);
    setLastOperationReason(`Fault applied: ${fault.label ?? fault.type}`);
  };

  const onLibraryDragStart = (event: React.DragEvent<HTMLButtonElement>, type: ElectricalSymbol['type']) => {
    event.dataTransfer.setData('application/mimic-v2-symbol', type);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const onCanvasDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (placementDisabled) return;
    const type = event.dataTransfer.getData('application/mimic-v2-symbol') as ElectricalSymbol['type'];
    if (!type) return;
    placeSymbol(type, worldPointFromClient(event.clientX, event.clientY));
  };

  const updateSymbolById = (symbolId: string, patcher: (symbol: ElectricalSymbol) => ElectricalSymbol) => {
    commit({
      ...doc,
      objects: {
        ...doc.objects,
        symbols: doc.objects.symbols.map((symbol) => symbol.id === symbolId ? patcher(symbol) : symbol)
      }
    });
  };

  const updateSelectedSymbol = (patcher: (symbol: ElectricalSymbol) => ElectricalSymbol) => {
    if (!selectedObject) return;
    updateSymbolById(selectedObject.id, patcher);
  };

  const resetSelectedBreakerTrip = () => {
    if (!selectedObject || selectedObject.type !== 'circuit-breaker') return;
    const nextDoc = migrateDrawingDocument({
      ...doc,
      objects: {
        ...doc.objects,
        symbols: doc.objects.symbols.map((symbol) => symbol.id === selectedObject.id
          ? { ...symbol, operation: { ...symbol.operation, tripped: false, lockout: false, protectionState: 'idle' } }
          : symbol)
      },
      operationEvents: [...doc.operationEvents, { id: `event-${Date.now()}`, timestamp: new Date().toISOString(), message: `Trip reset ${selectedObject.label?.text ?? selectedObject.id}`, targetObjectId: selectedObject.id, severity: 'operation' as const }]
    })!;
    setDoc(nextDoc);
    setDirty(true);
    setLastOperationReason(`Trip reset ${selectedObject.label?.text ?? selectedObject.id}`);
  };

  const setSelectedVoltageOnObject = (value: number) => {
    if (!selectedObject) return;
    updateSelectedSymbol((symbol) => ({ ...symbol, voltageLevelKv: value }));
  };

  const setSelectedPhases = (phases: Phase[]) => {
    if (selectedObject) {
      updateSelectedSymbol((symbol) => ({
        ...symbol,
        phaseApplicability: phases,
        phaseMode: phases.length > 1 ? 'three-phase' : 'single-phase',
        terminals: symbol.terminals.map((terminal) => ({ ...terminal, phaseApplicability: phases }))
      }));
      return;
    }
    if (selectedPath) {
      commit({
        ...doc,
        objects: {
          ...doc.objects,
          conductors: doc.objects.conductors.map((path) => path.id === selectedPath.id ? { ...path, phaseApplicability: phases, phaseMode: phases.length > 1 ? 'three-phase' : 'single-phase' } : path),
          busbars: doc.objects.busbars.map((path) => path.id === selectedPath.id ? { ...path, phaseApplicability: phases, phaseMode: phases.length > 1 ? 'three-phase' : 'single-phase' } : path)
        }
      });
    }
  };

  const updateSourcePowerFlow = (symbolId: string, patch: PowerFlowMetadata) => {
    commit({
      ...doc,
      objects: {
        ...doc.objects,
        symbols: doc.objects.symbols.map((symbol) =>
          symbol.id === symbolId
            ? { ...symbol, powerFlow: computePowerFlow(mergePhaseValues(symbol.powerFlow, undefined, patch, doc.activeView === 'single-line')) }
            : symbol
        )
      }
    });
  };

  const allPowerFlowObjects = [
    ...doc.objects.symbols.map((object) => ({ id: object.id, label: object.label?.text ?? object.id, kind: object.type, flow: object.powerFlow })),
    ...doc.objects.busbars.map((object) => ({ id: object.id, label: object.label?.text ?? object.id, kind: 'busbar', flow: object.powerFlow })),
    ...doc.objects.conductors.map((object) => ({ id: object.id, label: object.label?.text ?? object.id, kind: 'conductor', flow: object.powerFlow }))
  ];
  const sourceLoadFlowCards = doc.objects.symbols.filter((symbol) => symbol.type === 'source' || symbol.type === 'load');

  const powerFlowTarget = allPowerFlowObjects.find((object) => object.id === (powerFlowTargetId || selected[0])) ?? allPowerFlowObjects[0];
  const powerFlowTargetSummary = powerFlowTarget ? simulationState.objectSummaries.get(powerFlowTarget.id) : undefined;
  const powerFlowCardClass = (objectId: string) => {
    const summary = simulationState.objectSummaries.get(objectId);
    if (!summary || (summary.aggregate.currentA ?? 0) <= 0) return 'idle';
    if ((summary.aggregate.loadingPercent ?? 0) >= 100 || summary.thermalState === 'critical' || summary.thermalState === 'hot') return 'over';
    return 'flowing';
  };

  const openPowerFlowModal = () => {
    setPowerFlowTargetId(selected[0] ?? '');
    setPowerFlowTab('inputs');
    setModalView('power');
  };

  const openProtectionModal = () => {
    setSelectedRelayId(doc.relays[0]?.id ?? '');
    setProtectionTab('relays');
    setModalView('protection');
  };

  const updatePowerFlowForObject = (objectId: string, patch: PowerFlowMetadata, phase?: Phase, applyAll = false) => {
    const update = (flow: PowerFlowMetadata | undefined) => computePowerFlow(mergePhaseValues(flow, phase, patch, applyAll));
    commit({
      ...doc,
      objects: {
        ...doc.objects,
        symbols: doc.objects.symbols.map((symbol) => symbol.id === objectId ? { ...symbol, powerFlow: update(symbol.powerFlow) } : symbol),
        busbars: doc.objects.busbars.map((busbar) => busbar.id === objectId ? { ...busbar, powerFlow: update(busbar.powerFlow) } : busbar),
        conductors: doc.objects.conductors.map((conductor) => conductor.id === objectId ? { ...conductor, powerFlow: update(conductor.powerFlow) } : conductor)
      }
    });
  };

  const applyAggregateToAllPhases = (objectId: string) => {
    const target = allPowerFlowObjects.find((object) => object.id === objectId);
    if (!target?.flow) return;
    updatePowerFlowForObject(objectId, target.flow, undefined, true);
  };

  const copyPhaseAToBC = (objectId: string) => {
    const target = allPowerFlowObjects.find((object) => object.id === objectId);
    const phaseA = target?.flow?.perPhase?.A;
    if (!phaseA) return;
    const next: PowerFlowMetadata = { ...(target.flow ?? {}), perPhase: { ...(target.flow?.perPhase ?? {}), B: { ...phaseA, manualOverride: true }, C: { ...phaseA, manualOverride: true } } };
    updatePowerFlowForObject(objectId, next);
  };

  const resetPerPhaseOverrides = (objectId: string) => {
    const target = allPowerFlowObjects.find((object) => object.id === objectId);
    if (!target?.flow) return;
    updatePowerFlowForObject(objectId, { ...target.flow, perPhase: undefined });
  };

  const removeRelay = (relayId: string) => commit({ ...doc, relays: doc.relays.filter((relay) => relay.id !== relayId) });

  const removeZone = (zoneId: string) => commit({
    ...doc,
    protectionZones: doc.protectionZones.filter((zone) => zone.id !== zoneId),
    relays: doc.relays.map((relay) => relay.zoneId === zoneId ? { ...relay, zoneId: undefined } : relay)
  });

  const toggleZoneVisible = (zoneId: string) => commit({
    ...doc,
    protectionZones: doc.protectionZones.map((zone) => zone.id === zoneId ? { ...zone, visible: !zone.visible } : zone)
  });

  const toggleRelayEnabled = (relayId: string) => commit({
    ...doc,
    relays: doc.relays.map((relay) => relay.id === relayId ? { ...relay, enabled: !relay.enabled } : relay)
  });

  const createZoneFromSelection = () => {
    if (!selected.length) return;
    const selectedSymbolsForZone = doc.objects.symbols.filter((symbol) => selected.includes(symbol.id));
    const selectedPathsForZone = [
      ...doc.objects.conductors.filter((path) => selected.includes(path.id)),
      ...doc.objects.busbars.filter((path) => selected.includes(path.id))
    ];
    const points = [
      ...selectedSymbolsForZone.map((symbol) => symbol.position),
      ...selectedPathsForZone.flatMap((path) => path.vertices)
    ];
    if (!points.length) return;
    const minX = Math.min(...points.map((point) => point.x)) - 50;
    const maxX = Math.max(...points.map((point) => point.x)) + 50;
    const minY = Math.min(...points.map((point) => point.y)) - 45;
    const maxY = Math.max(...points.map((point) => point.y)) + 45;
    const zoneId = `zone-${Date.now()}`;
    commit({
      ...doc,
      protectionZones: [
        ...doc.protectionZones,
        {
          id: zoneId,
          name: `Zone ${doc.protectionZones.length + 1}`,
          vertices: [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }],
          assignedObjectIds: selected,
          ctInputIds: selectedSymbolsForZone.filter((symbol) => symbol.type === 'ct').map((symbol) => symbol.id),
          vtInputIds: selectedSymbolsForZone.filter((symbol) => symbol.type === 'vt').map((symbol) => symbol.id),
          color: '#22c55e',
          visible: true
        }
      ]
    });
  };

  const createRelayForFirstZone = (type: 'overcurrent' | 'earth-fault') => {
    const zone = doc.protectionZones[0];
    const breakers = doc.objects.symbols.filter((symbol) => symbol.type === 'circuit-breaker');
    const relay = {
      id: `relay-${Date.now()}`,
      name: `${type === 'overcurrent' ? 'OC' : 'EF'} Relay ${doc.relays.length + 1}`,
      zoneId: zone?.id,
      type,
      enabled: true,
      phases: phasesAll,
      pickupCurrentA: type === 'earth-fault' ? 50 : 500,
      earthFaultPickupA: type === 'earth-fault' ? 50 : undefined,
      timeDelayMs: 500,
      directional: false,
      tripTargetBreakerIds: breakers[0] ? [breakers[0].id] : [],
      backupTripTargetBreakerIds: breakers[1] ? [breakers[1].id] : [],
      breakerFailEnabled: true,
      breakerFailDelayMs: 500,
      state: 'idle' as const
    };
    commit({ ...doc, relays: [...doc.relays, relay] });
  };

  const updateRelay = (relayId: string, patcher: (relay: RelaySettings) => RelaySettings) => commit({
    ...doc,
    relays: doc.relays.map((relay) => relay.id === relayId ? patcher(relay) : relay)
  });

  const addRelay = () => {
    const breakers = doc.objects.symbols.filter((symbol) => symbol.type === 'circuit-breaker');
    const cts = doc.objects.symbols.filter((symbol) => symbol.type === 'ct');
    const relay: RelaySettings = {
      id: `relay-${Date.now()}`,
      name: `Relay ${doc.relays.length + 1}`,
      role: 'first-main',
      zoneId: doc.protectionZones[0]?.id,
      protectedAssetId: selected[0],
      type: 'overcurrent',
      enabled: true,
      phases: phasesAll,
      pickupCurrentA: 500,
      timeDelayMs: 500,
      directional: false,
      tripTargetBreakerIds: breakers[0] ? [breakers[0].id] : [],
      backupTripTargetBreakerIds: breakers[1] ? [breakers[1].id] : [],
      breakerFailEnabled: true,
      breakerFailDelayMs: 500,
      state: 'idle',
      inputs: cts[0] ? [{ id: `input-${Date.now()}`, sourceType: 'ct', sourceObjectId: cts[0].id, sourceLabel: cts[0].label?.text ?? cts[0].id, phases: phasesAll, quantity: 'current', polarity: 'forward' }] : [],
      functions: [{ id: `fn-${Date.now()}`, type: 'overcurrent', enabled: true, pickupThreshold: 500, timeDelayMs: 500, instantaneous: false, phases: phasesAll, requiredInputType: 'current', logic: 'any-phase', state: 'inactive' }],
      outputActions: breakers[0] ? [{ id: `output-${Date.now()}`, targetType: 'circuit-breaker', targetObjectId: breakers[0].id, action: 'trip-open-breaker' }] : [],
      eventHistory: []
    };
    commit({ ...doc, relays: [...doc.relays, relay] });
    setSelectedRelayId(relay.id);
  };

  const duplicateRelay = (relayId: string) => {
    const relay = doc.relays.find((item) => item.id === relayId);
    if (!relay) return;
    const id = `relay-${Date.now()}`;
    commit({ ...doc, relays: [...doc.relays, { ...relay, id, name: `${relay.name} copy`, state: 'idle', pickedUpAt: undefined, trippedAt: undefined, resetAt: undefined }] });
    setSelectedRelayId(id);
  };

  const addRelayInput = (relayId: string, sourceType: RelayInputSourceType = 'ct', quantity: RelayMeasuredQuantity = 'current') => updateRelay(relayId, (relay) => ({
    ...relay,
    inputs: [
      ...(relay.inputs ?? []),
      { id: `input-${Date.now()}`, sourceType, sourceObjectId: selectableProtectionSources.find((source) => source.sourceType === sourceType)?.id, sourceLabel: selectableProtectionSources.find((source) => source.sourceType === sourceType)?.label, phases: phasesAll, quantity, polarity: 'forward' }
    ]
  }));

  const addRelayFunction = (relayId: string, type: RelayFunctionType = 'overcurrent') => updateRelay(relayId, (relay) => ({
    ...relay,
    functions: [
      ...(relay.functions ?? []),
      { id: `fn-${Date.now()}`, type, enabled: true, pickupThreshold: type.includes('earth') ? 50 : type.includes('voltage') ? relay.inputs?.find((input) => input.quantity === 'voltage')?.sourceObjectId ? 132 : 1 : 500, timeDelayMs: type === 'breaker-fail' ? relay.breakerFailDelayMs : 500, instantaneous: false, phases: phasesAll, requiredInputType: type.includes('voltage') ? 'voltage' : type.includes('earth') ? 'earth-residual-current' : type === 'thermal-overload' ? 'temperature' : 'current', logic: type.includes('earth') ? 'residual-earth' : type === 'differential' ? 'differential-between-inputs' : 'any-phase', state: 'inactive' }
    ]
  }));

  const addRelayOutput = (relayId: string, targetType: RelayOutputTargetType = 'circuit-breaker', action: RelayOutputActionType = 'trip-open-breaker') => updateRelay(relayId, (relay) => ({
    ...relay,
    outputActions: [
      ...(relay.outputActions ?? []),
      { id: `output-${Date.now()}`, targetType, targetObjectId: selectableOutputTargets.find((target) => target.targetType === targetType)?.id, action }
    ]
  }));

  const toggleCtPolarity = () => updateSelectedSymbol((symbol) => ({
    ...symbol,
    engineering: { ...symbol.engineering, ctPolarity: symbol.engineering?.ctPolarity === 'P1-right' ? 'P1-left' : 'P1-right' }
  }));

  const toggleTransformerPolarity = () => updateSelectedSymbol((symbol) => ({
    ...symbol,
    engineering: { ...symbol.engineering, transformerPolarity: symbol.engineering?.transformerPolarity === 'hv-right' ? 'hv-left' : 'hv-right' }
  }));

  const toggleTransformerTertiary = () => updateSelectedSymbol((symbol) => {
    const hasTertiary = !symbol.engineering?.hasTertiary;
    const existing = symbol.terminals.filter((terminal) => terminal.name !== 'tertiary');
    return {
      ...symbol,
      terminals: hasTertiary ? [...existing, { id: 't-tertiary', name: 'tertiary', offset: { x: 0, y: 34 }, phaseApplicability: phasesAll }] : existing,
      engineering: { ...symbol.engineering, hasTertiary }
    };
  });

  const setTransformerTertiaryVoltage = (value: number) => updateSelectedSymbol((symbol) => ({
    ...symbol,
    engineering: { ...symbol.engineering, hasTertiary: true, tertiaryVoltageKv: value }
  }));

  const toggleTransformerExpansion = () => updateSelectedSymbol((symbol) => ({
    ...symbol,
    engineering: {
      ...symbol.engineering,
      transformerExpansion: symbol.engineering?.transformerExpansion === 'three-phase-expanded' ? 'single-symbol' : 'three-phase-expanded'
    }
  }));

  const selectedPowerFlow = selectedPhase
    ? selectedObject?.powerFlow?.perPhase?.[selectedPhase] ?? selectedPath?.powerFlow?.perPhase?.[selectedPhase] ?? selectedObject?.powerFlow ?? selectedPath?.powerFlow
    : selectedObject?.powerFlow ?? selectedPath?.powerFlow;
  const selectedPhases = selectedObject?.phaseApplicability ?? selectedPath?.phaseApplicability;
  const selectedSummary = selected.length === 1 ? simulationState.objectSummaries.get(selected[0]) : undefined;
  const selectableProtectionSources = [
    ...doc.objects.symbols.map((symbol) => ({
      id: symbol.id,
      label: symbol.label?.text ?? symbol.id,
      sourceType: symbol.type === 'ct' ? 'ct' as const : symbol.type === 'vt' ? 'vt' as const : symbol.type === 'transformer' ? 'transformer-winding' as const : 'feeder-load-source' as const
    })),
    ...doc.objects.busbars.map((busbar) => ({ id: busbar.id, label: busbar.label?.text ?? busbar.id, sourceType: 'busbar' as const })),
    ...doc.objects.conductors.map((conductor) => ({ id: conductor.id, label: conductor.label?.text ?? conductor.id, sourceType: 'conductor' as const })),
    ...doc.protectionZones.map((zone) => ({ id: zone.id, label: zone.name, sourceType: 'zone' as const }))
  ];
  const selectableOutputTargets = [
    ...doc.objects.symbols.filter((symbol) => symbol.type === 'circuit-breaker').map((symbol) => ({ id: symbol.id, label: symbol.label?.text ?? symbol.id, targetType: 'circuit-breaker' as const })),
    ...doc.objects.symbols.filter((symbol) => symbol.type === 'disconnector').map((symbol) => ({ id: symbol.id, label: symbol.label?.text ?? symbol.id, targetType: 'disconnector' as const })),
    ...doc.objects.symbols.filter((symbol) => symbol.type === 'source').map((symbol) => ({ id: symbol.id, label: symbol.label?.text ?? symbol.id, targetType: 'source' as const }))
  ];
  const selectedRelay = doc.relays.find((relay) => relay.id === selectedRelayId) ?? doc.relays[0];
  const info = (text: string) => <button className='mimic-v2-info-btn' type='button' title={text} aria-label={text}>?</button>;
  const quantitiesForSource = (sourceType: RelayInputSourceType): RelayMeasuredQuantity[] => {
    if (sourceType === 'ct') return ['current', 'earth-residual-current', 'differential-current'];
    if (sourceType === 'vt') return ['voltage', 'power', 'frequency'];
    if (sourceType === 'transformer-winding') return ['current', 'voltage', 'power', 'differential-current', 'temperature'];
    if (sourceType === 'busbar') return ['voltage', 'power', 'frequency'];
    if (sourceType === 'conductor') return ['current', 'power', 'temperature'];
    if (sourceType === 'feeder-load-source') return ['current', 'voltage', 'power', 'temperature'];
    if (sourceType === 'zone') return ['current', 'voltage', 'power', 'earth-residual-current', 'differential-current', 'temperature'];
    return ['current'];
  };
  const sourceTypeForInput = (input: { sourceType?: RelayInputSourceType; sourceObjectId?: string }) => {
    return input.sourceType ?? selectableProtectionSources.find((source) => source.id === input.sourceObjectId)?.sourceType ?? 'ct';
  };
  const normaliseQuantityForSource = (sourceType: RelayInputSourceType, quantity: RelayMeasuredQuantity) => quantitiesForSource(sourceType).includes(quantity) ? quantity : quantitiesForSource(sourceType)[0];

  const flowForObjectPhase = (objectId: string, phase?: Phase) => {
    const summary = simulationState.objectSummaries.get(objectId);
    if (!summary) return undefined;
    return phase ? summary.phases[phase] : summary.aggregate;
  };

  const thermalStrokeForObjectPhase = (objectId: string, phase: Phase | undefined, fallback: string) => {
    if (overlayMode === 'power') {
      const state = lineStateForPath(objectId);
      if (state === 'fault') return 'var(--md2-warning)';
      if (state === 'earth') return 'var(--md2-earth)';
      if (state === 'live') return 'var(--md2-live)';
      return flowForObjectPhase(objectId, phase) ? 'var(--md2-selected)' : fallback;
    }
    if (overlayMode !== 'thermal') return fallback;
    const flow = flowForObjectPhase(objectId, phase);
    if (flow?.thermalState === 'critical') return '#7f1d1d';
    if (flow?.thermalState === 'hot') return '#dc2626';
    if (flow?.thermalState === 'warm') return '#f59e0b';
    return '#16a34a';
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (focusedOperateMode) {
          event.preventDefault();
          setScenarioMenuOpen((open) => !open);
          return;
        }
        setSelected([]);
        setDraftPath([]);
        setCursorPoint(null);
        setSelectionBox(null);
      }
      if (event.key === 'Delete' && selected.length && !deleteDisabled) {
        commit({
          ...doc,
          objects: {
            ...doc.objects,
            symbols: doc.objects.symbols.filter((symbol) => !selected.includes(symbol.id)),
            conductors: doc.objects.conductors.filter((path) => !selected.includes(path.id)),
            busbars: doc.objects.busbars.filter((path) => !selected.includes(path.id))
          }
        });
        setSelected([]);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        const prev = undoStack[undoStack.length - 1];
        if (!prev) return;
        setRedoStack((r) => [...r, doc]);
        setUndoStack((u) => u.slice(0, -1));
        setDoc(prev);
      }
      if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z')) {
        const next = redoStack[redoStack.length - 1];
        if (!next) return;
        setUndoStack((u) => [...u, doc]);
        setRedoStack((r) => r.slice(0, -1));
        setDoc(next);
      }
      if (event.key.toLowerCase() === 'r' && selectedSymbols.length) {
        commit({ ...doc, objects: { ...doc.objects, symbols: doc.objects.symbols.map((s) => selected.includes(s.id) ? { ...s, rotation: (s.rotation + 90) % 360 } : s) } });
      }
      if (event.key === 'Enter' && tool === 'conductor') finishPath();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [commit, deleteDisabled, doc, finishPath, focusedOperateMode, redoStack, selected, selectedSymbols.length, tool, undoStack]);

  useEffect(() => {
    if (!learningVisibility.showThreePhase && doc.activeView === 'three-phase') setDoc((prev) => ({ ...prev, activeView: 'single-line' }));
    if (!learningVisibility.showThermalOverlay && overlayMode === 'thermal') setOverlayMode('none');
    if (!learningVisibility.showProtectionManager && overlayMode === 'protection') setOverlayMode('none');
    if (!learningVisibility.showTopologyOverlay && showTopologyOverlay) setShowTopologyOverlay(false);
    if (!learningVisibility.allowFaultTools && tool === 'fault') setTool('select');
  }, [doc.activeView, learningVisibility, overlayMode, showTopologyOverlay, tool]);

  useEffect(() => {
    if (!doc.faults.some((fault) => fault.active && !fault.persistent && fault.durationMs)) return;
    const timer = window.setInterval(() => {
      setDoc((current) => expireTransientFaults(current));
    }, 250);
    return () => window.clearInterval(timer);
  }, [doc.faults]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAtClientPoint(event.clientX, event.clientY, event.deltaY > 0 ? 0.9 : 1.1);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAtClientPoint]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => saveDraft(doc), 700);
    return () => window.clearTimeout(timer);
  }, [dirty, doc]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const renderSymbolGlyph = (symbol: ElectricalSymbol) => {
    const selectedStroke = selected.includes(symbol.id) ? 'var(--md2-selected)' : 'var(--md2-text)';
    if (renderMode === 'nodes') return <circle cx={0} cy={0} r={18} fill='var(--md2-symbol-bg)' stroke={selectedStroke} strokeWidth={2} />;
    if (symbol.type === 'cable-sealing-end') return <polygon points='-14,-13 18,0 -14,13' fill='var(--md2-canvas-bg)' stroke={selectedStroke} strokeWidth={2} />;
    if (symbol.type === 'source') return <g><line x1={-30} y1={0} x2={-14} y2={0} stroke={selectedStroke} strokeWidth={2}/><polygon points='-14,-16 18,0 -14,16' fill='var(--md2-symbol-bg)' stroke={selectedStroke} strokeWidth={2}/><line x1={18} y1={0} x2={40} y2={0} stroke={selectedStroke} strokeWidth={2}/></g>;
    if (symbol.type === 'load' || symbol.type === 'line-end') return <g><line x1={-40} y1={0} x2={-18} y2={0} stroke={selectedStroke} strokeWidth={2}/><polygon points='18,-16 -18,0 18,16' fill='var(--md2-symbol-bg)' stroke={selectedStroke} strokeWidth={2}/><line x1={18} y1={0} x2={30} y2={0} stroke={selectedStroke} strokeWidth={2}/></g>;
    if (symbol.type === 'transformer') return <g><circle cx={-9} cy={0} r={13} fill='none' stroke={selectedStroke} strokeWidth={2}/><circle cx={9} cy={0} r={13} fill='none' stroke={selectedStroke} strokeWidth={2}/></g>;
    if (symbol.type === 'ct') return <g><line x1={-30} y1={0} x2={30} y2={0} stroke={selectedStroke} strokeWidth={2}/><circle cx={-8} cy={0} r={11} fill='none' stroke={selectedStroke} strokeWidth={2}/><circle cx={8} cy={0} r={11} fill='none' stroke={selectedStroke} strokeWidth={2}/></g>;
    if (symbol.type === 'vt') return <g><line x1={0} y1={-26} x2={0} y2={-8} stroke={selectedStroke} strokeWidth={2}/><circle cx={0} cy={5} r={13} fill='none' stroke={selectedStroke} strokeWidth={2}/><text x={0} y={9} textAnchor='middle' fontSize='10' fill={selectedStroke}>V</text><line x1={0} y1={18} x2={0} y2={28} stroke={selectedStroke} strokeWidth={2}/><line x1={-9} y1={28} x2={9} y2={28} stroke={selectedStroke} strokeWidth={2}/><line x1={-6} y1={32} x2={6} y2={32} stroke={selectedStroke} strokeWidth={2}/><line x1={-3} y1={36} x2={3} y2={36} stroke={selectedStroke} strokeWidth={2}/></g>;
    if (symbol.type === 'circuit-breaker') {
      const fill = symbol.operation?.tripped ? 'var(--md2-warning)' : symbol.operation?.switchState === 'closed' ? 'var(--md2-live)' : 'var(--md2-symbol-bg)';
      const stateText = symbol.operation?.tripped ? 'T' : symbol.operation?.switchState === 'closed' ? 'X' : 'O';
      return <g><line x1={-30} y1={0} x2={-14} y2={0} stroke={selectedStroke} strokeWidth={2}/><rect x={-14} y={-14} width={28} height={28} fill={fill} stroke={selectedStroke} strokeWidth={2}/><text x={0} y={5} textAnchor='middle' fontSize='14' fontWeight={800} fill={selectedStroke}>{stateText}</text><line x1={14} y1={0} x2={30} y2={0} stroke={selectedStroke} strokeWidth={2}/></g>;
    }
    if (symbol.type === 'disconnector') {
      const closed = symbol.operation?.switchState === 'closed' && !symbol.operation?.tripped;
      return <g><line x1={-30} y1={0} x2={-8} y2={0} stroke={selectedStroke} strokeWidth={2}/><circle cx={-8} cy={0} r={2.5} fill={selectedStroke}/><circle cx={12} cy={0} r={2.5} fill={selectedStroke}/><line x1={12} y1={0} x2={30} y2={0} stroke={selectedStroke} strokeWidth={2}/><line x1={-8} y1={0} x2={closed ? 12 : 7} y2={closed ? 0 : -13} stroke={selectedStroke} strokeWidth={2}/></g>;
    }
    if (symbol.type === 'earth-switch') {
      const closed = symbol.operation?.switchState === 'closed' && !symbol.operation?.tripped;
      return <g><circle cx={0} cy={0} r={2.5} fill={selectedStroke}/><circle cx={0} cy={18} r={2.5} fill={selectedStroke}/><line x1={0} y1={0} x2={closed ? 0 : 13} y2={closed ? 18 : 8} stroke={selectedStroke} strokeWidth={2}/><line x1={0} y1={18} x2={0} y2={28} stroke={selectedStroke} strokeWidth={2}/><line x1={-9} y1={28} x2={9} y2={28} stroke={selectedStroke} strokeWidth={2}/><line x1={-6} y1={32} x2={6} y2={32} stroke={selectedStroke} strokeWidth={2}/><line x1={-3} y1={36} x2={3} y2={36} stroke={selectedStroke} strokeWidth={2}/></g>;
    }
    return <rect x={-20} y={-14} width={40} height={28} fill='var(--md2-symbol-bg)' stroke={selectedStroke} strokeWidth={2}/>;
  };

  const transformerLabels = (symbol: ElectricalSymbol) => {
    if (symbol.type !== 'transformer') return null;
    const hvLeft = symbol.engineering?.transformerPolarity !== 'hv-right';
    return <g>
      <text x={hvLeft ? -36 : 26} y={-20} fontSize='8'>{hvLeft ? 'HV' : 'LV'}</text>
      <text x={hvLeft ? 26 : -36} y={-20} fontSize='8'>{hvLeft ? 'LV' : 'HV'}</text>
      {symbol.engineering?.hasTertiary && <text x={-18} y={46} fontSize='8'>T {symbol.engineering.tertiaryVoltageKv ? `${symbol.engineering.tertiaryVoltageKv}kV` : ''}</text>}
    </g>;
  };

  const ctLabels = (symbol: ElectricalSymbol) => {
    if (symbol.type !== 'ct') return null;
    const p1Left = symbol.engineering?.ctPolarity !== 'P1-right';
    return <g>
      <text x={p1Left ? -35 : 22} y={-20} fontSize='8'>P1</text>
      <text x={p1Left ? 22 : -35} y={-20} fontSize='8'>P2</text>
      <path d={p1Left ? 'M -24 18 L 24 18' : 'M 24 18 L -24 18'} stroke='var(--md2-selected)' strokeWidth={1.5} markerEnd='url(#arrow)' />
    </g>;
  };

  const lineStateForPath = (pathId: string) => {
    const branchIds = topology.branches.filter((branch) => branch.objectId === pathId).map((branch) => branch.id);
    const live = branchIds.some((id) => operateState.liveBranchIds.has(id));
    const earthed = branchIds.some((id) => operateState.earthedBranchIds.has(id));
    if (live && earthed) return 'fault';
    if (earthed) return 'earth';
    if (live) return 'live';
    return 'dead';
  };

  const lineStroke = (base: string, state: ReturnType<typeof lineStateForPath>) => {
    if (state === 'fault') return 'var(--md2-warning)';
    if (state === 'earth') return 'var(--md2-earth)';
    if (state === 'live') return 'var(--md2-live)';
    return base;
  };

  const topologyBranchStroke = (branchId: string) => {
    if (operateState.faultBranchIds.has(branchId)) return 'var(--md2-warning)';
    if (operateState.earthedBranchIds.has(branchId)) return 'var(--md2-earth)';
    if (operateState.liveBranchIds.has(branchId)) return 'var(--md2-live)';
    return 'var(--md2-selected)';
  };

  const eventSeverity = (event: OperationEvent): ScenarioEventSeverity => {
    if (event.severity) return event.severity;
    const message = event.message.toLowerCase();
    if (message.includes('fault')) return 'fault';
    if (message.includes('trip') || message.includes('relay') || message.includes('protection')) return 'protection';
    if (message.includes('warning') || message.includes('mismatch') || message.includes('blocked')) return 'warning';
    if (message.includes('scenario') || message.includes('hint')) return 'scenario';
    if (message.includes('closed') || message.includes('open') || message.includes('operated')) return 'operation';
    return 'info';
  };

  const filteredOperationEvents = doc.operationEvents
    .map((event) => ({ event, severity: eventSeverity(event) }))
    .filter((item) => eventLogFilter === 'all' || item.severity === eventLogFilter)
    .slice(-80);

  const eventTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formatPowerStatistic = (flow?: PowerFlowMetadata) => {
    const mw = flow?.mw ?? 0;
    if (learningTier === 'Junior') {
      const watts = mw * 1_000_000;
      return Math.abs(mw) < 1 ? `${watts.toFixed(0)} W` : `${mw.toFixed(1)} MW`;
    }
    const mvar = flow?.mvar ?? 0;
    const mva = flow?.mva ?? Math.hypot(mw, mvar);
    return `${mva.toFixed(1)} MVA / ${mvar.toFixed(1)} MVAR`;
  };

  const vtRatioText = (symbol: ElectricalSymbol) => `${Math.round(((symbol.voltageLevelKv ?? 132) * 1000) / 110)}/1`;

  const scenarioSections = [
    { title: 'Tutorials', packages: builtInScenarioPackages.filter((pkg) => (pkg.scenario.mode ?? 'lesson') === 'lesson' && isScenarioAvailableForTier(pkg.scenario, learningTier)) },
    { title: 'Challenges', packages: builtInScenarioPackages.filter((pkg) => pkg.scenario.mode === 'challenge' && isScenarioAvailableForTier(pkg.scenario, learningTier)) },
    { title: 'Examples', packages: builtInScenarioPackages.filter((pkg) => (pkg.tags.includes('example') || pkg.tags.includes('thermal') || pkg.tags.includes('phase-specific')) && isScenarioAvailableForTier(pkg.scenario, learningTier)) },
    { title: 'Sandbox Templates', packages: builtInScenarioPackages.filter((pkg) => pkg.scenario.mode === 'sandbox' && isScenarioAvailableForTier(pkg.scenario, learningTier)) }
  ];
  const allVisibleScenarioPackages = scenarioSections.flatMap((section) => section.packages);
  const orderedAvailableScenarioPackages = builtInScenarioPackages.filter((pkg) => isScenarioAvailableForTier(pkg.scenario, learningTier));
  const nextScenarioPackage = activeScenarioPackage
    ? orderedAvailableScenarioPackages[(orderedAvailableScenarioPackages.findIndex((pkg) => pkg.id === activeScenarioPackage.id) + 1) % Math.max(orderedAvailableScenarioPackages.length, 1)]
    : undefined;

  const operationLabel = (symbol: ElectricalSymbol) => {
    if (symbol.type === 'source') return symbol.operation?.sourceOn === false ? 'Off' : 'On';
    if (!isSwitchingDevice(symbol.type) || symbol.type === 'circuit-breaker') return null;
    if (symbol.operation?.tripped) return 'Trip';
    return symbol.operation?.switchState === 'closed' ? 'Closed' : 'Open';
  };

  const switchVisual = (symbol: ElectricalSymbol) => {
    if (symbol.type === 'source') {
      const on = symbol.operation?.sourceOn !== false;
      return <circle cx={0} cy={-26} r={4} fill={on ? 'var(--md2-live)' : 'var(--md2-deenergised)'} />;
    }
    if (symbol.operation?.tripped) return <text x={-11} y={-23} fontSize='8' fill='var(--md2-warning)'>TRIP</text>;
    return null;
  };

  const componentGlyph = (type: ElectricalSymbol['type']) => {
    if (type === 'source') return <svg viewBox='0 0 40 28' aria-hidden='true'><line x1='2' y1='14' x2='10' y2='14'/><polygon points='10,4 28,14 10,24'/><line x1='28' y1='14' x2='38' y2='14'/></svg>;
    if (type === 'load' || type === 'line-end') return <svg viewBox='0 0 40 28' aria-hidden='true'><line x1='2' y1='14' x2='12' y2='14'/><polygon points='30,4 12,14 30,24'/><line x1='30' y1='14' x2='38' y2='14'/></svg>;
    if (type === 'transformer') return <svg viewBox='0 0 40 28' aria-hidden='true'><circle cx='16' cy='14' r='8'/><circle cx='24' cy='14' r='8'/><line x1='2' y1='14' x2='8' y2='14'/><line x1='32' y1='14' x2='38' y2='14'/></svg>;
    if (type === 'ct') return <svg viewBox='0 0 40 28' aria-hidden='true'><line x1='3' y1='14' x2='37' y2='14'/><circle cx='16' cy='14' r='7'/><circle cx='24' cy='14' r='7'/></svg>;
    if (type === 'vt') return <svg viewBox='0 0 40 34' aria-hidden='true'><line x1='20' y1='2' x2='20' y2='9'/><circle cx='20' cy='17' r='8'/><text x='16' y='20'>V</text><line x1='20' y1='25' x2='20' y2='29'/><line x1='13' y1='29' x2='27' y2='29'/><line x1='16' y1='32' x2='24' y2='32'/></svg>;
    if (type === 'circuit-breaker') return <svg viewBox='0 0 40 28' aria-hidden='true'><line x1='3' y1='14' x2='13' y2='14'/><rect x='13' y='7' width='14' height='14'/><text x='17' y='18'>O</text><line x1='27' y1='14' x2='37' y2='14'/></svg>;
    if (type === 'disconnector') return <svg viewBox='0 0 40 28' aria-hidden='true'><line x1='3' y1='14' x2='16' y2='14'/><line x1='16' y1='14' x2='28' y2='7'/><circle cx='16' cy='14' r='2'/><circle cx='30' cy='14' r='2'/><line x1='30' y1='14' x2='37' y2='14'/></svg>;
    if (type === 'earth-switch') return <svg viewBox='0 0 40 28' aria-hidden='true'><line x1='4' y1='10' x2='24' y2='10'/><line x1='24' y1='10' x2='24' y2='20'/><line x1='17' y1='20' x2='31' y2='20'/><line x1='19' y1='23' x2='29' y2='23'/><line x1='21' y1='26' x2='27' y2='26'/></svg>;
    if (type === 'cable-sealing-end') return <svg viewBox='0 0 40 28' aria-hidden='true'><polygon points='8,4 32,14 8,24'/></svg>;
    return <svg viewBox='0 0 40 28' aria-hidden='true'><rect x='8' y='7' width='24' height='14'/></svg>;
  };

  const toolIcon = (name: Tool) => {
    if (name === 'select') return <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M5 3 L17 14 L11 15 L8 21 L5 3 Z' fill='none' stroke='currentColor' strokeWidth='2' strokeLinejoin='round'/></svg>;
    if (name === 'operate') return <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M8 5 H16 M12 5 V12 M7 12 H17 L15 20 H9 L7 12 Z' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'/></svg>;
    if (name === 'conductor') return <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M4 17 L9 17 L9 7 L15 7 L15 17 L20 17' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round'/></svg>;
    if (name === 'fault') return <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M13 2 L5 14 H11 L9 22 L19 9 H13 L13 2 Z' fill='none' stroke='currentColor' strokeWidth='2' strokeLinejoin='round'/></svg>;
    return <svg viewBox='0 0 24 24' aria-hidden='true'><path d='M8 12 V6 A2 2 0 0 1 12 6 V11 V5 A2 2 0 0 1 16 5 V12 L18 10 A2 2 0 0 1 21 12 L18 18 A6 6 0 0 1 13 21 H10 A6 6 0 0 1 4 15 V11 A2 2 0 0 1 8 11 V12 Z' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'/></svg>;
  };

  const selectedBoxRect = selectionBox ? selectionBounds(selectionBox) : null;
  const ghostPath = draftPath.length > 0 ? [...draftPath, ...(cursorPoint ? [cursorPoint] : [])] : [];
  const launchScenario = scenarioLaunchPackage ? adaptScenarioForTier(scenarioLaunchPackage.scenario, learningTier) : undefined;
  const selectedFault = selectedObject ? doc.faults.find((fault) => fault.active && fault.targetObjectId === selectedObject.id) : undefined;
  const selectedDiagnostic = selectedObject ? simulationState.objectSummaries.get(selectedObject.id) : undefined;
  const selectedVoltageEstimate = selectedFault ? 0 : selectedObject?.voltageLevelKv;
  const symbolLabelY = (symbol: ElectricalSymbol) => symbol.type === 'earth-switch' || symbol.type === 'vt' ? 52 : symbol.type === 'ct' ? 44 : 38;

  return <div className='mimic-v2-root' data-theme={theme}>
    {!placementDisabled && (!focusedOperateMode || buildingScenario) && <aside className='mimic-v2-sidebar'>
      <h3>Components</h3>
      <div className='mimic-v2-voltage-row'>
        {standardVoltages.map((voltage) => <button key={voltage} className={`mimic-v2-chip ${selectedVoltage === voltage ? 'active' : ''}`} onClick={() => setSelectedVoltage(voltage)}>{voltage}</button>)}
      </div>
      {SYMBOL_LIBRARY.filter((s) => s.type !== 'line-end' && s.type !== 'cable-sealing-end' && s.type !== 'busbar-coupler').map((s) =>
        <div key={s.type} className='mimic-v2-item'>
          <button className='mimic-v2-component-btn' draggable onDragStart={(event) => onLibraryDragStart(event, s.type)} onClick={() => placeSymbol(s.type)}>
            <span className='mimic-v2-component-icon'>{componentGlyph(s.type)}</span>
            <span>{s.displayName}</span>
          </button>
        </div>
      )}
      <label className='mimic-v2-scenario-menu-setting' style={{ marginTop: 8 }}>
        Naming scheme
        <select value={resolveLabelScheme(doc)} onChange={(event) => applyLabelScheme(event.target.value as LabelScheme)}>
          {LABEL_SCHEMES.filter((scheme) => scheme.available).map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.label}</option>)}
        </select>
      </label>
      <button className='mimic-v2-btn' onClick={() => commit(generateLabels(doc))}>Regenerate auto labels</button>
      <button className='mimic-v2-btn' onClick={() => setLibraryOpen(true)}>Drawing library</button>
      <button className='mimic-v2-btn' onClick={createNewDrawing}>New</button>
      <button className='mimic-v2-btn' onClick={saveCurrentDrawing}>Save</button>
      <button className='mimic-v2-btn' onClick={saveCurrentDrawingAs}>Save as</button>
      {onRequestMenu && <button className='mimic-v2-btn' onClick={onRequestMenu}>Main menu</button>}
    </aside>}
    <main className='mimic-v2-main'>
      <div className='mimic-v2-toolbar'>
        {focusedOperateMode && <button className='mimic-v2-btn active' title='Scenario menu' onClick={() => setScenarioMenuOpen(true)}>Menu</button>}
        {focusedOperateMode ? <>
          <div className='mimic-v2-tool-group'><span>{activeScenarioPackage?.title ?? 'Scenario'}</span></div>
          <div className='mimic-v2-tool-group'><span>Mode</span><button className='mimic-v2-btn active'>Operate</button></div>
          <div className='mimic-v2-tool-group'><span>Tools</span><button className={`mimic-v2-btn mimic-v2-icon-btn ${tool==='select'?'active':''}`} aria-label='Select' title='Select and inspect equipment' onClick={() => setTool('select')}>{toolIcon('select')}</button><button className={`mimic-v2-btn mimic-v2-icon-btn ${tool==='operate'?'active':''}`} aria-label='Operate' title='Operate switchgear' onClick={() => setTool('operate')}>{toolIcon('operate')}</button>{learningVisibility.allowFaultTools && <button className={`mimic-v2-btn mimic-v2-icon-btn ${tool==='fault'?'active':''}`} aria-label='Fault' title='Apply a fault or thermal condition' onClick={() => setTool('fault')}>{toolIcon('fault')}</button>}<button className={`mimic-v2-btn mimic-v2-icon-btn ${tool==='pan'?'active':''}`} aria-label='Pan' title='Pan the canvas' onClick={() => setTool('pan')}>{toolIcon('pan')}</button></div>
          {(learningVisibility.showThermalOverlay || learningVisibility.showProtectionManager) && <div className='mimic-v2-tool-group'><span>Overlay</span><button className={`mimic-v2-btn ${overlayMode==='none'?'active':''}`} onClick={() => setOverlayMode('none')}>None</button>{learningVisibility.showThermalOverlay && <button className={`mimic-v2-btn ${overlayMode==='thermal'?'active':''}`} onClick={() => setOverlayMode('thermal')}>Thermal</button>}{learningVisibility.showProtectionManager && <button className={`mimic-v2-btn ${overlayMode==='protection'?'active':''}`} onClick={() => setOverlayMode('protection')}>Protection</button>}{learningVisibility.showProtectionManager && <button className='mimic-v2-btn' onClick={openProtectionModal}>Protection...</button>}</div>}
        </> : <>
          <div className='mimic-v2-tool-group'><span>Tier</span><select value={learningTier} title={learningTiers[learningTier].explanationStyle} onChange={(event) => setLearningTier(event.target.value as LearningTier)}>{learningTierOrder.map((tier) => <option key={tier} value={tier}>{tier}</option>)}</select></div>
          <div className='mimic-v2-tool-group'><span>Mode</span><button className={`mimic-v2-btn ${mode==='edit'?'active':''}`} onClick={() => { setMode('edit'); setTool('select'); }}>Edit</button><button className={`mimic-v2-btn ${mode==='operate'?'active':''}`} onClick={() => { setMode('operate'); setTool('operate'); }}>Operate</button></div>
          <div className='mimic-v2-tool-group'><span>Tools</span><button className={`mimic-v2-btn mimic-v2-icon-btn ${tool==='select'?'active':''}`} aria-label='Select' title='Select equipment' onClick={() => setTool('select')}>{toolIcon('select')}</button>{mode === 'operate' && <button className={`mimic-v2-btn mimic-v2-icon-btn ${tool==='operate'?'active':''}`} aria-label='Operate' title='Operate switchgear' onClick={() => setTool('operate')}>{toolIcon('operate')}</button>}{mode === 'edit' && !editingToolsDisabled && <button className={`mimic-v2-btn mimic-v2-icon-btn ${tool==='conductor'?'active':''}`} aria-label='Conductor' title='Draw conductor, busbar, cable, or overhead line' onClick={() => setTool('conductor')}>{toolIcon('conductor')}</button>}{learningVisibility.allowFaultTools && <button className={`mimic-v2-btn mimic-v2-icon-btn ${tool==='fault'?'active':''}`} aria-label='Fault' title='Apply a fault or thermal condition' onClick={() => setTool('fault')}>{toolIcon('fault')}</button>}<button className={`mimic-v2-btn mimic-v2-icon-btn ${tool==='pan'?'active':''}`} aria-label='Pan' title='Pan the canvas' onClick={() => setTool('pan')}>{toolIcon('pan')}</button>{tool === 'conductor' && !editingToolsDisabled && <select value={conductorToolKind} title='Conductor type' onChange={(event) => setConductorToolKind(event.target.value as ConductorToolKind)}><option value='busbar'>Busbar</option><option value='cable'>Cable</option><option value='overhead-line'>Overhead line</option></select>}</div>
          {tool === 'fault' && <div className='mimic-v2-tool-group'><span>Fault</span><select value={faultType} onChange={(event) => setFaultType(event.target.value as FaultType)}><option value='A-E'>A–Earth</option><option value='B-E'>B–Earth</option><option value='C-E'>C–Earth</option><option value='A-B'>A–B</option><option value='B-C'>B–C</option><option value='C-A'>C–A</option><option value='A-B-C'>A–B–C</option><option value='A-B-C-E'>A–B–C–Earth</option><option value='open-circuit'>Open circuit</option><option value='high-impedance'>High impedance</option><option value='hot-joint'>Hot joint</option></select><label className='mimic-v2-fault-transient-toggle' title='When checked, the fault clears automatically after about one second'><input type='checkbox' checked={faultTransient} onChange={(event) => setFaultTransient(event.target.checked)} />Transient</label></div>}
          <div className='mimic-v2-tool-group'><span>View</span><button className={`mimic-v2-btn ${doc.activeView==='single-line'?'active':''}`} onClick={() => setDoc((p)=>({ ...p, activeView:'single-line'}))}>Single-line</button>{learningVisibility.showThreePhase && <button className={`mimic-v2-btn ${doc.activeView==='three-phase'?'active':''}`} onClick={() => setDoc((p)=>({ ...p, activeView:'three-phase'}))}>Three-phase</button>}</div>
          <div className='mimic-v2-tool-group'><span>Overlay</span><button className={`mimic-v2-btn ${overlayMode==='none'?'active':''}`} onClick={() => setOverlayMode('none')}>None</button><button className={`mimic-v2-btn ${overlayMode==='power'?'active':''}`} onClick={() => setOverlayMode('power')}>Power</button>{learningVisibility.showThermalOverlay && <button className={`mimic-v2-btn ${overlayMode==='thermal'?'active':''}`} onClick={() => setOverlayMode('thermal')}>Thermal</button>}{learningVisibility.showProtectionManager && <button className={`mimic-v2-btn ${overlayMode==='protection'?'active':''}`} onClick={() => setOverlayMode('protection')}>Protection</button>}</div>
          <div className='mimic-v2-tool-group'><span>Managers</span>{learningVisibility.showPowerFlow && <button className='mimic-v2-btn' onClick={openPowerFlowModal}>Power Flow</button>}{learningVisibility.showProtectionManager && <button className='mimic-v2-btn' onClick={openProtectionModal}>Protection</button>}<button className={`mimic-v2-btn ${managerView==='scenario'?'active':''}`} onClick={() => setManagerView('scenario')}>Scenarios</button></div>
        </>}
        <div className='mimic-v2-tool-group'><span>UI</span><button className='mimic-v2-btn' title='Toggle light/dark theme' onClick={() => setTheme((t)=>t==='light'?'dark':'light')}>Theme</button>{!focusedOperateMode && learningVisibility.showDebug && <button className={`mimic-v2-btn ${showTopologyOverlay?'active':''}`} title={topologyOverlayDisabled ? 'Topology overlay disabled by scenario' : 'Show topology graph overlay'} disabled={topologyOverlayDisabled} onClick={() => setShowTopologyOverlay((v)=>!v)}>Topology overlay</button>}</div>
      </div>
      <div className='mimic-v2-canvas-wrap' onDragOver={onCanvasDragOver} onDrop={onCanvasDrop}>
      {scenarioSelectorOnly ? <div className='mimic-v2-canvas mimic-v2-canvas-empty' /> : <svg ref={svgRef} className='mimic-v2-canvas' onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onDoubleClick={() => finishPath()} onContextMenu={(event) => { event.preventDefault(); setDraftPath([]); setCursorPoint(null); }}>
        <defs>
          <pattern id='grid' width={doc.uiState.gridSize} height={doc.uiState.gridSize} patternUnits='userSpaceOnUse'><path d={`M ${doc.uiState.gridSize} 0 L 0 0 0 ${doc.uiState.gridSize}`} fill='none' stroke='var(--md2-grid-line)' strokeWidth='1'/></pattern>
          <marker id='arrow' markerWidth='8' markerHeight='8' refX='7' refY='4' orient='auto'><path d='M 0 0 L 8 4 L 0 8 z' fill='var(--md2-selected)' /></marker>
        </defs>
        <rect width='100%' height='100%' fill='url(#grid)' />
        <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
          {doc.protectionZones.filter((zone) => zone.visible).map((zone) => <g key={zone.id}>
            <polygon points={zone.vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill={zone.color} opacity={0.08} stroke={zone.color} strokeWidth={2} strokeDasharray='10 6' pointerEvents='none' />
            <text x={zone.vertices[0]?.x ?? 0} y={(zone.vertices[0]?.y ?? 0) - 6} fontSize='10' fill={zone.color}>{zone.name}</text>
          </g>)}
          {renderedBusbars.map((instance) => <g key={instance.id}>
            <polyline points={instance.vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke='transparent' strokeWidth={18} onMouseDown={(event) => onPathMouseDown(event, instance.canonicalId, instance.phase)} />
            {focusObjectIds.has(instance.canonicalId) && <polyline className='mimic-v2-focus-stroke' points={instance.vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke='var(--md2-selected)' strokeWidth={16} strokeLinecap='square' strokeLinejoin='round' pointerEvents='none' />}
            {instance.phase && <polyline points={instance.vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke={phaseColour(instance.phase)} strokeWidth={selected.includes(instance.canonicalId) ? 12 : 10} strokeLinecap='square' strokeLinejoin='round' pointerEvents='none' />}
            <polyline points={instance.vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke={selected.includes(instance.canonicalId) && selectedPhase === instance.phase ? 'var(--md2-selected)' : lineStroke(thermalStrokeForObjectPhase(instance.canonicalId, instance.phase, 'var(--md2-busbar)'), lineStateForPath(instance.canonicalId))} strokeWidth={selected.includes(instance.canonicalId) ? 8 : instance.phase ? 5 : 7} strokeLinecap='square' strokeLinejoin='round' pointerEvents='none' />
            {instance.phase && <text x={instance.vertices[0].x - 18} y={instance.vertices[0].y + 4} fontSize='9'>{instance.phase}</text>}
            {overlayMode === 'power' && flowForObjectPhase(instance.canonicalId, instance.phase)?.mw !== undefined && <text x={instance.vertices[Math.floor(instance.vertices.length / 2)].x} y={instance.vertices[Math.floor(instance.vertices.length / 2)].y - 8} fontSize='8'>{flowForObjectPhase(instance.canonicalId, instance.phase)?.mw?.toFixed(1)}MW {flowForObjectPhase(instance.canonicalId, instance.phase)?.direction === 'reverse' ? '<' : '>'}</text>}
          </g>)}
          {renderedConductors.map((instance) => <g key={instance.id}>
            <polyline points={instance.vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke='transparent' strokeWidth={16} onMouseDown={(event) => onPathMouseDown(event, instance.canonicalId, instance.phase)} />
            {focusObjectIds.has(instance.canonicalId) && <polyline className='mimic-v2-focus-stroke' points={instance.vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke='var(--md2-selected)' strokeWidth={12} strokeLinecap='round' pointerEvents='none' />}
            {instance.phase && <polyline points={instance.vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke={phaseColour(instance.phase)} strokeWidth={selected.includes(instance.canonicalId) ? 7 : 6} strokeDasharray={instance.path.conductorStyle === 'overhead-line' ? undefined : '18 10'} strokeLinecap='round' pointerEvents='none' />}
            <polyline points={instance.vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke={selected.includes(instance.canonicalId) && selectedPhase === instance.phase ? 'var(--md2-selected)' : lineStroke(thermalStrokeForObjectPhase(instance.canonicalId, instance.phase, 'var(--md2-cable)'), lineStateForPath(instance.canonicalId))} strokeWidth={selected.includes(instance.canonicalId) ? 5 : instance.phase ? 3 : 3} strokeDasharray={instance.path.conductorStyle === 'overhead-line' ? undefined : '18 10'} strokeLinecap='round' pointerEvents='none' />
            {instance.phase && <text x={instance.vertices[0].x - 18} y={instance.vertices[0].y + 4} fontSize='9'>{instance.phase}</text>}
            {overlayMode === 'power' && flowForObjectPhase(instance.canonicalId, instance.phase)?.mw !== undefined && <text x={instance.vertices[Math.floor(instance.vertices.length / 2)].x} y={instance.vertices[Math.floor(instance.vertices.length / 2)].y - 8} fontSize='8'>{flowForObjectPhase(instance.canonicalId, instance.phase)?.mw?.toFixed(1)}MW {flowForObjectPhase(instance.canonicalId, instance.phase)?.direction === 'reverse' ? '<' : '>'}</text>}
          </g>)}
          {renderedSymbols.map((instance) => <g key={instance.id} transform={`translate(${instance.position.x},${instance.position.y}) rotate(${instance.symbol.rotation})`} onMouseDown={(event) => onSymbolMouseDown(event, instance.symbol, instance.phase)}>
            {focusObjectIds.has(instance.symbol.id) && <circle className='mimic-v2-focus-ring' cx={0} cy={0} r={34} fill='none' stroke='var(--md2-selected)' strokeWidth={3} />}
            {instance.symbol.simulation?.arced && <circle className='mimic-v2-arc-flash' cx={0} cy={0} r={36} fill='none' stroke='var(--md2-warning)' strokeWidth={4} />}
            {instance.phase && (instance.symbol.type === 'source' || instance.symbol.type === 'load' || instance.symbol.type === 'line-end') && <text x={-34} y={4} fontSize='9'>{instance.phase}</text>}
            {instance.symbol.engineering?.transformerExpansion === 'three-phase-expanded' && doc.activeView === 'single-line' && <text x={18} y={-18} fontSize='10' fill='var(--md2-selected)'>3P</text>}
            {renderSymbolGlyph(instance.symbol)}
            {renderMode === 'nodes' && <text x={0} y={4} textAnchor='middle' fontSize='8'>{instance.symbol.type.slice(0, 4)}</text>}
            <text x={0} y={symbolLabelY(instance.symbol)} textAnchor='middle' fontSize='8' transform={`rotate(${-instance.symbol.rotation} 0 ${symbolLabelY(instance.symbol)})`}>{instance.symbol.label?.text ?? ''}</text>
            {mode === 'operate' && operationLabel(instance.symbol) && <text x={0} y={symbolLabelY(instance.symbol) + 11} textAnchor='middle' fontSize='8' transform={`rotate(${-instance.symbol.rotation} 0 ${symbolLabelY(instance.symbol) + 11})`}>{operationLabel(instance.symbol)}</text>}
            {transformerLabels(instance.symbol)}
            {ctLabels(instance.symbol)}
            {switchVisual(instance.symbol)}
            {instance.symbol.terminals.filter((terminal) => !instance.phase || terminal.phaseApplicability.includes(instance.phase)).map((terminal) => {
              const world = terminalWorldPosition(instance.symbol, terminal.id);
              const connected = world ? (terminalByPosition.get(pointKey({ x: Math.round(world.x), y: Math.round(world.y) })) ?? []).length > 1 : false;
              return <circle key={terminal.id} cx={terminal.offset.x} cy={terminal.offset.y} r={4} fill={busbarConnectedTerminalIds.has(`${instance.symbol.id}:${terminal.id}`) ? 'var(--md2-live)' : connected ? 'var(--md2-selected)' : 'var(--md2-canvas-bg)'} stroke='var(--md2-terminal)' strokeWidth={1.5} />;
            })}
            {doc.activeView==='single-line' && !hasAllPhases(instance.symbol.phaseApplicability) && <text x={16} y={-16} fontSize='12' fill='var(--md2-warning)'>*</text>}
            <title>{!hasAllPhases(instance.symbol.phaseApplicability) ? `* phase-specific device: ${instance.symbol.phaseApplicability.join(',')}` : 'all phases'}</title>
          </g>)}
          {doc.faults.filter((fault) => fault.active && fault.location).map((fault) => <g key={fault.id} transform={`translate(${fault.location!.x},${fault.location!.y})`}><path d='M -8 -8 L 8 8 M 8 -8 L -8 8' stroke='var(--md2-warning)' strokeWidth={3}/><text x={10} y={-8} fontSize='8'>{fault.label ?? fault.type}</text></g>)}
          {doc.objects.labels.map((item) => <text key={item.id} x={item.position.x} y={item.position.y} fontSize='11' fontWeight={700} fill='var(--md2-text)'>{item.text}</text>)}
          {doc.objects.annotations.map((item) => <text key={item.id} x={item.position.x} y={item.position.y} fontSize='10' fill='var(--md2-muted-text)'>{item.text}</text>)}
          {overlayMode === 'protection' && doc.relays.flatMap((relay) => {
            const targets = [
              ...(relay.inputs ?? []).map((input) => input.sourceObjectId).filter(Boolean) as string[],
              ...(relay.outputActions ?? []).map((action) => action.targetObjectId).filter(Boolean) as string[],
              ...(relay.tripTargetBreakerIds ?? [])
            ];
            return [...new Set(targets)].map((objectId, index) => {
              const symbol = doc.objects.symbols.find((item) => item.id === objectId);
              if (!symbol) return null;
              const color = relay.state === 'tripped' ? 'var(--md2-warning)' : relay.state === 'picked-up' ? 'var(--md2-selected)' : relay.enabled ? 'var(--md2-live)' : 'var(--md2-muted-text)';
              return <g key={`${relay.id}-${objectId}-${index}`} transform={`translate(${symbol.position.x + 24},${symbol.position.y - 26 - index * 12})`}><rect x={-18} y={-8} width={36} height={14} rx={3} fill='var(--md2-panel-bg)' stroke={color} strokeWidth={1.5}/><text x={0} y={3} textAnchor='middle' fontSize='7' fill={color}>{relay.name.slice(0, 6)}</text></g>;
            });
          })}
          {showTopologyOverlay && topology.branches.map((branch) => { const from = topology.nodes.find((node)=>node.id===branch.fromNodeId); const to = topology.nodes.find((node)=>node.id===branch.toNodeId); if(!from||!to) return null; const symbol = branch.objectId ? doc.objects.symbols.find((item) => item.id === branch.objectId) : undefined; const open = branch.kind === 'device-internal' && isSwitchingDevice(symbol?.type as ElectricalSymbol['type']) && symbol?.operation?.switchState !== 'closed'; return <line key={`dbg-${branch.id}`} x1={from.position.x} y1={from.position.y} x2={to.position.x} y2={to.position.y} stroke={topologyBranchStroke(branch.id)} strokeWidth={branch.kind === 'device-internal' ? 2 : 1} opacity={open ? 0.35 : 0.9} strokeDasharray={open ? '2 5' : branch.kind === 'device-internal' ? '5 3' : '3 3'} />; })}
          {showTopologyOverlay && topology.nodes.map((node) => <g key={`node-${node.id}`}><circle cx={node.position.x} cy={node.position.y} r={4} fill={operateState.faultNodeIds.has(node.id) ? 'var(--md2-warning)' : operateState.earthedNodeIds.has(node.id) ? 'var(--md2-earth)' : operateState.liveNodeIds.has(node.id) ? 'var(--md2-live)' : node.junction ? 'var(--md2-warning)' : 'var(--md2-selected)'} /><text x={node.position.x+6} y={node.position.y-6} fontSize='7'>{node.id}</text></g>)}
          {showTopologyOverlay && topology.terminals.filter((terminal)=>!terminal.connectedNodeIds.length).map((terminal)=> <circle key={`floating-${terminal.id}`} cx={terminal.worldPosition.x} cy={terminal.worldPosition.y} r={5} fill='none' stroke='var(--md2-warning)' strokeWidth={2} />)}
          {ghostPath.length > 0 && <polyline points={ghostPath.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke={conductorToolKind === 'busbar' ? 'var(--md2-busbar)' : 'var(--md2-cable)'} strokeDasharray={conductorToolKind === 'busbar' || conductorToolKind === 'overhead-line' ? undefined : '18 10'} strokeWidth={conductorToolKind === 'busbar' ? 7 : 3} opacity={0.58} strokeLinecap={conductorToolKind === 'busbar' ? 'square' : 'round'} />}
          {selectedBoxRect && <rect x={selectedBoxRect.x1} y={selectedBoxRect.y1} width={selectedBoxRect.x2 - selectedBoxRect.x1} height={selectedBoxRect.y2 - selectedBoxRect.y1} fill='var(--md2-selected-fill)' stroke='var(--md2-selected)' strokeDasharray='4 3' />}
        </g>
      </svg>}
      {!scenarioSelectorOnly && <div className='mimic-v2-camera-controls' aria-label='Canvas camera controls'>
        <button className='mimic-v2-camera-btn' title='Zoom out' onClick={() => zoomFromCanvasCenter(0.9)}>-</button>
        <button className='mimic-v2-camera-readout' title='Canvas zoom' onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}>{Math.round(scale * 100)}%</button>
        <button className='mimic-v2-camera-btn' title='Zoom in' onClick={() => zoomFromCanvasCenter(1.1)}>+</button>
      </div>}
      {focusedOperateMode && <div className='mimic-v2-lesson-callout'>
        <strong>{activeTeachingStep?.title ?? activeScenarioPackage?.title ?? 'Operations mode'}</strong>
        <p>{activeTeachingStep?.body ?? scenarioMessage}</p>
        <div className='mimic-v2-voltage-row'>
          <button className='mimic-v2-chip' onClick={showNextScenarioHint}>Hint</button>
          <button className='mimic-v2-chip' onClick={evaluateActiveScenario}>Check</button>
          <button className='mimic-v2-chip' onClick={() => activeScenarioPackage && startActiveScenario(activeScenarioPackage)}>Restart</button>
        </div>
        {(selectedObject || selectedPath) && <div className='mimic-v2-scenario-inspection'>
          <strong>{selectedObject?.label?.text ?? selectedPath?.label?.text ?? selectedPath?.id}</strong>
          {selectedObject && <p>{selectedObject.type.toUpperCase()} / phases {selectedObject.phaseApplicability.join(', ')} / {selectedVoltageEstimate ?? 'n/a'}kV</p>}
          {selectedPath && <p>{selectedPath.type === 'busbar-segment' ? 'BUSBAR' : 'CONDUCTOR'} / phases {selectedPath.phaseApplicability.join(', ')} / {selectedPath.voltageLevelKv ?? 'n/a'}kV</p>}
          {selectedObject?.type === 'source' && <p>Source output: {formatPowerStatistic(selectedObject.powerFlow)}.</p>}
          {selectedObject?.type === 'ct' && <p>CT indication: primary {selectedDiagnostic?.aggregate.currentA?.toFixed(0) ?? '0'}A / secondary {((selectedDiagnostic?.aggregate.currentA ?? 0) / 1000).toFixed(2)}A / ratio 1000/1 / construction zero-flux core.</p>}
          {selectedObject?.type === 'vt' && <p>VT indication: {selectedFault ? '0.0kV primary, abnormal reference detected' : `${selectedObject.voltageLevelKv ?? selectedDiagnostic?.aggregate.voltageKv ?? 'n/a'}kV primary, 110V secondary`} / ratio {vtRatioText(selectedObject)} / construction capacitive VT.</p>}
          {selectedObject?.operation?.switchState && <p>Switch state: {selectedObject.operation.switchState}{selectedObject.operation.tripped ? ' / tripped' : ''}{selectedObject.operation.lockout ? ' / lockout' : ''}</p>}
          {selectedObject?.type === 'circuit-breaker' && selectedObject.operation?.lockout && <button className='mimic-v2-chip' onClick={resetSelectedBreakerTrip}>Reset trip lockout</button>}
          {selectedObject?.simulation?.arced && <p className='mimic-v2-warning-text'>Arc damage detected on this device.</p>}
          <button className='mimic-v2-chip' disabled={!markActionAllowed} onClick={markSelectedAsIdentified}>Mark as faulted</button>
        </div>}
      </div>}
      {mode === 'operate' && <section className='mimic-v2-event-log' aria-label='Operational event log'>
        <header>
          <strong>Event Log</strong>
          <select value={eventLogFilter} onChange={(event) => setEventLogFilter(event.target.value as ScenarioEventSeverity | 'all')} title='Filter event log'>
            <option value='all'>All</option>
            <option value='operation'>Operation</option>
            <option value='warning'>Warning</option>
            <option value='protection'>Protection</option>
            <option value='alarm'>Alarm</option>
            <option value='fault'>Fault</option>
            <option value='scenario'>Scenario</option>
            <option value='info'>Info</option>
          </select>
        </header>
        <div className='mimic-v2-event-log-list'>
          {filteredOperationEvents.length ? filteredOperationEvents.map(({ event, severity }) => <button key={event.id} className={`mimic-v2-event-row ${severity}`} onClick={() => event.targetObjectId && setSelected([event.targetObjectId])}>
            <span>{eventTime(event.timestamp)}</span>
            <b>{severity}</b>
            <em>{event.source ?? event.targetObjectId ?? 'system'}</em>
            <span>{learningVisibility.showEventLogDetails ? event.message : eventExplanation(event.message, severity, learningTier)}</span>
          </button>) : <p>No events yet.</p>}
        </div>
      </section>}
      </div>
    </main>
    {!focusedOperateMode && <aside className='mimic-v2-inspector'>
      <h3>{managerView === 'scenario' ? 'Scenario Manager' : 'Inspector'}</h3>
      <p>{doc.name}{dirty ? ' *' : ''}</p>
      {migrationNotice && <p className='mimic-v2-warning-text'>{migrationNotice}</p>}
      {draftNotice && <p className='mimic-v2-warning-text'>{draftNotice} <button className='mimic-v2-chip' onClick={recoverDraft}>Recover</button></p>}
      <div className='mimic-v2-voltage-row inspector'>
        <button className='mimic-v2-chip' onClick={() => setLibraryOpen(true)}>Library</button>
        <button className='mimic-v2-chip' onClick={saveCurrentDrawing}>Save</button>
        <button className='mimic-v2-chip' onClick={saveCurrentDrawingAs}>Save as</button>
      </div>
      <div className='mimic-v2-voltage-row inspector'>
        <button className={`mimic-v2-chip ${managerView === 'inspector' ? 'active' : ''}`} onClick={() => setManagerView('inspector')}>Inspector</button>
        {learningVisibility.showPowerFlow && <button className='mimic-v2-chip' onClick={openPowerFlowModal}>Power flow...</button>}
        {learningVisibility.showProtectionManager && <button className='mimic-v2-chip' onClick={openProtectionModal}>Protection...</button>}
        <button className={`mimic-v2-chip ${managerView === 'scenario' ? 'active' : ''}`} onClick={() => setManagerView('scenario')}>Scenarios</button>
      </div>
      {managerView === 'scenario' && <section className='mimic-v2-manager-panel'>
        <h4>{learningTier} Mode</h4>
        <p>{learningTiers[learningTier].explanationStyle}</p>
        <p>{explain('power-flow', learningTier)}</p>
        <details className='mimic-v2-guidance-box'>
          <summary>Learn more</summary>
          {learnMore('power-flow', learningTier).map((item) => <p key={item.tier}><strong>{item.tier}:</strong> {item.text}</p>)}
        </details>
      </section>}
      {false && <section className='mimic-v2-manager-panel'>
        <h4>Inputs</h4>
        {doc.objects.symbols.filter((symbol) => symbol.type === 'source').map((source) => {
          const flow = source.powerFlow;
          return <div key={source.id} className='mimic-v2-manager-card'>
            <strong>{source.label?.text ?? source.id}</strong>
            <label>MW <input type='number' value={flow?.mw ?? ''} onChange={(event)=>updateSourcePowerFlow(source.id, { mw: Number(event.target.value) || undefined })} /></label>
            <label>MVAR <input type='number' value={flow?.mvar ?? ''} onChange={(event)=>updateSourcePowerFlow(source.id, { mvar: Number(event.target.value) || undefined })} /></label>
            <label>Voltage kV <input type='number' value={flow?.voltageKv ?? source.voltageLevelKv ?? ''} onChange={(event)=>updateSourcePowerFlow(source.id, { voltageKv: Number(event.target.value) || undefined })} /></label>
            <label>Direction <select value={flow?.direction ?? 'forward'} onChange={(event)=>updateSourcePowerFlow(source.id, { direction: event.target.value as PowerFlowMetadata['direction'] })}><option value='forward'>forward</option><option value='reverse'>reverse</option><option value='bidirectional'>bidirectional</option><option value='unknown'>unknown</option></select></label>
            <p>{source.operation?.sourceOn === false ? 'Offline' : 'Online'} / MVA {flow?.mva?.toFixed(2) ?? 'n/a'} / PF {flow?.powerFactor?.toFixed(3) ?? 'n/a'}</p>
          </div>;
        })}
        {!doc.objects.symbols.some((symbol) => symbol.type === 'source') && <p>No source inputs in this drawing.</p>}
        <h4>Outputs</h4>
        {[...simulationState.objectSummaries.values()].map((summary) => {
          const symbol = doc.objects.symbols.find((item) => item.id === summary.objectId);
          const path = doc.objects.conductors.find((item) => item.id === summary.objectId) ?? doc.objects.busbars.find((item) => item.id === summary.objectId);
          return <p key={summary.objectId}>{symbol?.label?.text ?? path?.id ?? summary.objectId}: {summary.aggregate.mw?.toFixed(1) ?? 'n/a'}MW / {summary.aggregate.currentA?.toFixed(0) ?? 'n/a'}A / {summary.thermalState}</p>;
        })}
        {!simulationState.objectSummaries.size && <p>No derived flow yet. Add source MW/MVAR and close a path through the topology.</p>}
      </section>}
      {false && <section className='mimic-v2-manager-panel'>
        <div className='mimic-v2-voltage-row inspector'>
          <button className='mimic-v2-chip' onClick={createZoneFromSelection}>Zone from selection</button>
          <button className='mimic-v2-chip' onClick={() => createRelayForFirstZone('overcurrent')}>Add OC relay</button>
          <button className='mimic-v2-chip' onClick={() => createRelayForFirstZone('earth-fault')}>Add EF relay</button>
        </div>
        <h4>Zones</h4>
        {doc.protectionZones.map((zone) => <div key={zone.id} className='mimic-v2-manager-card'>
          <strong>{zone.name}</strong>
          <p>{zone.assignedObjectIds.length} objects / CT {zone.ctInputIds.join(', ') || 'none'} / VT {zone.vtInputIds.join(', ') || 'none'}</p>
          <button className='mimic-v2-chip' onClick={() => toggleZoneVisible(zone.id)}>{zone.visible ? 'Hide' : 'Show'}</button>
          <button className='mimic-v2-chip danger' onClick={() => removeZone(zone.id)}>Remove</button>
        </div>)}
        {!doc.protectionZones.length && <p>No protection zones yet.</p>}
        <h4>Relays</h4>
        {doc.relays.map((relay) => <div key={relay.id} className='mimic-v2-manager-card'>
          <strong>{relay.name}</strong>
          <p>{relay.type} / {relay.state} / zone {relay.zoneId ?? 'all'} / trip {relay.tripTargetBreakerIds.join(', ') || 'none'} / backup {relay.backupTripTargetBreakerIds.join(', ') || 'none'}</p>
          <button className='mimic-v2-chip' onClick={() => toggleRelayEnabled(relay.id)}>{relay.enabled ? 'Disable' : 'Enable'}</button>
          <button className='mimic-v2-chip danger' onClick={() => removeRelay(relay.id)}>Remove</button>
        </div>)}
        {!doc.relays.length && <p>No relays configured.</p>}
      </section>}
      {managerView === 'scenario' && <section className='mimic-v2-manager-panel'>
        <div className='mimic-v2-voltage-row inspector'>
          <button className='mimic-v2-chip' onClick={saveCurrentAsScenario}>Convert current drawing</button>
          <button className='mimic-v2-chip' onClick={() => activeScenarioPackage && openScenarioLaunch(activeScenarioPackage)}>Launch</button>
          <button className='mimic-v2-chip' onClick={resetActiveScenario}>Reset</button>
          <button className='mimic-v2-chip' onClick={tickActiveScenario}>Step event</button>
          <button className='mimic-v2-chip' onClick={showNextScenarioHint}>Hint</button>
          <button className='mimic-v2-chip' onClick={evaluateActiveScenario}>Check</button>
          <button className='mimic-v2-chip' onClick={() => { setChallengeProgress(loadChallengeProgress()); setScenarioCatalogueOpen(true); }}>Scenario list</button>
          <button className='mimic-v2-chip' onClick={renameActiveScenario}>Rename</button>
          <button className='mimic-v2-chip' onClick={editActiveScenarioMetadata}>Edit metadata</button>
          <button className='mimic-v2-chip' onClick={addScenarioObjective}>Add objective</button>
          <button className='mimic-v2-chip' onClick={addScenarioEvent}>Add event</button>
        </div>
        <p>{scenarioMessage}</p>
        {activeScenarioPackage && <>
          <h4>Active Scenario</h4>
          <p>{activeScenarioPackage.title} / {activeScenarioPackage.difficulty}</p>
          <p>{activeScenarioPackage.description}</p>
          <h4>Objectives</h4>
          {activeScenarioPackage.scenario.objectives.map((objective) => <p key={objective.id}>{objective.completed ? 'Done' : objective.failed ? 'Failed' : 'Open'}: {objective.text}</p>)}
          <h4>Events</h4>
          {(activeScenarioPackage.scenario.events ?? []).map((event) => <p key={event.id}>{event.fired ? 'Fired' : 'Pending'} {event.atMs}ms: {event.message ?? event.type}</p>)}
          <h4>Expected Solution</h4>
          {(activeScenarioPackage.scenario.expectedSolution ?? []).map((step) => <p key={step.id}>{step.atMs}ms {step.message}</p>)}
          <h4>Replay Log</h4>
          {(activeScenarioPackage.scenario.replayLog ?? []).slice(-6).map((step) => <p key={step.id}>{step.atMs}ms {step.action}: {step.message}</p>)}
        </>}
        <h4>Saved Scenarios</h4>
        {scenarioPackages.map((pkg) => <div key={pkg.id} className='mimic-v2-manager-card'>
          <strong>{pkg.title}</strong>
          <p>{pkg.description || 'No description'} / {pkg.difficulty} / {pkg.tags.join(', ') || 'no tags'}</p>
          <button className='mimic-v2-chip' onClick={() => loadScenarioPackageIntoEditor(pkg)}>Load</button>
          <button className='mimic-v2-chip' onClick={() => openScenarioLaunch(pkg)}>Launch</button>
          <button className='mimic-v2-chip' onClick={() => duplicateScenarioPackageById(pkg.id)}>Duplicate</button>
          <button className='mimic-v2-chip danger' onClick={() => deleteScenarioById(pkg.id)}>Delete</button>
        </div>)}
        {!scenarioPackages.length && <p>No saved scenarios yet.</p>}
        {scenarioSections.filter((section) => section.packages.length).map((section) => <div key={section.title}>
          <h4>{section.title}</h4>
          {section.packages.map((pkg) => <div key={`${section.title}-${pkg.id}`} className='mimic-v2-manager-card'>
            <strong>{pkg.title}</strong>
            <p>{pkg.description} / {pkg.difficulty} / {tierBadgeForScenario(pkg.scenario)} / {pkg.scenario.briefing?.estimatedMinutes ? `${pkg.scenario.briefing.estimatedMinutes} min / ` : ''}{pkg.tags.join(', ')}</p>
            <button className='mimic-v2-chip' onClick={() => loadScenarioPackageIntoEditor(pkg)}>Load copy</button>
            <button className='mimic-v2-chip' onClick={() => openScenarioLaunch(pkg)}>Launch</button>
            <button className='mimic-v2-chip' onClick={() => duplicateScenarioPackageById(pkg.id)}>Duplicate editable</button>
          </div>)}
        </div>)}
      </section>}
      <p>Selected: {selected.join(', ') || 'none'}</p>
      <p>Editing: {selectedPhase ? `phase ${selectedPhase}` : doc.activeView === 'three-phase' ? 'whole object / all phases' : 'single-line aggregate (applies to all phases)'}</p>
      {selectedObject && <>
        {inspectorEditingDisabled && <p className='mimic-v2-warning-text'>Inspector editing is disabled for this operation exercise.</p>}
        <label>Label <input disabled={inspectorEditingDisabled} value={selectedObject.label?.text ?? ''} onChange={(event)=>setDoc((prev)=>({ ...prev, objects:{ ...prev.objects, symbols: prev.objects.symbols.map((symbol)=>symbol.id===selectedObject.id?{...symbol,label:{text:event.target.value,autoGenerated:false,manualOverride:true}}:symbol)}}))} /></label>
        <label>Voltage kV <input disabled={inspectorEditingDisabled} type='number' value={selectedObject.voltageLevelKv ?? ''} onChange={(event)=>setSelectedVoltageOnObject(Number(event.target.value)||selectedVoltage)} /></label>
        <div className='mimic-v2-voltage-row inspector'>
          {standardVoltages.map((voltage) => <button key={voltage} disabled={inspectorEditingDisabled} className={`mimic-v2-chip ${selectedObject.voltageLevelKv === voltage ? 'active' : ''}`} onClick={() => setSelectedVoltageOnObject(voltage)}>{voltage}</button>)}
        </div>
        {selectedObject.type === 'ct' && <button className='mimic-v2-btn' disabled={inspectorEditingDisabled} onClick={toggleCtPolarity}>Swap CT P1/P2</button>}
        {selectedObject.type === 'source' && <p>Source output: {formatPowerStatistic(selectedObject.powerFlow)}.</p>}
        {selectedObject.type === 'ct' && <p>CT construction: zero-flux core. Ratio: 1000/1. Primary {selectedSummary?.aggregate.currentA?.toFixed(0) ?? '0'}A / secondary {((selectedSummary?.aggregate.currentA ?? 0) / 1000).toFixed(2)}A.</p>}
        {selectedObject.type === 'vt' && <p>VT construction: capacitive VT. Ratio: {vtRatioText(selectedObject)}. Primary {selectedObject.voltageLevelKv ?? selectedSummary?.aggregate.voltageKv ?? 'n/a'}kV / secondary 110V.</p>}
        {selectedObject.type === 'transformer' && <button className='mimic-v2-btn' disabled={inspectorEditingDisabled} onClick={toggleTransformerPolarity}>Swap TX HV/LV</button>}
        {selectedObject.type === 'transformer' && <button className='mimic-v2-btn' disabled={inspectorEditingDisabled} onClick={toggleTransformerTertiary}>{selectedObject.engineering?.hasTertiary ? 'Remove tertiary' : 'Add tertiary'}</button>}
        {selectedObject.type === 'transformer' && <button className='mimic-v2-btn' disabled={inspectorEditingDisabled} onClick={toggleTransformerExpansion}>{selectedObject.engineering?.transformerExpansion === 'three-phase-expanded' ? 'Single schematic symbol' : 'Three-phase expanded'}</button>}
        {selectedObject.type === 'transformer' && selectedObject.engineering?.hasTertiary && <label>Tertiary voltage kV <input type='number' value={selectedObject.engineering?.tertiaryVoltageKv ?? ''} onChange={(event)=>setTransformerTertiaryVoltage(Number(event.target.value)||selectedVoltage)} /></label>}
        {selectedObject.type === 'transformer' && selectedObject.engineering?.hasTertiary && <div className='mimic-v2-voltage-row inspector'>
          {standardVoltages.map((voltage) => <button key={voltage} className={`mimic-v2-chip ${selectedObject.engineering?.tertiaryVoltageKv === voltage ? 'active' : ''}`} onClick={() => setTransformerTertiaryVoltage(voltage)}>{voltage}</button>)}
        </div>}
        <p>{!hasAllPhases(selectedObject.phaseApplicability) ? `* phase-specific device in single-line view (${selectedObject.phaseApplicability.join(',')})` : 'Device applies to all phases.'}</p>
        {selectedObject.type === 'circuit-breaker' && selectedObject.operation?.lockout && <button className='mimic-v2-btn' onClick={resetSelectedBreakerTrip}>Reset trip lockout</button>}
      </>}
      {(selectedObject || selectedPath) && <>
        <h4>Phases</h4>
        <div className='mimic-v2-voltage-row inspector'>
          {[
            ['ABC', ['A','B','C']],
            ['A', ['A']],
            ['B', ['B']],
            ['C', ['C']],
            ['AB', ['A','B']],
            ['BC', ['B','C']],
            ['CA', ['C','A']]
          ].map(([label, phases]) => <button key={label as string} className={`mimic-v2-chip ${(selectedPhases ?? []).join('') === (phases as Phase[]).join('') ? 'active' : ''}`} onClick={() => setSelectedPhases(phases as Phase[])}>{label as string}</button>)}
        </div>
        <h4>Power Flow</h4>
        <p>Input {selectedPowerFlow?.mw ?? 'n/a'}MW / {selectedPowerFlow?.mvar ?? 'n/a'}MVAR. Derived {selectedSummary?.aggregate.mw?.toFixed(1) ?? 'n/a'}MW / {selectedSummary?.aggregate.currentA?.toFixed(0) ?? 'n/a'}A.</p>
        <button className='mimic-v2-btn' onClick={openPowerFlowModal}>Edit Power Flow...</button>
      </>}
      <h4>Simulation</h4>
      <div className='mimic-v2-voltage-row inspector'>
        <button className='mimic-v2-chip' onClick={() => setDoc((prev)=>({ ...prev, simulationState: { ...prev.simulationState, running: !prev.simulationState.running } }))}>{doc.simulationState.running ? 'Pause' : 'Run'}</button>
        <button className='mimic-v2-chip' onClick={() => setDoc((prev)=> {
          const relayStepped = applyRelayProtectionStep(prev, simulationState).doc;
          return migrateDrawingDocument({ ...applyProtectionStep(relayStepped, simulationState), simulationState: { ...prev.simulationState, lastRecomputedAt: new Date().toISOString() } })!;
        })}>Step</button>
        <button className='mimic-v2-chip' onClick={() => setDoc((prev)=>({ ...prev, faults: prev.faults.map((fault)=>fault.persistent ? fault : { ...fault, active: false }), simulationState: { ...prev.simulationState, running: false } }))}>Reset</button>
      </div>
      <p>{simulationState.approximationLabel}</p>
      {overlayMode === 'thermal' && <p>Thermal legend: green normal, amber warm, red hot, dark red critical.</p>}
      {learningVisibility.showProtectionManager && <>
        <h4>Protection</h4>
        <p>{doc.relays.length} relays / {doc.protectionZones.length} zones. {doc.relays.filter((relay) => relay.state === 'picked-up' || relay.state === 'tripped').length} active.</p>
        <button className='mimic-v2-btn' onClick={openProtectionModal}>Edit Protection...</button>
      </>}
      <h4>Faults</h4>
      <button className='mimic-v2-btn' onClick={() => setTool('fault')}>View Faults...</button>
      {doc.scenarios.length > 0 && <>
        <h4>Scenarios</h4>
        {doc.scenarios.map((scenario) => <button key={scenario.id} className='mimic-v2-btn' onClick={() => setDoc((prev) => migrateDrawingDocument(loadScenario(prev, scenario.id))!)}>{scenario.name}</button>)}
      </>}
      {doc.faults.some((fault) => fault.active) && <>
        <h4>Faults</h4>
        {doc.faults.filter((fault) => fault.active).map((fault) => <p key={fault.id}>{fault.label ?? fault.type} on {fault.targetObjectId ?? fault.targetTopologyBranchId ?? fault.targetTopologyNodeId} <button className='mimic-v2-chip' onClick={() => setDoc(clearFault(doc, fault.id))}>clear</button></p>)}
      </>}
      {learningVisibility.showDebug && <>
        <h4>Debug</h4>
        <p>Selected IDs: {selected.join(', ') || 'none'}</p>
        <p>Warnings: {topology.warnings.length}</p>
        {topology.warnings.slice(0, 5).map((warning)=><p key={warning.id}>[{warning.code}] {warning.message}</p>)}
        <p>Schema: {doc.schemaVersion}</p>
        <p>Mode: {mode}</p><p>View: {doc.activeView}</p><p>Tool: {tool}</p><p>Display: {renderMode}</p>
        <p>Objects: {doc.objects.symbols.length + doc.objects.conductors.length + doc.objects.busbars.length}</p>
        <p>Topology: {topology.nodes.length} nodes / {topology.branches.length} branches / {topology.devices.length} devices</p>
        <p>Live branches: {[...operateState.liveBranchIds].join(', ') || 'none'}</p>
        <p>Earthed branches: {[...operateState.earthedBranchIds].join(', ') || 'none'}</p>
        <p>Fault branches: {[...operateState.faultBranchIds].join(', ') || 'none'}</p>
      </>}
      <p>Last operation: {lastOperationReason}</p>
      <h4>Event log</h4>
      {doc.operationEvents.slice(-5).map((event) => <p key={event.id}>{event.message}</p>)}
    </aside>}
    {scenarioMenuOpen && <div className='mimic-v2-modal-backdrop' onMouseDown={() => setScenarioMenuOpen(false)}>
      <div className='mimic-v2-launch-modal mimic-v2-scenario-menu' onMouseDown={(event) => event.stopPropagation()}>
        <header className='mimic-v2-library-header'>
          <div>
            <h2>Scenario menu</h2>
            <p>{activeScenarioPackage?.title ?? 'No scenario running'}</p>
          </div>
        </header>
        <label className='mimic-v2-scenario-menu-setting'>
          Naming scheme
          <select value={resolveLabelScheme(doc)} onChange={(event) => applyLabelScheme(event.target.value as LabelScheme)}>
            {LABEL_SCHEMES.filter((scheme) => scheme.available).map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.label}</option>)}
          </select>
        </label>
        <div className='mimic-v2-scenario-menu-actions'>
          <button className='mimic-v2-btn active' onClick={returnToScenarioSelector}>Return to scenario selector</button>
          <button className='mimic-v2-btn' onClick={() => setTheme((t) => t === 'light' ? 'dark' : 'light')}>Change theme colours</button>
          <button className='mimic-v2-btn' onClick={() => setScenarioMenuOpen(false)}>Return to scenario</button>
        </div>
      </div>
    </div>}
    {scenarioOutcome && <div className='mimic-v2-modal-backdrop' onMouseDown={() => setScenarioOutcome(null)}>
      <div className='mimic-v2-launch-modal' onMouseDown={(event) => event.stopPropagation()}>
        <header className='mimic-v2-library-header'>
          <div>
            <h2>{scenarioOutcome.title}</h2>
            <p>{activeScenarioPackage?.title ?? 'Scenario'}</p>
          </div>
        </header>
        <div className='mimic-v2-launch-grid'>
          <section>
            <h3>{scenarioOutcome.status === 'success' ? 'Score' : 'What went wrong'}</h3>
            <p>{scenarioOutcome.message}</p>
            {scenarioOutcome.status === 'success' && <p>{scenarioOutcome.score ?? 0} points / {scenarioOutcome.stars ?? 0} stars</p>}
          </section>
        </div>
        <footer className='mimic-v2-launch-actions'>
          {scenarioOutcome.status === 'failed' && <button className='mimic-v2-btn' onClick={() => { setScenarioOutcome(null); activeScenarioPackage && startActiveScenario(activeScenarioPackage); }}>Restart</button>}
          {scenarioOutcome.status === 'success' && nextScenarioPackage && nextScenarioPackage.id !== activeScenarioPackage?.id && <button className='mimic-v2-btn active' onClick={() => { setScenarioOutcome(null); startActiveScenario(nextScenarioPackage); }}>Next scenario</button>}
          <button className='mimic-v2-btn active' onClick={returnToScenarioSelector}>Return to scenario selector</button>
          <button className='mimic-v2-btn' onClick={() => setScenarioOutcome(null)}>{scenarioOutcome.status === 'success' ? 'View completed scenario' : 'Return to scenario'}</button>
        </footer>
      </div>
    </div>}
    {scenarioCatalogueOpen && <div className='mimic-v2-modal-backdrop' onMouseDown={() => { if (!scenarioSelectorOnly) setScenarioCatalogueOpen(false); }}>
      <div className='mimic-v2-library-modal mimic-v2-scenario-catalogue' onMouseDown={(event) => event.stopPropagation()}>
        <header className='mimic-v2-library-header'>
          <div>
            <h2>Lessons & Challenges</h2>
            <p>Select a learner level to show suitable operational exercises.</p>
          </div>
          <button className='mimic-v2-btn' onClick={() => onRequestMenu ? onRequestMenu() : setScenarioCatalogueOpen(false)}>Exit</button>
        </header>
        <div className='mimic-v2-catalogue-toolbar'>
          <label>Level <select value={learningTier} onChange={(event) => setLearningTier(event.target.value as LearningTier)}>{learningTierOrder.map((tier) => <option key={tier} value={tier}>{tier}</option>)}</select></label>
          <button className='mimic-v2-chip' onClick={() => setChallengeProgress(loadChallengeProgress())}>Refresh scores</button>
          <span>{allVisibleScenarioPackages.length} available</span>
        </div>
        {scenarioSections.filter((section) => section.packages.length).map((section) => <section key={section.title} className='mimic-v2-catalogue-section'>
          <h3>{section.title}</h3>
          <div className='mimic-v2-library-grid'>
            {section.packages.map((pkg) => {
              const progress = challengeProgress[pkg.id];
              const adapted = adaptScenarioForTier(pkg.scenario, learningTier);
              return <article key={`${section.title}-${pkg.id}`} className='mimic-v2-library-card'>
                <h3>{pkg.title}</h3>
                <p>{pkg.description}</p>
                <p>{pkg.scenario.mode ?? 'lesson'} / {pkg.difficulty} / {tierBadgeForScenario(pkg.scenario)}</p>
                {pkg.scenario.mode === 'challenge' && <p className='mimic-v2-score-line'>{progress?.completed ? 'Completed' : 'Not complete'} {progress?.stars ? `${'★'.repeat(progress.stars)}${'☆'.repeat(Math.max(0, 3 - progress.stars))}` : '☆☆☆'}</p>}
                <p>{adapted.objectives[0]?.text ?? adapted.learningObjectives?.[0] ?? 'Operational exercise'}</p>
                <div className='mimic-v2-library-actions'>
                  <button className='mimic-v2-chip' onClick={() => openScenarioLaunch(pkg)}>Open</button>
                  <button className='mimic-v2-chip' onClick={() => duplicateScenarioPackageById(pkg.id)}>Duplicate editable</button>
                </div>
              </article>;
            })}
          </div>
        </section>)}
        {!allVisibleScenarioPackages.length && <p>No scenarios are available at this level yet. Try the level above or below.</p>}
      </div>
    </div>}
    {scenarioLaunchPackage && launchScenario && <div className='mimic-v2-modal-backdrop' onMouseDown={() => setScenarioLaunchPackage(null)}>
      <div className='mimic-v2-launch-modal' onMouseDown={(event) => event.stopPropagation()}>
        <header className='mimic-v2-library-header'>
          <div>
            <h2>{scenarioLaunchPackage.title}</h2>
            <p>{launchScenario.mode ?? 'lesson'} / {scenarioLaunchPackage.difficulty} / {launchScenario.briefing?.estimatedMinutes ? `${launchScenario.briefing.estimatedMinutes} min` : 'untimed'} / {learningTier}</p>
          </div>
          <button className='mimic-v2-btn' onClick={() => setScenarioLaunchPackage(null)}>Exit to scenario list</button>
        </header>
        <div className='mimic-v2-launch-grid'>
          <section>
            <h3>Description</h3>
            <p>{scenarioLaunchPackage.description || 'No description provided.'}</p>
            <h3>Learning Objectives</h3>
            {(launchScenario.learningObjectives?.length ? launchScenario.learningObjectives : launchScenario.objectives.map((objective) => objective.text)).map((objective, index) => <p key={`${objective}-${index}`}>{objective}</p>)}
          </section>
          <section>
            <h3>Initial Network Condition</h3>
            <p>{launchScenario.briefing?.initialCondition ?? 'Scenario initial source, switch, fault, protection, and power-flow states are restored at start.'}</p>
            <h3>Operator Role</h3>
            <p>{launchScenario.briefing?.expectedOperatorRole ?? 'Control engineer / learner'}</p>
            <h3>Restrictions & Warnings</h3>
            {(launchScenario.briefing?.restrictions ?? ['Editing tools may be hidden during operational mode.']).map((item) => <p key={item}>{item}</p>)}
            {(launchScenario.briefing?.warnings ?? []).map((item) => <p key={item} className='mimic-v2-warning-text'>{item}</p>)}
          </section>
          <section>
            <h3>Win Conditions</h3>
            {(launchScenario.briefing?.winConditions ?? launchScenario.objectives.map((objective) => objective.text)).map((item) => <p key={item}>{item}</p>)}
          </section>
          <section>
            <h3>Lose Conditions</h3>
            {(launchScenario.briefing?.loseConditions ?? ['Live-earth conflict', 'Voltage segregation breach', 'Excessive incorrect operations']).map((item) => <p key={item}>{item}</p>)}
          </section>
        </div>
        <footer className='mimic-v2-launch-actions'>
          <button className='mimic-v2-btn active' onClick={() => startActiveScenario(scenarioLaunchPackage)}>Start</button>
          <button className='mimic-v2-btn' onClick={() => startActiveScenario(scenarioLaunchPackage, true)}>Practice mode</button>
          {activeScenarioPackage?.id === scenarioLaunchPackage.id && <button className='mimic-v2-btn' onClick={() => startActiveScenario(activeScenarioPackage)}>Restart</button>}
        </footer>
      </div>
    </div>}
    {modalView === 'power' && <div className='mimic-v2-modal-backdrop' onMouseDown={() => setModalView(null)}>
      <div className='mimic-v2-workflow-modal' onMouseDown={(event) => event.stopPropagation()}>
        <header className='mimic-v2-library-header'>
          <div>
            <h2>Power Flow</h2>
            <p>{powerFlowTarget ? `${powerFlowTarget.label} / ${powerFlowTarget.kind}` : 'Whole drawing network summary'}</p>
          </div>
          <button className='mimic-v2-btn' onClick={() => setModalView(null)}>Close</button>
        </header>
        <div className='mimic-v2-modal-tabs'>
          {(['inputs', 'phases', 'outputs', 'assumptions'] as PowerFlowTab[]).map((tab) => <button key={tab} className={`mimic-v2-chip ${powerFlowTab === tab ? 'active' : ''}`} onClick={() => setPowerFlowTab(tab)}>{tab}</button>)}
        </div>
        <section className='mimic-v2-flow-card-grid'>
          {sourceLoadFlowCards.map((symbol) => {
            const summary = simulationState.objectSummaries.get(symbol.id);
            return <article key={symbol.id} className={`mimic-v2-flow-card ${powerFlowCardClass(symbol.id)}`} onClick={() => setPowerFlowTargetId(symbol.id)}>
              <strong>{symbol.label?.text ?? symbol.id}</strong>
              <span>{symbol.type === 'source' ? 'Incomer' : 'Load'}</span>
              <p>{summary?.aggregate.mw?.toFixed(1) ?? symbol.powerFlow?.mw?.toFixed?.(1) ?? '0.0'}MW / {summary?.aggregate.currentA?.toFixed(0) ?? symbol.powerFlow?.currentA?.toFixed?.(0) ?? '0'}A</p>
              <p>Loading {summary?.aggregate.loadingPercent?.toFixed(0) ?? '0'}%</p>
              {symbol.type === 'source' ? <div className='mimic-v2-flow-card-inputs' onClick={(event) => event.stopPropagation()}>
                <label>MW<input type='number' value={symbol.powerFlow?.mw ?? ''} onChange={(event) => updatePowerFlowForObject(symbol.id, { mw: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
                <label>MVAR<input type='number' value={symbol.powerFlow?.mvar ?? ''} onChange={(event) => updatePowerFlowForObject(symbol.id, { mvar: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
              </div> : <div className='mimic-v2-flow-card-inputs' onClick={(event) => event.stopPropagation()}>
                <label>Limit A<input type='number' value={symbol.powerFlow?.currentA ?? ''} onChange={(event) => updatePowerFlowForObject(symbol.id, { currentA: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
                <label>R ohm<input type='number' value={symbol.powerFlow?.resistanceOhms ?? ''} onChange={(event) => updatePowerFlowForObject(symbol.id, { resistanceOhms: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
                <label>X ohm<input type='number' value={symbol.powerFlow?.reactanceOhms ?? ''} onChange={(event) => updatePowerFlowForObject(symbol.id, { reactanceOhms: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
              </div>}
            </article>;
          })}
          {!sourceLoadFlowCards.length && <p>No incomers or loads in this drawing yet.</p>}
        </section>
        <div className='mimic-v2-form-grid'>
          <label>Context {info('Choose the source, load, switchgear, busbar, or conductor whose inputs and branch results you want to inspect.')}<select value={powerFlowTarget?.id ?? ''} onChange={(event) => setPowerFlowTargetId(event.target.value)}>{allPowerFlowObjects.map((object) => <option key={object.id} value={object.id}>{object.label} / {object.kind}</option>)}</select></label>
          <label>Balanced {info('When enabled, aggregate edits are applied across phases. Turn this off before editing phase-specific values.')}<input type='checkbox' checked={balancedPowerFlow} onChange={(event) => setBalancedPowerFlow(event.target.checked)} /></label>
        </div>
        {powerFlowTarget && powerFlowTab === 'inputs' && <section className='mimic-v2-modal-section'>
          <h3>Inputs</h3>
          <div className='mimic-v2-form-grid'>
            <label>Voltage kV {info('Nominal voltage used to estimate current from MVA.')}<input type='number' value={powerFlowTarget.flow?.voltageKv ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { voltageKv: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
            <label>MW {info('Real power input. On sources this feeds the network; on branches and loads it is stored as engineering metadata.')}<input type='number' value={powerFlowTarget.flow?.mw ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { mw: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
            <label>MVAR {info('Reactive power input used with MW to calculate MVA and power factor.')}<input type='number' value={powerFlowTarget.flow?.mvar ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { mvar: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
            <label>MVA {info('Apparent power. If manually entered, it can override MW/MVAR derived MVA.')}<input type='number' value={powerFlowTarget.flow?.mva ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { mva: Number(event.target.value) || undefined, manualOverride: true }, undefined, balancedPowerFlow)} /></label>
            <label>Current / limit A {info('On a source this can set source current. On branch objects and loads it acts as a current limit for loading percentage.')}<input type='number' value={powerFlowTarget.flow?.currentA ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { currentA: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
            <label>Power factor {info('Calculated from MW/MVA unless manually entered for teaching notes.')}<input type='number' step='0.01' value={powerFlowTarget.flow?.powerFactor ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { powerFactor: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
            <label>R ohm {info('Resistance adds voltage drop and heating on this branch. Higher values reduce delivered voltage and power in the teaching approximation.')}<input type='number' value={powerFlowTarget.flow?.resistanceOhms ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { resistanceOhms: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
            <label>X ohm {info('Reactance contributes to branch impedance and voltage drop.')}<input type='number' value={powerFlowTarget.flow?.reactanceOhms ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { reactanceOhms: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
            <label>Z ohm {info('Direct impedance override. If set, it is used instead of R/X magnitude.')}<input type='number' value={powerFlowTarget.flow?.impedanceOhms ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { impedanceOhms: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
            <label>Rating limit % {info('Branch rating expressed as a percent of the default teaching base. Lower values make the same current show higher loading.')}<input type='number' value={powerFlowTarget.flow?.loadingPercent ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { loadingPercent: Number(event.target.value) || undefined }, undefined, balancedPowerFlow)} /></label>
            <label>Direction {info('Displayed flow direction metadata for teaching overlays.')}<select value={powerFlowTarget.flow?.direction ?? 'unknown'} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { direction: event.target.value as PowerFlowMetadata['direction'] }, undefined, balancedPowerFlow)}><option value='forward'>forward</option><option value='reverse'>reverse</option><option value='bidirectional'>bidirectional</option><option value='unknown'>unknown</option></select></label>
          </div>
        </section>}
        {powerFlowTarget && powerFlowTab === 'phases' && <section className='mimic-v2-modal-section'>
          <h3>Per-phase Values</h3>
          <div className='mimic-v2-voltage-row'>
            <button className='mimic-v2-chip' onClick={() => applyAggregateToAllPhases(powerFlowTarget.id)}>Apply aggregate equally</button>
            <button className='mimic-v2-chip' onClick={() => copyPhaseAToBC(powerFlowTarget.id)}>Copy phase A to B/C</button>
            <button className='mimic-v2-chip danger' onClick={() => resetPerPhaseOverrides(powerFlowTarget.id)}>Reset overrides</button>
          </div>
          <div className='mimic-v2-phase-grid'>
            {phasesAll.map((phase) => {
              const flow = powerFlowTarget.flow?.perPhase?.[phase] ?? {};
              return <div key={phase} className='mimic-v2-manager-card'>
                <strong>Phase {phase}</strong>
                <label>MW<input type='number' value={flow.mw ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { mw: Number(event.target.value) || undefined, manualOverride: true }, phase)} /></label>
                <label>MVAR<input type='number' value={flow.mvar ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { mvar: Number(event.target.value) || undefined, manualOverride: true }, phase)} /></label>
                <label>Current A<input type='number' value={flow.currentA ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { currentA: Number(event.target.value) || undefined, manualOverride: true }, phase)} /></label>
                <label>Voltage kV<input type='number' value={flow.voltageKv ?? ''} onChange={(event) => updatePowerFlowForObject(powerFlowTarget.id, { voltageKv: Number(event.target.value) || undefined, manualOverride: true }, phase)} /></label>
                <p>{flow.manualOverride ? 'Manual phase override' : 'Calculated from aggregate unless edited'}</p>
              </div>;
            })}
          </div>
        </section>}
        {powerFlowTab === 'outputs' && <section className='mimic-v2-modal-section'>
          <h3>Outputs/results</h3>
          {powerFlowTargetSummary ? <div className='mimic-v2-library-grid'>
            {phasesAll.map((phase) => {
              const flow = powerFlowTargetSummary.phases[phase];
              return <div key={phase} className='mimic-v2-manager-card'><strong>Phase {phase}</strong><p>MW {flow?.mw?.toFixed(2) ?? 'n/a'} / MVA {flow?.mva?.toFixed(2) ?? 'n/a'} / A {flow?.currentA?.toFixed(0) ?? 'n/a'}</p><p>PF {flow?.powerFactor?.toFixed(3) ?? 'n/a'} / drop {flow?.voltageDropKv?.toFixed(3) ?? 'n/a'}kV / loading {flow?.loadingPercent?.toFixed(0) ?? 'n/a'}%</p><p>{flow?.thermalState ?? 'normal'}</p></div>;
            })}
            <div className='mimic-v2-manager-card'><strong>Status</strong><p>{powerFlowTargetSummary.imbalance ? 'Phase imbalance detected' : 'No material imbalance detected'}</p><p>Thermal {powerFlowTargetSummary.thermalState}</p><p>Live {operateState.liveBranchIds.size} / earthed {operateState.earthedBranchIds.size} / faulted {operateState.faultBranchIds.size}</p></div>
          </div> : <p>No derived flow for this object yet. Check source values and closed topology.</p>}
        </section>}
        {powerFlowTab === 'assumptions' && <section className='mimic-v2-modal-section'>
          <h3>Assumptions/settings</h3>
          <p>{simulationState.approximationLabel}</p>
          <p>Single-line editing can apply aggregate values across phases. Three-phase mode keeps phase B edits isolated unless you use the explicit balancing buttons.</p>
          <p>Source power is shared across reachable loads as a teaching approximation, not an industrial load-flow calculation.</p>
        </section>}
      </div>
    </div>}
    {modalView === 'protection' && <div className='mimic-v2-modal-backdrop' onMouseDown={() => setModalView(null)}>
      <div className='mimic-v2-workflow-modal' onMouseDown={(event) => event.stopPropagation()}>
        <header className='mimic-v2-library-header'>
          <div>
            <h2>Protection Manager</h2>
            <p>Form-driven relay configuration for the current drawing.</p>
          </div>
          <button className='mimic-v2-btn' onClick={() => setModalView(null)}>Close</button>
        </header>
        <div className='mimic-v2-modal-tabs'>
          {(['relays', 'inputs', 'functions', 'outputs', 'events'] as ProtectionTab[]).map((tab) => <button key={tab} className={`mimic-v2-chip ${protectionTab === tab ? 'active' : ''}`} onClick={() => setProtectionTab(tab)}>{tab}</button>)}
        </div>
        <div className='mimic-v2-protection-layout'>
          <section>
            <div className='mimic-v2-voltage-row'><button className='mimic-v2-chip' onClick={addRelay}>Add relay</button>{selectedRelay && <button className='mimic-v2-chip' onClick={() => duplicateRelay(selectedRelay.id)}>Duplicate</button>}{selectedRelay && <button className='mimic-v2-chip danger' onClick={() => removeRelay(selectedRelay.id)}>Delete</button>}</div>
            {doc.relays.map((relay) => <button key={relay.id} className={`mimic-v2-relay-row ${selectedRelay?.id === relay.id ? 'active' : ''}`} onClick={() => setSelectedRelayId(relay.id)}><strong>{relay.name}</strong><span>{relay.role ?? 'first-main'} / {relay.state}</span></button>)}
            {!doc.relays.length && <p>No relays yet.</p>}
          </section>
          <section>
            {selectedRelay ? <>
              {protectionTab === 'relays' && <div className='mimic-v2-modal-section'>
                <h3>Relay</h3>
                <div className='mimic-v2-form-grid'>
                  <label>Name<input value={selectedRelay.name} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, name: event.target.value }))} /></label>
                  <label>Enabled<input type='checkbox' checked={selectedRelay.enabled} onChange={() => toggleRelayEnabled(selectedRelay.id)} /></label>
                  <label>Role {info('Role is descriptive for now. First main, second main, and backup relays can watch the same assets with different timings.')}<select value={selectedRelay.role ?? 'first-main'} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, role: event.target.value as RelayRole }))}><option value='first-main'>first main</option><option value='second-main'>second main</option><option value='backup'>backup</option><option value='busbar-protection'>busbar protection</option><option value='transformer-protection'>transformer protection</option><option value='feeder-protection'>feeder protection</option><option value='motor-load-protection'>motor/load protection</option></select></label>
                  <label>Protection scope {info('Optional drawing zone used to limit simple fault/current checks. Leave as whole network when the relay inputs already define what it measures.')}<select value={selectedRelay.zoneId ?? ''} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, zoneId: event.target.value || undefined }))}><option value=''>Whole network</option>{doc.protectionZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
                  <label>Breaker fail<input type='checkbox' checked={selectedRelay.breakerFailEnabled} onChange={() => updateRelay(selectedRelay.id, (relay) => ({ ...relay, breakerFailEnabled: !relay.breakerFailEnabled }))} /></label>
                </div>
                <details className='mimic-v2-guidance-box'>
                  <summary>Compatibility defaults</summary>
                  <p>These keep older relay packages working and seed new functions. Use the Functions tab for normal pickup and timing settings.</p>
                  <div className='mimic-v2-form-grid'>
                    <label>Default pickup A<input type='number' value={selectedRelay.pickupCurrentA} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, pickupCurrentA: Number(event.target.value) || 0 }))} /></label>
                    <label>Default delay ms<input type='number' value={selectedRelay.timeDelayMs} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, timeDelayMs: Number(event.target.value) || 0 }))} /></label>
                  </div>
                </details>
              </div>}
              {protectionTab === 'inputs' && <div className='mimic-v2-modal-section'>
                <h3>Measuring Inputs</h3>
                <div className='mimic-v2-voltage-row'><button className='mimic-v2-chip' onClick={() => addRelayInput(selectedRelay.id, 'ct', 'current')}>Add CT input</button><button className='mimic-v2-chip' onClick={() => addRelayInput(selectedRelay.id, 'vt', 'voltage')}>Add VT input</button></div>
                {(selectedRelay.inputs ?? []).map((input) => <div key={input.id} className='mimic-v2-manager-card'>
                  <div className='mimic-v2-form-grid'>
                    <label>Source {info('Pick the real drawing object that provides this relay measurement. The available quantities change to match the source type.')}<select value={input.sourceObjectId ?? input.sourceZoneId ?? ''} onChange={(event) => updateRelay(selectedRelay.id, (relay) => {
                      const source = selectableProtectionSources.find((item) => item.id === event.target.value);
                      return { ...relay, inputs: (relay.inputs ?? []).map((item) => item.id === input.id ? { ...item, sourceObjectId: event.target.value, sourceType: source?.sourceType ?? item.sourceType, sourceLabel: source?.label, quantity: normaliseQuantityForSource(source?.sourceType ?? item.sourceType, item.quantity) } : item) };
                    })}>{selectableProtectionSources.map((source) => <option key={source.id} value={source.id}>{source.label} / {source.sourceType}</option>)}</select></label>
                    <label>Quantity {info('CT inputs measure current quantities. VT/PT inputs measure voltage-type quantities. Thermal and power quantities appear on assets that can sensibly expose them.')}<select value={normaliseQuantityForSource(sourceTypeForInput(input), input.quantity)} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, inputs: (relay.inputs ?? []).map((item) => item.id === input.id ? { ...item, quantity: event.target.value as RelayMeasuredQuantity } : item) }))}>{quantitiesForSource(sourceTypeForInput(input)).map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}</select></label>
                    <label>CT ratio<input value={input.ctRatio ?? ''} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, inputs: (relay.inputs ?? []).map((item) => item.id === input.id ? { ...item, ctRatio: event.target.value } : item) }))} /></label>
                    <label>VT ratio<input value={input.vtRatio ?? ''} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, inputs: (relay.inputs ?? []).map((item) => item.id === input.id ? { ...item, vtRatio: event.target.value } : item) }))} /></label>
                  </div>
                  {!input.sourceObjectId && <p className='mimic-v2-warning-text'>Missing source object.</p>}
                </div>)}
              </div>}
              {protectionTab === 'functions' && <div className='mimic-v2-modal-section'>
                <h3>Functions</h3>
                <div className='mimic-v2-voltage-row'><button className='mimic-v2-chip' onClick={() => addRelayFunction(selectedRelay.id, 'overcurrent')}>Overcurrent</button><button className='mimic-v2-chip' onClick={() => addRelayFunction(selectedRelay.id, 'earth-fault')}>Earth fault</button><button className='mimic-v2-chip' onClick={() => addRelayFunction(selectedRelay.id, 'differential')}>Differential</button><button className='mimic-v2-chip' onClick={() => addRelayFunction(selectedRelay.id, 'breaker-fail')}>Breaker fail</button></div>
                {(selectedRelay.functions ?? []).map((fn) => <div key={fn.id} className='mimic-v2-manager-card'>
                  <div className='mimic-v2-form-grid'>
                    <label>Type<select value={fn.type} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, functions: (relay.functions ?? []).map((item) => item.id === fn.id ? { ...item, type: event.target.value as RelayFunctionType } : item) }))}><option value='overcurrent'>Overcurrent</option><option value='earth-fault'>Earth fault</option><option value='directional-overcurrent'>Directional OC</option><option value='directional-earth-fault'>Directional EF</option><option value='overvoltage'>Overvoltage</option><option value='undervoltage'>Undervoltage</option><option value='thermal-overload'>Thermal overload</option><option value='differential'>Differential</option><option value='restricted-earth-fault'>Restricted EF</option><option value='breaker-fail'>Breaker fail</option><option value='intertrip'>Intertrip</option><option value='trip-circuit-supervision'>Trip circuit supervision</option></select></label>
                    <label>Pickup {info('Teaching-grade threshold for this function. Current functions use amps, voltage functions use kV, and thermal/differential functions are simplified placeholders.')}<input type='number' value={fn.pickupThreshold ?? ''} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, functions: (relay.functions ?? []).map((item) => item.id === fn.id ? { ...item, pickupThreshold: Number(event.target.value) || undefined } : item) }))} /></label>
                    <label>Delay ms {info('The function must remain picked up for this delay before its output actions are issued. Backup protection usually uses a longer delay.')}<input type='number' value={fn.timeDelayMs} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, functions: (relay.functions ?? []).map((item) => item.id === fn.id ? { ...item, timeDelayMs: Number(event.target.value) || 0 } : item) }))} /></label>
                    <label>Logic {info('How the selected phases or inputs are combined. This is deterministic teaching logic, not a manufacturer relay curve.')}<select value={fn.logic} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, functions: (relay.functions ?? []).map((item) => item.id === fn.id ? { ...item, logic: event.target.value as RelayLogicCondition } : item) }))}><option value='any-phase'>any phase</option><option value='all-phases'>all phases</option><option value='selected-phase'>selected phase</option><option value='residual-earth'>residual/earth</option><option value='differential-between-inputs'>differential between inputs</option></select></label>
                    <label>Instantaneous<input type='checkbox' checked={fn.instantaneous} onChange={() => updateRelay(selectedRelay.id, (relay) => ({ ...relay, functions: (relay.functions ?? []).map((item) => item.id === fn.id ? { ...item, instantaneous: !item.instantaneous } : item) }))} /></label>
                  </div>
                  <p>State {fn.state}</p>
                </div>)}
              </div>}
              {protectionTab === 'outputs' && <div className='mimic-v2-modal-section'>
                <h3>Output Actions</h3>
                <button className='mimic-v2-chip' onClick={() => addRelayOutput(selectedRelay.id)}>Add breaker trip output</button>
                {(selectedRelay.outputActions ?? []).map((action) => <div key={action.id} className='mimic-v2-manager-card'>
                  <div className='mimic-v2-form-grid'>
                    <label>Target<select value={action.targetObjectId ?? ''} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, outputActions: (relay.outputActions ?? []).map((item) => item.id === action.id ? { ...item, targetObjectId: event.target.value } : item) }))}>{selectableOutputTargets.map((target) => <option key={target.id} value={target.id}>{target.label} / {target.targetType}</option>)}</select></label>
                    <label>Action<select value={action.action} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, outputActions: (relay.outputActions ?? []).map((item) => item.id === action.id ? { ...item, action: event.target.value as RelayOutputActionType } : item) }))}><option value='trip-open-breaker'>trip/open breaker</option><option value='block-close'>block close</option><option value='alarm'>alarm</option><option value='apply-lockout'>apply lockout</option><option value='clear-auto-reset'>clear/auto-reset</option><option value='trigger-backup-relay'>trigger backup relay</option></select></label>
                    <label>Delay ms<input type='number' value={action.delayMs ?? ''} onChange={(event) => updateRelay(selectedRelay.id, (relay) => ({ ...relay, outputActions: (relay.outputActions ?? []).map((item) => item.id === action.id ? { ...item, delayMs: Number(event.target.value) || undefined } : item) }))} /></label>
                  </div>
                  {selectableOutputTargets.find((target) => target.id === action.targetObjectId)?.targetType === 'disconnector' && <p className='mimic-v2-warning-text'>Disconnector trip/open is intentionally unusual. Check load and interlocking assumptions.</p>}
                </div>)}
              </div>}
              {protectionTab === 'events' && <div className='mimic-v2-modal-section'><h3>Relay Status & Event History</h3><p>{selectedRelay.state}</p>{doc.operationEvents.filter((event) => event.message.toLowerCase().includes(selectedRelay.name.toLowerCase()) || event.message.toLowerCase().includes('relay')).slice(-12).map((event) => <p key={event.id}>{event.timestamp}: {event.message}</p>)}</div>}
            </> : <p>Select or add a relay.</p>}
          </section>
        </div>
      </div>
    </div>}
    {libraryOpen && <div className='mimic-v2-modal-backdrop' onMouseDown={() => setLibraryOpen(false)}>
      <div className='mimic-v2-library-modal' onMouseDown={(event) => event.stopPropagation()}>
        <header className='mimic-v2-library-header'>
          <div>
            <h2>Drawing Library</h2>
            <p>Manage saved drawings, templates, examples, and JSON import/export.</p>
          </div>
          <button className='mimic-v2-btn' onClick={() => setLibraryOpen(false)}>Close</button>
        </header>
        <div className='mimic-v2-library-tabs'>
          <button className={`mimic-v2-btn ${libraryTab === 'drawings' ? 'active' : ''}`} onClick={() => setLibraryTab('drawings')}>Drawings</button>
          <button className={`mimic-v2-btn ${libraryTab === 'templates' ? 'active' : ''}`} onClick={() => setLibraryTab('templates')}>Templates</button>
          <button className={`mimic-v2-btn ${libraryTab === 'examples' ? 'active' : ''}`} onClick={() => setLibraryTab('examples')}>Examples</button>
          <input ref={importInputRef} type='file' accept='application/json,.json' hidden onChange={(event) => importJsonFile(event.target.files?.[0])} />
          <button className='mimic-v2-btn' onClick={createNewDrawing}>New drawing</button>
          <button className='mimic-v2-btn' onClick={saveCurrentDrawing}>Save</button>
          <button className='mimic-v2-btn' onClick={saveCurrentDrawingAs}>Save as</button>
          <button className='mimic-v2-btn' onClick={() => importInputRef.current?.click()}>Import JSON</button>
          <button className='mimic-v2-btn' onClick={() => downloadDrawingJson(doc)}>Export JSON</button>
          <button className='mimic-v2-btn' onClick={() => downloadDrawingJson({ ...doc, drawingType: 'template' })}>Export as template</button>
          <button className='mimic-v2-btn' onClick={resetToTemplate}>Reset to default</button>
        </div>
        {libraryTab === 'drawings' && <div className='mimic-v2-library-grid'>
          {drawingSummaries.map((summary) => <article key={summary.id} className='mimic-v2-library-card'>
            {summary.thumbnail && <img src={summary.thumbnail} alt='' />}
            <h3>{summary.name}{summary.id === activeDrawingId() ? ' (open)' : ''}</h3>
            <p>{summary.description || `${summary.objectCount} objects`}</p>
            <p>Updated {new Date(summary.updatedAt).toLocaleString()} / Schema {summary.schemaVersion}</p>
            <p>{summary.tags.join(', ') || 'No tags'} / {summary.voltageLevels.map((kv) => `${kv}kV`).join(', ') || 'No voltage set'}</p>
            <div className='mimic-v2-library-actions'>
              <button className='mimic-v2-chip' onClick={() => openStoredDrawing(summary.id)}>Open</button>
              <button className='mimic-v2-chip' onClick={() => duplicateStoredDrawing(summary.id)}>Duplicate</button>
              <button className='mimic-v2-chip' onClick={() => renameStoredDrawing(summary.id)}>Rename</button>
              <button className='mimic-v2-chip' onClick={() => { const loaded = loadDrawing(summary.id); if (loaded) downloadDrawingJson(loaded.doc); }}>Export</button>
              <button className='mimic-v2-chip danger' onClick={() => deleteStoredDrawing(summary.id)}>Delete</button>
            </div>
          </article>)}
          {!drawingSummaries.length && <p>No saved drawings yet.</p>}
        </div>}
        {libraryTab === 'templates' && <div className='mimic-v2-library-grid'>
          {builtInTemplates.map((template) => <article key={template.id} className='mimic-v2-library-card'>
            <h3>{template.name}</h3>
            <p>{template.description}</p>
            <p>{template.tags.join(', ')} / {template.voltageLevels.map((kv) => `${kv}kV`).join(', ')}</p>
            {template.notes && <p>{template.notes}</p>}
            <div className='mimic-v2-library-actions'>
              <button className='mimic-v2-chip' onClick={() => createFromTemplate(template)}>New from template</button>
              <button className='mimic-v2-chip' onClick={() => insertTemplateAtCanvasCenter(template)}>Insert into current</button>
            </div>
          </article>)}
        </div>}
        {libraryTab === 'examples' && <div className='mimic-v2-library-grid'>
          {builtInExamples.map((template) => <article key={template.id} className='mimic-v2-library-card'>
            <h3>{template.name}</h3>
            <p>{template.description}</p>
            <p>{template.tags.join(', ')} / {template.voltageLevels.map((kv) => `${kv}kV`).join(', ')}</p>
            <div className='mimic-v2-library-actions'>
              <button className='mimic-v2-chip' onClick={() => createFromTemplate(template)}>Copy as drawing</button>
              <button className='mimic-v2-chip' onClick={() => insertTemplateAtCanvasCenter(template)}>Insert into current</button>
            </div>
          </article>)}
        </div>}
        <details className='mimic-v2-json-tools'>
          <summary>Manual JSON</summary>
          <div className='mimic-v2-library-actions'>
            <button className='mimic-v2-chip' onClick={exportJsonToPreview}>Show export JSON</button>
            <button className='mimic-v2-chip' onClick={() => importJsonText(jsonPreview)}>Import text below</button>
          </div>
          <textarea value={jsonPreview} onChange={(event) => setJsonPreview(event.target.value)} spellCheck={false} />
        </details>
      </div>
    </div>}
  </div>;
}
