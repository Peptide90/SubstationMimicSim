import type { CSSProperties } from "react";

import { BrandingCluster } from "./BrandingCluster";

type Props = {
  buildTag: string;
  onStartSolo: () => void;
};

export function MainMenu({ buildTag, onStartSolo }: Props) {
  const buttonStyle: CSSProperties = {
    width: "min(420px, 90vw)",
    padding: "14px 18px",
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  };

  const disabledStyle: CSSProperties = {
    ...buttonStyle,
    opacity: 0.5,
    cursor: "not-allowed",
  };

  return (
    <div
      style={{
        height: "100vh",
        background: "radial-gradient(circle at top, #0b1220, #060b12 65%)",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        gap: 32,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ textAlign: "center", display: "grid", gap: 10 }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.5 }}>Substation Mimic</div>
        <div style={{ fontSize: 14, color: "#94a3b8" }}>
          Choose a mode to begin building and simulating your substation.
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
        <button style={buttonStyle} onClick={onStartSolo}>
          Solo: Substation Mimic Builder
        </button>
        <button style={disabledStyle} disabled>
          Multiplayer (Coming soon)
        </button>
      </div>

      <div style={{ position: "absolute", bottom: 24, left: 0, right: 0 }}>
        <BrandingCluster buildTag={buildTag} variant="footer" align="center" />
      </div>
    </div>
  );
}
