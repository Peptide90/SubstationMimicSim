import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DrawingDocument, ElectricalSymbol, Phase, Point, ViewMode } from '../drawing/model';
import { SYMBOL_LIBRARY } from '../symbols/library';
import { extractTopology } from '../topology/extractTopology';
import { generateLabels } from '../nomenclature/engine';
import { loadDocument, saveDocument } from '../storage/documentStore';
import '../theme/tokens.css';
import '../canvas/editor.css';

type Tool = 'select' | 'conductor' | 'busbar' | 'pan';

const snap = (value: number, grid: number) => Math.round(value / grid) * grid;
const hasAllPhases = (p: Phase[]) => ['A', 'B', 'C'].every((ph) => p.includes(ph as Phase));

const createEmpty = (): DrawingDocument => ({ id: `doc-${Date.now()}`, version: 2, name: 'Untitled Mimic Drawing', activeView: 'single-line', objects: { symbols: [], conductors: [], busbars: [], labels: [], annotations: [] }, uiState: { gridSize: 20, snapToGrid: true, snapToTerminals: true, snapToIntersections: true }, history: { undoStack: [], redoStack: [] } });

export function MimicDesignerV2(): JSX.Element {
  const [doc, setDoc] = useState<DrawingDocument>(() => loadDocument() ?? createEmpty());
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mode, setMode] = useState<'edit' | 'operate'>('edit');
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<string[]>([]);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [draftPath, setDraftPath] = useState<Point[]>([]);
  const [undoStack, setUndoStack] = useState<DrawingDocument[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingDocument[]>([]);
  const [showTopologyOverlay, setShowTopologyOverlay] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; start: Point; original: Point } | null>(null);
  const panRef = useRef<Point | null>(null);

  const topology = useMemo(() => extractTopology(doc), [doc]);
  const selectedObjects = doc.objects.symbols.filter((s) => selected.includes(s.id));

  const commit = useCallback((next: DrawingDocument) => {
    setUndoStack((prev) => [...prev, doc]);
    setRedoStack([]);
    setDoc(next);
  }, [doc]);

  const worldPoint = (event: React.MouseEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left - pan.x) / scale, y: (event.clientY - rect.top - pan.y) / scale };
  };

  const placeSymbol = (type: ElectricalSymbol['type']) => {
    const t = SYMBOL_LIBRARY.find((x) => x.type === type);
    if (!t) return;
    const id = `symbol-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const phases = doc.activeView === 'single-line' ? (['A', 'B', 'C'] as Phase[]) : [...t.defaultPhases];
    const next = generateLabels({ ...doc, objects: { ...doc.objects, symbols: [...doc.objects.symbols, { id, type: t.type, position: { x: 200, y: 200 }, rotation: 0, terminals: t.defaultTerminals.map((d, i) => ({ id: `t-${i}`, name: d.name, offset: { x: d.x, y: d.y }, phaseApplicability: phases })), phaseApplicability: phases, simulation: {}, viewMetadata: { 'single-line': { visible: true }, 'three-phase': { visible: true } } }] } });
    commit(next);
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.max(0.4, Math.min(3, s * delta)));
  };

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = worldPoint(e);
    if (e.button === 1 || tool === 'pan' || (e.button === 0 && e.shiftKey && mode === 'edit')) { panRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; return; }
    if (tool === 'conductor' || tool === 'busbar') {
      const nx = doc.uiState.snapToGrid ? snap(p.x, doc.uiState.gridSize) : p.x;
      const ny = doc.uiState.snapToGrid ? snap(p.y, doc.uiState.gridSize) : p.y;
      setDraftPath((prev) => [...prev, { x: nx, y: ny }]);
    }
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panRef.current) setPan({ x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y });
  };

  const onMouseUp = () => { panRef.current = null; };

  const completePath = () => {
    if (draftPath.length < 2) return;
    const id = `${tool}-${Date.now()}`;
    const pathObj = { id, type: tool === 'conductor' ? 'conductor-path' : 'busbar-segment', rotation: 0, phaseApplicability: ['A', 'B', 'C'] as Phase[], vertices: draftPath, orthogonal: true, connectionPoints: draftPath.map((pt, i) => ({ id: `${id}-cp-${i}`, position: pt })) } as any;
    const next = tool === 'conductor' ? { ...doc, objects: { ...doc.objects, conductors: [...doc.objects.conductors, pathObj] } } : { ...doc, objects: { ...doc.objects, busbars: [...doc.objects.busbars, { ...pathObj, width: 8 }] } };
    commit(next);
    setDraftPath([]);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelected([]); setDraftPath([]); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) {
        const next = { ...doc, objects: { ...doc.objects, symbols: doc.objects.symbols.filter((s) => !selected.includes(s.id)) } };
        commit(next); setSelected([]);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const prev = undoStack[undoStack.length - 1]; if (!prev) return; setRedoStack((r) => [...r, doc]); setUndoStack((u) => u.slice(0, -1)); setDoc(prev);
      }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
        const next = redoStack[redoStack.length - 1]; if (!next) return; setUndoStack((u) => [...u, doc]); setRedoStack((r) => r.slice(0, -1)); setDoc(next);
      }
      if (e.key.toLowerCase() === 'r' && selected.length) {
        const next = { ...doc, objects: { ...doc.objects, symbols: doc.objects.symbols.map((s) => selected.includes(s.id) ? { ...s, rotation: (s.rotation + 90) % 360 } : s) } }; commit(next);
      }
      if (e.key === 'Enter' && (tool === 'conductor' || tool === 'busbar')) completePath();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [doc, selected, undoStack, redoStack, tool, draftPath]);

  return <div className='mimic-v2-root' data-theme={theme}>
    <aside className='mimic-v2-sidebar'>
      <h3>Symbols</h3>
      {SYMBOL_LIBRARY.filter((s) => s.type !== 'line-end' && s.type !== 'cable-sealing-end' && s.type !== 'busbar-coupler').map((s) => <div key={s.type} className='mimic-v2-item'><button className='mimic-v2-btn' onClick={() => placeSymbol(s.type)}>{s.displayName}</button></div>)}
      <button className='mimic-v2-btn' onClick={() => commit(generateLabels(doc))}>Regenerate auto labels</button>
      <button className='mimic-v2-btn' onClick={() => setDoc(createEmpty())}>New</button>
      <button className='mimic-v2-btn' onClick={() => saveDocument(doc)}>Save</button>
      <button className='mimic-v2-btn' onClick={() => { const d = createEmpty(); d.objects.symbols.push({ id:'vt-demo', type:'vt', position:{x:300,y:200}, rotation:0, terminals:[{id:'t0',name:'tap',offset:{x:0,y:20},phaseApplicability:['B']}], phaseApplicability:['B'], label:{text:'VT101*',autoGenerated:true,manualOverride:false,marker:'* phase-specific device: Phase B only'}, simulation:{} }); setDoc(d); }}>Load sample</button>
    </aside>
    <main className='mimic-v2-main'>
      <div className='mimic-v2-toolbar'>
        <button className='mimic-v2-btn' onClick={() => setMode('edit')}>Edit</button><button className='mimic-v2-btn' onClick={() => setMode('operate')}>Operate</button>
        <button className={`mimic-v2-btn ${tool==='select'?'active':''}`} onClick={() => setTool('select')}>Select</button>
        <button className={`mimic-v2-btn ${tool==='conductor'?'active':''}`} onClick={() => setTool('conductor')}>Conductor</button>
        <button className={`mimic-v2-btn ${tool==='busbar'?'active':''}`} onClick={() => setTool('busbar')}>Busbar</button>
        <button className='mimic-v2-btn' onClick={() => setDoc((p)=>({ ...p, activeView:'single-line'}))}>Single-line</button>
        <button className='mimic-v2-btn' onClick={() => setDoc((p)=>({ ...p, activeView:'three-phase'}))}>Three-phase</button>
        <button className='mimic-v2-btn' onClick={() => setTheme((t)=>t==='light'?'dark':'light')}>Theme</button>
        <button className={`mimic-v2-btn ${showTopologyOverlay?'active':''}`} onClick={() => setShowTopologyOverlay((v)=>!v)}>Topology overlay</button>
      </div>
      <div className='mimic-v2-canvas-wrap'>
      <svg ref={svgRef} className='mimic-v2-canvas' onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onContextMenu={(e) => { e.preventDefault(); setDraftPath([]); }}>
        <defs><pattern id='grid' width={doc.uiState.gridSize} height={doc.uiState.gridSize} patternUnits='userSpaceOnUse'><path d={`M ${doc.uiState.gridSize} 0 L 0 0 0 ${doc.uiState.gridSize}`} fill='none' stroke='var(--md2-grid-line)' strokeWidth='1'/></pattern></defs>
        <rect width='100%' height='100%' fill='url(#grid)' />
        <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
          {doc.objects.busbars.map((b) => <polyline key={b.id} points={b.vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke='black' strokeWidth={6} />)}
          {doc.objects.conductors.map((c) => <polyline key={c.id} points={c.vertices.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke='var(--md2-text)' strokeWidth={2} />)}
          {doc.objects.symbols.map((s) => <g key={s.id} transform={`translate(${s.position.x},${s.position.y}) rotate(${s.rotation})`} onMouseDown={(e)=>{ if (tool!=='select') return; e.stopPropagation(); if (e.shiftKey) setSelected((prev)=>prev.includes(s.id)?prev.filter(id=>id!==s.id):[...prev,s.id]); else setSelected([s.id]); dragRef.current={id:s.id,start:{x:e.clientX,y:e.clientY},original:s.position}; }} onMouseMove={(e)=>{ if (!dragRef.current || dragRef.current.id!==s.id) return; const dx=(e.clientX-dragRef.current.start.x)/scale; const dy=(e.clientY-dragRef.current.start.y)/scale; setDoc((prev)=>({ ...prev, objects:{ ...prev.objects, symbols: prev.objects.symbols.map((x)=>x.id===s.id?{...x, position:{x:snap(dragRef.current!.original.x+dx, prev.uiState.gridSize), y:snap(dragRef.current!.original.y+dy, prev.uiState.gridSize)}}:x)}}));}} onMouseUp={()=>{ if(dragRef.current){ commit(doc);} dragRef.current=null; }}>
            <rect x={-20} y={-14} width={40} height={28} fill='none' stroke={selected.includes(s.id)?'var(--md2-selected)':'var(--md2-text)'} strokeWidth={2}/>
            <text x={0} y={4} textAnchor='middle' fontSize='8'>{s.type}</text>
            <text x={0} y={26} textAnchor='middle' fontSize='8'>{s.label?.text ?? ''}</text>
            {doc.activeView==='single-line' && !hasAllPhases(s.phaseApplicability) && <text x={16} y={-16} fontSize='12' fill='var(--md2-warning)'>*</text>}
            <title>{!hasAllPhases(s.phaseApplicability) ? `* phase-specific device: ${s.phaseApplicability.join(',')}` : 'all phases'}</title>
          </g>)}
          {showTopologyOverlay && topology.branches.map((b) => { const from = topology.nodes.find((n)=>n.id===b.fromNodeId); const to = topology.nodes.find((n)=>n.id===b.toNodeId); if(!from||!to) return null; return <line key={`dbg-${b.id}`} x1={from.position.x} y1={from.position.y} x2={to.position.x} y2={to.position.y} stroke='var(--md2-warning)' strokeWidth={1} strokeDasharray='3 3' />; })}
          {showTopologyOverlay && topology.nodes.map((n) => <g key={`node-${n.id}`}><circle cx={n.position.x} cy={n.position.y} r={4} fill={n.junction ? 'var(--md2-warning)' : 'var(--md2-selected)'} /><text x={n.position.x+6} y={n.position.y-6} fontSize='7'>{n.id}</text></g>)}
          {showTopologyOverlay && topology.terminals.filter((t)=>!t.connectedNodeIds.length).map((t)=> <circle key={`floating-${t.id}`} cx={t.worldPosition.x} cy={t.worldPosition.y} r={5} fill='none' stroke='var(--md2-warning)' strokeWidth={2} />)}
          {draftPath.length > 1 && <polyline points={draftPath.map((v) => `${v.x},${v.y}`).join(' ')} fill='none' stroke='var(--md2-selected)' strokeDasharray='4 4' strokeWidth={2} />}
        </g>
      </svg>
      </div>
    </main>
    <aside className='mimic-v2-inspector'>
      <h3>Inspector</h3>
      <p>Selected: {selected.join(', ') || 'none'}</p>
      {selectedObjects[0] && <>
        <label>Label <input value={selectedObjects[0].label?.text ?? ''} onChange={(e)=>setDoc((prev)=>({ ...prev, objects:{ ...prev.objects, symbols: prev.objects.symbols.map((s)=>s.id===selectedObjects[0].id?{...s,label:{text:e.target.value,autoGenerated:false,manualOverride:true}}:s)}}))} /></label>
        <label>Voltage kV <input type='number' value={selectedObjects[0].voltageLevelKv ?? ''} onChange={(e)=>setDoc((prev)=>({ ...prev, objects:{ ...prev.objects, symbols: prev.objects.symbols.map((s)=>s.id===selectedObjects[0].id?{...s,voltageLevelKv:Number(e.target.value)||undefined}:s)}}))} /></label>
        <p>{!hasAllPhases(selectedObjects[0].phaseApplicability) ? `* phase-specific device in single-line view (${selectedObjects[0].phaseApplicability.join(',')})` : 'Device applies to all phases.'}</p>
      </>}
      <h4>Debug</h4>
      <p>Selected IDs: {selected.join(', ') || 'none'}</p>
      <p>Warnings: {topology.warnings.length}</p>
      {topology.warnings.slice(0, 5).map((w)=><p key={w.id}>[{w.code}] {w.message}</p>)}
      <p>Mode: {mode}</p><p>View: {doc.activeView}</p><p>Object count: {doc.objects.symbols.length + doc.objects.conductors.length + doc.objects.busbars.length}</p><p>Topology: {topology.nodes.length} nodes / {topology.branches.length} branches</p>
    </aside>
  </div>;
}
