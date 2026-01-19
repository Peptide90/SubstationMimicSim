import { BUILD_TAG, CREATOR_LABEL, LINKEDIN_URL, YOUTUBE_URL } from "../app/constants/branding";

type Props = {
  buildTag?: string;
  variant?: "compact" | "footer";
  align?: "left" | "right" | "center";
};

const iconPaths = {
  youtube:
    "M23.498 6.186a2.94 2.94 0 0 0-2.07-2.078C19.652 3.6 12 3.6 12 3.6s-7.652 0-9.428.508A2.94 2.94 0 0 0 .502 6.186C0 7.964 0 12 0 12s0 4.036.502 5.814a2.94 2.94 0 0 0 2.07 2.078C4.348 20.4 12 20.4 12 20.4s7.652 0 9.428-.508a2.94 2.94 0 0 0 2.07-2.078C24 16.036 24 12 24 12s0-4.036-.502-5.814ZM9.6 15.6V8.4L15.9 12l-6.3 3.6Z",
  linkedin:
    "M4.98 3.5C4.98 4.88 3.88 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5ZM0 8.5h5V24H0V8.5Zm8 0h4.8v2.1h.07c.67-1.27 2.3-2.6 4.73-2.6 5.06 0 6 3.3 6 7.6V24h-5v-6.7c0-1.6-.03-3.7-2.26-3.7-2.27 0-2.62 1.77-2.62 3.58V24H8V8.5Z",
};

export function BrandingCluster({ buildTag = BUILD_TAG, variant = "compact", align = "right" }: Props) {
  const fontSize = variant === "compact" ? 12 : 13;
  const iconSize = variant === "compact" ? 14 : 16;
  const justify =
    align === "left" ? "flex-start" : align === "center" ? "center" : "flex-end";

  const iconStyle = {
    width: iconSize,
    height: iconSize,
    display: "inline-block",
  };

  const linkStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#cbd5f5",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: justify,
        gap: 10,
        color: "#94a3b8",
        fontSize,
        flexWrap: "wrap",
      }}
    >
      <span>{CREATOR_LABEL}</span>
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <a href={YOUTUBE_URL} target="_blank" rel="noreferrer" aria-label="YouTube" style={linkStyle}>
          <svg viewBox="0 0 24 24" style={iconStyle} fill="currentColor" aria-hidden="true">
            <path d={iconPaths.youtube} />
          </svg>
        </a>
        <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" aria-label="LinkedIn" style={linkStyle}>
          <svg viewBox="0 0 24 24" style={iconStyle} fill="currentColor" aria-hidden="true">
            <path d={iconPaths.linkedin} />
          </svg>
        </a>
      </span>
      <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{buildTag}</span>
    </div>
  );
}
