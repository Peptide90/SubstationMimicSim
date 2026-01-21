import type { CSSProperties } from "react";

import type { ChallengeEvaluation } from "../app/challenges/ChallengeEvaluator";
import type { ScenarioObjective, ScenarioTutorialStep } from "../app/challenges/types";

type Props = {
  title: string;
  description: string;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  objectives: ScenarioObjective[];
  evaluation?: ChallengeEvaluation | null;
  tutorialStep?: ScenarioTutorialStep;
  tutorialStepIndex: number;
  tutorialStepCount: number;
  canAdvanceTutorial: boolean;
  onAdvanceTutorial: () => void;
  onCheckSolution: () => void;
  onRetry: () => void;
  onNext: () => void;
  issues: string[];
};

const tabs = ["Instructions", "Objectives", "Analysis", "Results"] as const;

export function ChallengePanel({
  title,
  description,
  activeTab,
  onSelectTab,
  objectives,
  evaluation,
  tutorialStep,
  tutorialStepIndex,
  tutorialStepCount,
  canAdvanceTutorial,
  onAdvanceTutorial,
  onCheckSolution,
  onRetry,
  onNext,
  issues,
}: Props) {
  const card: CSSProperties = {
    background: "#0b1220",
    border: "1px solid #1f2937",
    borderRadius: 10,
    padding: 16,
    color: "#e2e8f0",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  };

  return (
    <aside style={{ width: 360, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>
        <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 6 }}>{description}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            style={{
              padding: "8px 6px",
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #334155",
              background: activeTab === tab ? "#1e293b" : "#0f172a",
              color: "#e2e8f0",
              cursor: "pointer",
            }}
            onClick={() => onSelectTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{ ...card, flex: 1, overflow: "auto" }}>
        {activeTab === "Instructions" && (
          <div style={{ display: "grid", gap: 12 }}>
            {tutorialStep ? (
              <>
                <div style={{ fontWeight: 700 }}>{tutorialStep.title}</div>
                <div style={{ fontSize: 13, color: "#cbd5f5" }}>{tutorialStep.body}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Step {tutorialStepIndex + 1} of {tutorialStepCount}
                </div>
                <button
                  disabled={!canAdvanceTutorial}
                  onClick={onAdvanceTutorial}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #334155",
                    background: canAdvanceTutorial ? "#38bdf8" : "#1e293b",
                    color: "#0f172a",
                    fontWeight: 700,
                    cursor: canAdvanceTutorial ? "pointer" : "not-allowed",
                  }}
                >
                  Next
                </button>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#cbd5f5" }}>
                Build the solution and check your work.
              </div>
            )}
          </div>
        )}
        {activeTab === "Objectives" && (
          <div style={{ display: "grid", gap: 8 }}>
            {objectives.map((objective) => {
              const result = evaluation?.objectives.find((o) => o.id === objective.id);
              const passed = result?.passed ?? false;
              return (
                <div
                  key={objective.id}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #1f2937",
                    background: passed ? "#1e293b" : "#0f172a",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ color: passed ? "#22c55e" : "#f97316" }}>{passed ? "✔" : "○"}</span>
                  <span style={{ fontSize: 13 }}>{objective.label}</span>
                </div>
              );
            })}
          </div>
        )}
        {activeTab === "Analysis" && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>Detected issues</div>
            {issues.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94a3b8" }}>No issues detected yet.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                {issues.map((issue) => (
                  <li key={issue} style={{ fontSize: 13 }}>
                    {issue}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {activeTab === "Results" && (
          <div style={{ display: "grid", gap: 12 }}>
            {evaluation ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Score: {evaluation.score}</div>
                <div style={{ fontSize: 14 }}>Stars: {"★".repeat(evaluation.stars)}{evaluation.stars === 0 ? "None" : ""}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Base score: {evaluation.breakdown.baseScore}</div>
                {evaluation.breakdown.penalties.length > 0 && (
                  <div style={{ display: "grid", gap: 4 }}>
                    {evaluation.breakdown.penalties.map((p) => (
                      <div key={p.label} style={{ fontSize: 12, color: "#fca5a5" }}>
                        -{p.value} {p.label}
                      </div>
                    ))}
                  </div>
                )}
                {evaluation.breakdown.resilience && (
                  <div style={{ display: "grid", gap: 4 }}>
                    {evaluation.breakdown.resilience.map((test) => (
                      <div key={test.label} style={{ fontSize: 12, color: test.passed ? "#22c55e" : "#f97316" }}>
                        {test.passed ? "✔" : "○"} {test.label}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#94a3b8" }}>Run Check solution to see results.</div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={onCheckSolution}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #334155",
                  background: "#38bdf8",
                  color: "#0f172a",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Check solution
              </button>
              <button
                onClick={onRetry}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #334155",
                  background: "#0f172a",
                  color: "#e2e8f0",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
              <button
                onClick={onNext}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #334155",
                  background: "#0f172a",
                  color: "#e2e8f0",
                  cursor: "pointer",
                }}
              >
                Next level
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
