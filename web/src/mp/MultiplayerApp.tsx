import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { io, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  GameTick,
  Player,
  Role,
  RoomState,
  ServerToClientEvents,
  Team,
} from "../../../shared/mpTypes";

import sampleScenario from "./scenarios/sampleScenario.json";

type Props = {
  onExit: () => void;
};

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
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [tick, setTick] = useState<GameTick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    const socket = io(MP_SERVER_URL, { transports: ["websocket"] });
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
    <div style={{ minHeight: "100vh", background: "#020617", color: "#e2e8f0" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
          borderBottom: "1px solid #1e293b",
          background: "#0f172a",
        }}
      >
        <div style={{ display: "grid" }}>
          <strong>Multiplayer Command Center</strong>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>
            Status: {connected ? "Connected" : "Disconnected"}
            {roomState ? ` • Room ${roomState.code}` : ""}
          </span>
        </div>
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
      </header>

      {error ? (
        <div style={{ padding: "12px 24px", background: "#7f1d1d", color: "#fee2e2" }}>{error}</div>
      ) : null}

      {!roomState || !socket ? (
        <Lobby socket={socketRef.current} connected={connected} />
      ) : (
        <RoomView
          socket={socket}
          room={roomState}
          tick={tick}
          currentPlayer={currentPlayer}
        />
      )}
    </div>
  );
}

function Lobby({
  socket,
  connected,
}: {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  connected: boolean;
}) {
  const [joinCode, setJoinCode] = useState("");
  const [teamCount, setTeamCount] = useState(2);

  return (
    <div style={{ padding: "32px 24px", display: "grid", gap: 20, maxWidth: 520 }}>
      <div>
        <h2 style={{ marginBottom: 8 }}>Multiplayer Lobby</h2>
        <p style={{ color: "#94a3b8" }}>
          Create a room or join an existing session with a code.
        </p>
      </div>

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
  );
}

