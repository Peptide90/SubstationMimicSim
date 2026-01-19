export type GlobalLeaderboardSubmission = {
  roomCode: string;
  teamName: string;
  score: number;
};

export type GlobalLeaderboardResult = {
  status: "stub";
  message: string;
};

export async function submitGlobalLeaderboard(
  _submission: GlobalLeaderboardSubmission
): Promise<GlobalLeaderboardResult> {
  return Promise.resolve({
    status: "stub",
    message: "Global leaderboard submission is not enabled for the MVP.",
  });
}
