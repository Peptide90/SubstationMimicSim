import { randomUUID } from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";

import type {
  ClientToServerEvents,
  GameEvent,
  GameTick,
  LoadScenarioPayload,
  Player,
  RoomState,
  Role,
  ScoreActionPayload,
  ServerToClientEvents,
  SetAvailableRolesPayload,
  SetRolePayload,
  SetTeamsPayload,
  SetTeamNamesPayload,
  Team,
} from "../shared/mpTypes";

type RoomRuntime = RoomState & {
  scenarioCursor: number;
  tickHandle?: NodeJS.Timeout;
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

function broadcastRoom(room: RoomRuntime) {
  io.to(room.code).emit("mp/roomState", sanitizeRoom(room));
}

function sanitizeRoom(room: RoomRuntime): RoomState {
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
    eventLog: room.eventLog,
    orgName: room.orgName,
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

function tickRoom(room: RoomRuntime) {
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
      if (evt.points) {
        const gm = room.players.find((player) => player.id === room.gmId);
        if (gm?.teamId) {
          const team = room.teams.find((teamItem) => teamItem.id === gm.teamId);
          if (team) team.score += evt.points;
        }
      }
    }
  }

  if (room.scenario && remainingSec === 0 && room.status === "running") {
    room.status = "finished";
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
  const pointsMap: Record<ScoreActionPayload["action"], number> = {
    ack_alarm: 5,
    restore_service: 15,
    inspect_equipment: 3,
    plan_request: 2,
  };
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
      teamId: teams[0]?.id,
      isGM: true,
      connected: true,
    };
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
      eventLog: [],
      scenarioCursor: 0,
      orgName: "",
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
    room.status = "running";
    room.startedAt = Date.now();
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
