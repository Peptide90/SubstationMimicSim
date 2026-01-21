import { randomUUID } from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";

import type {
  AlarmEvent,
  ClientToServerEvents,
  Award,
  Asset,
  AssetStatus,
  AssetTelemetry,
  AssetView,
  FieldReportAssetPayload,
  FieldReport,
  GameEvent,
  GameTick,
  GrantPointsPayload,
  LoadScenarioPayload,
  OperatorConfirmAssetPayload,
  OperatorRemoteSwitchPayload,
  OperatorHandlePlannerRequestPayload,
  PlannerRequest,
  Player,
  RoomState,
  Role,
  ScenarioEvent,
  ScoreActionPayload,
  ServerToClientEvents,
  SetAvailableRolesPayload,
  SetAutoAnnounceResultsPayload,
  SetGmAwardsPayload,
  SetResultsVisibilityPayload,
  SetRolePayload,
  SetTeamsPayload,
  SetTeamNamesPayload,
  Team,
  WorkOrder,
} from "../shared/mpTypes";

type RoomRuntime = RoomState & {
  scenarioCursor: number;
  tickHandle?: NodeJS.Timeout;
  stats: Map<string, PlayerStats>;
  gmAwardSelections: {
    bestSwitchingInstructionPlayerId?: string;
    bestCommunicationTeamId?: string;
  };
  assetsFull: Asset[];
  fieldReportsByAsset: Map<string, FieldReport>;
  workOrdersInternal: WorkOrder[];
  plannerRequestsInternal: PlannerRequest[];
  eventLogShortInternal: AlarmEvent[];
  eventLogDetailInternal: AlarmEvent[];
  inspectionLog: Map<string, number>;
};

const PORT = Number(process.env.MP_SERVER_PORT ?? 3001);
const ROOM_CODE_LENGTH = 6;
const MAX_PLAYERS = 12;
const USERNAME_REGEX = /^[A-Za-z]{3,12}$/;
const PROFANITY_LIST = ["BADWORD"];
const TEAM_LIMITS = { min: 2, max: 4 };
const DEFAULT_TEAMS = 2;
const DEFAULT_ROLES: Role[] = ["operator", "field", "planner"];
const TEAM_NAME_POOL = ["Falcons", "Circuit", "Nexus", "Voltage", "Relay", "Aurora", "Grid"];
const COUNTDOWN_SECONDS = 5;
const INSPECTION_VALID_WINDOW_SEC = 60;
const DEFAULT_FREQUENCY_HZ = 50.0;

type PlayerStats = {
  ackAlarms: number;
  restoreActions: number;
  inspections: number;
  planningRequests: number;
  firstSwitchAt?: number;
};

const rooms = new Map<string, RoomRuntime>();

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: "*" },
});

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms.has(code)) return generateCode();
  return code;
}

function createDefaultAssets(): Asset[] {
  const now = Date.now();
  const makeAsset = ({
    id,
    name,
    type,
    remoteControllable,
    status,
    telemetry,
    remoteFails,
  }: {
    id: string;
    name: string;
    type: Asset["type"];
    remoteControllable: boolean;
    status: AssetStatus;
    telemetry: AssetTelemetry;
    remoteFails?: boolean;
  }): Asset => ({
    id,
    name,
    type,
    remoteControllable,
    remoteFails,
    truth: {
      status,
      telemetry,
      lastTruthUpdated: now,
    },
    scada: {
      status,
      telemetry,
      dbi: false,
      lastScadaUpdated: now,
    },
    lastUpdated: now,
  });

  return [
    makeAsset({
      id: "cb-1",
      name: "Circuit Breaker CB-1",
      type: "cb",
      remoteControllable: true,
      status: "closed",
      telemetry: { windingTempC: 44, oilLevelPct: 92 },
    }),
    makeAsset({
      id: "cb-2",
      name: "Circuit Breaker CB-2",
      type: "cb",
      remoteControllable: true,
      status: "closed",
      telemetry: { windingTempC: 46, oilLevelPct: 91 },
    }),
    makeAsset({
      id: "ds-1",
      name: "Disconnector DS-1",
      type: "ds",
      remoteControllable: false,
      status: "closed",
      telemetry: { windingTempC: 35, oilLevelPct: 0 },
    }),
    makeAsset({
      id: "tx-1",
      name: "Transformer TX-1",
      type: "tx",
      remoteControllable: false,
      status: "closed",
      telemetry: { windingTempC: 68, oilLevelPct: 85 },
    }),
    makeAsset({
      id: "tx-2",
      name: "Transformer TX-2",
      type: "tx",
      remoteControllable: false,
      status: "closed",
      telemetry: { windingTempC: 64, oilLevelPct: 88 },
    }),
    makeAsset({
      id: "bus-1",
      name: "Busbar BB-1",
      type: "bus",
      remoteControllable: false,
      status: "closed",
      telemetry: { windingTempC: 32, oilLevelPct: 0 },
    }),
  ];
}

