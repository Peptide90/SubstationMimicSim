import type { CSSProperties } from "react";

import type { ChallengeEvaluation } from "../app/challenges/ChallengeEvaluator";
import type { ScenarioObjective, ScenarioTutorialStep } from "../app/challenges/types";

type Props = {
  title: string;
  description: string;
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
  callouts?: string[];
  showResetTutorial?: boolean;
  onResetTutorialStep?: () => void;
  showSwitchingControls?: boolean;
  switchingSegmentTitle?: string;
  onOpenSwitchingInstructions?: () => void;
};

export function ChallengePanel({
  title,
  description,
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
  callouts,
  showResetTutorial,
  onResetTutorialStep,
  showSwitchingControls,
  switchingSegmentTitle,
  onOpenSwitchingInstructions,
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

      <div style={{ ...card, flex: 1, overflow: "auto", display: "grid", gap: 16 }}>
        <section style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Instructions</div>
          {tutorialStep ? (
            <>
              <div style={{ fontWeight: 700 }}>{tutorialStep.title}</div>
              <div style={{ fontSize: 13, color: "#cbd5f5" }}>{tutorialStep.body}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Step {tutorialStepIndex + 1} of {tutorialStepCount}
              </div>
              {callouts && callouts.length > 0 && (
                <div style={{ display: "grid", gap: 6 }}>
                  {callouts.map((callout) => (
                    <div
                      key={callout}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "#1e293b",
                        border: "1px solid #334155",
                        fontSize: 12,
                        color: "#fbbf24",
                      }}
                    >
                      {callout}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                    width: "fit-content",
                  }}
                >
                  Next
                </button>
                {showResetTutorial && onResetTutorialStep && (
                  <button
                    onClick={onResetTutorialStep}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #334155",
                      background: "#0f172a",
                      color: "#e2e8f0",
                      cursor: "pointer",
                      width: "fit-content",
                    }}
                  >
                    Reset step
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#cbd5f5" }}>
              Build the solution and check your work.
            </div>
          )}

          {showSwitchingControls && onOpenSwitchingInstructions && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#0f172a",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#cbd5f5" }}>
                Switching segment active{switchingSegmentTitle ? `: ${switchingSegmentTitle}` : ""}.
              </div>
              <button
                onClick={onOpenSwitchingInstructions}
                style={{
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #334155",
                  background: "#38bdf8",
                  color: "#0f172a",
                  fontWeight: 700,
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Open Switching Instructions
              </button>
            </div>
          )}
        </section>

        <section style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Objectives</div>
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
        </section>

        <section style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Analysis</div>
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
        </section>

        <section style={{ display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Results</div>
          {evaluation ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Score: {evaluation.score}</div>
              <div style={{ fontSize: 14 }}>
                Stars: {"★".repeat(evaluation.stars)}
                {evaluation.stars === 0 ? "None" : ""}
              </div>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
        </section>
      </div>
    </aside>
  );
}
