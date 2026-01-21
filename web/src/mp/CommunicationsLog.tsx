import { useMemo, useState } from "react";

import type { CommsMessage, CommsMessageType, Role } from "../../../shared/mpTypes";

type Props = {
  messages: CommsMessage[];
  onPost: (type: CommsMessageType, text: string) => void;
  role: Role;
  playerName?: string;
};

const MESSAGE_TYPES: CommsMessageType[] = [
  "Switching Instruction",
  "Field Report",
  "Planner Request",
  "General Note",
];

export function CommunicationsLog({ messages, onPost, role, playerName }: Props) {
  const [messageType, setMessageType] = useState<CommsMessageType>("General Note");
  const [text, setText] = useState("");

  const sorted = useMemo(() => [...messages].sort((a, b) => a.timestamp - b.timestamp), [messages]);

  return (
    <div style={{ borderTop: "1px solid #1f2937", background: "#0b1220", color: "#e2e8f0", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <strong>Communications Log</strong>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          {role.toUpperCase()} • {playerName ?? "Unnamed"}
        </span>
      </div>
      <div style={{ maxHeight: 180, overflow: "auto", display: "grid", gap: 6, marginBottom: 10 }}>
        {sorted.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>No messages yet.</div>
        ) : (
          sorted.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr",
                gap: 8,
                padding: "6px 8px",
                border: "1px solid #1f2937",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ color: "#94a3b8" }}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
              <div>
                <strong>{msg.type}</strong>{" "}
                <span style={{ color: "#94a3b8" }}>
                  — {msg.authorRole.toUpperCase()} {msg.authorName}
                </span>
                <div style={{ color: "#e2e8f0", marginTop: 2 }}>{msg.text}</div>
              </div>
            </div>
          ))
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 8 }}>
        <select
          value={messageType}
          onChange={(event) => setMessageType(event.target.value as CommsMessageType)}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
          }}
        >
          {MESSAGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Post a formal note to all roles"
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
            onPost(messageType, text.trim());
            setText("");
          }}
        >
          Post
        </button>
      </div>
    </div>
  );
}
