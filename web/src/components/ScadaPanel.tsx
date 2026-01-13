import React from "react";
import { EventLog } from "./EventLog";
import type { EventCategory, EventLogItem } from "./EventLog";

export function ScadaPanel(props: {
  energizedEdgeCount: number;
  groundedEdgeCount: number;

  switchgear: Record<"es" | "ds" | "cb", Array<{ id: string; state: "open" | "closed"; label: string }>>;
  onToggleSwitch: (id: string) => void;

  events: EventLogItem[];
  filters: Record<EventCategory, boolean>;
  onToggleFilter: (cat: EventCategory) => void;
}) {
  const { energizedEdgeCount, groundedEdgeCount, switchgear, onToggleSwitch, events, filters, onToggleFilter } = props;

  return (
    <div
      style={{
        flex: 1,
        borderLeft: "1px solid #1f2937",
        background: "#0b1220",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {/* Status */}
      <div style={{ padding: 14, borderBottom: "1px solid #1f2937" }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>SCADA</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 14 }}>
          <div>
            <div style={{ color: "#94a3b8" }}>Energized edges</div>
            <div style={{ color: "#fff" }}>{energizedEdgeCount}</div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Grounded edges</div>
            <div style={{ color: "#fff" }}>{groundedEdgeCount}</div>
          </div>
        </div>
      </div>

      {/* Commands */}
      <div style={{ padding: 14, borderBottom: "1px solid #1f2937" }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Commands</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          {(["es", "ds", "cb"] as const).map((k) => (
            <div key={k}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>{k.toUpperCase()}</div>
              <div style={{ display: "grid", gap: 6 }}>
                {switchgear[k].length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>None</div>
                ) : (
                  switchgear[k].map((sw) => {
                    const isClosed = sw.state === "closed";
                    return (
                      <button
                        key={sw.id}
                        onClick={() => onToggleSwitch(sw.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #334155",
                          background: isClosed ? "#3f0d0d" : "#0d3f1d",
                          color: "#fff",
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        {sw.label}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ))}
          <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Future</div>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Alarms / groups</div>
          </div>
        </div>
      </div>

      {/* Event log scrolls */}
      <EventLog events={events} filters={filters} onToggleFilter={onToggleFilter} />
    </div>
  );
}
