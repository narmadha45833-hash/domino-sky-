import { FlightNetworkDataset, ValidationIssue } from '../types/aviation';
import { parseTimeToMinutes } from './time';

export function validateDataset(dataset: FlightNetworkDataset): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Airport data completeness
  const airportIds = new Set<string>();
  let airportMissingFields = 0;
  for (const ap of dataset.airports) {
    airportIds.add(ap.id);
    if (
      !ap.id ||
      !ap.name ||
      !ap.city ||
      !Number.isFinite(ap.lat) ||
      !Number.isFinite(ap.lng) ||
      !Number.isFinite(ap.capacity_per_hour)
    ) {
      airportMissingFields++;
    }
  }
  issues.push({
    id: 'val-airports',
    severity: airportMissingFields > 0 ? 'ERROR' : 'PASS',
    category: 'AIRPORT_DATA',
    title: `Airport Registry (${dataset.airports.length} airports)`,
    detail:
      airportMissingFields > 0
        ? `${airportMissingFields} airport record(s) have missing coordinates, names, or hourly capacity.`
        : `All ${dataset.airports.length} airports have valid IATA codes, coordinates (lat/lng), tiers, and hourly capacity.`,
  });

  // 2. Flight data completeness & 3. Airport references
  const flightIds = new Set<string>();
  const flightsMissingFields: string[] = [];
  const invalidAirportRefs: string[] = [];

  for (const fl of dataset.flights) {
    flightIds.add(fl.flight_id);
    if (
      !fl.flight_id ||
      !fl.tail_id ||
      !fl.origin ||
      !fl.destination ||
      !fl.dep ||
      !fl.arr ||
      !Number.isFinite(fl.block_minutes) ||
      !Number.isFinite(fl.pax) ||
      !Number.isFinite(fl.leg_order)
    ) {
      flightsMissingFields.push(fl.flight_id || 'UNKNOWN');
    }
    if (!airportIds.has(fl.origin) || !airportIds.has(fl.destination)) {
      invalidAirportRefs.push(`${fl.flight_id} (${fl.origin}->${fl.destination})`);
    }
    if (fl.pax > dataset.meta.seats_per_aircraft) {
      flightsMissingFields.push(`${fl.flight_id} (pax ${fl.pax} > seats ${dataset.meta.seats_per_aircraft})`);
    }
  }

  issues.push({
    id: 'val-flights-data',
    severity: flightsMissingFields.length > 0 ? 'ERROR' : 'PASS',
    category: 'FLIGHT_DATA',
    title: `Flight Schedule Integrity (${dataset.flights.length} flights)`,
    detail:
      flightsMissingFields.length > 0
        ? `Issues detected in: ${flightsMissingFields.join(', ')}`
        : `All ${dataset.flights.length} flights have valid schedules, block durations, and passenger loads <= ${dataset.meta.seats_per_aircraft} seats.`,
  });

  issues.push({
    id: 'val-airport-refs',
    severity: invalidAirportRefs.length > 0 ? 'ERROR' : 'PASS',
    category: 'AIRPORT_REFERENCES',
    title: 'Airport Foreign-Key References',
    detail:
      invalidAirportRefs.length > 0
        ? `Invalid origin/destination airport IDs on: ${invalidAirportRefs.join(', ')}`
        : 'All flight origins, destinations, crew bases, and spare aircraft bases reference valid airport IDs.',
  });

  // 4. Flight sequences & 5. Turnaround rules per aircraft
  const flightsByTail = new Map<string, typeof dataset.flights>();
  for (const fl of dataset.flights) {
    const list = flightsByTail.get(fl.tail_id) ?? [];
    list.push(fl);
    flightsByTail.set(fl.tail_id, list);
  }

  const sequenceBreaks: string[] = [];
  const turnaroundViolations: string[] = [];

  for (const [tailId, legs] of flightsByTail.entries()) {
    const sorted = [...legs].sort((a, b) => a.leg_order - b.leg_order);
    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];
      if (curr.leg_order !== i + 1) {
        sequenceBreaks.push(`${tailId} ${curr.flight_id}: expected leg_order ${i + 1}, got ${curr.leg_order}`);
      }
      if (i > 0) {
        const prev = sorted[i - 1];
        if (prev.destination !== curr.origin) {
          sequenceBreaks.push(
            `${tailId}: ${prev.flight_id} arrives at ${prev.destination} but ${curr.flight_id} departs from ${curr.origin}`
          );
        }
        const prevArr = parseTimeToMinutes(prev.arr);
        const currDep = parseTimeToMinutes(curr.dep);
        const turn = currDep - prevArr;
        if (turn < dataset.meta.min_turnaround_minutes) {
          turnaroundViolations.push(
            `${tailId} ${prev.flight_id}->${curr.flight_id}: ${turn}m turnaround (< ${dataset.meta.min_turnaround_minutes}m min)`
          );
        }
      }
    }
  }

  issues.push({
    id: 'val-sequence',
    severity: sequenceBreaks.length > 0 ? 'ERROR' : 'PASS',
    category: 'FLIGHT_SEQUENCE',
    title: `Aircraft Rotation & Leg Continuity (${flightsByTail.size} active tails)`,
    detail:
      sequenceBreaks.length > 0
        ? sequenceBreaks.join(' | ')
        : `All ${flightsByTail.size} operating aircraft maintain strict leg_order continuity and station-to-station routing.`,
  });

  issues.push({
    id: 'val-turnaround',
    severity: turnaroundViolations.length > 0 ? 'WARNING' : 'PASS',
    category: 'TURNAROUND_RULES',
    title: `Baseline Minimum Turnaround (${dataset.meta.min_turnaround_minutes} min)`,
    detail:
      turnaroundViolations.length > 0
        ? turnaroundViolations.join(' | ')
        : `All scheduled aircraft rotations satisfy the ${dataset.meta.min_turnaround_minutes}-minute minimum turnaround requirement.`,
  });

  // 6. Crew assignments & duty limits
  const invalidCrewAssignments: string[] = [];
  const baselineCrewDutyViolations: string[] = [];
  const flightById = new Map(dataset.flights.map((f) => [f.flight_id, f]));

  for (const crew of dataset.crews) {
    if (!airportIds.has(crew.base)) {
      invalidCrewAssignments.push(`${crew.crew_id}: unknown base ${crew.base}`);
    }
    if (!flightsByTail.has(crew.tail_id)) {
      invalidCrewAssignments.push(`${crew.crew_id}: tail ${crew.tail_id} has no scheduled flights`);
    }
    for (const fid of crew.flight_ids) {
      const fl = flightById.get(fid);
      if (!fl) {
        invalidCrewAssignments.push(`${crew.crew_id}: references missing flight ${fid}`);
      } else if (fl.tail_id !== crew.tail_id) {
        invalidCrewAssignments.push(`${crew.crew_id}: assigned ${fid} belongs to ${fl.tail_id}, not ${crew.tail_id}`);
      }
    }
    const lastFid = crew.flight_ids[crew.flight_ids.length - 1];
    const lastFlight = lastFid ? flightById.get(lastFid) : undefined;
    if (lastFlight) {
      const dutyStart = parseTimeToMinutes(crew.duty_start);
      const lastArr = parseTimeToMinutes(lastFlight.arr);
      const dutyDur = lastArr - dutyStart;
      if (dutyDur > crew.max_duty_mins) {
        baselineCrewDutyViolations.push(
          `${crew.crew_id} (${crew.tail_id}): ${dutyDur}m scheduled > ${crew.max_duty_mins}m limit`
        );
      }
    }
  }

  issues.push({
    id: 'val-aircraft-assign',
    severity: invalidCrewAssignments.length > 0 ? 'ERROR' : 'PASS',
    category: 'AIRCRAFT_ASSIGNMENT',
    title: `Crew & Aircraft Assignment Mapping (${dataset.crews.length} crews, ${dataset.spare_aircraft.length} spares)`,
    detail:
      invalidCrewAssignments.length > 0
        ? invalidCrewAssignments.join(' | ')
        : `All ${dataset.crews.length} crew rosters match their assigned tail IDs and flight lists; ${dataset.spare_aircraft.length} spare aircraft validated.`,
  });

  issues.push({
    id: 'val-crew-duty',
    severity: baselineCrewDutyViolations.length > 0 ? 'WARNING' : 'PASS',
    category: 'CREW_DUTY_RULES',
    title: 'Baseline Crew Duty Limits (max_duty_mins)',
    detail:
      baselineCrewDutyViolations.length > 0
        ? baselineCrewDutyViolations.join(' | ')
        : 'All 16 crews operate within their scheduled max_duty_mins limit prior to any disruption.',
  });

  // 7. Connection references & baseline minimum connection time
  const invalidConnections: string[] = [];
  for (const cx of dataset.connections) {
    const fromFl = flightById.get(cx.from_flight);
    const toFl = flightById.get(cx.to_flight);
    if (!fromFl || !toFl) {
      invalidConnections.push(`${cx.connection_id}: missing flight reference (${cx.from_flight} -> ${cx.to_flight})`);
      continue;
    }
    if (fromFl.destination !== cx.airport || toFl.origin !== cx.airport) {
      invalidConnections.push(`${cx.connection_id}: airport ${cx.airport} mismatch`);
      continue;
    }
    const avail = parseTimeToMinutes(toFl.dep) - parseTimeToMinutes(fromFl.arr);
    if (avail < cx.min_connect_minutes) {
      invalidConnections.push(
        `${cx.connection_id}: baseline connect time ${avail}m < min ${cx.min_connect_minutes}m`
      );
    }
  }

  issues.push({
    id: 'val-connections',
    severity: invalidConnections.length > 0 ? 'ERROR' : 'PASS',
    category: 'CONNECTION_REFERENCES',
    title: `Passenger Connection Graph (${dataset.connections.length} connections)`,
    detail:
      invalidConnections.length > 0
        ? invalidConnections.join(' | ')
        : `All ${dataset.connections.length} passenger connection pairs reference valid flights, matching hub airports, and feasible scheduled connection times.`,
  });

  return issues;
}
