import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { EventLog } from "../components/EventLog";
import type { EventCategory, EventLogFilters, EventLogItem } from "../components/EventLog";

import { ScadaPanel } from "../components/ScadaPanel";
import { CommunicationsLog } from "./CommunicationsLog";
import { LockedMimicView } from "./LockedMimicView";

import type {
  AlarmEvent,
  Award,
  AssetStatus,
  AssetTelemetry,
  AssetView,
  ClientToServerEvents,
  FieldLocation,
  GameTick,
  Player,
  PlannerRequestType,
  Role,
  RoomState,
  ServerToClientEvents,
  Team,
} from "../../../shared/mpTypes";

import sampleScenario from "./scenarios/sampleScenario.json";

type Props = {
  onExit: () => void;
};

type ReservedSocketEvents = {
  connect: () => void;
  disconnect: (reason?: string) => void;
  connect_error?: (err: unknown) => void;
};

type MpSocket = {
  id?: string;
  on: {
    <K extends keyof ServerToClientEvents>(event: K, handler: ServerToClientEvents[K]): void;
    <K extends keyof ReservedSocketEvents>(event: K, handler: ReservedSocketEvents[K]): void;
  };
  emit: <K extends keyof ClientToServerEvents>(
    event: K,
    payload: Parameters<ClientToServerEvents[K]>[0]
  ) => void;
  disconnect: () => void;
};

declare global {
  interface Window {
    io?: (url: string, options?: { transports?: string[] }) => MpSocket;
  }
}

const MP_SERVER_URL = import.meta.env.VITE_MP_SERVER_URL ?? "http://localhost:3001";
const ROLE_LABELS: Record<Role, string> = {
  gm: "Game Master",
  operator: "Control Room Operator",
  field: "Field Engineer",
  planner: "System Planner",
};

const ROLE_ACTIONS: Array<{ id: Role; label: string }> = [
  { id: "operator", label: ROLE_LABELS.operator },
  { id: "field", label: ROLE_LABELS.field },
  { id: "planner", label: ROLE_LABELS.planner },
];

