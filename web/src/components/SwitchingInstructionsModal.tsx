import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import type { SwitchingInstruction, SwitchingSegment, LineEndColour } from "../app/challenges/types";

type ReportOption = { id: string; label: string; value: LineEndColour[] };

type ReportLogEntry = {
  id: string;
  lineId?: string;
  type: "LINE_END_COLOURS";
  value: LineEndColour[];
  timestamp: number;
  correct: boolean;
};

type ReportType = "LINE_END_COLOURS" | "SWITCHGEAR_STATUS" | "OIL_LEVEL" | "GAS_PRESSURE" | "TAP_POSITION";

type Props = {
  open: boolean;
  segment: SwitchingSegment | null;
  segmentComplete?: boolean;
  canAdvance?: boolean;
  onAdvanceSegment?: () => void;
  completionStamps: Record<string, number | null>;
  reportOptions: Record<string, ReportOption[]>;
  reports: ReportLogEntry[];
  onClose: () => void;
  onToggleTick: (id: string) => void;
  ticked: Record<string, boolean>;
  onSubmitReport: (reportType: "LINE_END_COLOURS", interfaceId: string, value: LineEndColour[]) => void;
};

const modalStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2,6,23,0.75)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
  padding: 24,
};

const panelStyle: CSSProperties = {
  width: "min(960px, 100%)",
  maxHeight: "90vh",
  overflow: "auto",
  background: "#0b1220",
  border: "1px solid #1f2937",
  borderRadius: 16,
  padding: 20,
  color: "#e2e8f0",
  boxShadow: "0 16px 32px rgba(0,0,0,0.5)",
  display: "grid",
  gap: 16,
};

const lineStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 170px 40px",
  alignItems: "center",
  gap: 12,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #1f2937",
  background: "#0f172a",
};

const buttonStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#38bdf8",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer",
};

const selectStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#e2e8f0",
};

function formatLine(line: SwitchingInstruction) {
  return `${line.verb.replace(/_/g, " ")} ${line.targetLabel}`;
}

function formatStamp(timestamp: number | null | undefined) {
  if (!timestamp) return "Pending";
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  return `${elapsedSeconds}s ago`;
}

function makeRefId() {
  return `NCC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
}

export function SwitchingInstructionsModal({
  open,
  segment,
  segmentComplete,
  canAdvance,
  onAdvanceSegment,
  completionStamps,
  reportOptions,
  reports,
  onClose,
  onToggleTick,
  ticked,
  onSubmitReport,
}: Props) {
  const [selectedReportType, setSelectedReportType] = useState<ReportType>("LINE_END_COLOURS");
  const [selectedInstructionId, setSelectedInstructionId] = useState<string>("");
  const [selectedValueId, setSelectedValueId] = useState<string>("");
  const [refId] = useState(() => makeRefId());

  if (!open || !segment) return null;

  const reportTargets = segment.instructions.filter((line) => line.requiresReport?.type === "LINE_END_COLOURS");

  const currentOptions = useMemo(() => {
    if (selectedReportType !== "LINE_END_COLOURS") return [] as ReportOption[];
    if (!selectedInstructionId) return [] as ReportOption[];
    return reportOptions[selectedInstructionId] ?? [];
  }, [selectedInstructionId, selectedReportType, reportOptions]);

  const submitDisabled =
    selectedReportType !== "LINE_END_COLOURS" || !selectedInstructionId || !selectedValueId;

  return (
    <div style={modalStyle}>
      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.4 }}>NETWORK CONTROL INSTRUCTIONS</div>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>
              Ref: {refId} · Issued: {new Date().toLocaleString()}
            </div>
            <div style={{ color: "#cbd5f5", fontSize: 13, marginTop: 4 }}>{segment.title}</div>
          </div>
          <button style={{ ...buttonStyle, background: "#0f172a", color: "#e2e8f0" }} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {segment.instructions.map((line) => (
            <div key={line.id} style={lineStyle}>
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontWeight: 700 }}>{formatLine(line)}</div>
                {line.notes && <div style={{ fontSize: 12, color: "#94a3b8" }}>{line.notes}</div>}
              </div>
              <div style={{ fontSize: 12, color: completionStamps[line.id] ? "#22c55e" : "#f97316" }}>
                {completionStamps[line.id] ? `Completed ${formatStamp(completionStamps[line.id])}` : "Not complete"}
              </div>
              <label style={{ display: "flex", justifyContent: "center" }}>
                <input type="checkbox" checked={ticked[line.id] ?? false} onChange={() => onToggleTick(line.id)} />
              </label>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #1f2937", paddingTop: 12, display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Report back to Control</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                style={selectStyle}
                value={selectedReportType}
                onChange={(e) => {
                  const next = e.target.value as ReportType;
                  setSelectedReportType(next);
                  setSelectedInstructionId("");
                  setSelectedValueId("");
                }}
              >
                <option value="LINE_END_COLOURS">LINE_END_COLOURS</option>
                <option value="SWITCHGEAR_STATUS" disabled>
                  SWITCHGEAR_STATUS (coming soon)
                </option>
                <option value="OIL_LEVEL" disabled>
                  OIL_LEVEL (coming soon)
                </option>
                <option value="GAS_PRESSURE" disabled>
                  GAS_PRESSURE (coming soon)
                </option>
                <option value="TAP_POSITION" disabled>
                  TAP_POSITION (coming soon)
                </option>
              </select>

              <select
                style={selectStyle}
                value={selectedInstructionId}
                onChange={(e) => {
                  setSelectedInstructionId(e.target.value);
                  setSelectedValueId("");
                }}
                disabled={selectedReportType !== "LINE_END_COLOURS" || reportTargets.length === 0}
              >
                <option value="">Select instruction</option>
                {reportTargets.map((line) => (
                  <option key={line.id} value={line.id}>
                    {formatLine(line)}
                  </option>
                ))}
              </select>

              <select
                style={selectStyle}
                value={selectedValueId}
                onChange={(e) => setSelectedValueId(e.target.value)}
                disabled={selectedReportType !== "LINE_END_COLOURS" || !selectedInstructionId}
              >
                <option value="">Select value</option>
                {currentOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <button
                style={{ ...buttonStyle, opacity: submitDisabled ? 0.6 : 1, cursor: submitDisabled ? "not-allowed" : "pointer" }}
                disabled={submitDisabled}
                onClick={() => {
                  if (submitDisabled) return;
                  const line = segment.instructions.find((item) => item.id === selectedInstructionId);
                  const selected = currentOptions.find((opt) => opt.id === selectedValueId);
                  if (!line?.requiresReport || !selected) return;
                  onSubmitReport("LINE_END_COLOURS", line.requiresReport.interfaceId, selected.value);
                  setSelectedValueId("");
                }}
              >
                Submit Report
              </button>
            </div>
          </div>

          {reports.length > 0 && (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              Latest report: {reports[reports.length - 1].type} · {reports[reports.length - 1].value.join(" / ")} · {reports[reports.length - 1].correct ? "Accepted" : "Incorrect"}
            </div>
          )}
          {segmentComplete && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#22c55e" }}>Segment complete.</div>
              {canAdvance && onAdvanceSegment && (
                <button style={buttonStyle} onClick={onAdvanceSegment}>
                  Next segment
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
