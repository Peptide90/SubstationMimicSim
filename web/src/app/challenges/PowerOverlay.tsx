import type { PowerSimResult } from "./powerSim";

type Props = {
  sim: PowerSimResult;
};

export function PowerOverlay({ sim }: Props) {
  const busEntries = Object.entries(sim.busVoltage);
  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        top: 72,
        minWidth: 220,
        background: "rgba(11,18,32,0.9)",
        border: "1px solid #1f2937",
        borderRadius: 10,
        padding: 10,
        color: "#e2e8f0",
        fontSize: 12,
        zIndex: 20,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Power Snapshot</div>
      <div>P: {sim.totals.pMw.toFixed(1)} MW</div>
      <div>Q: {sim.totals.qMvar.toFixed(1)} MVAr</div>
      <div>S: {sim.totals.sMva.toFixed(1)} MVA</div>
      <div style={{ marginTop: 6 }}>Overloaded edges: {sim.edgeOverloaded.size}</div>
      <div style={{ marginTop: 6, color: "#94a3b8" }}>Bus voltage</div>
      {busEntries.length === 0 && <div style={{ color: "#64748b" }}>No busbar telemetry</div>}
      {busEntries.map(([busId, state]) => (
        <div key={busId} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span>{busId}</span>
          <span
            style={{
              color: state === "LOW" ? "#f87171" : state === "HIGH" ? "#60a5fa" : "#34d399",
              fontWeight: 700,
            }}
          >
            {state}
          </span>
        </div>
      ))}
    </div>
  );
}
