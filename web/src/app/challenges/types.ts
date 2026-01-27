import type { Edge, Node } from "reactflow";

import type { NodeKind } from "../../core/model";

export type ScenarioType = "tutorial" | "level";

export type ScenarioObjectiveType =
  | "energizeTerminal"
  | "connectBetween"
  | "includeComponent"
  | "noIllegalOperations"
  | "sequence"
  | "tagIsolation"
  | "buildBay"
  | "noFailedComponents";

export type ScenarioObjective = {
  id: string;
  label: string;
  type: ScenarioObjectiveType;
  params?: Record<string, any>;
};

export type ScenarioBuildRules = {
  allowedPalette: NodeKind[];
  maxCounts?: Partial<Record<NodeKind, number>>;
  buildZones?: Array<{ x: number; y: number; width: number; height: number }>;
  lockedNodes?: string[];
  lockedEdges?: string[];
};

export type ScenarioGraph = {
  nodes: Node[];
  edges: Edge[];
};

export type ScenarioInitialGraph = {
  locked: ScenarioGraph;
  player?: ScenarioGraph;
};

export type ScenarioScoring = {
  starThresholds: { one: number; two: number; three: number };
  penalties?: {
    excessComponents?: number;
    unusedComponents?: number;
    failedComponents?: number;
  };
  targetCounts?: Partial<Record<NodeKind, number>>;
  resilienceTests?: ScenarioResilienceTest[];
};

export type ScenarioResilienceTest =
  | {
      type: "tripDevice";
      deviceId?: string;
      kind?: NodeKind;
      requiredEnergized?: string[];
    }
  | {
      type: "busSectionOut";
      sectionId: string;
      requiredEnergized?: string[];
    };

export type ScenarioTutorialStep = {
  id: string;
  title: string;
  body: string;
  highlight?: { kind?: NodeKind; nodeId?: string; uiElement?: string };
  requires?: {
    type: "place" | "connect" | "toggle" | "fault" | "check" | "isolation";
    params?: Record<string, any>;
  };
};

export type ChallengeScenario = {
  id: string;
  title: string;
  type: ScenarioType;
  difficulty: number;
  description: string;
  briefing?: {
    backstory: string;
    learningObjectives: string[];
    constraints: string[];
  };
  initialGraph: ScenarioInitialGraph;
  buildRules: ScenarioBuildRules;
  objectives: ScenarioObjective[];
  scoring: ScenarioScoring;
  tutorialSteps?: ScenarioTutorialStep[];
};
