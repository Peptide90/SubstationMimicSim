export const BUILD_TAG = "V0.7";
export const CREATOR_LABEL = "Created by Jordan Taylor @TheElectricBrit on Youtube";
export const YOUTUBE_URL = "https://www.youtube.com/@TheElectricBrit";
export const LINKEDIN_URL = "https://www.linkedin.com/company/108942375/";

export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  changes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "V0.7",
    date: "2026-07-31",
    title: "Grid Games hub landing",
    changes: [
      "Rebranded the home screen as The Electric Brit's Grid Games with large descriptive tiles for each mode.",
      "Renamed the mimic designer tile to Substation 2D Sim; Solo/Multiplayer/Physical shown as small tile tags.",
      "Added placeholder tiles for Utility Empire 2D and Grid Card Game.",
      "Added an in-repo roadmap documenting deferred multiplayer work, including a future GM demonstrator mode.",
    ],
  },
  {
    version: "V0.6",
    date: "2026-05-22",
    title: "Mimic Designer V2 test integration",
    changes: [
      "Solo builder now launches Mimic Designer V2 while the legacy builder remains hidden.",
      "Added derived topology extraction, phase-aware connectivity, validation warnings, and topology debug overlay.",
      "Added this changelog, opened from the version number on the main page.",
    ],
  },
  {
    version: "V0.5",
    date: "2026-02-26",
    title: "Substation mimic builder baseline",
    changes: [
      "React Flow based builder with switchgear, busbars, challenges, interlocks, labelling, save/load, and power flow UI.",
    ],
  },
];
