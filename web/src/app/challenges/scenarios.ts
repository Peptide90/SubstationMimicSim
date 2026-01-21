import type { ChallengeScenario } from "./types";
import { makeBusbarEdge, makeNode } from "../mimic/graphUtils";

export const CHALLENGE_SCENARIOS: ChallengeScenario[] = [
  {
    id: "tutorial-1",
    title: "Tutorial 1: Connect the line",
    type: "tutorial",
    difficulty: 1,
    description: "Learn how to place components and draw busbars.",
    initialGraph: {
      locked: {
        nodes: [
          makeNode("iface", "SRC-1", 40, 140, {
            label: "Source",
            iface: { substationId: "SUB", terminalId: "S1" },
            locked: true,
          }),
          makeNode("iface", "LOAD-1", 760, 140, {
            label: "Load",
            iface: { substationId: "SUB", terminalId: "L1" },
            locked: true,
          }),
        ],
        edges: [],
      },
      player: { nodes: [], edges: [] },
    },
    buildRules: {
      allowedPalette: ["cb", "ds"],
      buildZones: [{ x: 200, y: 80, width: 400, height: 160 }],
      lockedNodes: ["SRC-1", "LOAD-1"],
      lockedEdges: [],
    },
    objectives: [
      {
        id: "obj-connect",
        label: "Connect Source to Load with two devices.",
        type: "connectBetween",
        params: { from: "SRC-1", to: "LOAD-1" },
      },
      {
        id: "obj-place",
        label: "Place at least one breaker and one disconnector.",
        type: "includeComponent",
        params: { kinds: ["cb", "ds"], count: 1 },
      },
    ],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
      penalties: { excessComponents: 3, unusedComponents: 2 },
      targetCounts: { cb: 1, ds: 1 },
    },
    tutorialSteps: [
      {
        id: "t1-step-1",
        title: "Place a disconnector",
        body: "Drag a Disconnector (DS) into the build zone.",
        highlight: { kind: "ds" },
        requires: { type: "place", params: { kind: "ds", count: 1 } },
      },
      {
        id: "t1-step-2",
        title: "Place a breaker",
        body: "Add a Circuit Breaker (CB) next to the disconnector.",
        highlight: { kind: "cb" },
        requires: { type: "place", params: { kind: "cb", count: 1 } },
      },
      {
        id: "t1-step-3",
        title: "Wire the busbars",
        body: "Connect Source → DS → CB → Load using busbars.",
        requires: { type: "connect", params: { from: "SRC-1", to: "LOAD-1" } },
      },
    ],
  },
  {
    id: "tutorial-2",
    title: "Tutorial 2: Disconnectors under load",
    type: "tutorial",
    difficulty: 2,
    description: "See why disconnectors are not used to break load current.",
    initialGraph: {
      locked: {
        nodes: [
          makeNode("iface", "SRC-2", 40, 140, {
            label: "Source",
            iface: { substationId: "SUB", terminalId: "S2" },
            locked: true,
          }),
          makeNode("iface", "LOAD-2", 760, 140, {
            label: "Load",
            iface: { substationId: "SUB", terminalId: "L2" },
            locked: true,
          }),
        ],
        edges: [],
      },
      player: {
        nodes: [
          makeNode("ds", "DS-2", 320, 140, { state: "closed" }),
          makeNode("cb", "CB-2", 500, 140, { state: "closed" }),
        ],
        edges: [
          makeBusbarEdge("SRC-2", "DS-2", "R", "L", "bb-t2-1", "bb-t2-1"),
          makeBusbarEdge("DS-2", "CB-2", "R", "L", "bb-t2-2", "bb-t2-2"),
          makeBusbarEdge("CB-2", "LOAD-2", "R", "L", "bb-t2-3", "bb-t2-3"),
        ],
      },
    },
    buildRules: {
      allowedPalette: [],
      lockedNodes: ["SRC-2", "LOAD-2", "DS-2", "CB-2"],
      lockedEdges: ["bb-t2-1", "bb-t2-2", "bb-t2-3"],
    },
    objectives: [
      {
        id: "obj-warning",
        label: "Observe why disconnectors cannot break load current.",
        type: "noIllegalOperations",
        params: { expectViolation: true },
      },
    ],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
    },
    tutorialSteps: [
      {
        id: "t2-step-1",
        title: "Disconnector under load",
        body: "Try opening DS-2 while the load is energized.",
        highlight: { nodeId: "DS-2" },
        requires: { type: "toggle", params: { nodeId: "DS-2", to: "open" } },
      },
      {
        id: "t2-step-2",
        title: "Use the breaker",
        body: "Now open the circuit breaker instead (CB-2).",
        highlight: { nodeId: "CB-2" },
        requires: { type: "toggle", params: { nodeId: "CB-2", to: "open" } },
      },
    ],
  },
  {
    id: "tutorial-3",
    title: "Tutorial 3: Isolate then energize",
    type: "tutorial",
    difficulty: 2,
    description: "Practice isolating a section before re-energizing.",
    initialGraph: {
      locked: {
        nodes: [
          makeNode("iface", "SRC-3", 40, 140, {
            label: "Source",
            iface: { substationId: "SUB", terminalId: "S3" },
            locked: true,
          }),
          makeNode("iface", "LOAD-3", 760, 140, {
            label: "Load",
            iface: { substationId: "SUB", terminalId: "L3" },
            locked: true,
          }),
        ],
        edges: [],
      },
      player: {
        nodes: [
          makeNode("ds", "DS-3A", 300, 140, { state: "open" }),
          makeNode("cb", "CB-3", 480, 140, { state: "open" }),
          makeNode("ds", "DS-3B", 620, 140, { state: "open" }),
        ],
        edges: [
          makeBusbarEdge("SRC-3", "DS-3A", "R", "L", "bb-t3-1", "bb-t3-1"),
          makeBusbarEdge("DS-3A", "CB-3", "R", "L", "bb-t3-2", "bb-t3-2"),
          makeBusbarEdge("CB-3", "DS-3B", "R", "L", "bb-t3-3", "bb-t3-3"),
          makeBusbarEdge("DS-3B", "LOAD-3", "R", "L", "bb-t3-4", "bb-t3-4"),
        ],
      },
    },
    buildRules: {
      allowedPalette: [],
      lockedNodes: ["SRC-3", "LOAD-3", "DS-3A", "CB-3", "DS-3B"],
      lockedEdges: ["bb-t3-1", "bb-t3-2", "bb-t3-3", "bb-t3-4"],
    },
    objectives: [
      {
        id: "obj-energize",
        label: "Energize the load after closing the correct sequence.",
        type: "energizeTerminal",
        params: { terminalId: "LOAD-3" },
      },
    ],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
    },
    tutorialSteps: [
      {
        id: "t3-step-1",
        title: "Close isolators",
        body: "Close both disconnectors to prepare the circuit.",
        requires: { type: "toggle", params: { nodeIds: ["DS-3A", "DS-3B"], to: "closed" } },
      },
      {
        id: "t3-step-2",
        title: "Energize",
        body: "Close the breaker to energize the load.",
        requires: { type: "toggle", params: { nodeId: "CB-3", to: "closed" } },
      },
    ],
  },
  {
    id: "level-1",
    title: "Level 1: Energize the load",
    type: "level",
    difficulty: 1,
    description: "Build a simple feeder that energizes the load.",
    initialGraph: {
      locked: {
        nodes: [
          makeNode("iface", "SRC-L1", 40, 140, {
            label: "Source",
            iface: { substationId: "SUB", terminalId: "S4" },
            locked: true,
          }),
          makeNode("iface", "LOAD-L1", 760, 140, {
            label: "Load",
            iface: { substationId: "SUB", terminalId: "L4" },
            locked: true,
          }),
        ],
        edges: [],
      },
      player: { nodes: [], edges: [] },
    },
    buildRules: {
      allowedPalette: ["cb", "ds", "tx"],
      maxCounts: { cb: 2, ds: 3, tx: 1 },
      buildZones: [{ x: 200, y: 80, width: 400, height: 160 }],
      lockedNodes: ["SRC-L1", "LOAD-L1"],
      lockedEdges: [],
    },
    objectives: [
      {
        id: "obj-energize",
        label: "Energize LOAD-L1.",
        type: "energizeTerminal",
        params: { terminalId: "LOAD-L1" },
      },
      {
        id: "obj-components",
        label: "Use a breaker and disconnector in the feeder.",
        type: "includeComponent",
        params: { kinds: ["cb", "ds"], count: 1 },
      },
    ],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
      penalties: { excessComponents: 4, unusedComponents: 2 },
      targetCounts: { cb: 1, ds: 1 },
      resilienceTests: [
        {
          type: "tripDevice",
          kind: "cb",
          requiredEnergized: ["LOAD-L1"],
        },
      ],
    },
  },
];

export function getScenarioById(id: string): ChallengeScenario | undefined {
  return CHALLENGE_SCENARIOS.find((scenario) => scenario.id === id);
}
