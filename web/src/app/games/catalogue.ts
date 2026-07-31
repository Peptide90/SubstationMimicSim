export type GameId = "mimic" | "challenges" | "multiplayer" | "utility-empire" | "grid-card-game";

export type GameStatus = "available" | "mvp" | "coming_soon";

/** Small tile tag (play format), shown instead of baking Solo/etc. into the title. */
export type GameTag = "Solo" | "Multiplayer" | "Physical" | "Coming soon";

export type GameCatalogueEntry = {
  id: GameId;
  title: string;
  blurb: string;
  cta: string;
  tag: GameTag;
  status: GameStatus;
  /** CSS background for the tile surface (gradient or image). */
  background: string;
  accent: string;
};

export const HUB_PRODUCT_NAME = "The Electric Brit's Grid Games";
export const HUB_TAGLINE = "Educational power-system games for learning, teaching, and classroom sessions.";

export const GAME_CATALOGUE: GameCatalogueEntry[] = [
  {
    id: "mimic",
    title: "Substation 2D Sim",
    blurb:
      "Freeform single-line mimic designer. Place switchgear, draw busbars, simulate energisation, and export diagrams.",
    cta: "Play",
    tag: "Solo",
    status: "available",
    background:
      "linear-gradient(145deg, rgba(14, 116, 144, 0.55) 0%, rgba(15, 23, 42, 0.92) 48%, rgba(6, 11, 18, 0.98) 100%), radial-gradient(ellipse at 20% 10%, rgba(56, 189, 248, 0.35), transparent 55%)",
    accent: "#38bdf8",
  },
  {
    id: "challenges",
    title: "Builder Challenges",
    blurb:
      "Guided lessons and graded builds. Learn isolation, interlocking, and bay layouts step by step.",
    cta: "Play",
    tag: "Solo",
    status: "available",
    background:
      "linear-gradient(145deg, rgba(21, 128, 61, 0.5) 0%, rgba(15, 23, 42, 0.92) 48%, rgba(6, 11, 18, 0.98) 100%), radial-gradient(ellipse at 80% 15%, rgba(74, 222, 128, 0.3), transparent 55%)",
    accent: "#4ade80",
  },
  {
    id: "multiplayer",
    title: "Multiplayer Grid Game",
    blurb:
      "Classroom multiplayer MVP with a game master, team roles, and shared scenarios. Requires the multiplayer server.",
    cta: "Join Lobby",
    tag: "Multiplayer",
    status: "mvp",
    background:
      "linear-gradient(145deg, rgba(124, 45, 18, 0.55) 0%, rgba(15, 23, 42, 0.92) 48%, rgba(6, 11, 18, 0.98) 100%), radial-gradient(ellipse at 50% 0%, rgba(251, 146, 60, 0.32), transparent 55%)",
    accent: "#fb923c",
  },
  {
    id: "utility-empire",
    title: "Utility Empire 2D",
    blurb:
      "Build and run a utility empire in 2D. Placeholder tile — this game lives in a separate repository and will link here when ready.",
    cta: "Coming Soon",
    tag: "Solo",
    status: "coming_soon",
    background:
      "linear-gradient(145deg, rgba(67, 56, 202, 0.5) 0%, rgba(15, 23, 42, 0.92) 48%, rgba(6, 11, 18, 0.98) 100%), radial-gradient(ellipse at 15% 20%, rgba(129, 140, 248, 0.35), transparent 55%)",
    accent: "#818cf8",
  },
  {
    id: "grid-card-game",
    title: "Grid Card Game",
    blurb:
      "A physical card game about power systems and grid operations. Placeholder tile while the design and rules are in progress.",
    cta: "Coming Soon",
    tag: "Physical",
    status: "coming_soon",
    background:
      "linear-gradient(145deg, rgba(136, 19, 55, 0.5) 0%, rgba(15, 23, 42, 0.92) 48%, rgba(6, 11, 18, 0.98) 100%), radial-gradient(ellipse at 85% 10%, rgba(251, 113, 133, 0.32), transparent 55%)",
    accent: "#fb7185",
  },
];

export function statusLabel(status: GameStatus): string | null {
  if (status === "mvp") return "MVP";
  if (status === "coming_soon") return "Coming soon";
  return null;
}

export type LaunchableGameId = "mimic" | "challenges" | "multiplayer";

export function isLaunchableGameId(id: GameId): id is LaunchableGameId {
  return id === "mimic" || id === "challenges" || id === "multiplayer";
}