function inspectionKey(playerId: string, assetId: string): string {
  return `${playerId}:${assetId}`;
}

function hasRecentInspection(room: RoomRuntime, playerId: string, assetId: string): boolean {
  const inspectedAt = room.inspectionLog.get(inspectionKey(playerId, assetId));
  if (!inspectedAt) return false;
  return Date.now() - inspectedAt <= INSPECTION_VALID_WINDOW_SEC * 1000;
}

function buildAssetViews(room: RoomRuntime, role?: Role, playerId?: string): AssetView[] {
  if (role === "gm") {
    return room.assetsFull.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      remoteControllable: asset.remoteControllable,
      scada: asset.scada,
      truth: asset.truth,
    }));
  }

  if (role === "field") {
    return room.assetsFull.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      remoteControllable: asset.remoteControllable,
      scada: asset.scada,
      truth: playerId && room.inspectionLog.has(inspectionKey(playerId, asset.id)) ? asset.truth : null,
    }));
  }

  return room.assetsFull.map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    remoteControllable: asset.remoteControllable,
    scada: asset.scada,
  }));
}

function updateAssetTruth(asset: Asset, status: AssetStatus, telemetry?: AssetTelemetry) {
  asset.truth = {
    status,
    telemetry: telemetry ?? asset.truth.telemetry,
    lastTruthUpdated: Date.now(),
  };
  asset.lastUpdated = Date.now();
}

function updateAssetScada(asset: Asset, status: AssetStatus, telemetry?: AssetTelemetry, dbi?: boolean) {
  asset.scada = {
    status,
    telemetry: telemetry ?? asset.scada.telemetry,
    dbi: dbi ?? asset.scada.dbi,
    lastScadaUpdated: Date.now(),
  };
  asset.lastUpdated = Date.now();
}

function addAlarmEvent(room: RoomRuntime, alarm: AlarmEvent) {
  room.eventLogShortInternal = [...room.eventLogShortInternal, alarm].slice(-200);
  room.eventLogDetailInternal = [...room.eventLogDetailInternal, alarm].slice(-200);
  broadcastRoom(room);
}

function broadcastRoom(room: RoomRuntime) {
  for (const player of room.players) {
    const role = player.isGM ? "gm" : player.role;
    io.to(player.id).emit("mp/roomState", buildRoomView(room, role, player.id));
  }
}

function buildRoomView(room: RoomRuntime, role?: Role, playerId?: string): RoomState {
  const isGM = role === "gm";
  const assets = buildAssetViews(room, role, playerId);
  const fieldReports = role === "operator" || isGM ? [...room.fieldReportsByAsset.values()] : [];
  const workOrders = role === "operator" || role === "field" || isGM ? room.workOrdersInternal : [];
  const plannerRequests = role === "operator" || role === "planner" || isGM ? room.plannerRequestsInternal : [];
  const eventLogShort = role === "operator" || role === "planner" || isGM ? room.eventLogShortInternal : [];
  const eventLogDetail = role === "field" || isGM ? room.eventLogDetailInternal : [];

  return {
    code: room.code,
    gmId: room.gmId,
    players: room.players,
    teams: room.teams,
    availableRoles: room.availableRoles,
    status: room.status,
    scenario: room.scenario,
    startedAt: room.startedAt,
    timeElapsedSec: room.timeElapsedSec,
    countdownEndsAt: room.countdownEndsAt,
    eventLog: room.eventLog,
    eventLogShort,
    eventLogDetail,
    assets,
    fieldReports,
    workOrders,
    plannerRequests,
    systemState: room.systemState,
    orgName: room.orgName,
    resultsVisible: room.resultsVisible,
    autoAnnounceResults: room.autoAnnounceResults,
    awards: room.awards,
  };
}

function makeTeams(count: number): Team[] {
  const names = [...TEAM_NAME_POOL].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, idx) => ({
    id: `team-${idx + 1}`,
    name: names[idx] ?? `Team ${idx + 1}`,
    score: 0,
  }));
}

function addEvent(room: RoomRuntime, event: GameEvent) {
  room.eventLog = [...room.eventLog, event].slice(-200);
  io.to(room.code).emit("mp/eventLog", event);
  broadcastRoom(room);
}

function resetRoomState(room: RoomRuntime) {
  room.eventLog = [];
  room.eventLogShortInternal = [];
  room.eventLogDetailInternal = [];
  room.fieldReportsByAsset = new Map();
  room.workOrdersInternal = [];
  room.plannerRequestsInternal = [];
  room.inspectionLog = new Map();
  room.assetsFull = createDefaultAssets();
  room.systemState = { frequencyHz: DEFAULT_FREQUENCY_HZ, lastUpdated: Date.now() };
}