function RoomView({
  socket,
  room,
  tick,
  currentPlayer,
}: {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  room: RoomState;
  tick: GameTick | null;
  currentPlayer: Player | null;
}) {
  const [nameInput, setNameInput] = useState("");
  const [roleChoice, setRoleChoice] = useState<Role>("operator");

  useEffect(() => {
    if (currentPlayer?.name) setNameInput(currentPlayer.name);
  }, [currentPlayer?.name]);

  useEffect(() => {
    if (!room.availableRoles.includes(roleChoice) && room.availableRoles.length > 0) {
      setRoleChoice(room.availableRoles[0]);
    }
  }, [room.availableRoles, roleChoice]);

  const isGM = currentPlayer?.id === room.gmId;

  return (
    <div style={{ padding: "24px", display: "grid", gap: 24 }}>
      {!currentPlayer?.name ? (
        <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
          <strong>Choose a username</strong>
          <input
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="Letters only (3-12)"
            style={inputStyle}
          />
          <button
            style={primaryButton}
            onClick={() => socket.emit("mp/setUsername", { name: nameInput.trim() })}
          >
            Confirm Name
          </button>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <RoomSummary room={room} tick={tick} />
        <TeamScoreboard teams={room.teams} />
        <PlayerList players={room.players} teams={room.teams} />
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ padding: 16, border: "1px solid #1e293b", borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Role Selection</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <select
              value={roleChoice}
              onChange={(event) => setRoleChoice(event.target.value as Role)}
              style={inputStyle}
            >
              {room.availableRoles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <button
              style={primaryButton}
              onClick={() => socket.emit("mp/setRole", { role: roleChoice })}
            >
              Request Role
            </button>
            {currentPlayer?.role ? (
              <span style={{ color: "#94a3b8" }}>Current: {ROLE_LABELS[currentPlayer.role]}</span>
            ) : null}
          </div>
        </div>

        {isGM ? <GameMasterPanel room={room} socket={socket} /> : null}

        {currentPlayer?.role ? (
          <RoleView role={currentPlayer.role} socket={socket} room={room} />
        ) : (
          <div style={{ color: "#94a3b8" }}>Select a role to enter the game view.</div>
        )}
      </div>
    </div>
  );
}

function RoomSummary({ room, tick }: { room: RoomState; tick: GameTick | null }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Room Overview</h3>
      <div style={{ display: "grid", gap: 6 }}>
        <div>Room code: {room.code}</div>
        <div>Status: {room.status}</div>
        <div>Scenario: {room.scenario?.name ?? "None selected"}</div>
        <div>Organisation: {room.orgName || "Not set"}</div>
        <div>
          Time: {tick ? `${tick.elapsedSec}s elapsed` : room.timeElapsedSec ?? 0}s
          {tick?.remainingSec !== undefined ? ` • ${tick.remainingSec}s remaining` : ""}
        </div>
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
            <div style={{ color: "#94a3b8" }}>{teamLookup.get(player.teamId ?? "") ?? "Unassigned"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GameMasterPanel({
  room,
  socket,
}: {
  room: RoomState;
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
}) {
  const [teamCount, setTeamCount] = useState(room.teams.length);
  const [orgName, setOrgName] = useState(room.orgName ?? "");
  const [teamNames, setTeamNames] = useState(room.teams.map((team) => team.name));
  const [roles, setRoles] = useState<Role[]>(room.availableRoles);
  const [scenarioId, setScenarioId] = useState(sampleScenario.id);
  const [eventType, setEventType] = useState("fault");
  const [eventMessage, setEventMessage] = useState("");

  useEffect(() => {
    setTeamCount(room.teams.length);
    setTeamNames(room.teams.map((team) => team.name));
    setRoles(room.availableRoles);
    setOrgName(room.orgName ?? "");
  }, [room.teams, room.availableRoles, room.orgName]);

  const scenarios = [sampleScenario];

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
        <input
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
          placeholder="Organisation name (optional)"
          style={inputStyle}
        />
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
        <select
          value={scenarioId}
          onChange={(event) => setScenarioId(event.target.value)}
          style={inputStyle}
        >
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
        <input
          value={eventType}
          onChange={(event) => setEventType(event.target.value)}
          placeholder="type"
          style={inputStyle}
        />
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
    </div>
  );
}

function RoleView({
  role,
  socket,
  room,
}: {
  role: Role;
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  room: RoomState;
}) {
  if (role === "gm") {
    return (
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Game Master View</h3>
        <p style={{ color: "#94a3b8" }}>
          Use the controls above to manage teams, roles, scenarios, and live events.
        </p>
        <EventLog events={room.eventLog} />
      </div>
    );
  }

  if (role === "operator") {
    return <OperatorView socket={socket} events={room.eventLog} />;
  }
  if (role === "field") {
    return <FieldView socket={socket} />;
  }
  return <PlannerView socket={socket} />;
}

function OperatorView({
  socket,
  events,
}: {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  events: RoomState["eventLog"];
}) {
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Control Room Operator</h3>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ padding: 12, border: "1px dashed #334155", borderRadius: 8 }}>
          Mimic viewport placeholder (energization view will plug in here).
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button style={primaryButton} onClick={() => socket.emit("mp/scoreAction", { action: "ack_alarm" })}>
            Acknowledge Alarm
          </button>
          <button
            style={primaryButton}
            onClick={() => socket.emit("mp/scoreAction", { action: "restore_service" })}
          >
            Execute Restore
          </button>
        </div>
        <EventLog events={events} />
      </div>
    </div>
  );
}

function FieldView({ socket }: { socket: Socket<ServerToClientEvents, ClientToServerEvents> }) {
  const [status, setStatus] = useState("Awaiting inspection command.");

  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Field Engineer</h3>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ padding: 12, border: "1px dashed #334155", borderRadius: 8 }}>
          Local HMI / inspection panel placeholder.
        </div>
        <button
          style={primaryButton}
          onClick={() => {
            setStatus("Inspecting equipment...");
            setTimeout(() => {
              setStatus("Inspection complete: relay status nominal.");
              socket.emit("mp/scoreAction", { action: "inspect_equipment" });
            }, 900);
          }}
        >
          Inspect Equipment
        </button>
        <div style={{ color: "#94a3b8" }}>{status}</div>
      </div>
    </div>
  );
}

function PlannerView({ socket }: { socket: Socket<ServerToClientEvents, ClientToServerEvents> }) {
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>System Planner</h3>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ padding: 12, border: "1px dashed #334155", borderRadius: 8 }}>
          Demand / supply / frequency analysis placeholder.
        </div>
        <button style={primaryButton} onClick={() => socket.emit("mp/scoreAction", { action: "plan_request" })}>
          Request Load Adjustment
        </button>
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

const labelStyle: CSSProperties = { fontSize: 12, color: "#94a3b8" };
