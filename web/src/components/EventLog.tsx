import React from "react";

export type EventCategory = "info" | "warn" | "error" | "debug";
export type EventLogItem = {
  ts: number;
  category: EventCategory;
  msg: string;
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
  filters: Record<EventCategory, boolean>;
  onToggleFilter: (cat: EventCategory) => void;
}) {
  const { events, filters, onToggleFilter } = props;

  const filtered = events.filter((e) => filters[e.category]);

  return (
    <div style={{ padding: 14, overflow: "auto", minHeight: 0, color: "#fff" }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>Event Log</div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        {(["info", "warn", "error", "debug"] as EventCategory[]).map((cat) => (
          <label key={cat} style={{ display: "flex", gap: 6, alignItems: "center", color: "#fff", fontSize: 13 }}>
            <input type="checkbox" checked={filters[cat]} onChange={() => onToggleFilter(cat)} />
            {cat.toUpperCase()}
          </label>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: "#94a3b8" }}>No events.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {filtered.map((e, idx) => (
            <div
              key={`${e.ts}-${idx}`}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: 10,
                padding: "8px 10px",
                border: "1px solid #1f2937",
                borderRadius: 8,
                fontSize: 13,
                background: "#0f172a",
                color: "#fff",
              }}
            >
              <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace' }}>
                {formatTime(e.ts)}
              </div>
              <div>{e.msg}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
