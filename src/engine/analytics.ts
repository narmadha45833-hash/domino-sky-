import {
  AppNotification,
  CostAssumptions,
  CostEstimate,
  SimulationResult,
} from '../types/aviation';

export const DEFAULT_COST_ASSUMPTIONS: CostAssumptions = {
  aircraftDelayCostPerMin: 4500, // INR per delayed aircraft-minute
  cancellationCostPerFlight: 280000, // INR per cancelled flight
  passengerAccommodationCost: 6500, // INR per stranded passenger (hotel/meals)
  rebookingCostPerPax: 3200, // INR per rebooked passenger
  spareDeploymentCost: 175000, // INR per spare aircraft activation
};

export function calculateCostEstimate(
  sim: SimulationResult,
  assumptions: CostAssumptions
): CostEstimate {
  const delayCost = sim.metrics.totalDelayMinutes * assumptions.aircraftDelayCostPerMin;
  const cancellationCost = sim.metrics.cancelledFlights * assumptions.cancellationCostPerFlight;
  const accommodationCost =
    sim.passengerImpact.strandedPassengers * assumptions.passengerAccommodationCost;
  const rebookingCost =
    sim.passengerImpact.rebookedPassengers * assumptions.rebookingCostPerPax;
  const spareDeploymentCost =
    sim.metrics.deployedSpareAircraft * assumptions.spareDeploymentCost;

  const totalEstimatedCost =
    delayCost + cancellationCost + accommodationCost + rebookingCost + spareDeploymentCost;

  return {
    delayCost,
    cancellationCost,
    accommodationCost,
    rebookingCost,
    spareDeploymentCost,
    totalEstimatedCost,
  };
}

export interface EmergencyAlertItem {
  id: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  title: string;
  detail: string;
  targetId?: string;
}

export function generateEmergencyAlerts(sim: SimulationResult): EmergencyAlertItem[] {
  const alerts: EmergencyAlertItem[] = [];

  if (sim.config.enabled && sim.config.durationMinutes > 0) {
    alerts.push({
      id: 'emg-closure',
      priority: 'CRITICAL',
      category: 'AIRSPACE',
      title: `${sim.config.airportId} Closed (${sim.config.durationMinutes}m from ${sim.config.startTime})`,
      detail: `${sim.config.description || 'Airport Shutdown'} impacting ${
        sim.airportRisks.find((a) => a.airport.id === sim.config.airportId)?.delayedDepartures ?? 0
      } departures and ${
        sim.airportRisks.find((a) => a.airport.id === sim.config.airportId)?.delayedArrivals ?? 0
      } arrivals.`,
      targetId: sim.config.airportId,
    });
  }

  for (const crew of sim.crews) {
    if (crew.status === 'VIOLATION') {
      alerts.push({
        id: `emg-crew-${crew.crew_id}`,
        priority: 'CRITICAL',
        category: 'CREW_FDTL',
        title: `Crew ${crew.crew_id} (${crew.tail_id}) Duty Violation +${crew.violationMins}m`,
        detail: crew.notes,
        targetId: crew.crew_id,
      });
    } else if (crew.status === 'WARNING') {
      alerts.push({
        id: `emg-crew-warn-${crew.crew_id}`,
        priority: 'HIGH',
        category: 'CREW_FDTL',
        title: `Crew ${crew.crew_id} Approaching Limit (${crew.dutyRemainingMins}m left)`,
        detail: crew.notes,
        targetId: crew.crew_id,
      });
    }
  }

  for (const cx of sim.connections) {
    if (cx.status !== 'MADE') {
      alerts.push({
        id: `emg-cx-${cx.connection_id}`,
        priority: cx.urgency,
        category: 'CONNECTION',
        title: `${cx.connection_id} Missed at ${cx.airport} (${cx.passengers} pax)`,
        detail: `${cx.from_flight} (${cx.fromFlight.predArrStr}) -> ${cx.to_flight} (${cx.toFlight.predDepStr}). ${
          cx.rebookedToFlightId
            ? `Rebooked onto ${cx.rebookedToFlightId}.`
            : `Shortfall ${cx.shortfallMin}m.`
        }`,
        targetId: cx.connection_id,
      });
    }
  }

  const severeFlights = [...sim.flights]
    .filter((f) => f.status !== 'ON_TIME')
    .sort(
      (a, b) =>
        Math.max(b.depDelayMin, b.arrDelayMin) - Math.max(a.depDelayMin, a.arrDelayMin)
    )
    .slice(0, 8);

  for (const fl of severeFlights) {
    const delay = Math.max(fl.depDelayMin, fl.arrDelayMin);
    alerts.push({
      id: `emg-fl-${fl.flight_id}`,
      priority:
        fl.status === 'CANCELLED' || delay >= 75
          ? 'CRITICAL'
          : delay >= 45
          ? 'HIGH'
          : delay >= 20
          ? 'MEDIUM'
          : 'LOW',
      category: 'FLIGHT',
      title:
        fl.status === 'CANCELLED'
          ? `${fl.flight_id} (${fl.origin}->${fl.destination}) CANCELLED`
          : `${fl.flight_id} (${fl.origin}->${fl.destination}) +${delay}m Delay`,
      detail: fl.reason,
      targetId: fl.flight_id,
    });
  }

  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return alerts.sort((a, b) => order[a.priority] - order[b.priority]);
}

