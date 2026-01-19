export type Role = "gm" | "operator" | "field" | "planner";

export type Player = {
  id: string;
  name?: string;
  role?: Role;
  teamId?: string;
  isGM: boolean;
  connected: boolean;
};

export type Team = {
  id: string;
  name: string;
  score: number;
};

export type ScenarioEvent = {
  id: string;
  atSec: number;
  type: string;
  description: string;
  points?: number;
};

export type Scenario = {
  id: string;
  name: string;
  durationSec: number;
  events: ScenarioEvent[];
};

export type GameEvent = {
  id: string;
  timestamp: number;
  type: string;
  message: string;
  playerId?: string;
  teamId?: string;
};

export type RoomStatus = "lobby" | "countdown" | "running" | "finished";

export type AwardCategory =
  | "fastest_switching"
  | "alarm_management"
  | "forecasting"
  | "field_experience"
  | "team_management"
  | "gm_best_switching_instruction"
  | "gm_best_communication";

export type Award = {
  id: string;
  title: string;
  description: string;
  category: AwardCategory;
  playerId?: string;
  teamId?: string;
};

export type RoomState = {
  code: string;
  gmId: string;
  players: Player[];
  teams: Team[];
  availableRoles: Role[];
  status: RoomStatus;
  scenario?: Scenario;
  startedAt?: number;
  timeElapsedSec?: number;
  countdownEndsAt?: number;
  eventLog: GameEvent[];
  orgName?: string;
  resultsVisible: boolean;
  autoAnnounceResults: boolean;
  awards: Award[];
};

export type GameTick = {
  elapsedSec: number;
  remainingSec?: number;
  status: RoomStatus;
};

export type MpError = {
  message: string;
};

export type CreateRoomPayload = {
  teamCount?: number;
};

export type JoinRoomPayload = {
  code: string;
};

export type SetUsernamePayload = {
  name: string;
};

export type SetRolePayload = {
  role: Role;
  playerId?: string;
};

export type StartGamePayload = {
  scenarioId?: string;
};

export type SetTeamsPayload = {
  teamCount: number;
};

export type MovePlayerTeamPayload = {
  playerId: string;
  teamId: string;
};

export type SetTeamNamesPayload = {
  names: string[];
  orgName?: string;
};

export type SetAvailableRolesPayload = {
  roles: Role[];
};

export type GrantPointsPayload = {
  teamId: string;
  points: number;
  reason: string;
};

export type SetResultsVisibilityPayload = {
  visible: boolean;
};

export type SetAutoAnnounceResultsPayload = {
  enabled: boolean;
};

export type SetGmAwardsPayload = {
  bestSwitchingInstructionPlayerId?: string;
  bestCommunicationTeamId?: string;
};

export type InjectEventPayload = {
  type: string;
  message: string;
};

export type LoadScenarioPayload = {
  scenario: Scenario;
};

export type ScoreActionPayload = {
  action: "ack_alarm" | "restore_service" | "inspect_equipment" | "plan_request";
};

export interface ClientToServerEvents {
  "mp/createRoom": (payload: CreateRoomPayload) => void;
  "mp/joinRoom": (payload: JoinRoomPayload) => void;
  "mp/setUsername": (payload: SetUsernamePayload) => void;
  "mp/setRole": (payload: SetRolePayload) => void;
  "mp/startGame": (payload: StartGamePayload) => void;
  "mp/setTeams": (payload: SetTeamsPayload) => void;
  "mp/movePlayerTeam": (payload: MovePlayerTeamPayload) => void;
  "mp/setTeamNames": (payload: SetTeamNamesPayload) => void;
  "mp/setAvailableRoles": (payload: SetAvailableRolesPayload) => void;
  "mp/injectEvent": (payload: InjectEventPayload) => void;
  "mp/loadScenario": (payload: LoadScenarioPayload) => void;
  "mp/scoreAction": (payload: ScoreActionPayload) => void;
  "mp/grantPoints": (payload: GrantPointsPayload) => void;
  "mp/setResultsVisibility": (payload: SetResultsVisibilityPayload) => void;
  "mp/setAutoAnnounceResults": (payload: SetAutoAnnounceResultsPayload) => void;
  "mp/setGmAwards": (payload: SetGmAwardsPayload) => void;
}

export interface ServerToClientEvents {
  "mp/roomState": (state: RoomState) => void;
  "mp/eventLog": (event: GameEvent) => void;
  "mp/gameTick": (tick: GameTick) => void;
  "mp/error": (error: MpError) => void;
}
