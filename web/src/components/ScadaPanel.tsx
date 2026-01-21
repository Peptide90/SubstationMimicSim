import { EventLog } from "./EventLog";
import type { EventCategory, EventLogFilters, EventLogItem } from "./EventLog";

export function ScadaPanel(props: {
  energizedEdgeCount: number;
  groundedEdgeCount: number;

  switchgear: Record<
    "es" | "ds" | "cb",
    Array<{
      id: string;
      state: "open" | "closed";
      label: string;
      darEnabled?: boolean;
      darLockout?: boolean;
      failActive?: boolean;
      disabled?: boolean;
    }>
  >;
  onToggleSwitch: (id: string) => void;
  onToggleDar: (id: string) => void;
  onResetCondition: (id: string) => void;

  events: EventLogItem[];
  filters: EventLogFilters;
  onToggleFilter: (cat: EventCategory | "acknowledged") => void;
  onAcknowledgeEvent: (eventId: string) => void;
  commandContent?: React.ReactNode;
  showSwitchgear?: boolean;
  commandHint?: string;
}) {
  const {
    energizedEdgeCount,
    groundedEdgeCount,
    switchgear,
    onToggleSwitch,
    onToggleDar,
    onResetCondition,
    events,
    filters,
    onToggleFilter,
    onAcknowledgeEvent,
    commandContent,
    showSwitchgear = true,
    commandHint,
  } = props;

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
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Commands</div>
        <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>
          {commandHint ?? "Tip: double-click a device on the diagram to operate it (or use these buttons)."}
        </div>
        {commandContent ? <div style={{ marginBottom: showSwitchgear ? 12 : 0 }}>{commandContent}</div> : null}
        {showSwitchgear ? (
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
                      const isCb = k === "cb";
                      const darState = sw.darLockout ? "lockout" : sw.darEnabled ? "active" : "inactive";
                      const darBg = darState === "lockout" ? "#b91c1c" : darState === "active" ? "#15803d" : "#4b5563";
                      const darTitle = darState === "lockout" ? "DAR LOCKOUT (click to toggle)" : "DAR (click to toggle)";
                      const failActive = sw.failActive === true;
                      const failBg = failActive ? "#dc2626" : "#4b5563";
                      const isDisabled = sw.disabled === true;
                      return (
                        <div key={sw.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                          <button
                            onClick={() => onToggleSwitch(sw.id)}
                            disabled={isDisabled}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #334155",
                              background: isDisabled ? "#1f2937" : isClosed ? "#3f0d0d" : "#0d3f1d",
                              color: isDisabled ? "#64748b" : "#fff",
                              fontWeight: 900,
                              cursor: isDisabled ? "not-allowed" : "pointer",
                            }}
                          >
                            {sw.label}
                          </button>
                          {isCb && (
                            <div style={{ display: "grid", gap: 6 }}>
                              <button
                                onClick={() => onToggleDar(sw.id)}
                                title={darTitle}
                                style={{
                                  minWidth: 44,
                                  padding: "4px 6px",
                                  borderRadius: 6,
                                  border: "1px solid #1f2937",
                                  background: darBg,
                                  color: "#f8fafc",
                                  fontSize: 10,
                                  fontWeight: 900,
                                  cursor: "pointer",
                                }}
                              >
                                DAR
                              </button>
                              <button
                                onClick={() => onResetCondition(sw.id)}
                                title={failActive ? "Reset breaker fail" : "No breaker fail"}
                                style={{
                                  minWidth: 44,
                                  padding: "4px 6px",
                                  borderRadius: 6,
                                  border: "1px solid #1f2937",
                                  background: failBg,
                                  color: "#f8fafc",
                                  fontSize: 10,
                                  fontWeight: 900,
                                  cursor: "pointer",
                                }}
                              >
                                FAIL
                              </button>
                            </div>
                          )}
                        </div>
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
        ) : null}
      </div>

      {/* Event log scrolls */}
      <EventLog
        events={events}
        filters={filters}
        onToggleFilter={onToggleFilter}
        onAcknowledgeEvent={onAcknowledgeEvent}
      />
    </div>
  );
}
