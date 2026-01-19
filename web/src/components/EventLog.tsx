import { useRef } from "react";

export type EventCategory = "info" | "warn" | "error" | "debug";
export type EventLogFilters = Record<EventCategory, boolean> & { acknowledged: boolean };
export type EventLogItem = {
  id: string;
  ts: number;
  category: EventCategory;
  msg: string;
  acknowledged?: boolean;
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function EventLog(props: {
  events: EventLogItem[];
  filters: EventLogFilters;
  onToggleFilter: (cat: EventCategory | "acknowledged") => void;
  onAcknowledgeEvent: (eventId: string) => void;
}) {
  const { events, filters, onToggleFilter, onAcknowledgeEvent } = props;

  const totalAlarms = events.filter((e) => e.category !== "debug").length;
  const totalErrors = events.filter((e) => e.category === "error").length;
  const acknowledgedAlarms = events.filter((e) => e.category !== "debug" && e.acknowledged).length;
  const flashAnchorRef = useRef(Date.now());
  const flashPhase = ((Date.now() - flashAnchorRef.current) % 2000) / 1000;

  const sorted = [...events].sort((a, b) => b.ts - a.ts);
  const filtered = sorted.filter((e) => {
    if (!filters[e.category]) return false;
    if (!filters.acknowledged && e.acknowledged) return false;
    return true;
  });

  return (
    <div style={{ padding: 14, overflow: "auto", minHeight: 0, color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 900 }}>Event Log</div>
        <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#cbd5f5", flexWrap: "wrap" }}>
          <span style={{ background: "#1f2937", borderRadius: 999, padding: "2px 8px" }}>
            Alarms: {totalAlarms}
          </span>
          <span style={{ background: "#7f1d1d", borderRadius: 999, padding: "2px 8px" }}>
            Errors: {totalErrors}
          </span>
          <span style={{ background: "#334155", borderRadius: 999, padding: "2px 8px" }}>
            Ack: {acknowledgedAlarms}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        {(["info", "warn", "error", "debug"] as EventCategory[]).map((cat) => (
          <label key={cat} style={{ display: "flex", gap: 6, alignItems: "center", color: "#fff", fontSize: 13 }}>
            <input type="checkbox" checked={filters[cat]} onChange={() => onToggleFilter(cat)} />
            {cat.toUpperCase()}
          </label>
        ))}
        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#fff", fontSize: 13 }}>
          <input type="checkbox" checked={filters.acknowledged} onChange={() => onToggleFilter("acknowledged")} />
          ACK
        </label>
      </div>
      <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>
        Tip: click an event to acknowledge it.
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: "#94a3b8" }}>No events.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {filtered.map((e, idx) => {
            const isAcked = e.acknowledged === true;
            const shouldFlash = !isAcked && (e.category === "info" || e.category === "error");
            const flashAnim =
              e.category === "info" ? "scada-flash-green 2s linear infinite" : "scada-flash-red 2s linear infinite";
            const ackedBackground = e.category === "error" ? "#f2b4b4" : "#ffffff";
            const defaultBackground = "#0f172a";
            const baseBackground = shouldFlash ? undefined : (isAcked ? ackedBackground : defaultBackground);
            const baseColor = isAcked
              ? "#111827"
              : e.category === "info"
              ? "#0b1220"
              : e.category === "error"
              ? "#fff"
              : "#fff";
            return (
            <div
              key={e.id ?? `${e.ts}-${idx}`}
              onClick={() => onAcknowledgeEvent(e.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: 10,
                padding: "8px 10px",
                border: "1px solid #1f2937",
                borderRadius: 8,
                fontSize: 13,
                background: baseBackground,
                color: baseColor,
                cursor: "pointer",
                animation: shouldFlash ? flashAnim : undefined,
                animationDelay: shouldFlash ? `-${flashPhase}s` : undefined,
              }}
            >
              <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace' }}>
                {formatTime(e.ts)}
              </div>
              <div>{e.msg}</div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
