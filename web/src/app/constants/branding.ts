export const BUILD_TAG = "V0.6";
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
