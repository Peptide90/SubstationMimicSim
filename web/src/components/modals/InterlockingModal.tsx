import { useState } from "react";
import type { ReactNode } from "react";
import type { SwitchState } from "../../core/model";

export type InterlockRule = {
  id: string;
  actionNodeId: string;
  actionTo: SwitchState;
  condNodeId: string;
  condState: SwitchState;
};

function ModalShell(props: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const { title, open, onClose, children } = props;
  if (!open) return null;
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
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ border: "1px solid #334155", background: "#0f172a", padding: "6px 10px", borderRadius: 8, color: "#fff" }}
          >
            Close
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export function InterlockingModal(props: {
  open: boolean;
  onClose: () => void;
  switchgearIds: string[];
  rules: InterlockRule[];
  setRules: (fn: (prev: InterlockRule[]) => InterlockRule[]) => void;
  appendDebug: (msg: string) => void;
}) {
  const { open, onClose, switchgearIds, rules, setRules, appendDebug } = props;

  const [actionNodeId, setActionNodeId] = useState("DS1");
  const [actionTo, setActionTo] = useState<SwitchState>("closed");
  const [condNodeId, setCondNodeId] = useState("ES1");
  const [condState, setCondState] = useState<SwitchState>("closed");

  const addRule = () => {
    const id = `il-${crypto.randomUUID().slice(0, 6)}`;
    setRules((prev) =>
      prev.concat({ id, actionNodeId, actionTo, condNodeId, condState })
    );
    appendDebug(`Added interlock ${id}`);
  };

  const removeRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    appendDebug(`Removed interlock ${id}`);
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: 8,
    borderRadius: 8,
    background: "#0f172a",
    color: "#fff",
    border: "1px solid #334155",
  };

  return (
    <ModalShell title="Interlocking" open={open} onClose={onClose}>
      <div style={{ color: "#cbd5e1", marginBottom: 10 }}>
        MVP: Block X → OPEN/CLOSE when Y is OPEN/CLOSED.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 1fr 140px", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Block action on</div>
          <select value={actionNodeId} onChange={(e) => setActionNodeId(e.target.value)} style={selectStyle}>
            {switchgearIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Action</div>
          <select value={actionTo} onChange={(e) => setActionTo(e.target.value as SwitchState)} style={selectStyle}>
            <option value="open">OPEN</option>
            <option value="closed">CLOSE</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>When this device is</div>
          <select value={condNodeId} onChange={(e) => setCondNodeId(e.target.value)} style={selectStyle}>
            {switchgearIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>State</div>
          <select value={condState} onChange={(e) => setCondState(e.target.value as SwitchState)} style={selectStyle}>
            <option value="open">OPEN</option>
            <option value="closed">CLOSED</option>
          </select>
        </div>
      </div>

      <button
        onClick={addRule}
        style={{ marginTop: 12, border: "1px solid #334155", background: "#0f172a", padding: "8px 12px", borderRadius: 8, color: "#fff", width: "fit-content" }}
      >
        Add Interlock
      </button>

      <div style={{ borderTop: "1px solid #1f2937", marginTop: 14, paddingTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Rules</div>
        {rules.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>No interlocks yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {rules.map((r) => (
              <div key={r.id} style={{ border: "1px solid #1f2937", background: "#0f172a", borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 900 }}>
                  Block {r.actionNodeId} → {r.actionTo.toUpperCase()} when {r.condNodeId} is {r.condState.toUpperCase()}
                </div>
                <button
                  onClick={() => removeRule(r.id)}
                  style={{ marginTop: 8, border: "1px solid #334155", background: "#0b1220", padding: "6px 10px", borderRadius: 8, color: "#fff" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
