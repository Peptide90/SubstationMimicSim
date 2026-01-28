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
  width: "min(920px, 100%)",
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
  gridTemplateColumns: "1fr 160px 40px",
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

function formatLine(line: SwitchingInstruction) {
  return `${line.verb.replace(/_/g, " ")} ${line.targetLabel}`;
}

function formatStamp(timestamp: number | null | undefined) {
  if (!timestamp) return "Pending";
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  return `${seconds}s ago`;
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
  if (!open || !segment) return null;

  const reportTargets = segment.instructions.filter((line) => line.requiresReport?.type === "LINE_END_COLOURS");

  return (
    <div style={modalStyle}>
      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{segment.title}</div>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>
              Switching instructions (tick for your own tracking).
            </div>
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

        <div style={{ borderTop: "1px solid #1f2937", paddingTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Report back to Control</div>
          {reportTargets.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>No reports required.</div>}
          {reportTargets.map((line) => {
            const options = reportOptions[line.id] ?? [];
            return (
              <div key={line.id} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#cbd5f5" }}>{formatLine(line)}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0" }}
                    defaultValue=""
                    onChange={(e) => {
                      const selected = options.find((opt) => opt.id === e.target.value);
                      if (selected && line.requiresReport) {
                        onSubmitReport("LINE_END_COLOURS", line.requiresReport.interfaceId, selected.value);
                      }
                      e.currentTarget.value = "";
                    }}
                  >
                    <option value="" disabled>
                      Select line end colours
                    </option>
                    {options.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
          {reports.length > 0 && (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              Latest report: {reports[reports.length - 1].type} ·{" "}
              {reports[reports.length - 1].value.join(" / ")} ·{" "}
              {reports[reports.length - 1].correct ? "Accepted" : "Incorrect"}
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
