import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onMouseDown={onCancel}
    >
      <div
        style={{
          width: "min(520px, 92vw)",
          background: "#0b1220",
          borderRadius: 10,
          border: "1px solid #1f2937",
          padding: 18,
          color: "#fff",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
        <div style={{ marginTop: 10, color: "#cbd5f5", fontSize: 13 }}>{description}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button
            onClick={onCancel}
            style={{
              border: "1px solid #334155",
              background: "#0f172a",
              padding: "6px 12px",
              borderRadius: 8,
              color: "#fff",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              border: "1px solid #4c1d95",
              background: "#6d28d9",
              padding: "6px 12px",
              borderRadius: 8,
              color: "#fff",
              fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