export function MultiplayerApp({ onExit }: Props) {
  const socketRef = useRef<MpSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [tick, setTick] = useState<GameTick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!window.io) {
      setError("Socket.IO client failed to load. Please refresh the page.");
      return undefined;
    }
    const socket = window.io(MP_SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setClientId(socket.id ?? null);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("mp/roomState", (state) => {
      setRoomState(state);
    });

    socket.on("mp/gameTick", (incomingTick) => {
      setTick(incomingTick);
    });

    socket.on("mp/error", (err) => {
      setError(err.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const currentPlayer = useMemo(() => {
    if (!roomState || !clientId) return null;
    return roomState.players.find((player) => player.id === clientId) ?? null;
  }, [roomState, clientId]);

  const socket = socketRef.current;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 50,
        background: "#020617",
        color: "#e2e8f0",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
          borderBottom: "1px solid #1e293b",
          background: "#0f172a",
        }}
      >
        <div style={{ display: "grid" }}>
          <strong>The Electric Brit&apos;s Grid Game</strong>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>
            Status: {connected ? "Connected" : "Disconnected"}
            {roomState ? ` • Room ${roomState.code}` : ""}
          </span>
        </div>
        {roomState ? (
          <div style={{ display: "grid", gap: 4, textAlign: "right", fontSize: 12, color: "#cbd5f5" }}>
            <span>
              {roomState.scenario?.name ?? "No scenario"} •{" "}
              {tick?.remainingSec !== undefined ? `${tick.remainingSec}s remaining` : "Timer idle"}
            </span>
            {currentPlayer ? (
              <span>
                {currentPlayer.name ?? "Unnamed"} •{" "}
                {currentPlayer.isGM ? "Game Master" : roomState.teams.find((team) => team.id === currentPlayer.teamId)?.name ?? "No team"} •{" "}
                {currentPlayer.role ? ROLE_LABELS[currentPlayer.role] : "No role"}
              </span>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 12, paddingLeft: 12 }}>
          <button
            style={secondaryButton}
            onClick={() => setHelpOpen((prev) => !prev)}
            title="Role help"
          >
            Help
          </button>
          <button
            style={{
              background: "#1e293b",
              color: "#e2e8f0",
              border: "1px solid #334155",
              padding: "8px 12px",
              borderRadius: 8,
              cursor: "pointer",
            }}
            onClick={onExit}
          >
            Back to menu
          </button>
        </div>
      </header>

      {error ? (
        <div style={{ padding: "12px 24px", background: "#7f1d1d", color: "#fee2e2" }}>{error}</div>
      ) : null}
      {helpOpen ? (
        <div style={{ padding: "12px 24px" }}>
          <RoleHelpPanel />
        </div>
      ) : null}

      <div style={{ flex: 1, overflow: "auto" }}>
        {!roomState || !socket ? (
          <Lobby socket={socketRef.current} connected={connected} />
        ) : (
          <RoomView socket={socket} room={roomState} tick={tick} currentPlayer={currentPlayer} />
        )}
      </div>
    </div>
  );
}

function Lobby({
  socket,
  connected,
}: {
  socket: MpSocket | null;
  connected: boolean;
}) {
  const [joinCode, setJoinCode] = useState("");
  const [teamCount, setTeamCount] = useState(2);

  return (
    <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: "40px 24px" }}>
      <div style={{ width: "100%", maxWidth: 960, display: "grid", gap: 24 }}>
        <div>
          <h2 style={{ marginBottom: 8 }}>Multiplayer Lobby</h2>
          <p style={{ color: "#94a3b8" }}>Create a room or join an existing session with a code.</p>
        </div>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div style={{ display: "grid", gap: 12, padding: 16, border: "1px solid #1e293b", borderRadius: 12 }}>
            <strong>Create Game</strong>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Number of teams (2-4)</span>
              <input
                type="number"
                min={2}
                max={4}
                value={teamCount}
                onChange={(event) => setTeamCount(Number(event.target.value))}
                style={inputStyle}
              />
            </label>
            <button
              style={primaryButton}
              disabled={!connected || !socket}
              onClick={() => socket?.emit("mp/createRoom", { teamCount })}
            >
              Create Game
            </button>
          </div>

          <div style={{ display: "grid", gap: 12, padding: 16, border: "1px solid #1e293b", borderRadius: 12 }}>
            <strong>Join Game</strong>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Join code</span>
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="ABC123"
                style={inputStyle}
              />
            </label>
            <button
              style={primaryButton}
              disabled={!connected || joinCode.trim().length < 4 || !socket}
              onClick={() => socket?.emit("mp/joinRoom", { code: joinCode.trim() })}
            >
              Join Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomView({
  socket,
  room,
  tick,
  currentPlayer,
}: {
  socket: MpSocket;
  room: RoomState;
  tick: GameTick | null;
  currentPlayer: Player | null;
}) {
  const [nameInput, setNameInput] = useState("");
  const [roleChoice, setRoleChoice] = useState<Role>("operator");
  const isGM = currentPlayer?.id === room.gmId;

  useEffect(() => {
    if (currentPlayer?.name) setNameInput(currentPlayer.name);
  }, [currentPlayer?.name]);

  useEffect(() => {
    if (!room.availableRoles.includes(roleChoice) && room.availableRoles.length > 0) {
      setRoleChoice(room.availableRoles[0]);
    }
  }, [room.availableRoles, roleChoice]);

  if (isGM) {
    return (
      <GameMasterLayout
        socket={socket}
        room={room}
        tick={tick}
        currentPlayer={currentPlayer}
      />
    );
  }

  return (
    <PlayerLayout
      socket={socket}
      room={room}
      tick={tick}
      currentPlayer={currentPlayer}
      nameInput={nameInput}
      onNameInputChange={setNameInput}
      roleChoice={roleChoice}
      onRoleChoiceChange={setRoleChoice}
    />
  );
}

function PlayerLayout({
  socket,
  room,
  tick,
  currentPlayer,
  nameInput,
  onNameInputChange,
  roleChoice,
  onRoleChoiceChange,
}: {
  socket: MpSocket;
  room: RoomState;
  tick: GameTick | null;
  currentPlayer: Player | null;
  nameInput: string;
  onNameInputChange: (value: string) => void;
  roleChoice: Role;
  onRoleChoiceChange: (value: Role) => void;
}) {
  const isLobbyPhase = room.status === "lobby" || room.status === "countdown";
  if (isLobbyPhase) {
    return (
      <LobbyDetails
        socket={socket}
        room={room}
        tick={tick}
        currentPlayer={currentPlayer}
        nameInput={nameInput}
        onNameInputChange={onNameInputChange}
        roleChoice={roleChoice}
        onRoleChoiceChange={onRoleChoiceChange}
      />
    );
  }

  return (
    <div style={{ padding: "24px", display: "grid", gap: 16, minHeight: "100%" }}>
      {currentPlayer?.role ? (
        <RoleView role={currentPlayer.role} socket={socket} room={room} currentPlayer={currentPlayer} />
      ) : (
        <div style={{ color: "#94a3b8" }}>Select a role to enter the game view.</div>
      )}
      {room.status === "finished" && room.resultsVisible ? (
        <ResultsPanel room={room} currentPlayer={currentPlayer} />
      ) : null}
    </div>
  );
}

function LobbyDetails({
  socket,
  room,
  tick,
  currentPlayer,
  nameInput,
  onNameInputChange,
  roleChoice,
  onRoleChoiceChange,
}: {
  socket: MpSocket;
  room: RoomState;
  tick: GameTick | null;
  currentPlayer: Player | null;
  nameInput: string;
  onNameInputChange: (value: string) => void;
  roleChoice: Role;
  onRoleChoiceChange: (value: Role) => void;
}) {
  const countdown = useCountdown(room.countdownEndsAt);
  return (
    <div style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: "40px 24px" }}>
      <div style={{ width: "100%", maxWidth: 960, display: "grid", gap: 24 }}>
        <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
          {!currentPlayer?.name ? <strong>Choose a display name</strong> : <strong>Lobby Setup</strong>}
          {!currentPlayer?.name ? (
            <>
              <input
                value={nameInput}
                onChange={(event) => onNameInputChange(event.target.value)}
                placeholder="Letters only (3-12)"
                style={inputStyle}
              />
              <button
                style={primaryButton}
                onClick={() => socket.emit("mp/setUsername", { name: nameInput.trim() })}
              >
                Confirm Display Name
              </button>
            </>
          ) : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <RoomSummary room={room} tick={tick} countdown={countdown} />
          <TeamScoreboard teams={room.teams} />
          <PlayerList players={room.players} teams={room.teams} />
        </div>

        <div style={{ padding: 16, border: "1px solid #1e293b", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Role Selection</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <select
              value={roleChoice}
              onChange={(event) => onRoleChoiceChange(event.target.value as Role)}
              style={inputStyle}
            >
              {room.availableRoles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <button style={primaryButton} onClick={() => socket.emit("mp/setRole", { role: roleChoice })}>
              Request Role
            </button>
            {currentPlayer?.role ? (
              <span style={{ color: "#94a3b8" }}>Current: {ROLE_LABELS[currentPlayer.role]}</span>
            ) : null}
          </div>
        </div>

        {room.status === "countdown" ? (
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fde047" }}>
            Game starts in {countdown ?? 0}s
          </div>
        ) : null}

        <RoleHelpPanel />
      </div>
    </div>
  );
}

function RoomSummary({
  room,
  tick,
  countdown,
}: {
  room: RoomState;
  tick: GameTick | null;
  countdown?: number | null;
}) {
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Room Overview</h3>
      <div style={{ display: "grid", gap: 6 }}>
        <div>Room code: {room.code}</div>
        <div>Status: {room.status}</div>
        <div>Scenario: {room.scenario?.name ?? "None selected"}</div>
        <div>Organisation: {room.orgName || "Not set"}</div>
        <div>
          Time elapsed: {tick ? `${tick.elapsedSec}s` : `${room.timeElapsedSec ?? 0}s`}
          {tick?.remainingSec !== undefined ? ` • ${tick.remainingSec}s remaining` : ""}
        </div>
        {room.status === "countdown" && countdown !== null ? <div>Countdown: {countdown}s</div> : null}
        {room.status === "finished" ? (
          <div style={{ color: "#a7f3d0" }}>Results ready — review team scores below.</div>
        ) : null}
      </div>
    </div>
  );
}

function TeamScoreboard({ teams }: { teams: Team[] }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Team Scores</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {teams.map((team) => (
          <div key={team.id} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{team.name}</span>
            <strong>{team.score}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerList({ players, teams }: { players: Player[]; teams: Team[] }) {
  const teamLookup = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Players</h3>
      <div style={{ display: "grid", gap: 6 }}>
        {players.map((player) => (
          <div key={player.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <div>
              <strong>{player.name ?? "Unnamed"}</strong>{" "}
              <span style={{ color: "#94a3b8" }}>({player.isGM ? "GM" : player.role ?? "No role"})</span>
            </div>
            <div style={{ color: "#94a3b8" }}>
              {player.isGM ? "GM" : teamLookup.get(player.teamId ?? "") ?? "Unassigned"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GameMasterLayout({
  socket,
  room,
  tick,
  currentPlayer,
}: {
  socket: MpSocket;
  room: RoomState;
  tick: GameTick | null;
  currentPlayer: Player | null;
}) {
  const [viewRole, setViewRole] = useState<Role>("operator");
  const [viewTeam, setViewTeam] = useState(room.teams[0]?.id ?? "");

  useEffect(() => {
    if (!room.availableRoles.includes(viewRole) && room.availableRoles.length > 0) {
      setViewRole(room.availableRoles[0]);
    }
  }, [room.availableRoles, viewRole]);

  useEffect(() => {
    if (room.teams.length > 0 && !room.teams.some((team) => team.id === viewTeam)) {
      setViewTeam(room.teams[0]?.id ?? "");
    }
  }, [room.teams, viewTeam]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) 2fr", minHeight: "100%" }}>
      <div style={{ padding: "24px", borderRight: "1px solid #1e293b", display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
          <strong>Game Master Console</strong>
        </div>

        <RoomSummary room={room} tick={tick} countdown={useCountdown(room.countdownEndsAt)} />
        <div style={{ display: "grid", gap: 12 }}>
          <strong>GM Spectator View</strong>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {room.teams.map((team) => (
                <button
                  key={team.id}
                  style={viewTeam === team.id ? selectedButton : secondaryButton}
                  onClick={() => setViewTeam(team.id)}
                >
                  {team.name}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {room.availableRoles.map((role) => (
                <button
                  key={role}
                  style={viewRole === role ? selectedButton : secondaryButton}
                  onClick={() => setViewRole(role)}
                >
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <GameMasterPanel room={room} socket={socket} />
      </div>

      <div style={{ padding: "24px", display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Live Game View</h2>
          <p style={{ color: "#94a3b8" }}>
            Viewing {ROLE_LABELS[viewRole]} for {room.teams.find((team) => team.id === viewTeam)?.name ?? "Team"}.
          </p>
        </div>
        <RoleView role={viewRole} socket={socket} room={room} currentPlayer={currentPlayer} readOnly />
        {room.status === "finished" && room.resultsVisible ? (
          <ResultsPanel room={room} currentPlayer={currentPlayer} />
        ) : null}
      </div>
    </div>
  );
}

function GameMasterPanel({
  room,
  socket,
}: {
  room: RoomState;
  socket: MpSocket;
}) {
  const [teamCount, setTeamCount] = useState(room.teams.length);
  const [orgName, setOrgName] = useState(room.orgName ?? "");
  const [teamNames, setTeamNames] = useState(room.teams.map((team) => team.name));
  const [roles, setRoles] = useState<Role[]>(room.availableRoles);
  const [scenarioId, setScenarioId] = useState(sampleScenario.id);
  const [eventType, setEventType] = useState("fault");
  const [eventMessage, setEventMessage] = useState("");
  const [bonusTeamId, setBonusTeamId] = useState(room.teams[0]?.id ?? "");
  const [bonusPoints, setBonusPoints] = useState(5);
  const [bonusReason, setBonusReason] = useState("Team coordination");
  const [gmBestSwitching, setGmBestSwitching] = useState<string | undefined>();
  const [gmBestComms, setGmBestComms] = useState<string | undefined>();

  useEffect(() => {
    setTeamCount(room.teams.length);
    setTeamNames(room.teams.map((team) => team.name));
    setRoles(room.availableRoles);
    setOrgName(room.orgName ?? "");
    setBonusTeamId(room.teams[0]?.id ?? "");
  }, [room.teams, room.availableRoles, room.orgName]);

  const scenarios = [sampleScenario];
  const injectEventOptions = [
    { value: "fault", label: "Fault" },
    { value: "alarm", label: "Alarm" },
    { value: "note", label: "Operational Note" },
  ];

  return (
    <div style={{ display: "grid", gap: 16, padding: 16, border: "1px solid #1e293b", borderRadius: 12 }}>
      <h3 style={{ marginTop: 0 }}>Game Master Controls</h3>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={labelStyle}>Teams (2-4)</span>
          <input
            type="number"
            min={2}
            max={4}
            value={teamCount}
            onChange={(event) => setTeamCount(Number(event.target.value))}
            style={inputStyle}
          />
        </label>
        <button style={primaryButton} onClick={() => socket.emit("mp/setTeams", { teamCount })}>
          Apply Team Count
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <strong>Organisation</strong>
        <input
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
          placeholder="School, company, or organisation"
          style={inputStyle}
        />
        <strong>Team Names</strong>
        {teamNames.map((name, idx) => (
          <input
            key={`team-name-${idx}`}
            value={name}
            onChange={(event) =>
              setTeamNames((prev) => prev.map((value, index) => (index === idx ? event.target.value : value)))
            }
            style={inputStyle}
          />
        ))}
        <button
          style={primaryButton}
          onClick={() => socket.emit("mp/setTeamNames", { names: teamNames, orgName })}
        >
          Save Team Names
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <strong>Available Roles</strong>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {ROLE_ACTIONS.map((role) => (
            <label key={role.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={roles.includes(role.id)}
                onChange={(event) => {
                  setRoles((prev) =>
                    event.target.checked ? [...prev, role.id] : prev.filter((item) => item !== role.id)
                  );
                }}
              />
              <span>{role.label}</span>
            </label>
          ))}
        </div>
        <button style={primaryButton} onClick={() => socket.emit("mp/setAvailableRoles", { roles })}>
          Update Roles
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <strong>Player Assignments</strong>
        {room.players.map((player) => (
          <div key={player.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <span>{player.name ?? "Unnamed"}</span>
            <select
              value={player.teamId ?? ""}
              onChange={(event) =>
                socket.emit("mp/movePlayerTeam", { playerId: player.id, teamId: event.target.value })
              }
              style={inputStyle}
              disabled={player.isGM}
            >
              {room.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <select
              value={player.role ?? ""}
              onChange={(event) =>
                socket.emit("mp/setRole", { playerId: player.id, role: event.target.value as Role })
              }
              style={inputStyle}
            >
              <option value="">Unassigned</option>
              <option value="gm">Game Master</option>
              {room.availableRoles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <strong>Scenario Control</strong>
        <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)} style={inputStyle}>
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            style={primaryButton}
            onClick={() =>
              socket.emit("mp/loadScenario", {
                scenario: scenarios.find((scenario) => scenario.id === scenarioId) ?? sampleScenario,
              })
            }
          >
            Load Scenario
          </button>
          <button style={primaryButton} onClick={() => socket.emit("mp/startGame", {})}>
            Start Game
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <strong>Inject Event</strong>
        <select value={eventType} onChange={(event) => setEventType(event.target.value)} style={inputStyle}>
          {injectEventOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={eventMessage}
          onChange={(event) => setEventMessage(event.target.value)}
          placeholder="Event description"
          style={inputStyle}
        />
        <button
          style={primaryButton}
          onClick={() => {
            socket.emit("mp/injectEvent", { type: eventType, message: eventMessage });
            setEventMessage("");
          }}
        >
          Inject Event
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <strong>GM Special Actions</strong>
        <select value={bonusTeamId} onChange={(event) => setBonusTeamId(event.target.value)} style={inputStyle}>
          {room.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={bonusPoints}
          onChange={(event) => setBonusPoints(Number(event.target.value))}
          style={inputStyle}
        />
        <input
          value={bonusReason}
          onChange={(event) => setBonusReason(event.target.value)}
          style={inputStyle}
        />
        <button
          style={primaryButton}
          onClick={() => socket.emit("mp/grantPoints", { teamId: bonusTeamId, points: bonusPoints, reason: bonusReason })}
        >
          Grant Bonus Points
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <strong>Results & Awards</strong>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={room.autoAnnounceResults}
            onChange={(event) => socket.emit("mp/setAutoAnnounceResults", { enabled: event.target.checked })}
          />
          <span title="Disable if you want to announce the winner in person / on command">Auto announce results</span>
        </label>
        <button
          style={secondaryButton}
          onClick={() => socket.emit("mp/setResultsVisibility", { visible: !room.resultsVisible })}
        >
          {room.resultsVisible ? "Hide Results" : "Reveal Results"}
        </button>
        <div style={{ display: "grid", gap: 6 }}>
          <span style={labelStyle}>GM Awards</span>
          <select
            value={gmBestSwitching ?? ""}
            onChange={(event) => setGmBestSwitching(event.target.value || undefined)}
            style={inputStyle}
          >
            <option value="">Best Switching Instruction (player)</option>
            {room.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name ?? "Unnamed"}
              </option>
            ))}
          </select>
          <select
            value={gmBestComms ?? ""}
            onChange={(event) => setGmBestComms(event.target.value || undefined)}
            style={inputStyle}
          >
            <option value="">Best Communication (team)</option>
            {room.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <button
            style={primaryButton}
            onClick={() =>
              socket.emit("mp/setGmAwards", {
                bestSwitchingInstructionPlayerId: gmBestSwitching,
                bestCommunicationTeamId: gmBestComms,
              })
            }
          >
            Save GM Awards
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleView({
  role,
  socket,
  room,
  currentPlayer,
  readOnly = false,
}: {
  role: Role;
  socket: MpSocket;
  room: RoomState;
  currentPlayer: Player | null;
  readOnly?: boolean;
}) {
  if (role === "gm") {
    return (
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Game Master View</h3>
        <p style={{ color: "#94a3b8" }}>
          Use the controls above to manage teams, roles, scenarios, and live events.
        </p>
        <MpGameEventLog events={room.eventLog} />
      </div>
    );
  }

  if (role === "operator") {
    return <OperatorView socket={socket} room={room} readOnly={readOnly} currentPlayer={currentPlayer} />;
  }
  if (role === "field") {
    return <FieldView socket={socket} room={room} readOnly={readOnly} currentPlayer={currentPlayer} />;
  }
  return <PlannerView socket={socket} room={room} readOnly={readOnly} currentPlayer={currentPlayer} />;
}

function OperatorView({
  socket,
  room,
  readOnly,
  currentPlayer,
}: {
  socket: MpSocket;
  room: RoomState;
  readOnly: boolean;
  currentPlayer: Player | null;
}) {
  const [edgeCounts, setEdgeCounts] = useState({ energized: 0, grounded: 0 });
  const assetsById = useMemo(() => new Map(room.assets.map((asset) => [asset.id, asset])), [room.assets]);

  const commandContent = (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: "#94a3b8" }}>System Frequency: {room.systemState.frequencyHz.toFixed(2)} Hz</span>
        <button
          style={secondaryButton}
          disabled={readOnly}
          onClick={() => socket.emit("mp/operatorConnectGenerator", { amountHz: 0.2 })}
        >
          Connect Generator (+0.2 Hz)
        </button>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <strong>Field Reports</strong>
        {room.fieldReports.length === 0 ? (
          <span style={{ color: "#94a3b8", fontSize: 12 }}>No field reports.</span>
        ) : (
          room.fieldReports.map((report) => (
            <div key={report.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
              <span>
                {report.assetId}: {report.status.toUpperCase()}
              </span>
              <button
                style={secondaryButton}
                disabled={readOnly}
                onClick={() =>
                  socket.emit("mp/operatorConfirmAsset", {
                    assetId: report.assetId,
                    confirmedStatus: report.status,
                    confirmedTelemetry: report.telemetry,
                  })
                }
              >
                Confirm
              </button>
            </div>
          ))
        )}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <strong>Field Tasks</strong>
        {room.assets.map((asset) => (
          <div key={asset.id} style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
            <span>{asset.id}</span>
            <button
              style={secondaryButton}
              disabled={readOnly}
              onClick={() => socket.emit("mp/createWorkOrder", { assetId: asset.id, action: "inspect" })}
            >
              Inspect
            </button>
            <button
              style={secondaryButton}
              disabled={readOnly}
              onClick={() => socket.emit("mp/createWorkOrder", { assetId: asset.id, action: "open" })}
            >
              Open
            </button>
            <button
              style={secondaryButton}
              disabled={readOnly}
              onClick={() => socket.emit("mp/createWorkOrder", { assetId: asset.id, action: "close" })}
            >
              Close
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <strong>Planner Requests</strong>
        {room.plannerRequests.length === 0 ? (
          <span style={{ color: "#94a3b8", fontSize: 12 }}>No requests.</span>
        ) : (
          room.plannerRequests.map((request) => (
            <div key={request.id} style={{ display: "grid", gap: 4, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{formatPlannerRequestType(request.type)}</span>
                <span style={{ color: "#94a3b8" }}>{request.status.toUpperCase()}</span>
              </div>
              {request.status === "pending" ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    style={secondaryButton}
                    disabled={readOnly}
                    onClick={() =>
                      socket.emit("mp/operatorHandlePlannerRequest", { requestId: request.id, status: "accepted" })
                    }
                  >
                    Accept
                  </button>
                  <button
                    style={secondaryButton}
                    disabled={readOnly}
                    onClick={() =>
                      socket.emit("mp/operatorHandlePlannerRequest", { requestId: request.id, status: "rejected" })
                    }
                  >
                    Reject
                  </button>
                </div>
              ) : null}
              {request.status === "accepted" ? (
                <button
                  style={secondaryButton}
                  disabled={readOnly}
                  onClick={() =>
                    socket.emit("mp/operatorHandlePlannerRequest", { requestId: request.id, status: "completed" })
                  }
                >
                  Mark Completed
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <strong>Work Orders</strong>
        {room.workOrders.length === 0 ? (
          <span style={{ color: "#94a3b8", fontSize: 12 }}>No work orders.</span>
        ) : (
          room.workOrders.map((order) => (
            <span key={order.id} style={{ fontSize: 12, color: "#cbd5f5" }}>
              {order.action.toUpperCase()} — {order.assetId} ({order.status})
            </span>
          ))
        )}
      </div>
    </div>
  );

  const onToggleSwitch = useCallback(
    (assetId: string) => {
      if (readOnly) return;
      const asset = assetsById.get(assetId);
      if (!asset) return;
      const action = asset.scada.status === "closed" ? "open" : "close";
      socket.emit("mp/operatorRemoteSwitch", { assetId, action });
    },
    [assetsById, readOnly, socket]
  );

  const switchgear = useMemo(() => buildSwitchgear(room.assets), [room.assets]);
  const scadaLog = useAlarmEventLog(room.eventLogShort, "short");

  return (
    <RoleLayout
      main={
        <LockedMimicView
          templateId={room.scenario?.mimicTemplateId}
          assets={room.assets}
          role="operator"
          onToggleSwitch={onToggleSwitch}
          onCountsChange={setEdgeCounts}
        />
      }
      scada={
        <ScadaPanel
          energizedEdgeCount={edgeCounts.energized}
          groundedEdgeCount={edgeCounts.grounded}
          switchgear={switchgear}
          onToggleSwitch={onToggleSwitch}
          onToggleDar={() => {}}
          onResetCondition={() => {}}
          events={scadaLog.events}
          filters={scadaLog.filters}
          onToggleFilter={scadaLog.onToggleFilter}
          onAcknowledgeEvent={scadaLog.onAcknowledgeEvent}
          commandContent={commandContent}
          commandHint="Use the command list to coordinate field work and operate switchgear."
        />
      }
      comms={
        <CommunicationsLog
          messages={room.commsLog}
          role="operator"
          playerName={currentPlayer?.name}
          onPost={(type, text) => socket.emit("mp/postCommsMessage", { type, text })}
        />
      }
    />
  );
}

function FieldView({
  socket,
  room,
  readOnly,
  currentPlayer,
}: {
  socket: MpSocket;
  room: RoomState;
  readOnly: boolean;
  currentPlayer: Player | null;
}) {
  const [edgeCounts, setEdgeCounts] = useState({ energized: 0, grounded: 0 });
  const [traveling, setTraveling] = useState(false);
  const fieldLocation = room.fieldLocation ?? "none";
  const fieldAssetId = fieldLocation.startsWith("asset:") ? fieldLocation.slice("asset:".length) : null;
  const currentAsset = room.assets.find((asset) => asset.id === fieldAssetId);
  const currentTruth = currentAsset?.truth ?? null;

  const travelTo = useCallback(
    (location: FieldLocation, delayMs: number) => {
      if (readOnly || traveling) return;
      setTraveling(true);
      setTimeout(() => {
        socket.emit("mp/fieldSetLocation", { location });
        setTraveling(false);
      }, delayMs);
    },
    [readOnly, socket, traveling]
  );

  const commandContent = (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ color: "#94a3b8", fontSize: 12 }}>
        Location: {fieldLocation === "none" ? "Base" : fieldLocation}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {room.assets.map((asset) => (
          <button
            key={asset.id}
            style={secondaryButton}
            disabled={readOnly || traveling}
            onClick={() => travelTo(`asset:${asset.id}`, 3000 + Math.random() * 5000)}
          >
            Travel to {asset.id}
          </button>
        ))}
        <button
          style={secondaryButton}
          disabled={readOnly || traveling}
          onClick={() => travelTo("scadaPanel", 2000)}
        >
          Travel to Local SCADA Panel
        </button>
        <button
          style={secondaryButton}
          disabled={readOnly || traveling}
          onClick={() => socket.emit("mp/fieldSetLocation", { location: "none" })}
        >
          Return to Base
        </button>
      </div>
      {traveling ? <span style={{ color: "#fcd34d", fontSize: 12 }}>Traveling...</span> : null}
      {currentTruth ? (
        <div style={{ display: "grid", gap: 6 }}>
          <strong>{currentAsset?.name ?? "Asset"}</strong>
          <div style={{ fontSize: 12 }}>Status: {currentTruth.status.toUpperCase()}</div>
          {currentTruth.lockout ? (
            <div style={{ fontSize: 12, color: "#fca5a5" }}>Lockout active — maintenance required.</div>
          ) : null}
          <AssetTelemetryPanel telemetry={currentTruth.telemetry} />
          {currentTruth.observations.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#cbd5f5" }}>
              {currentTruth.observations.map((observation, idx) => (
                <li key={`${currentAsset?.id ?? "asset"}-obs-${idx}`}>{observation}</li>
              ))}
            </ul>
          ) : null}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              style={secondaryButton}
              disabled={readOnly}
              onClick={() =>
                socket.emit("mp/fieldReportAsset", {
                  assetId: currentAsset?.id ?? "",
                  status: currentTruth.status,
                  telemetry: currentTruth.telemetry,
                  lockout: currentTruth.lockout,
                })
              }
            >
              Report to Control
            </button>
            <button
              style={secondaryButton}
              disabled={readOnly}
              onClick={() =>
                socket.emit("mp/postCommsMessage", {
                  type: "Field Report",
                  text: `${currentAsset?.id ?? "Asset"}: further inspection underway.`,
                })
              }
            >
              Further Inspection
            </button>
            <button
              style={secondaryButton}
              disabled={readOnly}
              onClick={() => socket.emit("mp/fieldPerformMaintenance", { assetId: currentAsset?.id ?? "" })}
            >
              Perform Maintenance
            </button>
            <button
              style={secondaryButton}
              disabled={readOnly}
              onClick={() => socket.emit("mp/fieldResetLockout", { assetId: currentAsset?.id ?? "" })}
            >
              Reset Lockout
            </button>
            <button
              style={secondaryButton}
              disabled={readOnly}
              onClick={() => socket.emit("mp/fieldAcknowledgeAlarm", { alarmId: currentAsset?.id ?? "" })}
            >
              Acknowledge Local Alarm
            </button>
          </div>
        </div>
      ) : (
        <span style={{ color: "#94a3b8", fontSize: 12 }}>
          Travel to an asset to see ground truth telemetry and observations.
        </span>
      )}
      <div style={{ display: "grid", gap: 6 }}>
        <strong>Work Orders</strong>
        {room.workOrders.length === 0 ? (
          <span style={{ color: "#94a3b8", fontSize: 12 }}>No work orders.</span>
        ) : (
          room.workOrders.map((order) => (
            <div key={order.id} style={{ display: "grid", gap: 4, fontSize: 12 }}>
              <span>
                {order.action.toUpperCase()} — {order.assetId} ({order.status})
              </span>
              {order.status === "open" ? (
                <button
                  style={secondaryButton}
                  disabled={readOnly}
                  onClick={() => socket.emit("mp/fieldAcceptWorkOrder", { workOrderId: order.id })}
                >
                  Accept
                </button>
              ) : null}
              {order.status === "accepted" ? (
                <button
                  style={secondaryButton}
                  disabled={readOnly}
                  onClick={() => socket.emit("mp/fieldManualOperate", { workOrderId: order.id })}
                >
                  Complete
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const scadaLog = useAlarmEventLog(room.eventLogDetail, "detail");

  return (
    <RoleLayout
      main={
        <LockedMimicView
          templateId={room.scenario?.mimicTemplateId}
          assets={room.assets}
          role="field"
          fieldLocation={room.fieldLocation}
          onCountsChange={setEdgeCounts}
        />
      }
      scada={
        <ScadaPanel
          energizedEdgeCount={edgeCounts.energized}
          groundedEdgeCount={edgeCounts.grounded}
          switchgear={emptySwitchgear()}
          onToggleSwitch={() => {}}
          onToggleDar={() => {}}
          onResetCondition={() => {}}
          events={scadaLog.events}
          filters={scadaLog.filters}
          onToggleFilter={scadaLog.onToggleFilter}
          onAcknowledgeEvent={scadaLog.onAcknowledgeEvent}
          commandContent={commandContent}
          showSwitchgear={false}
          commandHint="Travel to equipment or the local SCADA panel to unlock details."
        />
      }
      comms={
        <CommunicationsLog
          messages={room.commsLog}
          role="field"
          playerName={currentPlayer?.name}
          onPost={(type, text) => socket.emit("mp/postCommsMessage", { type, text })}
        />
      }
    />
  );
}

function PlannerView({
  socket,
  room,
  readOnly,
  currentPlayer,
}: {
  socket: MpSocket;
  room: RoomState;
  readOnly: boolean;
  currentPlayer: Player | null;
}) {
  const [requestType, setRequestType] = useState<PlannerRequestType>("add_generation");
  const [requestNotes, setRequestNotes] = useState("");
  const scadaLog = useAlarmEventLog(room.eventLogShort, "short");

  return (
    <RoleLayout
      main={
        <div style={{ padding: 16, display: "grid", gap: 12, minHeight: 0 }}>
          <h3 style={{ margin: 0 }}>System Planner</h3>
          <div style={{ padding: 12, border: "1px dashed #334155", borderRadius: 8 }}>
            <strong>System Frequency:</strong> {room.systemState.frequencyHz.toFixed(2)} Hz
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <strong>Send Request to Operator</strong>
            <select
              value={requestType}
              onChange={(event) => setRequestType(event.target.value as PlannerRequestType)}
              style={inputStyle}
            >
              <option value="add_generation">Add Generation</option>
              <option value="reduce_generation">Reduce Generation</option>
              <option value="shed_load">Shed Load</option>
              <option value="reconfigure">Reconfigure Network</option>
            </select>
            <textarea
              value={requestNotes}
              onChange={(event) => setRequestNotes(event.target.value)}
              placeholder="Notes for the operator"
              style={{ ...inputStyle, minHeight: 72 }}
            />
            <button
              style={primaryButton}
              onClick={() => {
                socket.emit("mp/plannerRequest", { type: requestType, notes: requestNotes || undefined });
                setRequestNotes("");
              }}
              disabled={readOnly}
            >
              Submit Request
            </button>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <strong>Request Status</strong>
            {room.plannerRequests.length === 0 ? (
              <span style={{ color: "#94a3b8" }}>No requests yet.</span>
            ) : null}
            {room.plannerRequests.map((request) => (
              <div key={request.id} style={{ padding: 10, border: "1px solid #1e293b", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{formatPlannerRequestType(request.type)}</strong>
                  <span style={{ color: "#94a3b8" }}>{request.status.toUpperCase()}</span>
                </div>
                {request.notes ? <div style={{ fontSize: 13 }}>{request.notes}</div> : null}
              </div>
            ))}
          </div>
          <div style={{ border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden", minHeight: 0 }}>
            <EventLog
              events={scadaLog.events}
              filters={scadaLog.filters}
              onToggleFilter={scadaLog.onToggleFilter}
              onAcknowledgeEvent={scadaLog.onAcknowledgeEvent}
            />
          </div>
        </div>
      }
      comms={
        <CommunicationsLog
          messages={room.commsLog}
          role="planner"
          playerName={currentPlayer?.name}
          onPost={(type, text) => socket.emit("mp/postCommsMessage", { type, text })}
        />
      }
    />
  );
}

function MpGameEventLog({ events }: { events: RoomState["eventLog"] }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <strong>Event Log</strong>
      <div style={{ maxHeight: 160, overflow: "auto", display: "grid", gap: 4 }}>
        {events.length === 0 ? <div style={{ color: "#94a3b8" }}>No events yet.</div> : null}
        {events.map((event) => (
          <div key={event.id} style={{ fontSize: 12, color: "#cbd5f5" }}>
            [{new Date(event.timestamp).toLocaleTimeString()}] {event.type.toUpperCase()} — {event.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function useAlarmEventLog(events: AlarmEvent[], variant: "short" | "detail") {
  const [filters, setFilters] = useState<EventLogFilters>({
    info: true,
    warn: true,
    error: true,
    debug: false,
    acknowledged: true,
  });
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  const mapped = useMemo<EventLogItem[]>(() => {
    return events.map((event) => {
      const category = event.severity === "high" ? "error" : event.severity === "med" ? "warn" : "info";
      return {
        id: event.id,
        ts: event.timestamp,
        category,
        msg: variant === "detail" ? event.messageDetail : event.messageShort,
        acknowledged: acknowledged.has(event.id),
      };
    });
  }, [acknowledged, events, variant]);

  const onToggleFilter = useCallback((cat: EventCategory | "acknowledged") => {
    setFilters((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const onAcknowledgeEvent = useCallback((eventId: string) => {
    setAcknowledged((prev) => new Set([...prev, eventId]));
  }, []);

  return { events: mapped, filters, onToggleFilter, onAcknowledgeEvent };
}

function buildSwitchgear(assets: AssetView[]) {
  const toState = (status: AssetStatus): "open" | "closed" => (status === "closed" ? "closed" : "open");
  const formatLabel = (asset: AssetView) => {
    const dbiSuffix = asset.scada.dbi ? " (DBI)" : "";
    const lockoutSuffix = asset.scada.lockout ? " (LOCKOUT)" : "";
    return `${asset.id}${dbiSuffix}${lockoutSuffix}`;
  };

  return {
    es: assets
      .filter((asset) => asset.type === "es")
      .map((asset) => ({
        id: asset.id,
        state: toState(asset.scada.status),
        label: formatLabel(asset),
        disabled: !asset.remoteControllable || asset.scada.lockout,
      })),
    ds: assets
      .filter((asset) => asset.type === "ds")
      .map((asset) => ({
        id: asset.id,
        state: toState(asset.scada.status),
        label: formatLabel(asset),
        disabled: !asset.remoteControllable || asset.scada.lockout,
      })),
    cb: assets
      .filter((asset) => asset.type === "cb")
      .map((asset) => ({
        id: asset.id,
        state: toState(asset.scada.status),
        label: formatLabel(asset),
        disabled: !asset.remoteControllable || asset.scada.lockout,
      })),
  };
}

function emptySwitchgear() {
  return { es: [], ds: [], cb: [] };
}

function AssetTelemetryPanel({ telemetry }: { telemetry: AssetTelemetry }) {
  if (telemetry.kind === "tx") {
    return (
      <div style={{ fontSize: 12 }}>
        Winding Temp: {telemetry.windingTempC.toFixed(1)} °C • Oil Level: {telemetry.oilLevelPct.toFixed(0)}%
      </div>
    );
  }
  if (telemetry.kind === "cb") {
    return <div style={{ fontSize: 12 }}>Gas Level: {telemetry.gasLevelPct.toFixed(0)}%</div>;
  }
  return <div style={{ fontSize: 12, color: "#94a3b8" }}>No telemetry available.</div>;
}

function RoleLayout({
  main,
  comms,
  scada,
}: {
  main: ReactNode;
  comms: ReactNode;
  scada?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: scada ? "2fr 1fr" : "1fr",
        gap: 16,
        minHeight: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div
          style={{
            flex: 3,
            minHeight: 0,
            border: "1px solid #1e293b",
            borderRadius: 12,
            display: "flex",
          }}
        >
          {main}
        </div>
        <div style={{ flex: 1, minHeight: 0, border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
          {comms}
        </div>
      </div>
      {scada ? (
        <div style={{ border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden", minHeight: 0 }}>
          {scada}
        </div>
      ) : null}
    </div>
  );
}

function RoleHelpPanel() {
  return (
    <div style={{ padding: 16, border: "1px solid #1e293b", borderRadius: 12 }}>
      <h3 style={{ marginTop: 0 }}>Role Help</h3>
      <div style={{ display: "grid", gap: 12, color: "#cbd5f5" }}>
        <div>
          <strong>{ROLE_LABELS.operator}:</strong> Controls switching and alarm response. Best for players who enjoy
          quick decision-making and operational safety.
        </div>
        <div>
          <strong>{ROLE_LABELS.field}:</strong> Inspects equipment and reports local conditions. Ideal for hands-on
          troubleshooting and situational awareness.
        </div>
        <div>
          <strong>{ROLE_LABELS.planner}:</strong> Monitors demand/supply trends and forecasts. Suited to strategic
          thinkers and system-level analysis.
        </div>
      </div>
    </div>
  );
}

function formatPlannerRequestType(type: PlannerRequestType) {
  switch (type) {
    case "add_generation":
      return "Add Generation";
    case "reduce_generation":
      return "Reduce Generation";
    case "shed_load":
      return "Shed Load";
    case "reconfigure":
      return "Reconfigure Network";
    default:
      return type;
  }
}

function ResultsPanel({ room, currentPlayer }: { room: RoomState; currentPlayer: Player | null }) {
  const topScore = Math.max(...room.teams.map((team) => team.score));
  const winningTeams = room.teams.filter((team) => team.score === topScore);
  const playerTeam = currentPlayer?.teamId;
  const didWin = winningTeams.some((team) => team.id === playerTeam);
  const teamLookup = useMemo(() => new Map(room.teams.map((team) => [team.id, team.name])), [room.teams]);
  const playerLookup = useMemo(
    () => new Map(room.players.map((player) => [player.id, player.name ?? "Unnamed"])),
    [room.players]
  );

  return (
    <div style={{ ...cardStyle, borderColor: "#1e40af" }}>
      <h3 style={{ marginTop: 0 }}>Results Summary</h3>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 600 }}>
          {didWin ? "Your team won this round!" : "Your team did not win this round."}
        </div>
        <div>
          Winning team{winningTeams.length > 1 ? "s" : ""}: {winningTeams.map((team) => team.name).join(", ")}
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <strong>Leaderboard</strong>
          {room.teams.map((team) => (
            <div key={team.id} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{team.name}</span>
              <span>{team.score}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <strong>Awards</strong>
          {room.awards.length === 0 ? <span style={{ color: "#94a3b8" }}>Awards pending.</span> : null}
          {room.awards.map((award) => (
            <AwardRow
              key={award.id}
              award={award}
              teamLookup={teamLookup}
              playerLookup={playerLookup}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AwardRow({
  award,
  teamLookup,
  playerLookup,
}: {
  award: Award;
  teamLookup: Map<string, string>;
  playerLookup: Map<string, string>;
}) {
  return (
    <div style={{ fontSize: 13 }}>
      <strong>{award.title}</strong> — {award.description}{" "}
      {award.playerId ? `(${playerLookup.get(award.playerId) ?? "Player"})` : ""}
      {award.teamId ? `(${teamLookup.get(award.teamId) ?? "Team"})` : ""}
    </div>
  );
}

function useCountdown(targetTimestamp?: number) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!targetTimestamp) return undefined;
    const handle = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(handle);
  }, [targetTimestamp]);

  if (!targetTimestamp) return null;
  const remainingMs = Math.max(targetTimestamp - now, 0);
  return Math.ceil(remainingMs / 1000);
}

const cardStyle: CSSProperties = {
  padding: 16,
  border: "1px solid #1e293b",
  borderRadius: 12,
  background: "rgba(15, 23, 42, 0.7)",
};

const inputStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#e2e8f0",
};

const primaryButton: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #1d4ed8",
  background: "#1d4ed8",
  color: "#e2e8f0",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButton: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#1f2937",
  color: "#e2e8f0",
  cursor: "pointer",
};

const selectedButton: CSSProperties = {
  ...secondaryButton,
  borderColor: "#38bdf8",
  background: "#0c4a6e",
};

const labelStyle: CSSProperties = { fontSize: 12, color: "#94a3b8" };