function handleScenarioEvent(room: RoomRuntime, event: ScenarioEvent) {
  const asset = event.assetId ? room.assetsFull.find((item) => item.id === event.assetId) : undefined;
  const alarmType = event.type === "fault" || event.type === "alarm" || event.type === "note" ? event.type : null;

  if (event.type === "dbi" && asset) {
    updateAssetScada(asset, "unknown", asset.scada.telemetry, event.dbi ?? true);
    addAlarmEvent(room, {
      id: `alarm-${randomUUID()}`,
      timestamp: Date.now(),
      type: "note",
      severity: "med",
      messageShort: event.messageShort ?? event.description ?? `${asset.name} flagged DBI.`,
      messageDetail: event.messageDetail ?? event.description ?? `${asset.name} SCADA data marked indeterminate.`,
      assetId: asset.id,
    });
  }

  if (event.type === "remote_fail" && asset) {
    asset.remoteFails = event.remoteFails ?? true;
    addAlarmEvent(room, {
      id: `alarm-${randomUUID()}`,
      timestamp: Date.now(),
      type: "alarm",
      severity: "high",
      messageShort: event.messageShort ?? `${asset.name} remote control unavailable.`,
      messageDetail:
        event.messageDetail ?? `${asset.name} remote command path failed. Manual switching required.`,
      assetId: asset.id,
    });
  }

  if (event.type === "freq_delta") {
    room.systemState = {
      frequencyHz: Math.max(47, Math.min(52, room.systemState.frequencyHz + (event.frequencyDelta ?? 0))),
      lastUpdated: Date.now(),
    };
    addAlarmEvent(room, {
      id: `alarm-${randomUUID()}`,
      timestamp: Date.now(),
      type: "note",
      severity: "med",
      messageShort: event.messageShort ?? event.description ?? "System frequency shift detected.",
      messageDetail:
        event.messageDetail ??
        event.description ??
        `Frequency now ${room.systemState.frequencyHz.toFixed(2)} Hz.`,
    });
  }

  if (alarmType) {
    addAlarmEvent(room, {
      id: `alarm-${randomUUID()}`,
      timestamp: Date.now(),
      type: alarmType,
      severity: event.alarmSeverity ?? "med",
      messageShort: event.messageShort ?? event.description,
      messageDetail: event.messageDetail ?? event.description,
      assetId: event.assetId,
    });
  }
}

function ensureStats(room: RoomRuntime, playerId: string): PlayerStats {
  const existing = room.stats.get(playerId);
  if (existing) return existing;
  const created: PlayerStats = {
    ackAlarms: 0,
    restoreActions: 0,
    inspections: 0,
    planningRequests: 0,
  };
  room.stats.set(playerId, created);
  return created;
}

function determineAwards(room: RoomRuntime): Award[] {
  const statsEntries = [...room.stats.entries()];
  const findTop = (selector: (stats: PlayerStats) => number) => {
    let best: { playerId: string; score: number } | null = null;
    for (const [playerId, stats] of statsEntries) {
      const score = selector(stats);
      if (!best || score > best.score) best = { playerId, score };
    }
    return best?.score ? best.playerId : undefined;
  };

  const awards: Award[] = [
    {
      id: "award-fastest-switching",
      title: "Fastest Switching",
      description: "Quickest restore actions under pressure.",
      category: "fastest_switching",
      playerId: findTop((stats) => (stats.firstSwitchAt ? 1_000_000_000 - stats.firstSwitchAt : 0)),
    },
    {
      id: "award-alarm-management",
      title: "Most Accurate Alarm Management",
      description: "Highest number of alarms acknowledged.",
      category: "alarm_management",
      playerId: findTop((stats) => stats.ackAlarms),
    },
    {
      id: "award-forecasting",
      title: "Best Forecasting",
      description: "Most effective planning requests submitted.",
      category: "forecasting",
      playerId: findTop((stats) => stats.planningRequests),
    },
    {
      id: "award-field-experience",
      title: "Most Experienced Field Team",
      description: "Most inspections completed.",
      category: "field_experience",
      playerId: findTop((stats) => stats.inspections),
    },
    {
      id: "award-team-management",
      title: "Effective Team Management",
      description: "Highest overall action count.",
      category: "team_management",
      playerId: findTop(
        (stats) => stats.ackAlarms + stats.restoreActions + stats.inspections + stats.planningRequests
      ),
    },
  ];

  if (room.gmAwardSelections.bestSwitchingInstructionPlayerId) {
    awards.push({
      id: "award-gm-switching",
      title: "GM Award: Best Switching Instruction",
      description: "Selected by the Game Master.",
      category: "gm_best_switching_instruction",
      playerId: room.gmAwardSelections.bestSwitchingInstructionPlayerId,
    });
  }
  if (room.gmAwardSelections.bestCommunicationTeamId) {
    awards.push({
      id: "award-gm-communication",
      title: "GM Award: Best Communication",
      description: "Selected by the Game Master.",
      category: "gm_best_communication",
      teamId: room.gmAwardSelections.bestCommunicationTeamId,
    });
  }

  return awards;
}

