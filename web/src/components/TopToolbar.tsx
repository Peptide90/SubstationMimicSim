import type { CSSProperties } from "react";

import { BrandingCluster } from "./BrandingCluster";

type Props = {
  buildTag: string;
  onOpenMenu: () => void;
  onOpenHelp: () => void;
  onOpenInterlocking: () => void;
  onOpenLabelling: () => void;
  onOpenSaveLoad: () => void;
  onOpenPowerFlow: () => void;
};

export function TopToolbar({
  buildTag,
  onOpenMenu,
  onOpenHelp,
  onOpenInterlocking,
  onOpenLabelling,
  onOpenSaveLoad,
  onOpenPowerFlow,
}: Props) {
  const btn: CSSProperties = {
    background: "#0f172a",
    color: "#e5e7eb",
    border: "1px solid #334155",
    borderRadius: 6,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 13,
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 48,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        background: "#020617",
        borderBottom: "1px solid #1e293b",
        zIndex: 1000,
      }}
    >
      <button
        style={{
          ...btn,
          background: "#1e293b",
          borderColor: "#475569",
        }}
        onClick={onOpenMenu}
      >
        ☰ Menu
      </button>
      <button style={btn} onClick={onOpenHelp}>
        Help
      </button>
      <div style={{ fontWeight: 700, color: "#e5e7eb", marginRight: 12 }}>
        Substation Mimic
      </div>

      <button style={btn} onClick={onOpenInterlocking}>
        Interlocking
      </button>
      <button style={btn} onClick={onOpenLabelling}>
        Labelling
      </button>
      <button style={btn} onClick={onOpenSaveLoad}>
        Save / Load
      </button>
      <button style={btn} onClick={onOpenPowerFlow}>
        Power Flow
      </button>

      <div style={{ marginLeft: "auto" }}>
        <BrandingCluster buildTag={buildTag} variant="compact" />
      </div>
    </div>
  );
}
