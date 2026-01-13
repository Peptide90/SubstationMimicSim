import React from "react";

export function TopToolbar(props: {
  buildTag: string;
  onOpenInterlocking: () => void;
  onOpenLabelling: () => void;
  onOpenSaveLoad: () => void;
}) {
  const { buildTag, onOpenInterlocking, onOpenLabelling, onOpenSaveLoad } = props;

  const btn: React.CSSProperties = {
    border: "1px solid #334155",
    background: "#0f172a",
    padding: "6px 10px",
    borderRadius: 8,
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 52,
        zIndex: 99999,
        background: "#0b1220",
        borderBottom: "1px solid #1f2937",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 12px",
        color: "#fff",
      }}
    >
      <div style={{ fontWeight: 900 }}>Substation Mimic</div>
      <div style={{ color: "#94a3b8", fontSize: 12 }}>Build: {buildTag}</div>

      <button style={btn} onClick={onOpenInterlocking}>Interlocking</button>
      <button style={btn} onClick={onOpenLabelling}>Labelling</button>
      <button style={btn} onClick={onOpenSaveLoad}>Save/Load</button>
    </div>
  );
}
