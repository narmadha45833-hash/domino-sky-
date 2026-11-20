import {
  AircraftUtilization,
  AirportRiskProfile,
  ClosureConfig,
  FlightNetworkDataset,
  RawFlight,
  RecoveryAction,
  RiskLevel,
  SecondaryClosureConfig,
  SimulatedCrew,
  SimulatedFlight,
  SimulationMetrics,
  SimulationResult,
  TimelineEvent,
} from '../types/aviation';
import { evaluateConnectionsAndPassengers } from './passengers';
import { formatMinutesToTime, parseTimeToMinutes } from './time';

interface ActiveRestriction {
  airportId: string;
  startMin: number;
  endMin: number;
  severityPct: 100 | 50 | 25;
  description: string;
  isSecondary: boolean;
}

export function runSimulation(
  dataset: FlightNetworkDataset,
  config: ClosureConfig,
  appliedActions: RecoveryAction[] = []
): SimulationResult {
  const minTurnaround = dataset.meta.min_turnaround_minutes;
  const airportMap = new Map(dataset.airports.map((a) => [a.id, a]));
  const spareMap = new Map(dataset.spare_aircraft.map((s) => [s.tail_id, s]));

  // Collect active airspace restrictions (primary + optional secondary compound weather)
  const restrictions: ActiveRestriction[] = [];
  if (config.enabled && config.durationMinutes > 0) {
    const sMin = parseTimeToMinutes(config.startTime);
    restrictions.push({
      airportId: config.airportId,
      startMin: sMin,
      endMin: sMin + config.durationMinutes,
      severityPct: config.severityPct ?? 100,
      description: config.description || 'Operational Shutdown',
      isSecondary: false,
    });
  }
  const sec: SecondaryClosureConfig | undefined = config.secondary;
  if (config.enabled && sec && sec.enabled && sec.durationMinutes > 0) {
    const sMin = parseTimeToMinutes(sec.startTime);
    restrictions.push({
      airportId: sec.airportId,
      startMin: sMin,
      endMin: sMin + sec.durationMinutes,
      severityPct: sec.severityPct ?? 100,
      description: sec.description || 'Secondary Weather Restriction',
      isSecondary: true,
    });
  }

  // Mutable working overrides from applied recovery actions
  const cancelledByRecovery = new Set<string>();
  const holdUntilByFlight = new Map<string, { minutes: number; reason: string }>();
  const tailOverrideByFlight = new Map<string, { tailId: string; isSpare: boolean; note: string }>();

  for (const action of appliedActions) {
    if (action.type === 'CANCEL_FLIGHT' && action.cancelFlightId) {
      cancelledByRecovery.add(action.cancelFlightId);
    } else if (action.type === 'HOLD_FLIGHT' && action.holdMinutes && action.targetFlightIds.length > 0) {
      for (const fid of action.targetFlightIds) {
        holdUntilByFlight.set(fid, {
          minutes: action.holdMinutes,
          reason: action.title,
        });
      }
    } else if (action.type === 'DEPLOY_SPARE' && action.spareTailId) {
      for (const fid of action.targetFlightIds) {
        tailOverrideByFlight.set(fid, {
          tailId: action.spareTailId,
          isSpare: true,
          note: `Covered by spare ${action.spareTailId}`,
        });
      }
    } else if (
      action.type === 'SWAP_AIRCRAFT' &&
      action.swapTailA &&
      action.swapTailB &&
      action.swapAtFlightA &&
      action.swapAtFlightB
    ) {
      const flA = dataset.flights.find((f) => f.flight_id === action.swapAtFlightA);
      const flB = dataset.flights.find((f) => f.flight_id === action.swapAtFlightB);
      if (flA && flB) {
        const legsA = dataset.flights.filter(
          (f) => f.tail_id === action.swapTailA && f.leg_order >= flA.leg_order
        );
        const legsB = dataset.flights.filter(
          (f) => f.tail_id === action.swapTailB && f.leg_order >= flB.leg_order
        );
        for (const f of legsA) {
          tailOverrideByFlight.set(f.flight_id, {
            tailId: action.swapTailB,
            isSpare: false,
            note: `Tail swapped from ${action.swapTailA} to ${action.swapTailB}`,
          });
        }
        for (const f of legsB) {
          tailOverrideByFlight.set(f.flight_id, {
            tailId: action.swapTailA,
            isSpare: false,
            note: `Tail swapped from ${action.swapTailB} to ${action.swapTailA}`,
          });
        }
      }
    }
  }

  // Group flights by effective tail
  const flightsByEffectiveTail = new Map<string, RawFlight[]>();
  for (const raw of dataset.flights) {
    const override = tailOverrideByFlight.get(raw.flight_id);
    const effectiveTail = override ? override.tailId : raw.tail_id;
    const list = flightsByEffectiveTail.get(effectiveTail) ?? [];
    list.push(raw);
    flightsByEffectiveTail.set(effectiveTail, list);
  }

  interface TailState {
    tailId: string;
    legs: RawFlight[];
    cursor: number;
    prevActualArrMin: number | null;
    prevActualDest: string | null;
    prevFlightId: string | null;
    prevCascadeRoot: string | null;
    prevCascadeDepth: number;
    conflicts: string[];
  }

  const tailStates: TailState[] = [];
  for (const [tailId, legs] of flightsByEffectiveTail.entries()) {
    const sorted = [...legs].sort((a, b) => {
      const d = parseTimeToMinutes(a.dep) - parseTimeToMinutes(b.dep);
      return d !== 0 ? d : a.leg_order - b.leg_order;
    });
    const spareInfo = spareMap.get(tailId);
    tailStates.push({
      tailId,
      legs: sorted,
      cursor: 0,
      prevActualArrMin: spareInfo ? parseTimeToMinutes(spareInfo.available_from) - minTurnaround : null,
      prevActualDest: spareInfo ? spareInfo.base : null,
      prevFlightId: null,
      prevCascadeRoot: null,
      prevCascadeDepth: 0,
      conflicts: [],
    });
  }

  // Runway slot ledger per airport: tracks the next available runway movement minute during congested/recovery windows
  const airportSlotCursor = new Map<string, number>();

  const getSlotSpacing = (airportId: string, severityFactor: number): number => {
    const ap = airportMap.get(airportId);
    const baseCap = ap ? ap.capacity_per_hour : 20;
    const effectiveCap = Math.max(1, Math.round(baseCap * severityFactor));
    return Math.max(2, Math.ceil(60 / effectiveCap));
  };

  const applyAirportControl = (
    airportId: string,
    desiredTimeMin: number,
    isArrival: boolean
  ): {
    actualTimeMin: number;
    closureDelayReason: string | null;
    slotDelayMin: number;
    hitRestriction: boolean;
  } => {
    let time = desiredTimeMin;
    let hitRestriction = false;
    let closureDelayReason: string | null = null;
    let slotDelayMin = 0;

    // 1. Check active restrictions at this airport
    for (const r of restrictions) {
      if (r.airportId !== airportId) continue;
      if (time >= r.startMin && time < r.endMin) {
        hitRestriction = true;
        if (r.severityPct === 100) {
          time = r.endMin;
          closureDelayReason = `${airportId} closed (${formatMinutesToTime(r.startMin)}–${formatMinutesToTime(r.endMin)}, ${r.description})`;
        } else {
          // Partial capacity degradation (50% = half capacity, 25% = quarter capacity)
          const remainingRatio = r.severityPct === 50 ? 0.5 : 0.25;
          const degradedSpacing = getSlotSpacing(airportId, remainingRatio);
          const nextSlot = airportSlotCursor.get(airportId) ?? r.startMin;
          const meteredTime = Math.max(time, nextSlot);
          if (meteredTime > time) {
            slotDelayMin += meteredTime - time;
          }
          time = meteredTime;
          airportSlotCursor.set(airportId, time + degradedSpacing);
          closureDelayReason = `${airportId} operating at ${Math.round(remainingRatio * 100)}% reduced runway capacity (${r.description}, ${degradedSpacing}m ATC spacing)`;
        }
      }
    }

    // 2. Post-closure runway backlog metering using capacity_per_hour
    if (config.enforceRunwayCapacity) {
      const recoveryWindow = restrictions.find(
        (r) => r.airportId === airportId && time >= r.endMin && time <= r.endMin + 60
      );
      if (recoveryWindow) {
        const normalSpacing = getSlotSpacing(airportId, 1.0);
        // Priority offset: arrivals get exact slot, departures yield by 0 if free
        const cursor = airportSlotCursor.get(airportId) ?? recoveryWindow.endMin;
        if (time < cursor) {
          const added = cursor - time;
          slotDelayMin += added;
          time = cursor;
        }
        airportSlotCursor.set(airportId, time + (isArrival ? normalSpacing : normalSpacing));
      }
    }

    return { actualTimeMin: time, closureDelayReason, slotDelayMin, hitRestriction };
  };

  const simulatedFlightsMap = new Map<string, SimulatedFlight>();
  let totalRunwaySlotDelayMinutes = 0;

  // Discrete-event chronological loop across all active aircraft legs
  while (true) {
    let nextTail: TailState | null = null;
    let bestSortKey = Infinity;

    for (const ts of tailStates) {
      if (ts.cursor >= ts.legs.length) continue;
      const fl = ts.legs[ts.cursor];
      const schedDepMin = parseTimeToMinutes(fl.dep);
      const prevReady = ts.prevActualArrMin !== null ? ts.prevActualArrMin + minTurnaround : -Infinity;
      const holdInfo = holdUntilByFlight.get(fl.flight_id);
      const holdTarget = holdInfo ? schedDepMin + holdInfo.minutes : -Infinity;
      const candidate = Math.max(schedDepMin, prevReady, holdTarget);
      if (candidate < bestSortKey) {
        bestSortKey = candidate;
        nextTail = ts;
      }
    }

    if (!nextTail) break;

    const raw = nextTail.legs[nextTail.cursor];
    nextTail.cursor += 1;

    const schedDepMin = parseTimeToMinutes(raw.dep);
    const schedArrMin = parseTimeToMinutes(raw.arr);
    const blockMinutes = schedArrMin - schedDepMin;
    const override = tailOverrideByFlight.get(raw.flight_id);

    if (nextTail.prevActualDest !== null && nextTail.prevActualDest !== raw.origin) {
      nextTail.conflicts.push(
        `Station mismatch before ${raw.flight_id}: ${nextTail.tailId} is at ${nextTail.prevActualDest}, required at ${raw.origin}.`
      );
    }

    if (cancelledByRecovery.has(raw.flight_id)) {
      simulatedFlightsMap.set(raw.flight_id, {
        ...raw,
        assignedTailId: nextTail.tailId,
        isSpareAssigned: Boolean(override?.isSpare),
        schedDepMin,
        schedArrMin,
        predDepMin: null,
        predArrMin: null,
        predDepStr: 'CANCELLED',
        predArrStr: 'CANCELLED',
        depDelayMin: 0,
        arrDelayMin: 0,
        status: 'CANCELLED',
        reason: `Flight ${raw.flight_id} cancelled by Operations / AI Dispatcher recovery action.`,
        disruptionSource: 'CANCELLED_RECOVERY',
        turnaroundAvailableMin: null,
        turnaroundViolation: false,
        firstDelayedAtMin: schedDepMin,
        cascadeDepth: nextTail.prevCascadeDepth,
        cascadeRootFlightId: nextTail.prevCascadeRoot ?? raw.flight_id,
        slotMeteredDelayMin: 0,
      });
      continue;
    }

    const prevReadyMin =
      nextTail.prevActualArrMin !== null ? nextTail.prevActualArrMin + minTurnaround : -Infinity;
    const turnaroundAvailableMin =
      nextTail.prevActualArrMin !== null ? Math.max(0, schedDepMin - nextTail.prevActualArrMin) : null;
    const holdInfo = holdUntilByFlight.get(raw.flight_id);
    const holdTargetMin = holdInfo ? schedDepMin + holdInfo.minutes : -Infinity;

    const depBase = Math.max(schedDepMin, prevReadyMin, holdTargetMin);
    const delayedByPrevLeg = prevReadyMin > schedDepMin;
    const delayedByHold = holdTargetMin > schedDepMin && holdTargetMin >= prevReadyMin;

    // Origin restriction & runway slot metering
    const originCtrl = applyAirportControl(raw.origin, depBase, false);
    let depCandidate = originCtrl.actualTimeMin;
    let arrCandidate = depCandidate + blockMinutes;

    // Destination restriction & runway slot metering
    const destCtrl = applyAirportControl(raw.destination, arrCandidate, true);
    let delayedByDestClosure = false;
    if (destCtrl.actualTimeMin > arrCandidate) {
      delayedByDestClosure = destCtrl.hitRestriction;
      const arrShift = destCtrl.actualTimeMin - arrCandidate;
      if (depCandidate < (restrictions.find((r) => r.airportId === raw.destination)?.startMin ?? Infinity)) {
        // Already airborne before destination closure started -> airborne holding
        arrCandidate = destCtrl.actualTimeMin;
      } else {
        // Ground Delay Program: absorb hold on the ground before departure
        depCandidate += arrShift;
        arrCandidate = depCandidate + blockMinutes;
      }
    }

    const slotMeteredDelayMin = originCtrl.slotDelayMin + destCtrl.slotDelayMin;
    totalRunwaySlotDelayMinutes += slotMeteredDelayMin;

    const depDelayMin = Math.max(0, depCandidate - schedDepMin);
    const arrDelayMin = Math.max(0, arrCandidate - schedArrMin);

    if (
      config.enabled &&
      config.autoCancelThresholdMinutes !== null &&
      Math.max(depDelayMin, arrDelayMin) > config.autoCancelThresholdMinutes
    ) {
      simulatedFlightsMap.set(raw.flight_id, {
        ...raw,
        assignedTailId: nextTail.tailId,
        isSpareAssigned: Boolean(override?.isSpare),
        schedDepMin,
        schedArrMin,
        predDepMin: null,
        predArrMin: null,
        predDepStr: 'CANCELLED',
        predArrStr: 'CANCELLED',
        depDelayMin: 0,
        arrDelayMin: 0,
        status: 'CANCELLED',
        reason: `Auto-cancelled: Projected delay (+${Math.max(depDelayMin, arrDelayMin)}m) exceeded ${config.autoCancelThresholdMinutes}m cancellation threshold.`,
        disruptionSource: 'CANCELLED_THRESHOLD',
        turnaroundAvailableMin,
        turnaroundViolation: false,
        firstDelayedAtMin: schedDepMin,
        cascadeDepth: nextTail.prevCascadeDepth + 1,
        cascadeRootFlightId: nextTail.prevCascadeRoot ?? raw.flight_id,
        slotMeteredDelayMin,
      });
      continue;
    }

    const reasons: string[] = [];
    let disruptionSource: SimulatedFlight['disruptionSource'] = 'NONE';
    let cascadeDepth = 0;
    let cascadeRootFlightId: string | null = null;
    let firstDelayedAtMin: number | null = null;

    if (originCtrl.hitRestriction && depDelayMin > 0) {
      disruptionSource = 'ORIGIN_CLOSURE';
      cascadeDepth = 0;
      cascadeRootFlightId = raw.flight_id;
      firstDelayedAtMin = schedDepMin;
      reasons.push(
        `Departure held until ${formatMinutesToTime(depCandidate)} due to ${originCtrl.closureDelayReason}.`
      );
    }

    if ((delayedByDestClosure || destCtrl.slotDelayMin > 0) && arrDelayMin > 0) {
      if (disruptionSource === 'NONE') {
        disruptionSource = 'DEST_CLOSURE';
        cascadeDepth = 0;
        cascadeRootFlightId = raw.flight_id;
        firstDelayedAtMin = schedDepMin;
      }
      if (depDelayMin === 0) {
        reasons.push(
          `Departed ${raw.origin} on time at ${formatMinutesToTime(depCandidate)}, but entered airborne arrival holding for ${raw.destination} (${destCtrl.closureDelayReason ?? 'runway slot metering'}).`
        );
      } else {
        reasons.push(
          `Ground Delay Program held departure to ${formatMinutesToTime(depCandidate)} for ${raw.destination} reopening/slot (${destCtrl.closureDelayReason ?? 'ATC spacing'}).`
        );
      }
    }

    if (delayedByPrevLeg && nextTail.prevFlightId && nextTail.prevActualArrMin !== null) {
      if (disruptionSource === 'NONE') {
        disruptionSource = 'TURNAROUND_PROPAGATION';
        cascadeDepth = nextTail.prevCascadeDepth + 1;
        cascadeRootFlightId = nextTail.prevCascadeRoot ?? nextTail.prevFlightId;
        firstDelayedAtMin = schedDepMin;
      }
      const rawTurnGap = schedDepMin - nextTail.prevActualArrMin;
      reasons.push(
        `Flight ${raw.flight_id} is delayed because ${nextTail.tailId} arrived late from previous leg ${nextTail.prevFlightId} at ${formatMinutesToTime(nextTail.prevActualArrMin)} (leaving ${rawTurnGap}m vs ${minTurnaround}m required turnaround).`
      );
    }

    if (slotMeteredDelayMin > 0 && !originCtrl.hitRestriction && !delayedByDestClosure) {
      reasons.push(
        `Includes +${slotMeteredDelayMin}m ATC runway slot metering delay (${airportMap.get(raw.origin)?.capacity_per_hour ?? 20}/hr recovery queue).`
      );
    }

    if (delayedByHold && holdInfo) {
      if (disruptionSource === 'NONE') {
        disruptionSource = 'RECOVERY_HOLD';
        firstDelayedAtMin = schedDepMin;
      }
      reasons.push(`Held on departure (${holdInfo.reason}) to protect inbound passenger connections.`);
    }

    const isDelayed = depDelayMin > 0 || arrDelayMin > 0;
    if (override && !isDelayed) {
      disruptionSource = 'SPARE_COVERED';
      reasons.push(`${override.note}; operates on schedule.`);
    } else if (override) {
      reasons.push(override.note);
    }

    if (reasons.length === 0) {
      reasons.push('Operating on schedule within all turnaround and airspace constraints.');
    }

    const actualTurnGap =
      nextTail.prevActualArrMin !== null ? depCandidate - nextTail.prevActualArrMin : null;
    const turnaroundViolation = actualTurnGap !== null && actualTurnGap < minTurnaround;

    if (turnaroundViolation) {
      nextTail.conflicts.push(
        `Turnaround conflict on ${raw.flight_id}: only ${actualTurnGap}m after ${nextTail.prevFlightId}.`
      );
    }

    const simFl: SimulatedFlight = {
      ...raw,
      assignedTailId: nextTail.tailId,
      isSpareAssigned: Boolean(override?.isSpare),
      schedDepMin,
      schedArrMin,
      predDepMin: depCandidate,
      predArrMin: arrCandidate,
      predDepStr: formatMinutesToTime(depCandidate),
      predArrStr: formatMinutesToTime(arrCandidate),
      depDelayMin,
      arrDelayMin,
      status: isDelayed ? 'DELAYED' : 'ON_TIME',
      reason: reasons.join(' '),
      disruptionSource,
      turnaroundAvailableMin,
      turnaroundViolation,
      firstDelayedAtMin,
      cascadeDepth,
      cascadeRootFlightId,
      slotMeteredDelayMin,
    };

    simulatedFlightsMap.set(raw.flight_id, simFl);

    nextTail.prevActualArrMin = arrCandidate;
    nextTail.prevActualDest = raw.destination;
    nextTail.prevFlightId = raw.flight_id;
    nextTail.prevCascadeRoot = cascadeRootFlightId ?? nextTail.prevCascadeRoot;
    nextTail.prevCascadeDepth = isDelayed ? cascadeDepth : 0;
  }

  const aircraftScheduleConflicts = new Map<string, string[]>();
  for (const ts of tailStates) {
    if (ts.conflicts.length > 0) aircraftScheduleConflicts.set(ts.tailId, ts.conflicts);
  }

  const flights: SimulatedFlight[] = dataset.flights.map((f) => simulatedFlightsMap.get(f.flight_id)!);

  const { connections, passengerImpact } = evaluateConnectionsAndPassengers(
    dataset,
    flights,
    appliedActions
  );

  const flightMap = new Map(flights.map((f) => [f.flight_id, f]));
  const crews: SimulatedCrew[] = dataset.crews.map((crew) => {
    const dutyStartMin = parseTimeToMinutes(crew.duty_start);
    const crewFlights = crew.flight_ids
      .map((fid) => flightMap.get(fid))
      .filter((f): f is SimulatedFlight => Boolean(f));

    const schedFinalArrMin = crewFlights.reduce((max, f) => Math.max(max, f.schedArrMin), dutyStartMin);
    const schedDutyMins = schedFinalArrMin - dutyStartMin;
    const activeCrewFlights = crewFlights.filter((f) => f.status !== 'CANCELLED');
    const simFinalArrMin = activeCrewFlights.reduce(
      (max, f) => Math.max(max, f.predArrMin ?? f.schedArrMin),
      dutyStartMin
    );
    const simDutyMins = simFinalArrMin - dutyStartMin;
    const dutyRemainingMins = crew.max_duty_mins - simDutyMins;
    const violationMins = Math.max(0, simDutyMins - crew.max_duty_mins);
    const affectedFlightCount = crewFlights.filter((f) => f.status !== 'ON_TIME').length;

    const status: SimulatedCrew['status'] =
      violationMins > 0 ? 'VIOLATION' : dutyRemainingMins <= 45 ? 'WARNING' : 'LEGAL';

    let notes = 'Within legal FDTL max_duty_mins limit.';
    if (status === 'VIOLATION') {
      notes = `Crew duty exceeds ${crew.max_duty_mins}m limit by ${violationMins}m (final arrival ${formatMinutesToTime(simFinalArrMin)}).`;
    } else if (status === 'WARNING') {
      notes = `Low duty buffer: only ${dutyRemainingMins}m remaining before ${crew.max_duty_mins}m limit.`;
    }

    return {
      ...crew,
      dutyStartMin,
      schedFinalArrMin,
      schedDutyMins,
      simFinalArrMin,
      simDutyMins,
      dutyRemainingMins,
      violationMins,
      status,
      affectedFlightCount,
      notes,
    };
  });

  const allTailIds = [
    ...Array.from(new Set(dataset.flights.map((f) => f.tail_id))).sort(),
    ...dataset.spare_aircraft.map((s) => s.tail_id),
  ];

  const aircraft: AircraftUtilization[] = allTailIds.map((tailId) => {
    const spareInfo = spareMap.get(tailId);
    const isSpare = Boolean(spareInfo);
    const assignedFlights = flights
      .filter((f) => f.assignedTailId === tailId)
      .sort((a, b) => a.schedDepMin - b.schedDepMin);

    const activeFlights = assignedFlights.filter((f) => f.status !== 'CANCELLED');
    const delayedCount = assignedFlights.filter((f) => f.status === 'DELAYED').length;
    const cancelledCount = assignedFlights.filter((f) => f.status === 'CANCELLED').length;
    const totalDelayMins = assignedFlights.reduce(
      (sum, f) => sum + Math.max(f.depDelayMin, f.arrDelayMin),
      0
    );

    const firstOrigin = assignedFlights[0]?.origin ?? spareInfo?.base ?? 'DEL';
    const lastActive = activeFlights[activeFlights.length - 1] ?? null;
    const currentLocation = lastActive ? lastActive.destination : firstOrigin;

    const minTurn = assignedFlights.reduce<number | null>((min, f) => {
      if (f.turnaroundAvailableMin === null) return min;
      return min === null ? f.turnaroundAvailableMin : Math.min(min, f.turnaroundAvailableMin);
    }, null);

    const activeBlockMins = activeFlights.reduce((sum, f) => sum + f.block_minutes, 0);
    const utilizationPct = Math.min(100, Math.round((activeBlockMins / 960) * 100));

    let availability: AircraftUtilization['availability'] = 'IN_SERVICE';
    if (isSpare) {
      availability = assignedFlights.length > 0 ? 'SPARE_DEPLOYED' : 'SPARE_STANDBY';
    } else if (delayedCount > 0 || cancelledCount > 0) {
      availability = 'DISRUPTED';
    } else if (assignedFlights.length === 0) {
      availability = 'AVAILABLE';
    }

    return {
      tailId,
      isSpare,
      baseAirport: spareInfo?.base ?? firstOrigin,
      currentLocation,
      previousFlight: activeFlights.length >= 2 ? activeFlights[activeFlights.length - 2] : null,
      nextFlight: assignedFlights[0] ?? null,
      flights: assignedFlights,
      totalFlights: assignedFlights.length,
      delayedFlights: delayedCount,
      cancelledFlights: cancelledCount,
      totalDelayMins,
      minRemainingTurnaroundMin: minTurn,
      availability,
      scheduleConflicts: aircraftScheduleConflicts.get(tailId) ?? [],
      utilizationPct,
    };
  });

  const restrictedAirports = new Set(restrictions.map((r) => r.airportId));

  const airportRisks: AirportRiskProfile[] = dataset.airports.map((ap) => {
    const deps = flights.filter((f) => f.origin === ap.id);
    const arrs = flights.filter((f) => f.destination === ap.id);
    const delayedDepartures = deps.filter((f) => f.status === 'DELAYED').length;
    const delayedArrivals = arrs.filter((f) => f.status === 'DELAYED').length;
    const cancelledFlights = flights.filter(
      (f) => (f.origin === ap.id || f.destination === ap.id) && f.status === 'CANCELLED'
    ).length;

    const totalDelayMinutes =
      deps.reduce((s, f) => s + f.depDelayMin, 0) + arrs.reduce((s, f) => s + f.arrDelayMin, 0);

    const apMissedConns = connections.filter((c) => c.airport === ap.id && c.status !== 'MADE');
    const missedConnections = apMissedConns.length;
    const affectedConnectingPax = apMissedConns.reduce((s, c) => s + c.passengers, 0);
    const isClosedAirport = restrictedAirports.has(ap.id);

    const rawScore =
      delayedDepartures * 3 +
      delayedArrivals * 2 +
      cancelledFlights * 6 +
      missedConnections * 4 +
      Math.round(totalDelayMinutes / 45) +
      (isClosedAirport ? 8 : 0);

    const riskLevel: RiskLevel =
      rawScore >= 20
        ? 'CRITICAL RISK'
        : rawScore >= 10
        ? 'HIGH RISK'
        : rawScore >= 3
        ? 'MODERATE RISK'
        : 'LOW RISK';

    const calculationBreakdown = `Score ${rawScore} = (${delayedDepartures} delayed dep × 3) + (${delayedArrivals} delayed arr × 2) + (${cancelledFlights} cancelled × 6) + (${missedConnections} missed conn × 4) + (${Math.round(
      totalDelayMinutes / 45
    )} from ${totalDelayMinutes}m delay)${isClosedAirport ? ' + 8 active restriction' : ''}`;

    return {
      airport: ap,
      departuresTotal: deps.length,
      arrivalsTotal: arrs.length,
      delayedDepartures,
      delayedArrivals,
      cancelledFlights,
      totalDelayMinutes,
      missedConnections,
      affectedConnectingPax,
      riskScore: rawScore,
      riskLevel,
      calculationBreakdown,
      isClosedAirport,
    };
  });

  const timelineEvents: TimelineEvent[] = [];
  for (const r of restrictions) {
    timelineEvents.push({
      id: `evt-closure-start-${r.airportId}-${r.startMin}`,
      timeMin: r.startMin,
      timeStr: formatMinutesToTime(r.startMin),
      type: 'CLOSURE_START',
      severity: r.severityPct === 100 ? 'CRITICAL' : 'HIGH',
      title: `${r.airportId} ${r.severityPct === 100 ? 'Airport Closure' : `${r.severityPct}% Capacity Restriction`} Begins`,
      description: `${r.airportId} restricted from ${formatMinutesToTime(r.startMin)} to ${formatMinutesToTime(r.endMin)} (${r.description}).`,
      airportId: r.airportId,
    });
    timelineEvents.push({
      id: `evt-closure-end-${r.airportId}-${r.endMin}`,
      timeMin: r.endMin,
      timeStr: formatMinutesToTime(r.endMin),
      type: 'CLOSURE_END',
      severity: 'MEDIUM',
      title: `${r.airportId} Normal Runway Capacity Restored`,
      description: `Restriction ends; ATC meters backlog at ${airportMap.get(r.airportId)?.capacity_per_hour ?? 20} movements/hr.`,
      airportId: r.airportId,
    });
  }

  for (const fl of flights) {
    if (fl.status === 'DELAYED') {
      const eventMin = fl.firstDelayedAtMin ?? fl.schedDepMin;
      const isCascade = fl.disruptionSource === 'TURNAROUND_PROPAGATION';
      timelineEvents.push({
        id: `evt-fl-${fl.flight_id}`,
        timeMin: eventMin,
        timeStr: formatMinutesToTime(eventMin),
        type: isCascade ? 'CASCADE_PROPAGATION' : 'FLIGHT_DELAY',
        severity: Math.max(fl.depDelayMin, fl.arrDelayMin) >= 60 ? 'HIGH' : 'MEDIUM',
        title: `${fl.flight_id} (${fl.origin}→${fl.destination}) Delayed +${Math.max(fl.depDelayMin, fl.arrDelayMin)}m`,
        description: fl.reason,
        flightId: fl.flight_id,
        tailId: fl.assignedTailId,
        airportId: fl.origin,
      });
    } else if (fl.status === 'CANCELLED') {
      timelineEvents.push({
        id: `evt-cancel-${fl.flight_id}`,
        timeMin: fl.schedDepMin,
        timeStr: fl.dep,
        type: 'FLIGHT_CANCELLED',
        severity: 'CRITICAL',
        title: `${fl.flight_id} (${fl.origin}→${fl.destination}) Cancelled`,
        description: fl.reason,
        flightId: fl.flight_id,
        tailId: fl.assignedTailId,
        airportId: fl.origin,
      });
    }
  }

  for (const cx of connections) {
    if (cx.status !== 'MADE') {
      const tMin = cx.toFlight.predDepMin ?? cx.toFlight.schedDepMin;
      timelineEvents.push({
        id: `evt-cx-${cx.connection_id}`,
        timeMin: tMin,
        timeStr: formatMinutesToTime(tMin),
        type: 'CONNECTION_MISSED',
        severity: cx.passengers >= 35 ? 'CRITICAL' : 'HIGH',
        title: `Connection ${cx.connection_id} Missed at ${cx.airport} (${cx.passengers} pax)`,
        description: `${cx.from_flight} → ${cx.to_flight} at ${cx.airport}: ${
          cx.status === 'MISSED_CANCELLATION'
            ? 'Flight cancelled.'
            : `Only ${cx.availableConnectMin}m available vs ${cx.min_connect_minutes}m minimum.`
        }`,
        airportId: cx.airport,
        connectionId: cx.connection_id,
      });
    }
  }

  for (const cr of crews) {
    if (cr.status === 'VIOLATION') {
      timelineEvents.push({
        id: `evt-crew-${cr.crew_id}`,
        timeMin: cr.dutyStartMin + cr.max_duty_mins,
        timeStr: formatMinutesToTime(cr.dutyStartMin + cr.max_duty_mins),
        type: 'CREW_VIOLATION',
        severity: 'CRITICAL',
        title: `Crew ${cr.crew_id} (${cr.tail_id}) Duty Limit Exceeded`,
        description: cr.notes,
        tailId: cr.tail_id,
      });
    }
  }

  timelineEvents.sort((a, b) => a.timeMin - b.timeMin);

  const onTimeFlights = flights.filter((f) => f.status === 'ON_TIME').length;
  const delayedFlights = flights.filter((f) => f.status === 'DELAYED').length;
  const cancelledFlights = flights.filter((f) => f.status === 'CANCELLED').length;
  const within15Flights = flights.filter(
    (f) => f.status !== 'CANCELLED' && Math.max(f.depDelayMin, f.arrDelayMin) <= 15
  ).length;

  const totalDelayMinutes = flights.reduce(
    (sum, f) => sum + Math.max(f.depDelayMin, f.arrDelayMin),
    0
  );
  const maxDelayMinutes = flights.reduce(
    (max, f) => Math.max(max, f.depDelayMin, f.arrDelayMin),
    0
  );
  const affectedAircraftCount = aircraft.filter(
    (a) => !a.isSpare && (a.delayedFlights > 0 || a.cancelledFlights > 0)
  ).length;
  const deployedSpareAircraft = aircraft.filter(
    (a) => a.isSpare && a.availability === 'SPARE_DEPLOYED'
  ).length;
  const availableSpareAircraft = dataset.spare_aircraft.length - deployedSpareAircraft;
  const missedConnectionsCount = connections.filter((c) => c.status !== 'MADE').length;
  const crewViolationCount = crews.filter((c) => c.status === 'VIOLATION').length;
  const turnaroundViolationCount = flights.filter((f) => f.turnaroundViolation).length;

  const sortedAirports = [...airportRisks].sort((a, b) => b.riskScore - a.riskScore);
  const mostAffectedAirportId =
    sortedAirports[0] && sortedAirports[0].riskScore > 0 ? sortedAirports[0].airport.id : null;

  const sortedTails = [...aircraft]
    .filter((a) => !a.isSpare)
    .sort((a, b) => b.totalDelayMins - a.totalDelayMins);
  const mostAffectedTailId =
    sortedTails[0] && sortedTails[0].totalDelayMins > 0 ? sortedTails[0].tailId : null;

  const otp0Pct = Math.round((onTimeFlights / dataset.flights.length) * 100);
  const otp15Pct = Math.round((within15Flights / dataset.flights.length) * 100);
  const avgDelayPerDelayedMin = delayedFlights > 0 ? Math.round(totalDelayMinutes / delayedFlights) : 0;
  const totalSeatsOffered = flights
    .filter((f) => f.status !== 'CANCELLED')
    .reduce((s) => s + dataset.meta.seats_per_aircraft, 0);
  const activePax = flights
    .filter((f) => f.status !== 'CANCELLED')
    .reduce((s, f) => s + f.pax, 0);
  const networkLoadFactorPct =
    totalSeatsOffered > 0 ? Math.round((activePax / totalSeatsOffered) * 100) : 0;

  const metrics: SimulationMetrics = {
    totalAirports: dataset.airports.length,
    totalFlights: dataset.flights.length,
    totalAircraft: new Set(dataset.flights.map((f) => f.tail_id)).size,
    totalConnections: dataset.connections.length,
    totalCrews: dataset.crews.length,
    availableSpareAircraft,
    deployedSpareAircraft,
    onTimeFlights,
    delayedFlights,
    cancelledFlights,
    totalDelayMinutes,
    maxDelayMinutes,
    affectedAircraftCount,
    missedConnectionsCount,
    crewViolationCount,
    turnaroundViolationCount,
    mostAffectedAirportId,
    mostAffectedTailId,
    otp0Pct,
    otp15Pct,
    avgDelayPerDelayedMin,
    networkLoadFactorPct,
    runwaySlotDelayMinutes: totalRunwaySlotDelayMinutes,
  };

  return {
    config,
    appliedActions,
    flights,
    connections,
    crews,
    aircraft,
    airportRisks,
    passengerImpact,
    metrics,
    timelineEvents,
  };
}