function tickRoom(room: RoomRuntime) {
  if (room.status === "countdown" && room.countdownEndsAt) {
    if (Date.now() >= room.countdownEndsAt) {
      room.status = "running";
      room.startedAt = Date.now();
      room.timeElapsedSec = 0;
      broadcastRoom(room);
    }
  }
  if (!room.startedAt) return;
  const elapsedSec = Math.floor((Date.now() - room.startedAt) / 1000);
  room.timeElapsedSec = elapsedSec;
  const remainingSec = room.scenario ? Math.max(room.scenario.durationSec - elapsedSec, 0) : undefined;
  const tick: GameTick = { elapsedSec, remainingSec, status: room.status };
  io.to(room.code).emit("mp/gameTick", tick);

  if (room.scenario) {
    while (room.scenarioCursor < room.scenario.events.length) {
      const evt = room.scenario.events[room.scenarioCursor];
      if (evt.atSec > elapsedSec) break;
      room.scenarioCursor += 1;
      const event: GameEvent = {
        id: evt.id,
        timestamp: Date.now(),
        type: evt.type,
        message: evt.description,
      };
      addEvent(room, event);
      handleScenarioEvent(room, evt);
      if (evt.points) {
        // Scenario events award points to all teams for MVP placeholder.
        for (const team of room.teams) {
          team.score += evt.points;
        }
      }
    }
  }

  if (room.scenario && remainingSec === 0 && room.status === "running") {
    room.status = "finished";
    room.awards = determineAwards(room);
    room.resultsVisible = room.autoAnnounceResults;
    broadcastRoom(room);
    if (room.tickHandle) {
      clearInterval(room.tickHandle);
      room.tickHandle = undefined;
    }
  }
}

function ensureRoom(code: string) {
  return rooms.get(code);
}

function requireGM(room: RoomRuntime, playerId: string): boolean {
  return room.gmId === playerId;
}

function findRoomByPlayer(playerId: string): { room: RoomRuntime; player: Player } | null {
  for (const room of rooms.values()) {
    const player = room.players.find((playerItem) => playerItem.id === playerId);
    if (player) return { room, player };
  }
  return null;
}

function validateName(name: string): boolean {
  if (!USERNAME_REGEX.test(name)) return false;
  const normalized = name.toLowerCase();
  return !PROFANITY_LIST.some((word) => normalized.includes(word.toLowerCase()));
}

function assignRandomTeam(room: RoomRuntime): string | undefined {
  if (room.teams.length === 0) return undefined;
  const team = room.teams[Math.floor(Math.random() * room.teams.length)];
  return team?.id;
}

function handleScoreAction(room: RoomRuntime, player: Player, payload: ScoreActionPayload) {
  const team = room.teams.find((teamItem) => teamItem.id === player.teamId);
  if (!team) return;
  const stats = ensureStats(room, player.id);
  const pointsMap: Record<ScoreActionPayload["action"], number> = {
    ack_alarm: 5,
    restore_service: 15,
    inspect_equipment: 3,
    plan_request: 2,
  };
  if (payload.action === "ack_alarm") stats.ackAlarms += 1;
  if (payload.action === "restore_service") {
    stats.restoreActions += 1;
    stats.firstSwitchAt = stats.firstSwitchAt ?? Date.now();
  }
  if (payload.action === "inspect_equipment") stats.inspections += 1;
  if (payload.action === "plan_request") stats.planningRequests += 1;
  team.score += pointsMap[payload.action];
  addEvent(room, {
    id: `score-${randomUUID()}`,
    timestamp: Date.now(),
    type: "score",
    message: `${player.name ?? "Player"} completed ${payload.action.replace("_", " ")}`,
    playerId: player.id,
    teamId: team.id,
  });
}

