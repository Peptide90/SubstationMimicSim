import type { ReactNode, CSSProperties } from "react";
import type { Node } from "reactflow";
import type { NodeKind } from "../../core/model";
import { schemaDefaultPrefix } from "../../app/labeling/bp109";

import type {
  BP109Meta,
  BayType,
  LabelMode,
  LabelScheme,
  VoltageClass,
  CircuitType,
  PurposeDigit,
} from "../../app/labeling/bp109";


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
          width: "min(1100px, 96vw)",
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

export function LabellingModal(props: {
  open: boolean;
  onClose: () => void;

  nodes: Node[];
  getKind: (n: Node) => NodeKind | null;

  labelScheme: LabelScheme;
  setLabelScheme: (v: LabelScheme) => void;

  labelMode: LabelMode;
  setLabelMode: (v: LabelMode) => void;

  labelOverrides: Record<string, string>;
  setLabelOverrides: (fn: (prev: Record<string, string>) => Record<string, string>) => void;

  bayTypeOverrides: Record<string, BayType>;
  setBayTypeOverrides: (fn: (prev: Record<string, BayType>) => Record<string, BayType>) => void;

  bp109MetaById: Record<string, BP109Meta>;
  setBp109MetaById: (fn: (prev: Record<string, BP109Meta>) => Record<string, BP109Meta>) => void;

  getDisplayLabel: (nodeId: string) => string;

  ensureBp109Meta: (nodeId: string, kind: NodeKind) => void;
}) {
  const {
    open,
    onClose,
    nodes,
    getKind,
    labelScheme,
    setLabelScheme,
    labelMode,
    setLabelMode,
    labelOverrides,
    setLabelOverrides,
    bayTypeOverrides,
    setBayTypeOverrides,
    bp109MetaById,
    setBp109MetaById,
    getDisplayLabel,
    ensureBp109Meta,
  } = props;

  const selectStyle: CSSProperties = {
    padding: 8,
    width: "100%",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#fff",
  };

  return (
    <ModalShell title="Labelling" open={open} onClose={onClose}>
      <div style={{ color: "#cbd5e1", marginBottom: 10, fontSize: 12 }}>
        FREEFORM overrides always win. BP109 uses the schema JSON and auto-sets prefix when Voltage changes.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Scheme</div>
          <select value={labelScheme} onChange={(e) => setLabelScheme(e.target.value as LabelScheme)} style={selectStyle}>
            <option value="DEFAULT">Default</option>
            <option value="NG_BP109">NG BP109</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Mode</div>
          <select value={labelMode} onChange={(e) => setLabelMode(e.target.value as LabelMode)} style={selectStyle}>
            <option value="AUTO">Auto</option>
            <option value="FREEFORM">Freeform overrides</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {nodes
          .map((n) => ({ n, kind: getKind(n) }))
          .filter((entry): entry is { n: Node; kind: NodeKind } => entry.kind !== null && entry.kind !== "junction")
          .map(({ n, kind }) => {
            const display = getDisplayLabel(n.id);

            if (labelScheme === "NG_BP109" && !bp109MetaById[n.id]) ensureBp109Meta(n.id, kind);
            const meta = bp109MetaById[n.id];

            const bayType = bayTypeOverrides[n.id] ?? "AUTO";

            return (
              <div
                key={n.id}
                style={{
                  border: "1px solid #1f2937",
                  borderRadius: 10,
                  padding: 12,
                  background: "#0f172a",
                  display: "grid",
                  gridTemplateColumns: "90px 140px 160px 1fr",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 900 }}>{kind.toUpperCase()}</div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace' }}>{n.id}</div>

                <div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>BayType</div>
                  <select
                    value={bayType}
                    onChange={(e) => setBayTypeOverrides((m) => ({ ...m, [n.id]: e.target.value as BayType }))}
                    style={{ ...selectStyle, background: "#0b1220" }}
                  >
                    <option value="AUTO">AUTO</option>
                    <option value="BUS">BUS</option>
                    <option value="LINE">LINE</option>
                    <option value="TX">TX</option>
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Label</div>
                  {labelMode === "FREEFORM" ? (
                    <input
                      value={labelOverrides[n.id] ?? ""}
                      placeholder={display}
                      onChange={(e) => setLabelOverrides((m) => ({ ...m, [n.id]: e.target.value }))}
                      style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#fff" }}
                    />
                  ) : (
                    <div style={{ padding: 8, borderRadius: 8, border: "1px solid #1f2937", background: "#0b1220", color: "#fff" }}>
                      {display}
                    </div>
                  )}

                  {labelScheme === "NG_BP109" && meta && (
                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Voltage</div>
                        <select
                          value={meta.voltageClass}
                          onChange={(e) => {
                            const vc = e.target.value as VoltageClass;
                            const defPrefix = schemaDefaultPrefix(vc);
                            setBp109MetaById((m) => ({
                              ...m,
                              [n.id]: { ...m[n.id], voltageClass: vc, prefix: defPrefix },
                            }));
                          }}
                          style={{ ...selectStyle, background: "#0b1220" }}
                        >
                          <option value="400">400</option>
                          <option value="275">275</option>
                          <option value="132">132</option>
                          <option value="LV66">LV66</option>
                          <option value="HVDC">HVDC</option>
                        </select>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Type</div>
                        <select
                          value={meta.circuitType}
                          onChange={(e) =>
                            setBp109MetaById((m) => ({ ...m, [n.id]: { ...m[n.id], circuitType: e.target.value as CircuitType } }))
                          }
                          style={{ ...selectStyle, background: "#0b1220" }}
                        >
                          <option value="LINE">LINE</option>
                          <option value="TX_HV">TX_HV</option>
                          <option value="MAIN_BUS_SEC">MAIN_BUS_SEC</option>
                          <option value="BUS_COUPLER">BUS_COUPLER</option>
                          <option value="SERIES_REACTOR">SERIES_REACTOR</option>
                          <option value="SHUNT_COMP">SHUNT_COMP</option>
                          <option value="RES_BUS_SEC">RES_BUS_SEC</option>
                          <option value="SPARE">SPARE</option>
                          <option value="TX_LV">TX_LV</option>
                          <option value="GEN">GEN</option>
                        </select>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Circuit #</div>
                        <input
                          type="number"
                          min={0}
                          max={9}
                          value={meta.circuitNumber}
                          onChange={(e) =>
                            setBp109MetaById((m) => ({ ...m, [n.id]: { ...m[n.id], circuitNumber: Number(e.target.value) } }))
                          }
                          style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#fff" }}
                        />
                      </div>

                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Purpose</div>
                        <select
                          value={String(meta.purposeDigit)}
                          onChange={(e) =>
                            setBp109MetaById((m) => ({
                              ...m,
                              [n.id]: { ...m[n.id], purposeDigit: Number(e.target.value) as PurposeDigit },
                            }))
                          }
                          style={{ ...selectStyle, background: "#0b1220" }}
                        >
                          {Array.from({ length: 10 }).map((_, i) => (
                            <option key={i} value={String(i)}>{i}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Suffix</div>
                        <input
                          value={meta.suffixLetter ?? ""}
                          onChange={(e) => setBp109MetaById((m) => ({ ...m, [n.id]: { ...m[n.id], suffixLetter: e.target.value } }))}
                          style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#fff" }}
                        />
                      </div>

                      <div style={{ gridColumn: "span 5" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Prefix override</div>
                        <select
                          value={meta.prefix ?? ""}
                          onChange={(e) => setBp109MetaById((m) => ({ ...m, [n.id]: { ...m[n.id], prefix: e.target.value as any } }))}
                          style={{ ...selectStyle, background: "#0b1220" }}
                        >
                          <option value="">(schema default)</option>
                          <option value="X">X</option>
                          <option value="D">D</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </ModalShell>
  );
}
