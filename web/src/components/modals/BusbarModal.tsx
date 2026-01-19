import type { CSSProperties } from "react";
import type { Edge } from "reactflow";

type BusRole = "MAIN" | "RESERVE" | "SECTION" | "COUPLER" | "FEEDER";
type VoltageClass = "400" | "275" | "132" | "LV66" | "HVDC";

export function BusbarModal(props: {
  open: boolean;
  edge: Edge | null;
  onClose: () => void;
  onUpdateEdgeData: (edgeId: string, patch: any) => void;
}) {
  const { open, edge, onClose, onUpdateEdgeData } = props;
  if (!open || !edge) return null;

  const data = (edge.data as any) ?? {};
  const busRole: BusRole = data.busRole ?? "FEEDER";
  const voltageClass: VoltageClass = data.voltageClass ?? "400";
  const busSectionId: string = data.busSectionId ?? "";

  const selectStyle: CSSProperties = {
    padding: 8,
    width: "100%",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#fff",
  };

  const inputStyle: CSSProperties = {
    padding: 8,
    width: "100%",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#fff",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: "min(720px, 96vw)",
          background: "#0b1220",
          borderRadius: 10,
          border: "1px solid #1f2937",
          padding: 14,
          color: "#fff",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Busbar Properties</div>
          <button
            onClick={onClose}
            style={{ border: "1px solid #334155", background: "#0f172a", padding: "6px 10px", borderRadius: 8, color: "#fff" }}
          >
            Close
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Role</div>
            <select
              value={busRole}
              onChange={(e) => onUpdateEdgeData(edge.id, { busRole: e.target.value })}
              style={selectStyle}
            >
              <option value="MAIN">MAIN</option>
              <option value="RESERVE">RESERVE</option>
              <option value="SECTION">SECTION</option>
              <option value="COUPLER">COUPLER</option>
              <option value="FEEDER">FEEDER</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Voltage Class</div>
            <select
              value={voltageClass}
              onChange={(e) => onUpdateEdgeData(edge.id, { voltageClass: e.target.value })}
              style={selectStyle}
            >
              <option value="400">400</option>
              <option value="275">275</option>
              <option value="132">132</option>
              <option value="LV66">LV66</option>
              <option value="HVDC">HVDC</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Bus Section ID (optional)</div>
            <input
              value={busSectionId}
              onChange={(e) => onUpdateEdgeData(edge.id, { busSectionId: e.target.value })}
              style={inputStyle}
              placeholder="e.g. A, B, 1, 2"
            />
          </div>

          <div style={{ color: "#cbd5e1", fontSize: 12 }}>
            These tags are the basis for later BP109 inference (main/reserve bars, bus sections, couplers, and bay classification).
          </div>
        </div>
      </div>
    </div>
  );
}
