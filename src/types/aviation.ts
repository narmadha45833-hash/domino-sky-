export interface DatasetMeta {
  dataset: string;
  operating_day: string;
  min_turnaround_minutes: number;
  seats_per_aircraft: number;
  notes: string[];
}

export interface Airport {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  tier: 'mega_hub' | 'regional_hub' | 'spoke';
  capacity_per_hour: number;
}

export interface RawFlight {
  flight_id: string;
  tail_id: string;
  leg_order: number;
  origin: string;
  destination: string;
  dep: string;
  arr: string;
  block_minutes: number;
  pax: number;
  turnaround_before_min: number | null;
}

export interface RawConnection {
  connection_id: string;
  airport: string;
  from_flight: string;
  to_flight: string;
  passengers: number;
  min_connect_minutes: number;
}

export interface RawCrew {
  crew_id: string;
  tail_id: string;
  base: string;
  duty_start: string;
  max_duty_mins: number;
  flight_ids: string[];
}

export interface SpareAircraft {
  tail_id: string;
  base: string;
  available_from: string;
  seats: number;
}

export interface FlightNetworkDataset {
  meta: DatasetMeta;
  airports: Airport[];
  flights: RawFlight[];
  connections: RawConnection[];
  crews: RawCrew[];
  spare_aircraft: SpareAircraft[];
}

export interface SecondaryClosureConfig {
  enabled: boolean;
  airportId: string;
  startTime: string; // HH:MM
  durationMinutes: number;
  severityPct: 100 | 50 | 25; // 100 = full closure, 50 = half capacity, 25 = 25% capacity
  description: string;
}

export interface ClosureConfig {
  enabled: boolean;
  airportId: string;
  startTime: string; // HH:MM
  durationMinutes: number;
  severityPct: 100 | 50 | 25; // 100 = full ground stop, 50/25 = reduced runway capacity
  enforceRunwayCapacity: boolean; // meter post-closure & peak slots using airport capacity_per_hour
  description: string;
  autoCancelThresholdMinutes: number | null; // null = never auto-cancel
  secondary?: SecondaryClosureConfig;
}

export type RecoveryActionType =
  | 'DEPLOY_SPARE'
  | 'HOLD_FLIGHT'
  | 'SWAP_AIRCRAFT'
  | 'CANCEL_FLIGHT'
  | 'REBOOK_PASSENGERS';

export interface RecoveryAction {
  id: string;
  type: RecoveryActionType;
  title: string;
  summary: string;
  targetFlightIds: string[];
  spareTailId?: string;
  swapTailA?: string;
  swapTailB?: string;
  swapAtFlightA?: string;
  swapAtFlightB?: string;
  holdMinutes?: number;
  cancelFlightId?: string;
  connectionId?: string;
  rebookToFlightId?: string;
  // Explainable AI fields
  problemIdentified: string;
  dataUsed: string[];
  whySelected: string;
  alternativesConsidered: string[];
  expectedOperationalImpact: string;
  passengerImpactLabel: string;
  aircraftAvailabilityCheck: string;
  crewFeasibilityCheck: string;
  crewFeasible: boolean;
  aircraftFeasible: boolean;
  operationalRisks: string;
  // Calculated deterministic deltas
  delayMinutesSaved: number;
  connectionsSaved: number;
  passengersSaved: number;
  flightsRecovered: number;
  feasibilityScore: number; // deterministic ranking metric (0-100 based on constraints & impact)
  rank?: number;
}

export type FlightStatus = 'ON_TIME' | 'DELAYED' | 'CANCELLED';

export interface SimulatedFlight extends RawFlight {
  assignedTailId: string;
  isSpareAssigned: boolean;
  schedDepMin: number;
  schedArrMin: number;
  predDepMin: number | null;
  predArrMin: number | null;
  predDepStr: string;
  predArrStr: string;
  depDelayMin: number;
  arrDelayMin: number;
  status: FlightStatus;
  reason: string;
  disruptionSource:
    | 'NONE'
    | 'ORIGIN_CLOSURE'
    | 'DEST_CLOSURE'
    | 'TURNAROUND_PROPAGATION'
    | 'RECOVERY_HOLD'
    | 'CANCELLED_THRESHOLD'
    | 'CANCELLED_RECOVERY'
    | 'SPARE_COVERED';
  turnaroundAvailableMin: number | null;
  turnaroundViolation: boolean;
  firstDelayedAtMin: number | null;
  cascadeDepth: number;
  cascadeRootFlightId: string | null;
  slotMeteredDelayMin: number;
}

export type ConnectionStatus = 'MADE' | 'MISSED_DELAY' | 'MISSED_CANCELLATION';

export interface SimulatedConnection extends RawConnection {
  fromFlight: SimulatedFlight;
  toFlight: SimulatedFlight;
  availableConnectMin: number | null;
  shortfallMin: number;
  status: ConnectionStatus;
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  rebookedToFlightId?: string;
  alternativeOptions: AlternativeFlightOption[];
}

export interface AlternativeFlightOption {
  flightId: string;
  origin: string;
  destination: string;
  depStr: string;
  arrStr: string;
  availableSeats: number;
  canAccommodateAll: boolean;
  connectMinutesAfterArrival: number | null;
  feasible: boolean;
  note: string;
}

export interface SimulatedCrew extends RawCrew {
  dutyStartMin: number;
  schedFinalArrMin: number;
  schedDutyMins: number;
  simFinalArrMin: number;
  simDutyMins: number;
  dutyRemainingMins: number;
  violationMins: number;
  status: 'LEGAL' | 'WARNING' | 'VIOLATION';
  affectedFlightCount: number;
  notes: string;
}

