import type { PowerSimResult } from "./powerSim";

type Props = {
  sim: PowerSimResult;
};

export function PowerOverlay({ sim }: Props) {
  const busEntries = Object.entries(sim.busVoltage);
  const hasBusData = busEntries.length > 0;

  const formatVoltageLabel = (state: string) => {
    if (state === "LOW") return "Under voltage";
    if (state === "HIGH") return "Over voltage";
    return "Nominal";
  };

  const voltageColour = (state: string) => {
    if (state === "LOW") return "#c084fc"; // purple hue shift from blue
    if (state === "HIGH") return "#4ade80"; // greenish hue shift from blue
    return "#38bdf8"; // nominal blue
  };

  const currentLabel = (state: string | undefined) => {
    if (state === "OVER") return "Overcurrent";
    if (state === "UNDER") return "Low current";
    return "Normal";
  };

  const currentColour = (state: string | undefined) => {
    if (state === "OVER") return "#f97373";
    if (state === "UNDER") return "#94a3b8";
    return "#22c55e";
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 376,
        top: 72,
        minWidth: 260,
        background: "rgba(11,18,32,0.9)",
        border: "1px solid #1f2937",
        borderRadius: 10,
        padding: 12,
        color: "#e2e8f0",
        fontSize: 12,
        zIndex: 20,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Bus Condition</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
        Snapshot of bus voltage and current loading.
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 11, marginBottom: 6, color: "#cbd5e1" }}>
        <div>P: {sim.totals.pMw.toFixed(1)} MW</div>
        <div>Q: {sim.totals.qMvar.toFixed(1)} MVAr</div>
        <div>S: {sim.totals.sMva.toFixed(1)} MVA</div>
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>
        Overloaded edges: {sim.edgeOverloaded.size}
      </div>

      <div
        style={{
          marginTop: 8,
          borderTop: "1px solid #1f2937",
          paddingTop: 6,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 0.9fr 0.9fr",
            gap: 6,
            fontSize: 11,
            color: "#a5b4fc",
            marginBottom: 4,
          }}
        >
          <div>Bus</div>
          <div>Voltage</div>
          <div>Current</div>
        </div>
        {!hasBusData && <div style={{ color: "#64748b" }}>No busbar telemetry</div>}
        {busEntries.map(([busId, state]) => {
          const voltageState = state;
          const currentState = sim.busCurrent[busId];
          return (
            <div
              key={busId}
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.9fr 0.9fr",
                gap: 6,
                alignItems: "center",
                marginBottom: 2,
              }}
            >
              <span style={{ color: "#e2e8f0" }}>{busId}</span>
              <span
                style={{
                  color: voltageColour(voltageState),
                  fontWeight: 700,
                }}
              >
                {formatVoltageLabel(voltageState)}
              </span>
              <span
                style={{
                  color: currentColour(currentState),
                  fontWeight: 700,
                }}
              >
                {currentLabel(currentState)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
