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
      buildZones: [{ x: 200, y: 80, width: 420, height: 160 }],
      lockedNodes: ["SRC-1", "LOAD-1"],
      lockedEdges: [],
    },
    objectives: [
      {
        id: "obj-connect",
        label: "Connect Source to Load with DS → CB → DS.",
        type: "connectBetween",
        params: { from: "SRC-1", to: "LOAD-1" },
      },
      {
        id: "obj-place-ds",
        label: "Place two disconnectors.",
        type: "includeComponent",
        params: { kinds: ["ds"], count: 2 },
      },
      {
        id: "obj-place-cb",
        label: "Place one breaker.",
        type: "includeComponent",
        params: { kinds: ["cb"], count: 1 },
      },
    ],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
      penalties: { excessComponents: 3, unusedComponents: 2 },
      targetCounts: { cb: 1, ds: 2 },
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
        body: "Add a Circuit Breaker (CB) between disconnectors.",
        highlight: { kind: "cb" },
        requires: { type: "place", params: { kind: "cb", count: 1 } },
      },
      {
        id: "t1-step-3",
        title: "Place the second disconnector",
        body: "Add a second Disconnector (DS) on the load side.",
        highlight: { kind: "ds" },
        requires: { type: "place", params: { kind: "ds", count: 2 } },
      },
      {
        id: "t1-step-4",
        title: "Wire the busbars",
        body: "Connect Source → DS → CB → DS → Load using busbars.",
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
            label: "Source A",
            iface: { substationId: "SUB", terminalId: "S2" },
            locked: true,
          }),
          makeNode("iface", "LOAD-2", 760, 140, {
            label: "Load A",
            iface: { substationId: "SUB", terminalId: "L2" },
            locked: true,
          }),
        ],
        edges: [],
      },
      player: {
        nodes: [
          makeNode("junction", "J-2L", 160, 140, {}),
          makeNode("junction", "J-2R", 680, 140, {}),
          makeNode("junction", "J-2LB", 160, 260, {}),
          makeNode("junction", "J-2RB", 680, 260, {}),
          makeNode("ds", "DS-2", 260, 140, { state: "closed" }),
          makeNode("cb", "CB-2", 420, 140, { state: "closed" }),
          makeNode("ds", "DS-2A", 560, 140, { state: "closed" }),
          makeNode("ds", "DS-2B", 320, 260, { state: "closed" }),
          makeNode("ds", "DS-2C", 520, 260, { state: "closed" }),
        ],
        edges: [
          makeBusbarEdge("SRC-2", "J-2L", "R", "L", "bb-t2-1", "bb-t2-1"),
          makeBusbarEdge("J-2L", "DS-2", "R", "L", "bb-t2-2", "bb-t2-2"),
          makeBusbarEdge("DS-2", "CB-2", "R", "L", "bb-t2-3", "bb-t2-3"),
          makeBusbarEdge("CB-2", "DS-2A", "R", "L", "bb-t2-4", "bb-t2-4"),
          makeBusbarEdge("DS-2A", "J-2R", "R", "L", "bb-t2-5", "bb-t2-5"),
          makeBusbarEdge("J-2R", "LOAD-2", "R", "L", "bb-t2-6", "bb-t2-6"),
          makeBusbarEdge("J-2L", "J-2LB", "B", "T", "bb-t2-7", "bb-t2-7"),
          makeBusbarEdge("J-2LB", "DS-2B", "R", "L", "bb-t2-8", "bb-t2-8"),
          makeBusbarEdge("DS-2B", "DS-2C", "R", "L", "bb-t2-9", "bb-t2-9"),
          makeBusbarEdge("DS-2C", "J-2RB", "R", "L", "bb-t2-10", "bb-t2-10"),
          makeBusbarEdge("J-2RB", "J-2R", "T", "B", "bb-t2-11", "bb-t2-11"),
        ],
      },
    },
    buildRules: {
      allowedPalette: [],
      lockedNodes: ["SRC-2", "LOAD-2", "DS-2", "CB-2", "DS-2A", "DS-2B", "DS-2C", "J-2L", "J-2R", "J-2LB", "J-2RB"],
      lockedEdges: [
        "bb-t2-1",
        "bb-t2-2",
        "bb-t2-3",
        "bb-t2-4",
        "bb-t2-5",
        "bb-t2-6",
        "bb-t2-7",
        "bb-t2-8",
        "bb-t2-9",
        "bb-t2-10",
        "bb-t2-11",
      ],
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
        title: "Disconnector with alternate path",
        body: "Open DS-2. Because DS-2B provides an alternate path, it opens without issues.",
        highlight: { nodeId: "DS-2" },
        requires: { type: "toggle", params: { nodeId: "DS-2", to: "open" } },
      },
      {
        id: "t2-step-2",
        title: "Parallel path removed",
        body: "Now open DS-2B. With the alternate path gone, the disconnector will arc and fail.",
        highlight: { nodeId: "DS-2B" },
        requires: { type: "toggle", params: { nodeId: "DS-2B", to: "open" } },
      },
      {
        id: "t2-step-3",
        title: "Use the breaker",
        body: "Open CB-2 instead. The breaker safely interrupts load current.",
        highlight: { nodeId: "CB-2" },
        requires: { type: "toggle", params: { nodeId: "CB-2", to: "open" } },
      },
    ],
  },
  {
    id: "tutorial-3",
    title: "Tutorial 3: Isolate then earth",
    type: "tutorial",
    difficulty: 2,
    description: "Practice isolating, proving dead, and applying earths.",
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
          makeNode("ds", "DS-3A", 260, 140, { state: "closed" }),
          makeNode("cb", "CB-3", 420, 140, { state: "closed" }),
          makeNode("ds", "DS-3B", 560, 140, { state: "closed" }),
          makeNode("es", "ES-3A", 260, 260, { state: "open" }),
          makeNode("es", "ES-3B", 560, 260, { state: "open" }),
        ],
        edges: [
          makeBusbarEdge("SRC-3", "DS-3A", "R", "L", "bb-t3-1", "bb-t3-1"),
          makeBusbarEdge("DS-3A", "CB-3", "R", "L", "bb-t3-2", "bb-t3-2"),
          makeBusbarEdge("CB-3", "DS-3B", "R", "L", "bb-t3-3", "bb-t3-3"),
          makeBusbarEdge("DS-3B", "LOAD-3", "R", "L", "bb-t3-4", "bb-t3-4"),
          makeBusbarEdge("DS-3A", "ES-3A", "B", "T", "bb-t3-5", "bb-t3-5"),
          makeBusbarEdge("DS-3B", "ES-3B", "B", "T", "bb-t3-6", "bb-t3-6"),
        ],
      },
    },
    buildRules: {
      allowedPalette: [],
      lockedNodes: ["SRC-3", "LOAD-3", "DS-3A", "CB-3", "DS-3B", "ES-3A", "ES-3B"],
      lockedEdges: ["bb-t3-1", "bb-t3-2", "bb-t3-3", "bb-t3-4", "bb-t3-5", "bb-t3-6"],
    },
    objectives: [
      {
        id: "obj-energize",
        label: "Isolate the load and apply earths safely.",
        type: "energizeTerminal",
        params: { terminalId: "LOAD-3", shouldBeEnergized: false },
      },
    ],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
    },
    tutorialSteps: [
      {
        id: "t3-step-1",
        title: "Open the breaker",
        body: "Open CB-3 to interrupt load current first.",
        requires: { type: "toggle", params: { nodeId: "CB-3", to: "open" } },
      },
      {
        id: "t3-step-2",
        title: "Open disconnectors",
        body: "With the breaker open, open both disconnectors to isolate the circuit.",
        requires: { type: "toggle", params: { nodeIds: ["DS-3A", "DS-3B"], to: "open" } },
      },
      {
        id: "t3-step-3",
        title: "Apply earths",
        body: "Close both earth switches to ground the isolated section.",
        requires: { type: "toggle", params: { nodeIds: ["ES-3A", "ES-3B"], to: "closed" } },
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
