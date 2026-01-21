import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type {
  AlarmEvent,
  Award,
  AssetView,
  ClientToServerEvents,
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
        <RoleView role={currentPlayer.role} socket={socket} room={room} />
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
        <RoleView role={viewRole} socket={socket} room={room} readOnly />
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
  readOnly = false,
}: {
  role: Role;
  socket: MpSocket;
  room: RoomState;
  readOnly?: boolean;
}) {
  if (role === "gm") {
    return (
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Game Master View</h3>
        <p style={{ color: "#94a3b8" }}>
          Use the controls above to manage teams, roles, scenarios, and live events.
        </p>
        <AlarmLog events={room.eventLogDetail} variant="detail" />
        <EventLog events={room.eventLog} />
      </div>
    );
  }

  if (role === "operator") {
    return <OperatorView socket={socket} room={room} readOnly={readOnly} />;
  }
  if (role === "field") {
    return <FieldView socket={socket} room={room} readOnly={readOnly} />;
  }
  return <PlannerView socket={socket} room={room} readOnly={readOnly} />;
}

function OperatorView({
  socket,
  room,
  readOnly,
}: {
  socket: MpSocket;
  room: RoomState;
  readOnly: boolean;
}) {
  const reportLookup = useMemo(
    () => new Map(room.fieldReports.map((report) => [report.assetId, report])),
    [room.fieldReports]
  );

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Control Room Operator</h3>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ padding: 12, border: "1px dashed #334155", borderRadius: 8 }}>
            <strong>System Frequency:</strong> {room.systemState.frequencyHz.toFixed(2)} Hz
          </div>
          <button
            style={primaryButton}
            onClick={() => socket.emit("mp/operatorConnectGenerator", { amountHz: 0.2 })}
            disabled={readOnly}
          >
            Connect Generator (+0.2 Hz)
          </button>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <strong>Substation Assets</strong>
          <div style={{ display: "grid", gap: 8 }}>
            {room.assets.map((asset) => {
              const report = reportLookup.get(asset.id);
              const statusLabel = asset.scada.dbi ? "DBI / Unknown" : asset.scada.status;
              return (
                <div
                  key={asset.id}
                  style={{
                    padding: 12,
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <strong>{asset.name}</strong>{" "}
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>({asset.type.toUpperCase()})</span>
                    </div>
                    <span style={{ color: asset.scada.dbi ? "#fca5a5" : "#a7f3d0" }}>
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                    <span>
                      Winding Temp:{" "}
                      {asset.scada.dbi ? "--" : `${asset.scada.telemetry.windingTempC.toFixed(1)} °C`}
                    </span>
                    <span>
                      Oil Level:{" "}
                      {asset.scada.dbi ? "--" : `${asset.scada.telemetry.oilLevelPct.toFixed(0)} %`}
                    </span>
                    {asset.scada.dbi ? <span style={{ color: "#fbbf24" }}>DBI active</span> : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={secondaryButton}
                      disabled={readOnly || !asset.remoteControllable}
                      onClick={() =>
                        socket.emit("mp/operatorRemoteSwitch", { assetId: asset.id, action: "open" })
                      }
                    >
                      Remote Open
                    </button>
                    <button
                      style={secondaryButton}
                      disabled={readOnly || !asset.remoteControllable}
                      onClick={() =>
                        socket.emit("mp/operatorRemoteSwitch", { assetId: asset.id, action: "close" })
                      }
                    >
                      Remote Close
                    </button>
                    <button
                      style={secondaryButton}
                      disabled={readOnly}
                      onClick={() =>
                        socket.emit("mp/createWorkOrder", { assetId: asset.id, action: "inspect" })
                      }
                    >
                      Request Field Inspection
                    </button>
                    <button
                      style={secondaryButton}
                      disabled={readOnly}
                      onClick={() =>
                        socket.emit("mp/createWorkOrder", { assetId: asset.id, action: "open" })
                      }
                    >
                      Switching Instruction: Open
                    </button>
                    <button
                      style={secondaryButton}
                      disabled={readOnly}
                      onClick={() =>
                        socket.emit("mp/createWorkOrder", { assetId: asset.id, action: "close" })
                      }
                    >
                      Switching Instruction: Close
                    </button>
                    <button
                      style={secondaryButton}
                      disabled={readOnly || !report}
                      onClick={() =>
                        report &&
                        socket.emit("mp/operatorConfirmAsset", {
                          assetId: asset.id,
                          confirmedStatus: report.status,
                          confirmedTelemetry: report.telemetry,
                        })
                      }
                    >
                      Confirm From Field Report
                    </button>
                  </div>
                  {report ? (
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      Latest field report: {report.status} • {report.telemetry.windingTempC} °C,{" "}
                      {report.telemetry.oilLevelPct}% oil
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <strong>Planner Requests</strong>
          {room.plannerRequests.length === 0 ? (
            <span style={{ color: "#94a3b8" }}>No requests yet.</span>
          ) : null}
          {room.plannerRequests.map((request) => (
            <div
              key={request.id}
              style={{
                padding: 10,
                border: "1px solid #1e293b",
                borderRadius: 8,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{formatPlannerRequestType(request.type)}</strong>
                <span style={{ color: "#94a3b8" }}>{request.status.toUpperCase()}</span>
              </div>
              {request.notes ? <div style={{ fontSize: 13, color: "#cbd5f5" }}>{request.notes}</div> : null}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {request.status === "pending" ? (
                  <>
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
                  </>
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
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <strong>Work Orders</strong>
          {room.workOrders.length === 0 ? <span style={{ color: "#94a3b8" }}>No work orders yet.</span> : null}
          {room.workOrders.map((order) => (
            <div key={order.id} style={{ fontSize: 13, color: "#cbd5f5" }}>
              {order.action.toUpperCase()} — {order.assetId} • {order.status.toUpperCase()}
            </div>
          ))}
        </div>

        <AlarmLog events={room.eventLogShort} variant="short" />
      </div>
    </div>
  );
}

function FieldView({
  socket,
  room,
  readOnly,
}: {
  socket: MpSocket;
  room: RoomState;
  readOnly: boolean;
}) {
  const [walkingAssetId, setWalkingAssetId] = useState<string | null>(null);
  const [walkStatus, setWalkStatus] = useState<string>("Awaiting assignment.");
  const [panelAssetId, setPanelAssetId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);

  const beginInspection = (asset: AssetView) => {
    if (readOnly || walkingAssetId) return;
    const delayMs = 3000 + Math.random() * 5000;
    setWalkingAssetId(asset.id);
    setWalkStatus(`Walking to ${asset.name}...`);
    setTimeout(() => {
      socket.emit("mp/fieldInspectAsset", { assetId: asset.id });
      setWalkStatus(`Inspection complete for ${asset.name}.`);
      setWalkingAssetId(null);
    }, delayMs);
  };

  const openLocalPanel = (asset: AssetView) => {
    if (readOnly || panelLoading) return;
    setPanelAssetId(asset.id);
    setPanelLoading(true);
    setPanelOpen(false);
    setTimeout(() => {
      setPanelLoading(false);
      setPanelOpen(true);
    }, 2000);
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Field Engineer</h3>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ padding: 12, border: "1px dashed #334155", borderRadius: 8 }}>
          <strong>Field Status:</strong> {walkStatus}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <strong>Substation Map</strong>
          {room.assets.map((asset) => (
            <div
              key={asset.id}
              style={{
                padding: 12,
                border: "1px solid #1e293b",
                borderRadius: 8,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{asset.name}</strong>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>{asset.type.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 13 }}>
                {asset.truth ? (
                  <>
                    <div>Truth Status: {asset.truth.status}</div>
                    <div>
                      Winding Temp: {asset.truth.telemetry.windingTempC.toFixed(1)} °C • Oil Level:{" "}
                      {asset.truth.telemetry.oilLevelPct.toFixed(0)}%
                    </div>
                  </>
                ) : (
                  <span style={{ color: "#94a3b8" }}>Truth data hidden until inspection.</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  style={secondaryButton}
                  disabled={readOnly || !!walkingAssetId}
                  onClick={() => beginInspection(asset)}
                >
                  Walk & Inspect
                </button>
                <button
                  style={secondaryButton}
                  disabled={readOnly}
                  onClick={() => openLocalPanel(asset)}
                >
                  Open Local SCADA Panel
                </button>
                <button
                  style={secondaryButton}
                  disabled={readOnly || !asset.truth}
                  onClick={() =>
                    asset.truth &&
                    socket.emit("mp/fieldReportAsset", {
                      assetId: asset.id,
                      status: asset.truth.status,
                      telemetry: asset.truth.telemetry,
                    })
                  }
                >
                  Report to Control
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <strong>Work Orders</strong>
          {room.workOrders.length === 0 ? <span style={{ color: "#94a3b8" }}>No work orders.</span> : null}
          {room.workOrders.map((order) => (
            <div key={order.id} style={{ padding: 10, border: "1px solid #1e293b", borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>
                  {order.action.toUpperCase()} — {order.assetId}
                </strong>
                <span style={{ color: "#94a3b8" }}>{order.status.toUpperCase()}</span>
              </div>
              {order.notes ? <div style={{ fontSize: 13 }}>{order.notes}</div> : null}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
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
                    Complete Work Order
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <strong>Local SCADA Panel</strong>
          {panelLoading ? <div style={{ color: "#fcd34d" }}>Opening local panel...</div> : null}
          {panelOpen ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ color: "#94a3b8", fontSize: 12 }}>
                Panel open at {panelAssetId ?? "site"}
              </div>
              <AlarmLog events={room.eventLogDetail} variant="detail" />
            </div>
          ) : (
            <div style={{ color: "#94a3b8" }}>Panel closed.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlannerView({
  socket,
  room,
  readOnly,
}: {
  socket: MpSocket;
  room: RoomState;
  readOnly: boolean;
}) {
  const [requestType, setRequestType] = useState<PlannerRequestType>("add_generation");
  const [requestNotes, setRequestNotes] = useState("");

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>System Planner</h3>
      <div style={{ display: "grid", gap: 12 }}>
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
          {room.plannerRequests.length === 0 ? <span style={{ color: "#94a3b8" }}>No requests yet.</span> : null}
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

        <AlarmLog events={room.eventLogShort} variant="short" />
      </div>
    </div>
  );
}

function EventLog({ events }: { events: RoomState["eventLog"] }) {
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

function AlarmLog({ events, variant }: { events: AlarmEvent[]; variant: "short" | "detail" }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <strong>{variant === "detail" ? "Detailed Alarm Log" : "Alarm Log"}</strong>
      <div style={{ maxHeight: 180, overflow: "auto", display: "grid", gap: 4 }}>
        {events.length === 0 ? <div style={{ color: "#94a3b8" }}>No alarms yet.</div> : null}
        {events.map((event) => (
          <div key={event.id} style={{ fontSize: 12, color: "#cbd5f5" }}>
            [{new Date(event.timestamp).toLocaleTimeString()}] {event.type.toUpperCase()} ({event.severity}) —{" "}
            {variant === "detail" ? event.messageDetail : event.messageShort}
          </div>
        ))}
      </div>
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
