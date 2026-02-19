import type { ChallengeScenario } from "./types";
import { makeBusbarEdge, makeNode } from "../mimic/graphUtils";

export const CHALLENGE_SCENARIOS: ChallengeScenario[] = [
  {
    id: "tutorial-1",
    title: "Tutorial 1: Connect the line",
    type: "tutorial",
    difficulty: 1,
    description: "Learn interface locations, component placement, and how to get help.",
    briefing: {
      backstory:
        "You are preparing a simple training bay. First locate the two interface points and build a basic DS-CB-DS path between them.",
      learningObjectives: [
        "Identify the source and load interface nodes.",
        "Build a simple DS → CB → DS arrangement and connect it with busbars.",
        "Know where the Help button is for reference during later lessons.",
      ],
      constraints: [
        "Use only the components shown in the tutorial palette.",
        "Keep all construction inside the highlighted build zone.",
      ],
    },
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
    description: "Practice switching instructions: isolate, lock/caution, prove dead, and apply earths.",
    briefing: {
      backstory:
        "Control has issued a formal switching instruction sheet. Follow each line in order, then report line-end colours back to control.",
      learningObjectives: [
        "Use the Switching Instructions modal during a live switching segment.",
        "Open, lock and caution the breaker/disconnectors correctly.",
        "Apply points of isolation and complete the line-end-colour report.",
      ],
      constraints: [
        "Use right-click actions to apply/remove points of isolation.",
        "Right-click the interface to read line-end colours before reporting.",
      ],
    },
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
          makeNode("junction", "J-3L", 180, 140, {}),
          makeNode("junction", "J-3R", 640, 140, {}),
          makeNode("ds", "DS-3A", 260, 140, { state: "closed" }),
          makeNode("cb", "CB-3", 420, 140, { state: "closed" }),
          makeNode("ds", "DS-3B", 560, 140, { state: "closed" }),
          makeNode("es", "ES-3A", 180, 260, { state: "open" }),
          makeNode("es", "ES-3B", 640, 260, { state: "open" }),
        ],
        edges: [
          makeBusbarEdge("SRC-3", "J-3L", "R", "L", "bb-t3-1", "bb-t3-1"),
          makeBusbarEdge("J-3L", "DS-3A", "R", "L", "bb-t3-2", "bb-t3-2"),
          makeBusbarEdge("DS-3A", "CB-3", "R", "L", "bb-t3-3", "bb-t3-3"),
          makeBusbarEdge("CB-3", "DS-3B", "R", "L", "bb-t3-4", "bb-t3-4"),
          makeBusbarEdge("DS-3B", "J-3R", "R", "L", "bb-t3-5", "bb-t3-5"),
          makeBusbarEdge("J-3R", "LOAD-3", "R", "L", "bb-t3-6", "bb-t3-6"),
          makeBusbarEdge("J-3L", "ES-3A", "B", "T", "bb-t3-7", "bb-t3-7"),
          makeBusbarEdge("J-3R", "ES-3B", "B", "T", "bb-t3-8", "bb-t3-8"),
        ],
      },
    },
    buildRules: {
      allowedPalette: [],
      lockedNodes: ["SRC-3", "LOAD-3", "J-3L", "J-3R", "DS-3A", "CB-3", "DS-3B", "ES-3A", "ES-3B"],
      lockedEdges: [
        "bb-t3-1",
        "bb-t3-2",
        "bb-t3-3",
        "bb-t3-4",
        "bb-t3-5",
        "bb-t3-6",
        "bb-t3-7",
        "bb-t3-8",
      ],
    },
    objectives: [
      {
        id: "obj-energize",
        label: "Isolate the load and apply earths safely.",
        type: "energizeTerminal",
        params: { terminalId: "LOAD-3", shouldBeEnergized: false },
      },
      {
        id: "obj-no-failed-ds",
        label: "Keep disconnectors healthy during the isolation sequence.",
        type: "noFailedComponents",
        params: { kinds: ["ds"] },
      },
    ],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
      penalties: { failedComponents: 20 },
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
      {
        id: "t3-step-4",
        title: "Apply isolation tags",
        body: "Right-click each disconnector and apply a point of isolation notice. Tagged devices stay locked open until removed.",
        requires: { type: "isolation", params: { nodeIds: ["DS-3A", "DS-3B"], applied: true } },
      },
    ],
    switchingSegments: [
      {
        id: "t3-switch-1",
        title: "Control switching instructions",
        lineEndColours: {
          "LOAD-3": ["RED", "BLUE", "YELLOW", "BLUE", "RED"],
        },
        instructions: [
          {
            id: "t3-1",
            verb: "OPEN_LOCK_CAUTION",
            targetLabel: "CB-3",
            notes: "Open the breaker and apply point of isolation (lock + caution).",
          },
          {
            id: "t3-2",
            verb: "OPEN_LOCK_CAUTION",
            targetLabel: "DS-3A",
            notes: "Open DS-3A and apply point of isolation.",
          },
          {
            id: "t3-3",
            verb: "OPEN_LOCK_CAUTION",
            targetLabel: "DS-3B",
            notes: "Open DS-3B and apply point of isolation.",
          },
          { id: "t3-4", verb: "CLOSE_EARTH", targetLabel: "ES-3A" },
          { id: "t3-5", verb: "CLOSE_EARTH", targetLabel: "ES-3B" },
          {
            id: "t3-6",
            verb: "CHECK_OPEN_LOCK_CAUTION",
            targetLabel: "DS-3B",
            notes: "Right-click Load interface to read colours, then report them to control.",
            requiresReport: { type: "LINE_END_COLOURS", interfaceId: "LOAD-3" },
          },
        ],
      },
    ],
  },
  {
    id: "tutorial-ct",
    title: "Tutorial 4: CT/VT basics",
    type: "tutorial",
    difficulty: 3,
    description: "Introduce instrument transformers and their configuration.",
    initialGraph: {
      locked: {
        nodes: [
          makeNode("iface", "SRC-CT", 40, 140, {
            label: "Source",
            iface: { substationId: "SUB", terminalId: "S7" },
            locked: true,
          }),
          makeNode("iface", "LOAD-CT", 760, 140, {
            label: "Load",
            iface: { substationId: "SUB", terminalId: "L7" },
            locked: true,
          }),
        ],
        edges: [],
      },
      player: { nodes: [], edges: [] },
    },
    buildRules: {
      allowedPalette: ["cb", "ds", "ct", "vt"],
      buildZones: [{ x: 200, y: 80, width: 420, height: 160 }],
      lockedNodes: ["SRC-CT", "LOAD-CT"],
      lockedEdges: [],
    },
    objectives: [
      {
        id: "obj-ct-vt",
        label: "Place one CT and one VT in the bay.",
        type: "includeComponent",
        params: { kinds: ["ct", "vt"], count: 1 },
      },
      {
        id: "obj-connect-ct",
        label: "Connect the CT/VT bay between Source and Load.",
        type: "connectBetween",
        params: { from: "SRC-CT", to: "LOAD-CT" },
      },
    ],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
      penalties: { excessComponents: 3, unusedComponents: 2 },
      targetCounts: { ct: 1, vt: 1, cb: 1, ds: 2 },
    },
    tutorialSteps: [
      {
        id: "ct-step-1",
        title: "Place a current transformer",
        body: "Add a CT inline in the bay.",
        highlight: { kind: "ct" },
        requires: { type: "place", params: { kind: "ct", count: 1 } },
      },
      {
        id: "ct-step-2",
        title: "Place a voltage transformer",
        body: "Add a VT inline in the bay.",
        highlight: { kind: "vt" },
        requires: { type: "place", params: { kind: "vt", count: 1 } },
      },
      {
        id: "ct-step-3",
        title: "Connect the bay",
        body: "Wire Source → CT → CB → VT → Load.",
        requires: { type: "connect", params: { from: "SRC-CT", to: "LOAD-CT" } },
      },
    ],
  },
  {
    id: "level-1",
    title: "Level 1: Energize the load",
    type: "level",
    difficulty: 1,
    description: "Build a simple feeder that energizes the load.",
    briefing: {
      backstory:
        "A large generation customer wants to connect to the grid. They have installed their own transformer, and you must now construct a basic switchgear bay to connect it safely to the grid.",
      learningObjectives: [
        "Build a safe bay with DS → CB → DS and earth switches on either side of the breaker.",
        "Safely energize the transformer by closing switchgear in the correct sequence.",
        "Safely isolate and earth the bay after de-energizing.",
        "Use right-click to quote isolation points on switchgear.",
      ],
      constraints: [
        "The transformer and source are already installed and cannot be moved.",
        "Only disconnectors, breakers, and earth switches can be added.",
      ],
    },
    initialGraph: {
      locked: {
        nodes: [
          makeNode("iface", "SRC-L1", 40, 140, {
            label: "Source",
            iface: { substationId: "SUB", terminalId: "S4" },
            locked: true,
          }),
          makeNode("tx", "TX-L1", 160, 140, {
            label: "Customer TX",
            locked: true,
          }),
          makeNode("iface", "LOAD-L1", 760, 140, {
            label: "Load",
            iface: { substationId: "SUB", terminalId: "L4" },
            locked: true,
          }),
        ],
        edges: [makeBusbarEdge("SRC-L1", "TX-L1", "R", "L", "bb-l1-1", "bb-l1-1")],
      },
      player: { nodes: [], edges: [] },
    },
    buildRules: {
      allowedPalette: ["cb", "ds", "es"],
      maxCounts: { cb: 1, ds: 2, es: 2 },
      buildZones: [{ x: 260, y: 80, width: 420, height: 200 }],
      lockedNodes: ["SRC-L1", "TX-L1", "LOAD-L1"],
      lockedEdges: ["bb-l1-1"],
    },
    objectives: [
      {
        id: "obj-build",
        label: "Build a DS → CB → DS bay with earths to connect TX-L1 to LOAD-L1.",
        type: "buildBay",
        params: { from: "TX-L1", to: "LOAD-L1", requiredCounts: { cb: 1, ds: 2, es: 2 } },
      },
      {
        id: "obj-energize",
        label: "Safely switch in to energize LOAD-L1.",
        type: "sequence",
        params: {
          mode: "energize",
          terminalId: "LOAD-L1",
          switchKindCounts: { ds: 2, cb: 1 },
          earthKindCounts: { es: 2 },
        },
      },
      {
        id: "obj-isolate",
        label: "Safely isolate and earth the bay after de-energizing.",
        type: "sequence",
        params: {
          mode: "isolate",
          terminalId: "LOAD-L1",
          switchKindCounts: { ds: 2, cb: 1 },
          earthKindCounts: { es: 2 },
          requirePriorEnergize: true,
        },
      },
      {
        id: "obj-isolation-tags",
        label: "Apply points of isolation on both disconnectors.",
        type: "tagIsolation",
        params: { kinds: ["ds"], count: 2 },
      },
    ],
    scoring: {
      starThresholds: { one: 33, two: 66, three: 99 },
      penalties: { excessComponents: 4, unusedComponents: 2 },
      targetCounts: { cb: 1, ds: 2, es: 2 },
      resilienceTests: [
        {
          type: "tripDevice",
          kind: "cb",
          requiredEnergized: ["LOAD-L1"],
        },
      ],
    },
  },
  {
    id: "level-2",
    title: "Level 2: Twin radial feeder build",
    type: "level",
    difficulty: 2,
    description: "Build a twin-radial feeder arrangement with resilient transformer switching.",
    briefing: {
      backstory:
        "You are building a twin-radial feeder arrangement for a new windfarm. Two incoming circuits feed two transformer bays, with coupler flexibility so one path can remain in service during maintenance.",
      learningObjectives: [
        "Place two transformers with switchgear bays on both sides.",
        "Create a bus coupler between the low-voltage sides so one transformer can supply both circuits during maintenance.",
        "Safely isolate one transformer while maintaining supply through the other.",
      ],
      constraints: [
        "Two incoming and two outgoing interfaces are fixed.",
        "Use transformers, breakers, disconnectors, and earth switches to build each bay.",
      ],
    },
    initialGraph: {
      locked: {
        nodes: [
          makeNode("iface", "SRC-L2A", 40, 120, {
            label: "Incomer A",
            iface: { substationId: "SUB", terminalId: "S5" },
            locked: true,
          }),
          makeNode("iface", "SRC-L2B", 40, 820, {
            label: "Incomer B",
            iface: { substationId: "SUB", terminalId: "S6" },
            locked: true,
          }),
          makeNode("iface", "LOAD-L2A", 1240, 120, {
            label: "Grid Out A",
            iface: { substationId: "SUB", terminalId: "L5" },
            locked: true,
          }),
          makeNode("iface", "LOAD-L2B", 1240, 820, {
            label: "Grid Out B",
            iface: { substationId: "SUB", terminalId: "L6" },
            locked: true,
          }),
        ],
        edges: [],
      },
      player: { nodes: [], edges: [] },
    },
    buildRules: {
      allowedPalette: ["cb", "ds", "es", "tx"],
      buildZones: [
        { x: 140, y: 40, width: 1040, height: 860 },
      ],
      lockedNodes: ["SRC-L2A", "SRC-L2B", "LOAD-L2A", "LOAD-L2B"],
      lockedEdges: [],
    },
    objectives: [
      {
        id: "obj-build-l2",
        label: "Install two transformers with full switchgear bays on both sides (including earth switches).",
        type: "includeComponent",
        params: {
          kinds: ["tx", "cb", "ds", "es"],
          count: 2,
          requiredCounts: { tx: 2, cb: 6, ds: 14, es: 12 },
        },
      },
      {
        id: "obj-connect-a",
        label: "Connect Incomer A to Grid Out A through a transformer bay.",
        type: "connectBetween",
        params: { from: "SRC-L2A", to: "LOAD-L2A" },
      },
      {
        id: "obj-connect-b",
        label: "Connect Incomer B to Grid Out B through a transformer bay.",
        type: "connectBetween",
        params: { from: "SRC-L2B", to: "LOAD-L2B" },
      },
      {
        id: "obj-bus-coupler",
        label: "Provide a low-voltage bus coupler between the transformer bays.",
        type: "connectBetween",
        params: { from: "LOAD-L2A", to: "LOAD-L2B" },
      },
    ],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
      penalties: { excessComponents: 3, unusedComponents: 2, failedComponents: 15 },
      targetCounts: { tx: 2, cb: 6, ds: 14, es: 12 },
    },
  },
  {
    id: "level-3",
    title: "Level 3: Add a reserve bus",
    type: "level",
    difficulty: 3,
    description: "Expand a main-bus substation with reserve bus, coupler, and sectioning operations.",
    briefing: {
      backstory:
        "Upgrade this single-bus substation to include a reserve busbar and a bus coupler. A bus section breaker is not required because the coupler can provide the necessary switching path for maintenance.",
      learningObjectives: [
        "Add a reserve busbar and connect each bay to it through a disconnector.",
        "Install a bus coupler at one end so the bars can be paralleled.",
        "Demonstrate switching to bypass the middle feeder while keeping import/export connected.",
      ],
      constraints: [
        "The three existing bays and main bus section (DS-CB-DS) are fixed.",
        "Use disconnectors, breakers, and earth switches to extend the yard.",
        "Use the Busbar Tool button (top-left) to draw clean reserve busbars.",
      ],
    },
    initialGraph: {
      locked: {
        nodes: [
          makeNode("iface", "L3-IMPORT", 240, 520, {
            label: "Import",
            iface: { substationId: "SUB", terminalId: "L3I" },
            locked: true,
          }),
          makeNode("iface", "L3-MID", 520, 520, {
            label: "Feeder",
            iface: { substationId: "SUB", terminalId: "L3M" },
            locked: true,
          }),
          makeNode("iface", "L3-EXPORT", 800, 520, {
            label: "Export",
            iface: { substationId: "SUB", terminalId: "L3E" },
            locked: true,
          }),
          makeNode("junction", "L3-BUS-L", 240, 120, {}),
          makeNode("junction", "L3-BUS-M", 520, 120, {}),
          makeNode("junction", "L3-BUS-R", 800, 120, {}),
          makeNode("ds", "L3-BUS-SEC-DS-A", 620, 120, { state: "open" }),
          makeNode("cb", "L3-BUS-SEC-CB", 680, 120, { state: "open" }),
          makeNode("ds", "L3-BUS-SEC-DS-B", 740, 120, { state: "open" }),
          makeNode("ds", "L3-DS-L1", 220, 200, { state: "open" }),
          makeNode("cb", "L3-CB-L", 220, 260, { state: "open" }),
          makeNode("ds", "L3-DS-L2", 220, 320, { state: "open" }),
          makeNode("ds", "L3-DS-M1", 500, 200, { state: "open" }),
          makeNode("cb", "L3-CB-M", 500, 260, { state: "open" }),
          makeNode("ds", "L3-DS-M2", 500, 320, { state: "open" }),
          makeNode("ds", "L3-DS-R1", 780, 200, { state: "open" }),
          makeNode("cb", "L3-CB-R", 780, 260, { state: "open" }),
          makeNode("ds", "L3-DS-R2", 780, 320, { state: "open" }),
        ],
        edges: [
          makeBusbarEdge("L3-BUS-L", "L3-BUS-M", "R", "L", "bb-l3-main-1", "bb-l3-main-1"),
          makeBusbarEdge("L3-BUS-M", "L3-BUS-SEC-DS-A", "R", "L", "bb-l3-main-2a", "bb-l3-main-2a"),
          makeBusbarEdge("L3-BUS-SEC-DS-A", "L3-BUS-SEC-CB", "R", "L", "bb-l3-main-2b", "bb-l3-main-2b"),
          makeBusbarEdge("L3-BUS-SEC-CB", "L3-BUS-SEC-DS-B", "R", "L", "bb-l3-main-2c", "bb-l3-main-2c"),
          makeBusbarEdge("L3-BUS-SEC-DS-B", "L3-BUS-R", "R", "L", "bb-l3-main-2d", "bb-l3-main-2d"),
          makeBusbarEdge("L3-BUS-L", "L3-DS-L1", "B", "T", "bb-l3-l-1", "bb-l3-l-1"),
          makeBusbarEdge("L3-DS-L1", "L3-CB-L", "B", "T", "bb-l3-l-2", "bb-l3-l-2"),
          makeBusbarEdge("L3-CB-L", "L3-DS-L2", "B", "T", "bb-l3-l-3", "bb-l3-l-3"),
          makeBusbarEdge("L3-DS-L2", "L3-IMPORT", "B", "T", "bb-l3-l-4", "bb-l3-l-4"),
          makeBusbarEdge("L3-BUS-M", "L3-DS-M1", "B", "T", "bb-l3-m-1", "bb-l3-m-1"),
          makeBusbarEdge("L3-DS-M1", "L3-CB-M", "B", "T", "bb-l3-m-2", "bb-l3-m-2"),
          makeBusbarEdge("L3-CB-M", "L3-DS-M2", "B", "T", "bb-l3-m-3", "bb-l3-m-3"),
          makeBusbarEdge("L3-DS-M2", "L3-MID", "B", "T", "bb-l3-m-4", "bb-l3-m-4"),
          makeBusbarEdge("L3-BUS-R", "L3-DS-R1", "B", "T", "bb-l3-r-1", "bb-l3-r-1"),
          makeBusbarEdge("L3-DS-R1", "L3-CB-R", "B", "T", "bb-l3-r-2", "bb-l3-r-2"),
          makeBusbarEdge("L3-CB-R", "L3-DS-R2", "B", "T", "bb-l3-r-3", "bb-l3-r-3"),
          makeBusbarEdge("L3-DS-R2", "L3-EXPORT", "B", "T", "bb-l3-r-4", "bb-l3-r-4"),
        ],
      },
      player: { nodes: [], edges: [] },
    },
    buildRules: {
      allowedPalette: ["cb", "ds", "es"],
      buildZones: [{ x: 120, y: 40, width: 860, height: 520 }],
      lockedNodes: [
        "L3-IMPORT",
        "L3-MID",
        "L3-EXPORT",
        "L3-BUS-L",
        "L3-BUS-M",
        "L3-BUS-R",
        "L3-BUS-SEC-DS-A",
        "L3-BUS-SEC-CB",
        "L3-BUS-SEC-DS-B",
        "L3-DS-L1",
        "L3-CB-L",
        "L3-DS-L2",
        "L3-DS-M1",
        "L3-CB-M",
        "L3-DS-M2",
        "L3-DS-R1",
        "L3-CB-R",
        "L3-DS-R2",
      ],
      lockedEdges: [
        "bb-l3-main-1",
        "bb-l3-main-2a",
        "bb-l3-main-2b",
        "bb-l3-main-2c",
        "bb-l3-main-2d",
        "bb-l3-l-1",
        "bb-l3-l-2",
        "bb-l3-l-3",
        "bb-l3-l-4",
        "bb-l3-m-1",
        "bb-l3-m-2",
        "bb-l3-m-3",
        "bb-l3-m-4",
        "bb-l3-r-1",
        "bb-l3-r-2",
        "bb-l3-r-3",
        "bb-l3-r-4",
      ],
    },
    objectives: [
      {
        id: "obj-l3-reserve-bus",
        label: "Create a reserve busbar, connect each bay to it, and add reserve bus section disconnectors.",
        type: "includeComponent",
        params: { kinds: ["ds"], count: 5 },
      },
      {
        id: "obj-l3-coupler",
        label: "Install a bus coupler to connect the main and reserve busbars.",
        type: "includeComponent",
        params: { kinds: ["cb"], count: 1 },
      },
      {
        id: "obj-l3-import-export",
        label: "Provide a path between Import and Export while bypassing the middle feeder.",
        type: "connectBetween",
        params: { from: "L3-IMPORT", to: "L3-EXPORT" },
      },
    ],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
      penalties: { excessComponents: 3, unusedComponents: 2, failedComponents: 15 },
      targetCounts: { cb: 4, ds: 9, es: 2 },
    },
  },
  {
    id: "phase1_overload_transfer",
    title: "Phase 1: Overload Transfer, Fault, Isolation",
    type: "tutorial",
    difficulty: 4,
    description: "Rebalance load under overload, then isolate a faulted circuit safely.",
    initialGraph: {
      locked: {
        nodes: [
          { ...makeNode("iface", "P1-SRC", 40, 180, { label: "Source", locked: true, iface: { substationId: "SUB", terminalId: "P1S" } }), data: { ...(makeNode("iface", "P1-SRC", 40, 180, { label: "Source", locked: true, iface: { substationId: "SUB", terminalId: "P1S" } }).data as any), power: { role: "source", pMw: 160, qMvar: 10 } } },
          { ...makeNode("iface", "P1-LOAD", 860, 180, { label: "Load", locked: true, iface: { substationId: "SUB", terminalId: "P1L" } }), data: { ...(makeNode("iface", "P1-LOAD", 860, 180, { label: "Load", locked: true, iface: { substationId: "SUB", terminalId: "P1L" } }).data as any), power: { role: "load", pMw: 150, qMvar: 65 } } },
          makeNode("junction", "P1-JL", 180, 180, {}),
          makeNode("junction", "P1-JR", 720, 180, {}),
          makeNode("ds", "P1-DS-A1", 280, 120, { state: "closed" }),
          makeNode("cb", "P1-CB-A", 430, 120, { state: "closed" }),
          makeNode("ds", "P1-DS-A2", 580, 120, { state: "closed" }),
          makeNode("ds", "P1-DS-B1", 280, 240, { state: "open" }),
          makeNode("cb", "P1-CB-B", 430, 240, { state: "open" }),
          makeNode("ds", "P1-DS-B2", 580, 240, { state: "open" }),
          makeNode("es", "P1-ES-A", 430, 320, { state: "open" }),
        ],
        edges: [
          { ...makeBusbarEdge("P1-SRC", "P1-JL", "R", "L", "p1-src", "p1-e1"), data: { kind: "busbar", busbarId: "p1-src", ratingMva: 200 } },
          { ...makeBusbarEdge("P1-JL", "P1-DS-A1", "R", "L", "p1-a", "p1-e2"), data: { kind: "busbar", busbarId: "p1-a", ratingMva: 65 } },
          { ...makeBusbarEdge("P1-DS-A1", "P1-CB-A", "R", "L", "p1-a", "p1-e3"), data: { kind: "busbar", busbarId: "p1-a", ratingMva: 65 } },
          { ...makeBusbarEdge("P1-CB-A", "P1-DS-A2", "R", "L", "p1-a", "p1-e4"), data: { kind: "busbar", busbarId: "p1-a", ratingMva: 65 } },
          { ...makeBusbarEdge("P1-DS-A2", "P1-JR", "R", "L", "p1-a", "p1-e5"), data: { kind: "busbar", busbarId: "p1-a", ratingMva: 65 } },
          { ...makeBusbarEdge("P1-JL", "P1-DS-B1", "R", "L", "p1-b", "p1-e6"), data: { kind: "busbar", busbarId: "p1-b", ratingMva: 80 } },
          { ...makeBusbarEdge("P1-DS-B1", "P1-CB-B", "R", "L", "p1-b", "p1-e7"), data: { kind: "busbar", busbarId: "p1-b", ratingMva: 80 } },
          { ...makeBusbarEdge("P1-CB-B", "P1-DS-B2", "R", "L", "p1-b", "p1-e8"), data: { kind: "busbar", busbarId: "p1-b", ratingMva: 80 } },
          { ...makeBusbarEdge("P1-DS-B2", "P1-JR", "R", "L", "p1-b", "p1-e9"), data: { kind: "busbar", busbarId: "p1-b", ratingMva: 80 } },
          { ...makeBusbarEdge("P1-JR", "P1-LOAD", "R", "L", "p1-load", "p1-e10"), data: { kind: "busbar", busbarId: "p1-load", ratingMva: 200 } },
          { ...makeBusbarEdge("P1-CB-A", "P1-ES-A", "B", "T", "p1-gnd", "p1-e11"), data: { kind: "busbar", busbarId: "p1-gnd", ratingMva: 200 } },
        ],
      },
      player: {
        nodes: [],
        edges: [],
      },
    },
    buildRules: {
      allowedPalette: [],
      lockedNodes: ["P1-SRC", "P1-LOAD", "P1-JL", "P1-JR", "P1-DS-A1", "P1-CB-A", "P1-DS-A2", "P1-DS-B1", "P1-CB-B", "P1-DS-B2", "P1-ES-A"],
      lockedEdges: ["p1-e1", "p1-e2", "p1-e3", "p1-e4", "p1-e5", "p1-e6", "p1-e7", "p1-e8", "p1-e9", "p1-e10", "p1-e11"],
    },
    objectives: [
      { id: "p1-obj-1", label: "Manage overload and keep supply on load.", type: "noIllegalOperations" },
    ],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
    },
    tutorialSteps: [
      { id: "p1-stage-1", title: "Stage 1: Transfer load", body: "Close DS/CB path B to split load and clear overload on circuit A.", requires: { type: "toggle", params: { nodeIds: ["P1-DS-B1", "P1-CB-B", "P1-DS-B2"], to: "closed" } } },
      { id: "p1-stage-2", title: "Stage 2: Faulted circuit", body: "A fault appears on circuit A. Open CB-A and rebalance via circuit B.", requires: { type: "toggle", params: { nodeId: "P1-CB-A", to: "open" } } },
      { id: "p1-stage-3a", title: "Stage 3: Isolate for maintenance", body: "Open DS-A1 and DS-A2 to isolate the faulted circuit.", requires: { type: "toggle", params: { nodeIds: ["P1-DS-A1", "P1-DS-A2"], to: "open" } } },
      { id: "p1-stage-3b", title: "Apply earth", body: "Close ES-A only after the circuit is isolated.", requires: { type: "toggle", params: { nodeId: "P1-ES-A", to: "closed" } } },
    ],
    challengePhases: {
      stageFaults: [{ stepId: "p1-stage-2", edgeId: "p1-e4", message: "Fault injected on Circuit A. Protection margin reduced." }],
    },
  },
  {
    id: "phase2_reactive_control",
    title: "Phase 2: Reactive Power Control",
    type: "tutorial",
    difficulty: 4,
    description: "Use capacitor and reactor switching to normalize bus voltages.",
    initialGraph: {
      locked: {
        nodes: [
          { ...makeNode("iface", "P2-SRC", 40, 180, { label: "Source", locked: true }), data: { ...(makeNode("iface", "P2-SRC", 40, 180, { label: "Source", locked: true }).data as any), power: { role: "source", pMw: 180, qMvar: 20 } } },
          makeNode("junction", "P2-BUS-L", 280, 180, {}),
          makeNode("junction", "P2-BUS-R", 620, 180, {}),
          { ...makeNode("iface", "P2-LOAD-L", 280, 340, { label: "Load-L" }), data: { ...(makeNode("iface", "P2-LOAD-L", 280, 340, { label: "Load-L" }).data as any), power: { role: "load", pMw: 70, qMvar: 80 } } },
          { ...makeNode("iface", "P2-LOAD-R", 620, 340, { label: "Load-R" }), data: { ...(makeNode("iface", "P2-LOAD-R", 620, 340, { label: "Load-R" }).data as any), power: { role: "load", pMw: 70, qMvar: 5 } } },
          { ...makeNode("iface", "P2-CAP", 180, 80, { label: "Cap Bank" }), data: { ...(makeNode("iface", "P2-CAP", 180, 80, { label: "Cap Bank" }).data as any), power: { role: "neutral", pMw: 0, qMvar: 55, deviceType: "cap_bank" } } },
          { ...makeNode("iface", "P2-REACT", 720, 80, { label: "Shunt Reactor" }), data: { ...(makeNode("iface", "P2-REACT", 720, 80, { label: "Shunt Reactor" }).data as any), power: { role: "neutral", pMw: 0, qMvar: 55, deviceType: "shunt_reactor" } } },
          makeNode("cb", "P2-CB-CAP", 220, 120, { state: "open" }),
          makeNode("cb", "P2-CB-REACT", 680, 120, { state: "open" }),
        ],
        edges: [
          { ...makeBusbarEdge("P2-SRC", "P2-BUS-L", "R", "L", "p2-left", "p2-e1"), data: { kind: "busbar", busbarId: "p2-left", ratingMva: 220 } },
          { ...makeBusbarEdge("P2-BUS-L", "P2-BUS-R", "R", "L", "p2-tie", "p2-e2"), data: { kind: "busbar", busbarId: "p2-tie", ratingMva: 220 } },
          { ...makeBusbarEdge("P2-BUS-L", "P2-LOAD-L", "B", "T", "p2-left", "p2-e3"), data: { kind: "busbar", busbarId: "p2-left", ratingMva: 140 } },
          { ...makeBusbarEdge("P2-BUS-R", "P2-LOAD-R", "B", "T", "p2-right", "p2-e4"), data: { kind: "busbar", busbarId: "p2-right", ratingMva: 140 } },
          { ...makeBusbarEdge("P2-CAP", "P2-CB-CAP", "R", "L", "p2-cap", "p2-e5"), data: { kind: "busbar", busbarId: "p2-left", ratingMva: 100 } },
          { ...makeBusbarEdge("P2-CB-CAP", "P2-BUS-L", "R", "T", "p2-cap", "p2-e6"), data: { kind: "busbar", busbarId: "p2-left", ratingMva: 100 } },
          { ...makeBusbarEdge("P2-REACT", "P2-CB-REACT", "L", "R", "p2-react", "p2-e7"), data: { kind: "busbar", busbarId: "p2-right", ratingMva: 100 } },
          { ...makeBusbarEdge("P2-CB-REACT", "P2-BUS-R", "L", "T", "p2-react", "p2-e8"), data: { kind: "busbar", busbarId: "p2-right", ratingMva: 100 } },
        ],
      },
      player: {
        nodes: [],
        edges: [],
      },
    },
    buildRules: {
      allowedPalette: [],
      lockedNodes: ["P2-SRC", "P2-BUS-L", "P2-BUS-R", "P2-LOAD-L", "P2-LOAD-R", "P2-CAP", "P2-REACT", "P2-CB-CAP", "P2-CB-REACT"],
      lockedEdges: ["p2-e1", "p2-e2", "p2-e3", "p2-e4", "p2-e5", "p2-e6", "p2-e7", "p2-e8"],
    },
    objectives: [{ id: "p2-obj-1", label: "Normalize bus voltage using reactive devices.", type: "noIllegalOperations" }],
    scoring: {
      starThresholds: { one: 60, two: 80, three: 95 },
    },
    tutorialSteps: [
      { id: "p2-stage-1", title: "Low voltage on left bus", body: "Close CB-CAP to inject reactive support to left bus.", requires: { type: "toggle", params: { nodeId: "P2-CB-CAP", to: "closed" } } },
      { id: "p2-stage-2", title: "High voltage on right bus", body: "Close CB-REACT to absorb vars and normalize right bus.", requires: { type: "toggle", params: { nodeId: "P2-CB-REACT", to: "closed" } } },
    ],
  },
];

export function getScenarioById(id: string): ChallengeScenario | undefined {
  return CHALLENGE_SCENARIOS.find((scenario) => scenario.id === id);
}
