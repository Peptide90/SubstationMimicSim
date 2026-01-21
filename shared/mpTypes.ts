export type Role = "gm" | "operator" | "field" | "planner";

export type AssetType = "cb" | "ds" | "tx" | "bus";

export type AssetStatus = "open" | "closed" | "tripped" | "unknown";

export type AssetTelemetry = {
  windingTempC: number;
  oilLevelPct: number;
};

export type AssetTruth = {
  status: AssetStatus;
  telemetry: AssetTelemetry;
  lastTruthUpdated: number;
};

export type AssetScada = {
  status: AssetStatus;
  telemetry: AssetTelemetry;
  dbi: boolean;
  lastScadaUpdated: number;
};

export type Asset = {
  id: string;
  name: string;
  type: AssetType;
  remoteControllable: boolean;
  remoteFails?: boolean;
  truth: AssetTruth;
  scada: AssetScada;
  lastUpdated: number;
};

export type AssetView = {
  id: string;
  name: string;
  type: AssetType;
  remoteControllable: boolean;
  scada: AssetScada;
  truth?: AssetTruth | null;
};

export type FieldReport = {
  id: string;
  assetId: string;
  status: AssetStatus;
  telemetry: AssetTelemetry;
  reportedBy: string;
  timestamp: number;
};

export type WorkOrderAction = "open" | "close" | "inspect";

export type WorkOrderStatus = "open" | "accepted" | "completed" | "rejected";

export type WorkOrder = {
  id: string;
  assetId: string;
  action: WorkOrderAction;
  notes?: string;
  createdBy: string;
  createdAt: number;
  status: WorkOrderStatus;
  acceptedBy?: string;
  completedAt?: number;
};

export type PlannerRequestType = "add_generation" | "reduce_generation" | "shed_load" | "reconfigure";

export type PlannerRequestStatus = "pending" | "accepted" | "rejected" | "completed";

export type PlannerRequest = {
  id: string;
  type: PlannerRequestType;
  notes?: string;
  createdBy: string;
  createdAt: number;
  status: PlannerRequestStatus;
  updatedAt?: number;
  handledBy?: string;
};

export type AlarmSeverity = "low" | "med" | "high";

export type AlarmEvent = {
  id: string;
  timestamp: number;
  type: "alarm" | "fault" | "note";
  severity: AlarmSeverity;
  messageShort: string;
  messageDetail: string;
  assetId?: string;
};

export type SystemState = {
  frequencyHz: number;
  lastUpdated: number;
};

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
  assetId?: string;
  dbi?: boolean;
  remoteFails?: boolean;
  frequencyDelta?: number;
  alarmSeverity?: AlarmSeverity;
  messageShort?: string;
  messageDetail?: string;
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
  eventLogShort: AlarmEvent[];
  eventLogDetail: AlarmEvent[];
  assets: AssetView[];
  fieldReports: FieldReport[];
  workOrders: WorkOrder[];
  plannerRequests: PlannerRequest[];
  systemState: SystemState;
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

export type OperatorRemoteSwitchPayload = {
  assetId: string;
  action: "open" | "close";
};

export type CreateWorkOrderPayload = {
  assetId: string;
  action: WorkOrderAction;
  notes?: string;
};

export type FieldAcceptWorkOrderPayload = {
  workOrderId: string;
};

export type FieldInspectAssetPayload = {
  assetId: string;
};

export type FieldReportAssetPayload = {
  assetId: string;
  status: AssetStatus;
  telemetry: AssetTelemetry;
};

export type FieldManualOperatePayload = {
  workOrderId: string;
};

export type OperatorConfirmAssetPayload = {
  assetId: string;
  confirmedStatus: AssetStatus;
  confirmedTelemetry: AssetTelemetry;
};

export type PlannerRequestPayload = {
  type: PlannerRequestType;
  notes?: string;
};

export type OperatorHandlePlannerRequestPayload = {
  requestId: string;
  status: PlannerRequestStatus;
};

export type OperatorConnectGeneratorPayload = {
  amountHz?: number;
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
  "mp/operatorRemoteSwitch": (payload: OperatorRemoteSwitchPayload) => void;
  "mp/createWorkOrder": (payload: CreateWorkOrderPayload) => void;
  "mp/fieldAcceptWorkOrder": (payload: FieldAcceptWorkOrderPayload) => void;
  "mp/fieldInspectAsset": (payload: FieldInspectAssetPayload) => void;
  "mp/fieldReportAsset": (payload: FieldReportAssetPayload) => void;
  "mp/fieldManualOperate": (payload: FieldManualOperatePayload) => void;
  "mp/operatorConfirmAsset": (payload: OperatorConfirmAssetPayload) => void;
  "mp/plannerRequest": (payload: PlannerRequestPayload) => void;
  "mp/operatorHandlePlannerRequest": (payload: OperatorHandlePlannerRequestPayload) => void;
  "mp/operatorConnectGenerator": (payload: OperatorConnectGeneratorPayload) => void;
}

export interface ServerToClientEvents {
  "mp/roomState": (state: RoomState) => void;
  "mp/eventLog": (event: GameEvent) => void;
  "mp/gameTick": (tick: GameTick) => void;
  "mp/error": (error: MpError) => void;
}