io.on("connection", (socket) => {
  socket.on("mp/createRoom", ({ teamCount }) => {
    const code = generateCode();
    const teams = makeTeams(
      Math.min(TEAM_LIMITS.max, Math.max(TEAM_LIMITS.min, teamCount ?? DEFAULT_TEAMS))
    );
    const player: Player = {
      id: socket.id,
      name: undefined,
      role: "gm",
      teamId: undefined,
      isGM: true,
      connected: true,
    };
    const systemState = { frequencyHz: DEFAULT_FREQUENCY_HZ, lastUpdated: Date.now() };
    const room: RoomRuntime = {
      code,
      gmId: socket.id,
      players: [player],
      teams,
      availableRoles: DEFAULT_ROLES,
      status: "lobby",
      scenario: undefined,
      startedAt: undefined,
      timeElapsedSec: 0,
      countdownEndsAt: undefined,
      eventLog: [],
      eventLogShort: [],
      eventLogDetail: [],
      assets: [],
      fieldReports: [],
      workOrders: [],
      plannerRequests: [],
      systemState,
      scenarioCursor: 0,
      orgName: "",
      resultsVisible: false,
      autoAnnounceResults: true,
      awards: [],
      stats: new Map(),
      gmAwardSelections: {},
      assetsFull: createDefaultAssets(),
      fieldReportsByAsset: new Map(),
      workOrdersInternal: [],
      plannerRequestsInternal: [],
      eventLogShortInternal: [],
      eventLogDetailInternal: [],
      inspectionLog: new Map(),
    };
    rooms.set(code, room);
    socket.join(code);
    broadcastRoom(room);
  });

  socket.on("mp/joinRoom", ({ code }) => {
    const room = ensureRoom(code);
    if (!room) {
      socket.emit("mp/error", { message: "Room not found." });
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit("mp/error", { message: "Room is full." });
      return;
    }
    const teamId = assignRandomTeam(room);
    const player: Player = {
      id: socket.id,
      name: undefined,
      role: undefined,
      teamId,
      isGM: false,
      connected: true,
    };
    room.players.push(player);
    socket.join(room.code);
    broadcastRoom(room);
  });

  socket.on("mp/setUsername", ({ name }) => {
    const room = [...rooms.values()].find((roomItem) =>
      roomItem.players.some((player) => player.id === socket.id)
    );
    if (!room) return;
    if (!validateName(name)) {
      socket.emit("mp/error", { message: "Name must be 3-12 letters, no spaces." });
      return;
    }
    const player = room.players.find((playerItem) => playerItem.id === socket.id);
    if (!player) return;
    player.name = name;
    broadcastRoom(room);
  });

  socket.on("mp/setRole", (payload: SetRolePayload) => {
    const room = [...rooms.values()].find((roomItem) =>
      roomItem.players.some((player) => player.id === socket.id)
    );
    if (!room) return;
    const playerId = payload.playerId ?? socket.id;
    if (playerId !== socket.id && !requireGM(room, socket.id)) {
      socket.emit("mp/error", { message: "Only the GM can assign roles." });
      return;
    }
    if (!room.availableRoles.includes(payload.role) && payload.role !== "gm") {
      socket.emit("mp/error", { message: "Role is not available in this room." });
      return;
    }
    const player = room.players.find((playerItem) => playerItem.id === playerId);
    if (!player) return;
    player.role = payload.role;
    broadcastRoom(room);
  });

  socket.on("mp/startGame", () => {
    const room = [...rooms.values()].find((roomItem) => roomItem.gmId === socket.id);
    if (!room) {
      socket.emit("mp/error", { message: "Only the GM can start the game." });
      return;
    }
    resetRoomState(room);
    room.status = "countdown";
    room.countdownEndsAt = Date.now() + COUNTDOWN_SECONDS * 1000;
    room.startedAt = undefined;
    room.scenarioCursor = 0;
    if (room.tickHandle) clearInterval(room.tickHandle);
    room.tickHandle = setInterval(() => tickRoom(room), 1000);
    broadcastRoom(room);
  });

  socket.on("mp/setTeams", (payload: SetTeamsPayload) => {
    const room = [...rooms.values()].find((roomItem) => roomItem.gmId === socket.id);
    if (!room) {
      socket.emit("mp/error", { message: "Only the GM can update teams." });
      return;
    }
    const count = Math.min(TEAM_LIMITS.max, Math.max(TEAM_LIMITS.min, payload.teamCount));
    room.teams = makeTeams(count);
    for (const player of room.players) {
      if (player.isGM) {
        player.teamId = undefined;
        continue;
      }
      player.teamId = assignRandomTeam(room);
    }
    broadcastRoom(room);
  });

  socket.on("mp/movePlayerTeam", ({ playerId, teamId }) => {
    const room = [...rooms.values()].find((roomItem) => roomItem.gmId === socket.id);
    if (!room) {
      socket.emit("mp/error", { message: "Only the GM can move players." });
      return;
    }
    const player = room.players.find((playerItem) => playerItem.id === playerId);
    const team = room.teams.find((teamItem) => teamItem.id === teamId);
    if (!player || !team) return;
    if (player.isGM) {
      socket.emit("mp/error", { message: "Game Masters are not assigned to teams." });
      return;
    }
    player.teamId = team.id;
    broadcastRoom(room);
  });

  socket.on("mp/setTeamNames", (payload: SetTeamNamesPayload) => {
    const room = [...rooms.values()].find((roomItem) => roomItem.gmId === socket.id);
    if (!room) {
      socket.emit("mp/error", { message: "Only the GM can set team names." });
      return;
    }
    room.teams = room.teams.map((team, idx) => ({
      ...team,
      name: payload.names[idx] ?? team.name,
    }));
    room.orgName = payload.orgName ?? room.orgName;
    broadcastRoom(room);
  });

  socket.on("mp/setAvailableRoles", (payload: SetAvailableRolesPayload) => {
    const room = [...rooms.values()].find((roomItem) => roomItem.gmId === socket.id);
    if (!room) {
      socket.emit("mp/error", { message: "Only the GM can set roles." });
      return;
    }
    room.availableRoles = payload.roles.filter((role) => role !== "gm");
    broadcastRoom(room);
  });

  socket.on("mp/injectEvent", ({ type, message }) => {
    const room = [...rooms.values()].find((roomItem) => roomItem.gmId === socket.id);
    if (!room) {
      socket.emit("mp/error", { message: "Only the GM can inject events." });
      return;
    }
    addEvent(room, {
      id: `evt-${randomUUID()}`,
      timestamp: Date.now(),
      type,
      message,
    });
  });

  socket.on("mp/loadScenario", ({ scenario }: LoadScenarioPayload) => {
    const room = [...rooms.values()].find((roomItem) => roomItem.gmId === socket.id);
    if (!room) {
      socket.emit("mp/error", { message: "Only the GM can load scenarios." });
      return;
    }
    room.scenario = scenario;
    room.scenarioCursor = 0;
    broadcastRoom(room);
  });

  socket.on("mp/scoreAction", (payload: ScoreActionPayload) => {
    const room = [...rooms.values()].find((roomItem) =>
      roomItem.players.some((player) => player.id === socket.id)
    );
    if (!room) return;
    const player = room.players.find((playerItem) => playerItem.id === socket.id);
    if (!player) return;
    handleScoreAction(room, player, payload);
  });

  socket.on("mp/operatorRemoteSwitch", (payload: OperatorRemoteSwitchPayload) => {
    const found = findRoomByPlayer(socket.id);
    if (!found) return;
    const { room, player } = found;
    if (player.role !== "operator") {
      socket.emit("mp/error", { message: "Only operators can issue remote switching." });
      return;
    }
    const asset = room.assetsFull.find((item) => item.id === payload.assetId);
    if (!asset) {
      socket.emit("mp/error", { message: "Asset not found." });
      return;
    }
    if (!asset.remoteControllable || asset.remoteFails) {
      addAlarmEvent(room, {
        id: `alarm-${randomUUID()}`,
        timestamp: Date.now(),
        type: "alarm",
        severity: "high",
        messageShort: `${asset.name}: Remote command failed.`,
        messageDetail: `${asset.name} remote command failed. Manual switching required.`,
        assetId: asset.id,
      });
      return;
    }
    updateAssetTruth(asset, payload.action);
    updateAssetScada(asset, payload.action, asset.truth.telemetry, false);
    addAlarmEvent(room, {
      id: `alarm-${randomUUID()}`,
      timestamp: Date.now(),
      type: "note",
      severity: "low",
      messageShort: `${asset.name} ${payload.action}ed remotely.`,
      messageDetail: `Remote switching completed: ${asset.name} set to ${payload.action}.`,
      assetId: asset.id,
    });
  });

  socket.on("mp/createWorkOrder", ({ assetId, action, notes }) => {
    const found = findRoomByPlayer(socket.id);
    if (!found) return;
    const { room, player } = found;
    if (player.role !== "operator") {
      socket.emit("mp/error", { message: "Only operators can create work orders." });
      return;
    }
    const asset = room.assetsFull.find((item) => item.id === assetId);
    if (!asset) {
      socket.emit("mp/error", { message: "Asset not found." });
      return;
    }
    const order: WorkOrder = {
      id: `wo-${randomUUID()}`,
      assetId,
      action,
      notes,
      createdBy: player.id,
      createdAt: Date.now(),
      status: "open",
    };
    room.workOrdersInternal = [...room.workOrdersInternal, order];
    broadcastRoom(room);
  });

  socket.on("mp/fieldAcceptWorkOrder", ({ workOrderId }) => {
    const found = findRoomByPlayer(socket.id);
    if (!found) return;
    const { room, player } = found;
    if (player.role !== "field") {
      socket.emit("mp/error", { message: "Only field engineers can accept work orders." });
      return;
    }
    const order = room.workOrdersInternal.find((item) => item.id === workOrderId);
    if (!order) {
      socket.emit("mp/error", { message: "Work order not found." });
      return;
    }
    if (order.status !== "open") {
      socket.emit("mp/error", { message: "Work order is already assigned." });
      return;
    }
    order.status = "accepted";
    order.acceptedBy = player.id;
    broadcastRoom(room);
  });

  socket.on("mp/fieldInspectAsset", ({ assetId }) => {
    const found = findRoomByPlayer(socket.id);
    if (!found) return;
    const { room, player } = found;
    if (player.role !== "field") {
      socket.emit("mp/error", { message: "Only field engineers can inspect assets." });
      return;
    }
    const asset = room.assetsFull.find((item) => item.id === assetId);
    if (!asset) {
      socket.emit("mp/error", { message: "Asset not found." });
      return;
    }
    room.inspectionLog.set(inspectionKey(player.id, assetId), Date.now());
    broadcastRoom(room);
  });

  socket.on("mp/fieldReportAsset", ({ assetId }: FieldReportAssetPayload) => {
    const found = findRoomByPlayer(socket.id);
    if (!found) return;
    const { room, player } = found;
    if (player.role !== "field") {
      socket.emit("mp/error", { message: "Only field engineers can report assets." });
      return;
    }
    const asset = room.assetsFull.find((item) => item.id === assetId);
    if (!asset) {
      socket.emit("mp/error", { message: "Asset not found." });
      return;
    }
    if (!hasRecentInspection(room, player.id, assetId)) {
      socket.emit("mp/error", { message: "Inspect the asset before sending a report." });
      return;
    }
    const report: FieldReport = {
      id: `report-${randomUUID()}`,
      assetId,
      status: asset.truth.status,
      telemetry: asset.truth.telemetry,
      reportedBy: player.id,
      timestamp: Date.now(),
    };
    room.fieldReportsByAsset.set(assetId, report);
    broadcastRoom(room);
  });

  socket.on("mp/fieldManualOperate", ({ workOrderId }) => {
    const found = findRoomByPlayer(socket.id);
    if (!found) return;
    const { room, player } = found;
    if (player.role !== "field") {
      socket.emit("mp/error", { message: "Only field engineers can complete work orders." });
      return;
    }
    const order = room.workOrdersInternal.find((item) => item.id === workOrderId);
    if (!order) {
      socket.emit("mp/error", { message: "Work order not found." });
      return;
    }
    if (order.status !== "accepted" || order.acceptedBy !== player.id) {
      socket.emit("mp/error", { message: "Work order must be accepted before completion." });
      return;
    }
    if (!hasRecentInspection(room, player.id, order.assetId)) {
      socket.emit("mp/error", { message: "Inspect the asset before completing the work order." });
      return;
    }
    const asset = room.assetsFull.find((item) => item.id === order.assetId);
    if (!asset) {
      socket.emit("mp/error", { message: "Asset not found." });
      return;
    }
    if (order.action === "open" || order.action === "close") {
      updateAssetTruth(asset, order.action);
      updateAssetScada(asset, order.action, asset.truth.telemetry, false);
    }
    if (order.action === "inspect") {
      const report: FieldReport = {
        id: `report-${randomUUID()}`,
        assetId: asset.id,
        status: asset.truth.status,
        telemetry: asset.truth.telemetry,
        reportedBy: player.id,
        timestamp: Date.now(),
      };
      room.fieldReportsByAsset.set(asset.id, report);
    }
    order.status = "completed";
    order.completedAt = Date.now();
    addAlarmEvent(room, {
      id: `alarm-${randomUUID()}`,
      timestamp: Date.now(),
      type: "note",
      severity: "low",
      messageShort: `${asset.name} work order ${order.action} completed.`,
      messageDetail: `Field completed ${order.action} on ${asset.name}.`,
      assetId: asset.id,
    });
  });

  socket.on("mp/operatorConfirmAsset", (payload: OperatorConfirmAssetPayload) => {
    const found = findRoomByPlayer(socket.id);
    if (!found) return;
    const { room, player } = found;
    if (player.role !== "operator") {
      socket.emit("mp/error", { message: "Only operators can confirm SCADA updates." });
      return;
    }
    const asset = room.assetsFull.find((item) => item.id === payload.assetId);
    if (!asset) {
      socket.emit("mp/error", { message: "Asset not found." });
      return;
    }
    const report = room.fieldReportsByAsset.get(payload.assetId);
    if (!report) {
      socket.emit("mp/error", { message: "No field report available for this asset." });
      return;
    }
    updateAssetScada(asset, payload.confirmedStatus, payload.confirmedTelemetry, false);
    addAlarmEvent(room, {
      id: `alarm-${randomUUID()}`,
      timestamp: Date.now(),
      type: "note",
      severity: "low",
      messageShort: `${asset.name} SCADA updated from field report.`,
      messageDetail: `Operator confirmed ${asset.name} status: ${payload.confirmedStatus}.`,
      assetId: asset.id,
    });
  });

  socket.on("mp/plannerRequest", ({ type, notes }) => {
    const found = findRoomByPlayer(socket.id);
    if (!found) return;
    const { room, player } = found;
    if (player.role !== "planner") {
      socket.emit("mp/error", { message: "Only planners can send requests." });
      return;
    }
    const request: PlannerRequest = {
      id: `req-${randomUUID()}`,
      type,
      notes,
      createdBy: player.id,
      createdAt: Date.now(),
      status: "pending",
    };
    room.plannerRequestsInternal = [...room.plannerRequestsInternal, request];
    broadcastRoom(room);
  });

  socket.on("mp/operatorHandlePlannerRequest", ({ requestId, status }: OperatorHandlePlannerRequestPayload) => {
    const found = findRoomByPlayer(socket.id);
    if (!found) return;
    const { room, player } = found;
    if (player.role !== "operator") {
      socket.emit("mp/error", { message: "Only operators can manage planner requests." });
      return;
    }
    const request = room.plannerRequestsInternal.find((item) => item.id === requestId);
    if (!request) {
      socket.emit("mp/error", { message: "Planner request not found." });
      return;
    }
    request.status = status;
    request.updatedAt = Date.now();
    request.handledBy = player.id;
    broadcastRoom(room);
  });

  socket.on("mp/operatorConnectGenerator", ({ amountHz }) => {
    const found = findRoomByPlayer(socket.id);
    if (!found) return;
    const { room, player } = found;
    if (player.role !== "operator") {
      socket.emit("mp/error", { message: "Only operators can adjust generation." });
      return;
    }
    const delta = amountHz ?? 0.2;
    room.systemState = {
      frequencyHz: Math.min(50.5, room.systemState.frequencyHz + delta),
      lastUpdated: Date.now(),
    };
    addAlarmEvent(room, {
      id: `alarm-${randomUUID()}`,
      timestamp: Date.now(),
      type: "note",
      severity: "low",
      messageShort: `Generation support applied (+${delta.toFixed(2)} Hz).`,
      messageDetail: `Operator connected generation. Frequency now ${room.systemState.frequencyHz.toFixed(2)} Hz.`,
    });
  });

  socket.on("mp/grantPoints", ({ teamId, points, reason }: GrantPointsPayload) => {
    const room = [...rooms.values()].find((roomItem) => roomItem.gmId === socket.id);
    if (!room) {
      socket.emit("mp/error", { message: "Only the GM can grant points." });
      return;
    }
    const team = room.teams.find((teamItem) => teamItem.id === teamId);
    if (!team) return;
    team.score += points;
    addEvent(room, {
      id: `bonus-${randomUUID()}`,
      timestamp: Date.now(),
      type: "gm_bonus",
      message: `GM bonus: ${reason} (+${points})`,
      teamId: team.id,
    });
  });

  socket.on("mp/setResultsVisibility", ({ visible }: SetResultsVisibilityPayload) => {
    const room = [...rooms.values()].find((roomItem) => roomItem.gmId === socket.id);
    if (!room) {
      socket.emit("mp/error", { message: "Only the GM can reveal results." });
      return;
    }
    room.resultsVisible = visible;
    broadcastRoom(room);
  });

  socket.on("mp/setAutoAnnounceResults", ({ enabled }: SetAutoAnnounceResultsPayload) => {
    const room = [...rooms.values()].find((roomItem) => roomItem.gmId === socket.id);
    if (!room) {
      socket.emit("mp/error", { message: "Only the GM can update auto announcements." });
      return;
    }
    room.autoAnnounceResults = enabled;
    broadcastRoom(room);
  });

  socket.on("mp/setGmAwards", (payload: SetGmAwardsPayload) => {
    const room = [...rooms.values()].find((roomItem) => roomItem.gmId === socket.id);
    if (!room) {
      socket.emit("mp/error", { message: "Only the GM can set awards." });
      return;
    }
    room.gmAwardSelections = payload;
    if (room.status === "finished") {
      room.awards = determineAwards(room);
    }
    broadcastRoom(room);
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      const player = room.players.find((playerItem) => playerItem.id === socket.id);
      if (!player) continue;
      player.connected = false;
      if (room.gmId === socket.id) {
        player.isGM = false;
        const nextGM = room.players.find((candidate) => candidate.connected && candidate.id !== socket.id);
        if (nextGM) {
          room.gmId = nextGM.id;
          nextGM.isGM = true;
          nextGM.role = "gm";
        }
      }
      broadcastRoom(room);
    }
  });
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Multiplayer server listening on :${PORT}`);
});
