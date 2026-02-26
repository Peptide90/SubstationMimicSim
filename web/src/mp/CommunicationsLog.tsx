import { useEffect, useMemo, useRef, useState } from "react";

import type { CommsMessage, CommsTargetRole, Role, Team } from "../../../shared/mpTypes";

type Props = {
  messages: CommsMessage[];
  onPost: (targetRole: CommsTargetRole, targetTeamId: string | undefined, text: string) => void;
  role: Role;
  playerName?: string;
  teams?: Team[];
  allowTeamTarget?: boolean;
};

const ROLE_TARGET_OPTIONS: Array<{ value: CommsTargetRole; label: string }> = [
  { value: "all", label: "All" },
  { value: "operator", label: "Control Room Operator" },
  { value: "field", label: "Field Engineer" },
  { value: "planner", label: "System Planner" },
];

export function CommunicationsLog({ messages, onPost, role, playerName, teams = [], allowTeamTarget = false }: Props) {
  const [targetRole, setTargetRole] = useState<CommsTargetRole>("all");
  const [targetTeamId, setTargetTeamId] = useState<string | undefined>(teams[0]?.id);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sorted = useMemo(() => [...messages].sort((a, b) => a.timestamp - b.timestamp), [messages]);
  const teamNameById = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);

  useEffect(() => {
    if (targetRole !== "team") return;
    if (!targetTeamId && teams[0]?.id) {
      setTargetTeamId(teams[0].id);
    }
  }, [targetRole, targetTeamId, teams]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [sorted]);

  const audienceLabel = (message: CommsMessage) => {
    if (message.audience.scope === "all") return "ALL";
    if (message.audience.scope === "role") return ROLE_TARGET_OPTIONS.find((item) => item.value === message.audience.role)?.label ?? message.audience.role;
    return `TEAM: ${teamNameById.get(message.audience.teamId) ?? message.audience.teamId}`;
  };

  return (
    <div
      style={{
        borderTop: "1px solid #1f2937",
        background: "#0b1220",
        color: "#e2e8f0",
        padding: 12,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <strong>Communications Log</strong>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          {role.toUpperCase()} • {playerName ?? "Unnamed"}
        </span>
      </div>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: "auto", display: "grid", gap: 6, marginBottom: 10 }}>
        {sorted.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>No messages yet.</div>
        ) : (
          sorted.map((msg) => {
            const isTeamDirect = msg.audience.scope === "team";
            return (
              <div
                key={msg.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 1fr",
                  gap: 8,
                  padding: "6px 8px",
                  border: `1px solid ${isTeamDirect ? "#7c3aed" : "#1f2937"}`,
                  background: isTeamDirect ? "rgba(124, 58, 237, 0.16)" : "transparent",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                <div style={{ color: "#94a3b8" }}>{new Date(msg.timestamp).toLocaleTimeString()}</div>
                <div>
                  <strong>{audienceLabel(msg)}</strong>{" "}
                  <span style={{ color: "#94a3b8" }}>
                    — {msg.authorRole.toUpperCase()} {msg.authorName}
                  </span>
                  <div style={{ color: "#e2e8f0", marginTop: 2 }}>{msg.text}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: targetRole === "team" ? "180px 180px 1fr auto" : "180px 1fr auto", gap: 8 }}>
        <select
          value={targetRole}
          onChange={(event) => setTargetRole(event.target.value as CommsTargetRole)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
          }}
        >
          {ROLE_TARGET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          {allowTeamTarget ? <option value="team">Team Direct</option> : null}
        </select>
        {targetRole === "team" ? (
          <select
            value={targetTeamId ?? ""}
            onChange={(event) => setTargetTeamId(event.target.value || undefined)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#e2e8f0",
            }}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        ) : null}
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Post a formal note"
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
          }}
        />
        <button
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #1d4ed8",
            background: "#1d4ed8",
            color: "#e2e8f0",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() => {
            if (!text.trim()) return;
            onPost(targetRole, targetRole === "team" ? targetTeamId : undefined, text.trim());
            setText("");
          }}
        >
          Post
        </button>
      </div>
    </div>
  );
}
