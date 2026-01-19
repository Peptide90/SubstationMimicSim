import { useMemo, useRef } from "react";
import type { ReactNode } from "react";

function ModalShell(props: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const { title, open, onClose, children } = props;
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
      onMouseDown={onClose}
    >
      <div
        style={{
          width: "min(1100px, 96vw)",
          maxHeight: "85vh",
          overflow: "auto",
          background: "#0b1220",
          borderRadius: 10,
          border: "1px solid #1f2937",
          padding: 14,
          color: "#fff",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ border: "1px solid #334155", background: "#0f172a", padding: "6px 10px", borderRadius: 8, color: "#fff" }}
          >
            Close
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export function SaveLoadModal(props: {
  open: boolean;
  onClose: () => void;

  saveTitle: string;
  setSaveTitle: (v: string) => void;
  saveDescription: string;
  setSaveDescription: (v: string) => void;

  onDownload: () => void;
  onLoadFile: (file: File) => Promise<void>;

  templates: Array<{ id: string; name: string; description: string; category: string }>;
  onLoadTemplate: (id: string) => void;
}) {
  const {
    open,
    onClose,
    saveTitle,
    setSaveTitle,
    saveDescription,
    setSaveDescription,
    onDownload,
    onLoadFile,
    templates,
    onLoadTemplate,
  } = props;

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Group templates by category (minimal changes, derived here)
  const { grouped, categories } = useMemo(() => {
    const grouped = templates.reduce<Record<string, typeof templates>>((acc, t) => {
      const key = t.category || "Uncategorized";
      (acc[key] ||= []).push(t);
      return acc;
    }, {});
    const categories = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
    return { grouped, categories };
  }, [templates]);

  return (
    <ModalShell title="Save / Load" open={open} onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Title (saved into JSON metadata)</div>
            <input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              style={{
                padding: 8,
                width: "100%",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#fff",
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Description (saved into JSON metadata)</div>
            <input
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              style={{
                padding: 8,
                width: "100%",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#fff",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={onDownload}
            style={{ border: "1px solid #334155", background: "#0f172a", padding: "8px 12px", borderRadius: 8, color: "#fff" }}
          >
            Save (download JSON)
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ border: "1px solid #334155", background: "#0f172a", padding: "8px 12px", borderRadius: 8, color: "#fff" }}
          >
            Load (upload JSON)
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await onLoadFile(f);
              e.currentTarget.value = "";
            }}
          />
        </div>

        <div style={{ borderTop: "1px solid #1f2937", paddingTop: 10 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Templates</div>

          <div style={{ display: "grid", gap: 14 }}>
            {categories.map((cat) => (
              <div key={cat}>
                <div style={{ fontWeight: 900, marginBottom: 8, color: "#fff" }}>{cat}</div>

                <div style={{ display: "grid", gap: 10 }}>
                  {grouped[cat].map((t) => (
                    <div
                      key={t.id}
                      style={{
                        border: "1px solid #1f2937",
                        background: "#0f172a",
                        borderRadius: 10,
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 900, color: "#fff" }}>{t.name}</div>
                      <div style={{ color: "#cbd5e1", marginTop: 4 }}>{t.description}</div>

                      <button
                        onClick={() => onLoadTemplate(t.id)}
                        style={{
                          marginTop: 10,
                          border: "1px solid #334155",
                          background: "#0b1220",
                          padding: "6px 10px",
                          borderRadius: 8,
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Load Template
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
