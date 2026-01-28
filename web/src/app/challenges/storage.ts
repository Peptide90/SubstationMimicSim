type ChallengeProgress = {
  stars: number;
  completed: boolean;
};

type ChallengeProgressMap = Record<string, ChallengeProgress>;

const STORAGE_KEY = "substation.mimic.challenges.progress.v1";

export function loadChallengeProgress(): ChallengeProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ChallengeProgressMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function saveChallengeProgress(progress: ChallengeProgressMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function updateChallengeProgress(
  scenarioId: string,
  stars: number,
  completed: boolean
): ChallengeProgressMap {
  const current = loadChallengeProgress();
  const prev = current[scenarioId];
  const nextStars = Math.max(prev?.stars ?? 0, stars);
  const nextCompleted = prev?.completed || completed;
  const updated = { ...current, [scenarioId]: { stars: nextStars, completed: nextCompleted } };
  saveChallengeProgress(updated);
  return updated;
}
