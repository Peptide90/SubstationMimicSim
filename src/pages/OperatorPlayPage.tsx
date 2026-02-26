import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createOperatorMap, createGridOverlay } from '@map-core/index';
import { getScenarioById, type AllowedAction } from '@scenarios/index';
import { ScenarioEngine } from '@sim-core/index';

export function OperatorPlayPage() {
  const { scenarioId = '' } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const engine = useMemo(() => {
    const scenario = getScenarioById(scenarioId);
    return scenario ? new ScenarioEngine(scenario) : null;
  }, [scenarioId]);

  const [state, setState] = useState(engine?.getState());
  const [pauseMessage, setPauseMessage] = useState<string | undefined>();

  useEffect(() => {
    if (!engine || !mapRef.current) return;
    const map = createOperatorMap(mapRef.current, engine.getState().scenario.regionId);
    map.on('load', () => {
      map.addLayer(
        createGridOverlay(() => ({
          nodes: engine.getState().scenario.network.nodes,
          corridors: engine.getState().scenario.network.corridors,
          corridorState: engine.getState().corridors
        }))
      );
    });
    return () => map.remove();
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    const id = window.setInterval(() => {
      const result = engine.step(1);
      setState({ ...result.state });
      setPauseMessage(result.pauseMessage);
    }, 1000);
    return () => window.clearInterval(id);
  }, [engine]);

  if (!engine || !state) {
    return <main className="page">Scenario not found.</main>;
  }

  const pause = state.pendingPauseId ? state.scenario.pauses.find((p) => p.id === state.pendingPauseId) : undefined;

  const runAction = (action: AllowedAction) => {
    engine.applyAction(action);
    setPauseMessage(undefined);
    setState({ ...engine.getState() });
  };

  return (
    <main className="operator-layout">
      <section ref={mapRef} className="map-pane" />
      <section className="bottom-pane">
        <div className="metrics">
          <span>f: {state.metrics.frequencyHz.toFixed(2)} Hz</span>
          <span>RoCoF: {state.metrics.rocofHzPerS.toFixed(3)} Hz/s</span>
          <span>Load/Gen: {state.metrics.loadMw.toFixed(0)} / {state.metrics.generationMw.toFixed(0)} MW</span>
          <span>Reserve: {state.metrics.reserveMw.toFixed(0)} MW</span>
        </div>
        <div className="event-log">
          {state.eventLog.slice(-8).map((line, i) => (
            <div key={`${line}-${i}`}>{line}</div>
          ))}
        </div>
        {pause && (
          <div className="decision-panel">
            <h3>Auto-paused</h3>
            <p>{pauseMessage}</p>
            {pause.allowedActions.map((action) => (
              <button key={action.id} onClick={() => runAction(action)}>
                {action.label}
              </button>
            ))}
          </div>
        )}
        <footer className="attribution">© OpenStreetMap contributors</footer>
        <button onClick={() => navigate(`/operator/debrief/${Date.now()}`)}>End run</button>
      </section>
    </main>
  );
}