export function generateNotificationsFromSimulation(
  sim: SimulationResult,
  prevIds: Set<string>
): AppNotification[] {
  const nowStr = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const list: AppNotification[] = [];

  if (sim.config.enabled && sim.config.durationMinutes > 0) {
    list.push({
      id: `notif-closure-${sim.config.airportId}-${sim.config.startTime}-${sim.config.durationMinutes}`,
      timestamp: nowStr,
      simTimeStr: sim.config.startTime,
      category: 'CLOSURE',
      severity: 'CRITICAL',
      title: `Airport Closure Activated: ${sim.config.airportId}`,
      message: `${sim.config.airportId} closed from ${sim.config.startTime} for ${sim.config.durationMinutes}m (${sim.config.description || 'Operational Shutdown'}).`,
      read: false,
    });
  }

  for (const fl of sim.flights) {
    if (fl.status === 'CANCELLED') {
      list.push({
        id: `notif-cancel-${fl.flight_id}-${fl.disruptionSource}`,
        timestamp: nowStr,
        simTimeStr: fl.dep,
        category: 'CANCELLATION',
        severity: 'CRITICAL',
        title: `Flight Cancelled: ${fl.flight_id}`,
        message: `${fl.origin}->${fl.destination} (${fl.assignedTailId}) cancelled. ${fl.pax} passengers affected.`,
        read: false,
      });
    } else if (fl.status === 'DELAYED' && Math.max(fl.depDelayMin, fl.arrDelayMin) >= 30) {
      const d = Math.max(fl.depDelayMin, fl.arrDelayMin);
      list.push({
        id: `notif-delay-${fl.flight_id}-${d}`,
        timestamp: nowStr,
        simTimeStr: fl.dep,
        category: 'DELAY',
        severity: d >= 60 ? 'HIGH' : 'MEDIUM',
        title: `Flight Delay: ${fl.flight_id} (+${d}m)`,
        message: fl.reason,
        read: false,
      });
    }
    if (fl.turnaroundViolation) {
      list.push({
        id: `notif-turn-${fl.flight_id}`,
        timestamp: nowStr,
        simTimeStr: fl.dep,
        category: 'TURNAROUND',
        severity: 'HIGH',
        title: `Turnaround Conflict: ${fl.flight_id}`,
        message: `${fl.assignedTailId} turnaround fell below 30m minimum.`,
        read: false,
      });
    }
  }

  for (const cx of sim.connections) {
    if (cx.status !== 'MADE' && !cx.rebookedToFlightId) {
      list.push({
        id: `notif-cx-${cx.connection_id}-${cx.status}`,
        timestamp: nowStr,
        simTimeStr: cx.toFlight.dep,
        category: 'CONNECTION',
        severity: cx.urgency,
        title: `Missed Connection ${cx.connection_id} at ${cx.airport}`,
        message: `${cx.passengers} passengers missed ${cx.from_flight} -> ${cx.to_flight}.`,
        read: false,
      });
    }
  }

  for (const cr of sim.crews) {
    if (cr.status === 'VIOLATION') {
      list.push({
        id: `notif-crew-${cr.crew_id}-${cr.violationMins}`,
        timestamp: nowStr,
        simTimeStr: cr.duty_start,
        category: 'CREW',
        severity: 'CRITICAL',
        title: `Crew Duty Limit Exceeded: ${cr.crew_id}`,
        message: cr.notes,
        read: false,
      });
    }
  }

  if (sim.appliedActions.length > 0) {
    const latest = sim.appliedActions[sim.appliedActions.length - 1];
    list.push({
      id: `notif-rec-${latest.id}`,
      timestamp: nowStr,
      simTimeStr: sim.config.startTime,
      category: 'RECOVERY',
      severity: 'LOW',
      title: `Recovery Applied: ${latest.title}`,
      message: latest.expectedOperationalImpact || latest.summary,
      read: false,
    });
  }

  return list.filter((n) => !prevIds.has(n.id));
}
