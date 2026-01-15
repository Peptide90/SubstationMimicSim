import React from "react";

export type InterfaceRole = "source" | "sink" | "neutral";

export type InterfaceMeta = {
  enabled: boolean;
  role: InterfaceRole;
  mva: number; // + for source, - for sink, 0 for neutral
};

export function PowerFlowModal(props: {
  open: boolean;
  onClose: () => void;

  interfaces: Array<{ id: string; label: string }>;
  focusedId: string | null;

  metaById: Record<string, InterfaceMeta>;
  setMetaById: (fn: (prev: Record<string, InterfaceMeta>) => Record<string, InterfaceMeta>) => void;
}) {
  const { open, onClose, interfaces, focusedId, metaById, setMetaById } = props;
  if (!open) return null;

  const selectStyle: React.CSSProperties = {
    padding: 8,
    width: "100%",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#fff",
  };

  const inputStyle: React.CSSProperties = {
    padding: 8,
    width: "100%",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#fff",
  };

  const ensure = (id: string): InterfaceMeta =>
    metaById[id] ?? { enabled: true, role: "neutral", mva: 0 };

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
          width: "min(900px, 96vw)",
          maxHeight: "85vh",
          overflow: "auto",
          background: "#0b1220",
          borderRadius: 10,
          border: "1px solid #1f2937",
          padding: 14,
          color: "#fff",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Power Flow</div>
          <button
            onClick={onClose}
            style={{ border: "1px solid #334155", background: "#0f172a", padding: "6px 10px", borderRadius: 8, color: "#fff" }}
          >
            Close
          </button>
        </div>

        <div style={{ marginTop: 12, color: "#cbd5e1", fontSize: 12 }}>
          Set which interfaces are injecting (Source) or absorbing (Sink) power. This drives energization and later animated flow.
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {interfaces.map((itf) => {
            const meta = ensure(itf.id);
            const isFocused = focusedId === itf.id;

            return (
              <div
                key={itf.id}
                style={{
                  border: isFocused ? "1px solid #38bdf8" : "1px solid #1f2937",
                  background: "#0f172a",
                  borderRadius: 10,
                  padding: 12,
                  display: "grid",
                  gridTemplateColumns: "160px 120px 140px 1fr",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 900 }}>{itf.label}</div>

                <div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Enabled</div>
                  <select
                    value={meta.enabled ? "yes" : "no"}
                    onChange={(e) =>
                      setMetaById((m) => ({ ...m, [itf.id]: { ...ensure(itf.id), enabled: e.target.value === "yes" } }))
                    }
                    style={selectStyle}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Role</div>
                  <select
                    value={meta.role}
                    onChange={(e) => {
                      const role = e.target.value as InterfaceRole;
                      const mva = role === "source" ? Math.abs(meta.mva || 100) : role === "sink" ? -Math.abs(meta.mva || 100) : 0;
                      setMetaById((m) => ({ ...m, [itf.id]: { ...ensure(itf.id), role, mva } }));
                    }}
                    style={selectStyle}
                  >
                    <option value="source">Source (+)</option>
                    <option value="sink">Sink (-)</option>
                    <option value="neutral">Neutral</option>
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>MVA</div>
                  <input
                    type="number"
                    value={meta.mva}
                    onChange={(e) => setMetaById((m) => ({ ...m, [itf.id]: { ...ensure(itf.id), mva: Number(e.target.value) } }))}
                    style={inputStyle}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