export interface AircraftUtilization {
  tailId: string;
  isSpare: boolean;
  baseAirport: string;
  currentLocation: string;
  previousFlight: SimulatedFlight | null;
  nextFlight: SimulatedFlight | null;
  flights: SimulatedFlight[];
  totalFlights: number;
  delayedFlights: number;
  cancelledFlights: number;
  totalDelayMins: number;
  minRemainingTurnaroundMin: number | null;
  availability: 'AVAILABLE' | 'IN_SERVICE' | 'DISRUPTED' | 'SPARE_STANDBY' | 'SPARE_DEPLOYED';
  scheduleConflicts: string[];
  utilizationPct: number;
}

export type RiskLevel = 'LOW RISK' | 'MODERATE RISK' | 'HIGH RISK' | 'CRITICAL RISK';

export interface AirportRiskProfile {
  airport: Airport;
  departuresTotal: number;
  arrivalsTotal: number;
  delayedDepartures: number;
  delayedArrivals: number;
  cancelledFlights: number;
  totalDelayMinutes: number;
  missedConnections: number;
  affectedConnectingPax: number;
  riskScore: number;
  riskLevel: RiskLevel;
  calculationBreakdown: string;
  isClosedAirport: boolean;
}

export interface TimelineEvent {
  id: string;
  timeMin: number;
  timeStr: string;
  type:
    | 'CLOSURE_START'
    | 'CLOSURE_END'
    | 'FLIGHT_DELAY'
    | 'CASCADE_PROPAGATION'
    | 'CONNECTION_MISSED'
    | 'FLIGHT_CANCELLED'
    | 'CREW_VIOLATION'
    | 'TURNAROUND_CONFLICT';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  flightId?: string;
  tailId?: string;
  airportId?: string;
  connectionId?: string;
}

export interface PassengerImpactSummary {
  totalScheduledPaxBoardings: number;
  totalUniqueConnectingPax: number;
  affectedFlightBoardingsRaw: number;
  doubleCountedConnectingPax: number;
  uniqueAffectedPassengers: number;
  delayedPassengers: number;
  missedConnectionPassengers: number;
  cancelledFlightPassengers: number;
  passengersNeedingRebooking: number;
  rebookedPassengers: number;
  strandedPassengers: number;
}

export interface SimulationMetrics {
  totalAirports: number;
  totalFlights: number;
  totalAircraft: number;
  totalConnections: number;
  totalCrews: number;
  availableSpareAircraft: number;
  deployedSpareAircraft: number;
  onTimeFlights: number;
  delayedFlights: number;
  cancelledFlights: number;
  totalDelayMinutes: number;
  maxDelayMinutes: number;
  affectedAircraftCount: number;
  missedConnectionsCount: number;
  crewViolationCount: number;
  turnaroundViolationCount: number;
  mostAffectedAirportId: string | null;
  mostAffectedTailId: string | null;
  otp0Pct: number;
  otp15Pct: number;
  avgDelayPerDelayedMin: number;
  networkLoadFactorPct: number;
  runwaySlotDelayMinutes: number;
}

export interface SimulationResult {
  config: ClosureConfig;
  appliedActions: RecoveryAction[];
  flights: SimulatedFlight[];
  connections: SimulatedConnection[];
  crews: SimulatedCrew[];
  aircraft: AircraftUtilization[];
  airportRisks: AirportRiskProfile[];
  passengerImpact: PassengerImpactSummary;
  metrics: SimulationMetrics;
  timelineEvents: TimelineEvent[];
}

export interface CostAssumptions {
  aircraftDelayCostPerMin: number; // INR or USD -> let's use USD or INR? Dataset uses IST (Indian cities). INR (₹) or USD ($)? Let's default to INR (₹) with clear currency symbol, or allow currency label! Let's use USD ($) or INR (₹) — actually INR (₹) fits India domestic operations naturally, e.g. ₹4,500/min aircraft delay, ₹250,000/cancellation, ₹6,500/accommodation, ₹3,200/rebooking, ₹180,000/spare deployment. Let's make it crisp and configurable!
  cancellationCostPerFlight: number;
  passengerAccommodationCost: number;
  rebookingCostPerPax: number;
  spareDeploymentCost: number;
}

export interface CostEstimate {
  delayCost: number;
  cancellationCost: number;
  accommodationCost: number;
  rebookingCost: number;
  spareDeploymentCost: number;
  totalEstimatedCost: number;
}

export interface ValidationIssue {
  id: string;
  severity: 'PASS' | 'WARNING' | 'ERROR';
  category:
    | 'AIRPORT_DATA'
    | 'AIRPORT_REFERENCES'
    | 'FLIGHT_DATA'
    | 'AIRCRAFT_ASSIGNMENT'
    | 'FLIGHT_SEQUENCE'
    | 'CONNECTION_REFERENCES'
    | 'TURNAROUND_RULES'
    | 'CREW_DUTY_RULES';
  title: string;
  detail: string;
}

export interface AppNotification {
  id: string;
  timestamp: string;
  simTimeStr: string;
  category:
    | 'CLOSURE'
    | 'DELAY'
    | 'CANCELLATION'
    | 'CONNECTION'
    | 'TURNAROUND'
    | 'CREW'
    | 'RECOVERY';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  message: string;
  read: boolean;
}

export interface SavedScenario {
  id: string;
  name: string;
  createdAt: string;
  config: ClosureConfig;
  appliedActions: RecoveryAction[];
  summary: {
    delayedFlights: number;
    cancelledFlights: number;
    totalDelayMinutes: number;
    missedConnections: number;
    uniqueAffectedPassengers: number;
    strandedPassengers: number;
    mostAffectedAirportId: string | null;
    mostAffectedTailId: string | null;
  };
}
