import type { ReactNode, CSSProperties } from "react";
import type { Node } from "reactflow";
import type { NodeKind } from "../../core/model";
import { schemaDefaultPrefix } from "../../app/labeling/bp109";
import { LABEL_SCHEMES, getSchemeDefinition } from "../../app/labeling/schemes";

import type {
  AnsiIecMeta,
  BP109Meta,
  BayType,
  LabelMode,
  LabelScheme,
  VoltageClass,
  CircuitType,
  PurposeDigit,
} from "../../app/labeling/types";

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

  bp109MetaById: Record<string, Partial<BP109Meta>>;
  setBp109MetaById: (fn: (prev: Record<string, Partial<BP109Meta>>) => Record<string, Partial<BP109Meta>>) => void;

  ansiIecMetaById: Record<string, Partial<AnsiIecMeta>>;
  setAnsiIecMetaById: (fn: (prev: Record<string, Partial<AnsiIecMeta>>) => Record<string, Partial<AnsiIecMeta>>) => void;

  resolvedBp109Meta: Record<string, BP109Meta>;
  resolvedAnsiIecMeta: Record<string, AnsiIecMeta>;

  substationVoltageKv: number;
  setSubstationVoltageKv: (v: number) => void;

  getDisplayLabel: (nodeId: string) => string;
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
    setBp109MetaById,
    setAnsiIecMetaById,
    resolvedBp109Meta,
    resolvedAnsiIecMeta,
    substationVoltageKv,
    setSubstationVoltageKv,
    getDisplayLabel,
  } = props;

  const schemeDef = getSchemeDefinition(labelScheme);

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
        {schemeDef.description}
        {schemeDef.reference ? ` (${schemeDef.reference})` : ""}
        {" — "}
        FREEFORM overrides always win. Topology drives auto labels; field edits are saved as overrides.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Naming scheme</div>
          <select value={labelScheme} onChange={(e) => setLabelScheme(e.target.value as LabelScheme)} style={selectStyle}>
            {LABEL_SCHEMES.filter((s) => s.available).map((scheme) => (
              <option key={scheme.id} value={scheme.id}>
                {scheme.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Mode</div>
          <select value={labelMode} onChange={(e) => setLabelMode(e.target.value as LabelMode)} style={selectStyle}>
            <option value="AUTO">Auto</option>
            <option value="FREEFORM">Freeform overrides</option>
          </select>
        </div>
        {labelScheme === "NG_BP109" && (
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Site kV</div>
            <select
              value={String(substationVoltageKv)}
              onChange={(e) => setSubstationVoltageKv(Number(e.target.value))}
              style={selectStyle}
            >
              <option value="400">400</option>
              <option value="275">275</option>
              <option value="132">132</option>
              <option value="66">66</option>
            </select>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {nodes
          .map((n) => ({ n, kind: getKind(n) }))
          .filter((entry): entry is { n: Node; kind: NodeKind } => entry.kind !== null && entry.kind !== "junction")
          .map(({ n, kind }) => {
            const display = getDisplayLabel(n.id);
            const bp109Meta = resolvedBp109Meta[n.id];
            const ansiMeta = resolvedAnsiIecMeta[n.id];
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
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Bay type (override)</div>
                  <select
                    value={bayType}
                    onChange={(e) => setBayTypeOverrides((m) => ({ ...m, [n.id]: e.target.value as BayType }))}
                    style={{ ...selectStyle, background: "#0b1220" }}
                    disabled={labelScheme === "DEFAULT"}
                  >
                    <option value="AUTO">AUTO (from topology)</option>
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

                  {labelScheme === "NG_BP109" && bp109Meta && (
                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Voltage class</div>
                        <select
                          value={bp109Meta.voltageClass}
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
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Circuit type</div>
                        <select
                          value={bp109Meta.circuitType}
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
                          value={bp109Meta.circuitNumber}
                          onChange={(e) =>
                            setBp109MetaById((m) => ({ ...m, [n.id]: { ...m[n.id], circuitNumber: Number(e.target.value) } }))
                          }
                          style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#fff" }}
                        />
                      </div>

                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Purpose</div>
                        <select
                          value={String(bp109Meta.purposeDigit)}
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
                          value={bp109Meta.suffixLetter ?? ""}
                          onChange={(e) => setBp109MetaById((m) => ({ ...m, [n.id]: { ...m[n.id], suffixLetter: e.target.value } }))}
                          style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#fff" }}
                        />
                      </div>

                      <div style={{ gridColumn: "span 5" }}>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Prefix override</div>
                        <select
                          value={bp109Meta.prefix ?? ""}
                          onChange={(e) => setBp109MetaById((m) => ({ ...m, [n.id]: { ...m[n.id], prefix: e.target.value as BP109Meta["prefix"] } }))}
                          style={{ ...selectStyle, background: "#0b1220" }}
                        >
                          <option value="">(schema default)</option>
                          <option value="X">X</option>
                          <option value="D">D</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {labelScheme === "ANSI_IEC" && ansiMeta && (
                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Function</div>
                        <input
                          value={ansiMeta.functionCode}
                          onChange={(e) => setAnsiIecMetaById((m) => ({ ...m, [n.id]: { ...m[n.id], functionCode: e.target.value } }))}
                          style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#fff" }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Bay #</div>
                        <input
                          type="number"
                          min={1}
                          value={ansiMeta.bayNumber}
                          onChange={(e) => setAnsiIecMetaById((m) => ({ ...m, [n.id]: { ...m[n.id], bayNumber: Number(e.target.value) } }))}
                          style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#fff" }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Suffix</div>
                        <input
                          value={ansiMeta.suffix ?? ""}
                          onChange={(e) => setAnsiIecMetaById((m) => ({ ...m, [n.id]: { ...m[n.id], suffix: e.target.value } }))}
                          style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#fff" }}
                        />
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
