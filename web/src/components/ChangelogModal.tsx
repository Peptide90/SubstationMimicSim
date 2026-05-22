import { CHANGELOG } from "../app/constants/branding";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ChangelogModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(2, 6, 23, 0.76)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
      onMouseDown={onClose}
    >
      <section
        style={{
          width: "min(680px, 94vw)",
          maxHeight: "min(720px, 88vh)",
          overflow: "auto",
          background: "#08111f",
          border: "1px solid #334155",
          borderRadius: 8,
          color: "#e2e8f0",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.45)",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "18px 20px",
            borderBottom: "1px solid #1e293b",
          }}
        >
          <div>
            <h2 id="changelog-title" style={{ margin: 0, fontSize: 20, letterSpacing: 0 }}>
              Changelog
            </h2>
            <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 13 }}>
              Release notes for Substation Mimic.
            </div>
          </div>
          <button
            type="button"
            aria-label="Close changelog"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 6,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#e2e8f0",
              cursor: "pointer",
              padding: 0,
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            x
          </button>
        </header>
        <div style={{ display: "grid", gap: 18, padding: 20 }}>
          {CHANGELOG.map((entry) => (
            <article key={entry.version} style={{ borderBottom: "1px solid #1e293b", paddingBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: 16, letterSpacing: 0 }}>
                  {entry.version}: {entry.title}
                </h3>
                <time style={{ color: "#94a3b8", fontSize: 13 }}>{entry.date}</time>
              </div>
              <ul style={{ margin: "10px 0 0", paddingLeft: 20, display: "grid", gap: 7, color: "#cbd5e1" }}>
                {entry.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
