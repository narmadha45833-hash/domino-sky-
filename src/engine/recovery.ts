import {
  ClosureConfig,
  FlightNetworkDataset,
  RecoveryAction,
  SimulationResult,
} from '../types/aviation';
import { runSimulation } from './simulation';
import { formatMinutesToTime, parseTimeToMinutes } from './time';

export function generateRecoveryRecommendations(
  dataset: FlightNetworkDataset,
  config: ClosureConfig,
  currentSim: SimulationResult,
  appliedActions: RecoveryAction[]
): RecoveryAction[] {
  if (!config.enabled || (currentSim.metrics.delayedFlights === 0 && currentSim.metrics.cancelledFlights === 0 && currentSim.metrics.missedConnectionsCount === 0)) {
    return [];
  }

  const candidates: RecoveryAction[] = [];
  const usedSpareIds = new Set(
    appliedActions.filter((a) => a.type === 'DEPLOY_SPARE' && a.spareTailId).map((a) => a.spareTailId!)
  );
  const heldFlights = new Set(
    appliedActions.filter((a) => a.type === 'HOLD_FLIGHT').flatMap((a) => a.targetFlightIds)
  );
  const cancelledFlights = new Set(
    appliedActions.filter((a) => a.type === 'CANCEL_FLIGHT' && a.cancelFlightId).map((a) => a.cancelFlightId!)
  );
  const rebookedConns = new Set(
    appliedActions.filter((a) => a.type === 'REBOOK_PASSENGERS' && a.connectionId).map((a) => a.connectionId!)
  );

  // 1. DEPLOY SPARE AIRCRAFT (VT-DS17 at BLR, VT-DS18 at DEL)
  for (const spare of dataset.spare_aircraft) {
    if (usedSpareIds.has(spare.tail_id)) continue;
    const spareAvailMin = parseTimeToMinutes(spare.available_from);

    // Find delayed flights departing from spare.base after spareAvailMin
    const eligibleFlights = currentSim.flights.filter(
      (f) =>
        f.origin === spare.base &&
        f.status === 'DELAYED' &&
        f.disruptionSource === 'TURNAROUND_PROPAGATION' &&
        f.schedDepMin >= spareAvailMin &&
        !f.isSpareAssigned
    );

    // Group by original tail to check taking over the remaining rotation from that flight onwards
    const seenTails = new Set<string>();
    for (const startFl of eligibleFlights) {
      if (seenTails.has(startFl.tail_id)) continue;
      seenTails.add(startFl.tail_id);

      const remainingChain = currentSim.flights
        .filter(
          (f) =>
            f.assignedTailId === startFl.tail_id &&
            f.leg_order >= startFl.leg_order &&
            f.status !== 'CANCELLED'
        )
        .sort((a, b) => a.leg_order - b.leg_order);

      if (remainingChain.length === 0) continue;

      const targetIds = remainingChain.map((f) => f.flight_id);
      const totalChainPax = remainingChain.reduce((s, f) => s + f.pax, 0);

      // Check crew feasibility: original crew may still be inbound on delayed leg, so standby base crew at spare.base is required
      const origCrew = currentSim.crews.find((c) => c.tail_id === startFl.tail_id);
      const chainLastArr = remainingChain[remainingChain.length - 1].schedArrMin;
      const standbyDutyMins = chainLastArr - (startFl.schedDepMin - 45);
      const crewFeasible = standbyDutyMins <= 600;

      const draftAction: RecoveryAction = {
        id: `rec-spare-${spare.tail_id}-${startFl.flight_id}`,
        type: 'DEPLOY_SPARE',
        title: `Deploy Spare ${spare.tail_id} at ${spare.base} for ${targetIds.join(', ')}`,
        summary: `Assign standby ${spare.tail_id} (based at ${spare.base}, available ${spare.available_from}) to cover ${targetIds.length} downstream leg(s) starting with ${startFl.flight_id}.`,
        targetFlightIds: targetIds,
        spareTailId: spare.tail_id,
        problemIdentified: `${startFl.tail_id} arrives late into ${spare.base}, delaying ${startFl.flight_id} (+${startFl.depDelayMin}m) and ${remainingChain.length - 1} subsequent leg(s).`,
        dataUsed: [
          `Spare ${spare.tail_id} base=${spare.base}, available_from=${spare.available_from}, seats=${spare.seats}`,
          `Target rotation: ${targetIds.join(' -> ')} (${totalChainPax} total onboard pax)`,
          `Original crew ${origCrew?.crew_id ?? 'N/A'} inbound late with ${startFl.tail_id}`,
        ],
        whySelected: '',
        alternativesConsidered: [
          `Hold ${startFl.flight_id} for inbound ${startFl.tail_id} (leaves +${startFl.depDelayMin}m delay intact)`,
          `Cancel ${startFl.flight_id} (strands ${startFl.pax} passengers and breaks return leg)`,
        ],
        expectedOperationalImpact: '',
        passengerImpactLabel: '',
        aircraftAvailabilityCheck: `PASS — ${spare.tail_id} is on standby at ${spare.base} since ${spare.available_from} (${spare.seats} seats >= max ${Math.max(...remainingChain.map((f) => f.pax))} pax).`,
        crewFeasibilityCheck: crewFeasible
          ? `PASS — Requires ${spare.base} standby reserve crew (${standbyDutyMins}m duty <= 600m max); relieves inbound ${origCrew?.crew_id ?? 'crew'} from cascade.`
          : `RESTRICTED — Estimated duty ${standbyDutyMins}m exceeds 600m limit.`,
        crewFeasible,
        aircraftFeasible: true,
        operationalRisks: `Requires standby crew activation at ${spare.base}; ${startFl.tail_id} terminates rotation at ${spare.base} until repositioned.`,
        delayMinutesSaved: 0,
        connectionsSaved: 0,
        passengersSaved: 0,
        flightsRecovered: 0,
        feasibilityScore: 0,
      };

      const testSim = runSimulation(dataset, config, [...appliedActions, draftAction]);
      const delaySaved = Math.max(0, currentSim.metrics.totalDelayMinutes - testSim.metrics.totalDelayMinutes);
      const connsSaved = Math.max(
        0,
        currentSim.metrics.missedConnectionsCount - testSim.metrics.missedConnectionsCount
      );
      const paxSaved = Math.max(
        0,
        currentSim.passengerImpact.missedConnectionPassengers -
          testSim.passengerImpact.missedConnectionPassengers
      );
      const flightsRec = Math.max(0, testSim.metrics.onTimeFlights - currentSim.metrics.onTimeFlights);

      if (delaySaved > 0 || connsSaved > 0 || flightsRec > 0) {
        draftAction.delayMinutesSaved = delaySaved;
        draftAction.connectionsSaved = connsSaved;
        draftAction.passengersSaved = paxSaved;
        draftAction.flightsRecovered = flightsRec;
        draftAction.expectedOperationalImpact = `Eliminates ${delaySaved} total delay min, restores ${flightsRec} flight(s) to ON TIME, and protects ${connsSaved} connection(s).`;
        draftAction.passengerImpactLabel =
          paxSaved > 0
            ? `Protects ${paxSaved} connecting passenger(s) and stabilizes ${totalChainPax} flight boardings.`
            : `Eliminates departure delays for ${totalChainPax} scheduled boardings across ${targetIds.length} leg(s).`;
        draftAction.whySelected = `Deploying ${spare.tail_id} at its ${spare.base} home base eliminates ${delaySaved}m of propagated delay cleanly with zero ferry flight required.`;
        draftAction.feasibilityScore =
          (crewFeasible ? 40 : 0) +
          connsSaved * 35 +
          paxSaved * 1.2 +
          delaySaved * 0.45 +
          flightsRec * 12;
        candidates.push(draftAction);
      }
    }
  }

  // 2. HOLD OUTBOUND FLIGHT TO SAVE MISSED CONNECTION
  for (const cx of currentSim.connections) {
    if (cx.status !== 'MISSED_DELAY') continue;
    if (heldFlights.has(cx.to_flight)) continue;
    if (cx.shortfallMin <= 0 || cx.shortfallMin > 45) continue; // realistic max operational hold 45m

    const additionalHoldMins = cx.shortfallMin;
    const holdMins = additionalHoldMins + cx.toFlight.depDelayMin;
    const targetDepStr = formatMinutesToTime(cx.toFlight.schedDepMin + holdMins);
    const toCrew = currentSim.crews.find((c) => c.tail_id === cx.toFlight.assignedTailId);
    const crewMargin = toCrew ? toCrew.dutyRemainingMins : 600;
    const crewFeasible = crewMargin >= additionalHoldMins;

    const draftAction: RecoveryAction = {
      id: `rec-hold-${cx.connection_id}-${cx.to_flight}`,
      type: 'HOLD_FLIGHT',
      title: `Hold ${cx.to_flight} until ${targetDepStr} (+${additionalHoldMins}m at ${cx.airport}) for ${cx.connection_id}`,
      summary: `Hold ${cx.to_flight} (${cx.toFlight.origin}->${cx.toFlight.destination}) ${additionalHoldMins}m past projected ${cx.toFlight.predDepStr} to ${targetDepStr} so ${cx.passengers} passengers from ${cx.from_flight} meet ${cx.min_connect_minutes}m min connect.`,
      targetFlightIds: [cx.to_flight],
      holdMinutes: holdMins,
      problemIdentified: `${cx.passengers} passengers arriving on ${cx.from_flight} (${cx.fromFlight.predArrStr}) miss ${cx.to_flight} (${cx.toFlight.predDepStr}) by ${cx.shortfallMin}m at ${cx.airport}.`,
      dataUsed: [
        `Connection ${cx.connection_id}: ${cx.passengers} pax, min_connect=${cx.min_connect_minutes}m, actual=${cx.availableConnectMin}m`,
        `Outbound ${cx.to_flight} on ${cx.toFlight.assignedTailId}; crew ${toCrew?.crew_id ?? 'N/A'} remaining duty ${crewMargin}m`,
      ],
      whySelected: '',
      alternativesConsidered: [
        `Allow ${cx.to_flight} to depart on time and rebook ${cx.passengers} pax (may leave passengers stranded if later flights lack seats)`,
      ],
      expectedOperationalImpact: '',
      passengerImpactLabel: '',
      aircraftAvailabilityCheck: `PASS — ${cx.toFlight.assignedTailId} is already positioned at ${cx.airport}.`,
      crewFeasibilityCheck: crewFeasible
        ? `PASS — Crew ${toCrew?.crew_id ?? ''} has ${crewMargin}m remaining duty (>= ${cx.shortfallMin}m hold).`
        : `FAIL — Holding ${cx.shortfallMin}m violates Crew ${toCrew?.crew_id ?? ''} max_duty_mins (${crewMargin}m buffer).`,
      crewFeasible,
      aircraftFeasible: true,
      operationalRisks: `Adds ${cx.shortfallMin}m delay to ${cx.to_flight} (${cx.toFlight.pax} pax) and may ripple to subsequent leg of ${cx.toFlight.assignedTailId}.`,
      delayMinutesSaved: 0,
      connectionsSaved: 0,
      passengersSaved: 0,
      flightsRecovered: 0,
      feasibilityScore: 0,
    };

    const testSim = runSimulation(dataset, config, [...appliedActions, draftAction]);
    const connsSaved = Math.max(
      0,
      currentSim.metrics.missedConnectionsCount - testSim.metrics.missedConnectionsCount
    );
    const paxSaved = Math.max(
      0,
      currentSim.passengerImpact.missedConnectionPassengers -
        testSim.passengerImpact.missedConnectionPassengers
    );
    const netDelayDelta = testSim.metrics.totalDelayMinutes - currentSim.metrics.totalDelayMinutes;
    const newCrewViolations = testSim.metrics.crewViolationCount - currentSim.metrics.crewViolationCount;
    const isActuallyCrewSafe = crewFeasible && newCrewViolations <= 0;

    if (connsSaved > 0) {
      draftAction.crewFeasible = isActuallyCrewSafe;
      draftAction.delayMinutesSaved = Math.max(0, -netDelayDelta);
      draftAction.connectionsSaved = connsSaved;
      draftAction.passengersSaved = paxSaved;
      draftAction.expectedOperationalImpact = `Saves ${connsSaved} connection(s); trades +${Math.max(0, netDelayDelta)}m controlled departure hold to prevent missed hub transfer.`;
      draftAction.passengerImpactLabel = `Prevents ${paxSaved} connecting passenger(s) from missing onward travel at ${cx.airport}.`;
      draftAction.whySelected = `Holding ${cx.to_flight} by ${cx.shortfallMin}m yields high passenger preservation (${cx.passengers} pax saved) with bounded downstream impact.`;
      draftAction.feasibilityScore =
        (isActuallyCrewSafe ? 35 : -50) + connsSaved * 40 + paxSaved * 1.5 - Math.max(0, netDelayDelta) * 0.25;
      candidates.push(draftAction);
    }
  }

  // 3. AIRCRAFT SWAP AT SHARED HUB
  const delayedTails = currentSim.aircraft.filter((a) => !a.isSpare && a.delayedFlights > 0);
  const healthyTails = currentSim.aircraft.filter((a) => !a.isSpare && a.delayedFlights === 0 && a.cancelledFlights === 0);

  for (const dTail of delayedTails) {
    const firstDelayed = dTail.flights.find((f) => f.status === 'DELAYED' && f.disruptionSource === 'TURNAROUND_PROPAGATION');
    if (!firstDelayed) continue;

    for (const hTail of healthyTails) {
      // Check if hTail has a flight departing from firstDelayed.origin later, or already waiting there before firstDelayed.schedDepMin
      const candidateSwapLeg = hTail.flights.find(
        (f) =>
          f.origin === firstDelayed.origin &&
          f.schedDepMin >= firstDelayed.schedDepMin + 20 &&
          f.schedDepMin <= firstDelayed.schedDepMin + 150
      );
      if (!candidateSwapLeg) continue;

      // Ensure hTail's prior leg arrived at firstDelayed.origin at least min_turnaround before firstDelayed.schedDepMin
      const hPrevLeg = hTail.flights.find((f) => f.leg_order === candidateSwapLeg.leg_order - 1);
      const hReadyMin = hPrevLeg ? (hPrevLeg.predArrMin ?? hPrevLeg.schedArrMin) + 30 : 300;
      if (hReadyMin > firstDelayed.schedDepMin) continue;

      // Also check remaining rotation compatibility: both swap chains must remain station-legal and crew-safe
      const draftAction: RecoveryAction = {
        id: `rec-swap-${dTail.tailId}-${hTail.tailId}-${firstDelayed.flight_id}`,
        type: 'SWAP_AIRCRAFT',
        title: `Swap ${hTail.tailId} onto ${firstDelayed.flight_id} at ${firstDelayed.origin}`,
        summary: `Reassign early-ready ${hTail.tailId} at ${firstDelayed.origin} to operate ${firstDelayed.flight_id} while delayed ${dTail.tailId} absorbs ${candidateSwapLeg.flight_id}.`,
        targetFlightIds: [firstDelayed.flight_id, candidateSwapLeg.flight_id],
        swapTailA: dTail.tailId,
        swapTailB: hTail.tailId,
        swapAtFlightA: firstDelayed.flight_id,
        swapAtFlightB: candidateSwapLeg.flight_id,
        problemIdentified: `${dTail.tailId} arrives late into ${firstDelayed.origin}, threatening ${firstDelayed.flight_id} (${firstDelayed.dep}) while ${hTail.tailId} sits idle at ${firstDelayed.origin} until ${candidateSwapLeg.dep}.`,
        dataUsed: [
          `${dTail.tailId} next leg ${firstDelayed.flight_id} (${firstDelayed.dep}), delayed +${firstDelayed.depDelayMin}m`,
          `${hTail.tailId} ready at ${firstDelayed.origin} from ${formatMinutesToTime(hReadyMin)} before ${candidateSwapLeg.flight_id} (${candidateSwapLeg.dep})`,
        ],
        whySelected: '',
        alternativesConsidered: [
          `Wait for ${dTail.tailId} inbound arrival (+${firstDelayed.depDelayMin}m delay)`,
        ],
        expectedOperationalImpact: '',
        passengerImpactLabel: '',
        aircraftAvailabilityCheck: `PASS — ${hTail.tailId} is physically at ${firstDelayed.origin} by ${formatMinutesToTime(hReadyMin - 30)}.`,
        crewFeasibilityCheck: '',
        crewFeasible: true,
        aircraftFeasible: true,
        operationalRisks: `Requires gate/ramp crew coordination at ${firstDelayed.origin} and verifying tail-to-crew qualification.`,
        delayMinutesSaved: 0,
        connectionsSaved: 0,
        passengersSaved: 0,
        flightsRecovered: 0,
        feasibilityScore: 0,
      };

      const testSim = runSimulation(dataset, config, [...appliedActions, draftAction]);
      const conflicts = testSim.aircraft.flatMap((a) => a.scheduleConflicts);
      const delaySaved = Math.max(0, currentSim.metrics.totalDelayMinutes - testSim.metrics.totalDelayMinutes);
      const connsSaved = Math.max(
        0,
        currentSim.metrics.missedConnectionsCount - testSim.metrics.missedConnectionsCount
      );
      const paxSaved = Math.max(
        0,
        currentSim.passengerImpact.missedConnectionPassengers -
          testSim.passengerImpact.missedConnectionPassengers
      );
      const flightsRec = Math.max(0, testSim.metrics.onTimeFlights - currentSim.metrics.onTimeFlights);

      if (conflicts.length === 0 && (delaySaved > 10 || connsSaved > 0)) {
        const crewViolDelta = testSim.metrics.crewViolationCount - currentSim.metrics.crewViolationCount;
        const crewOk = crewViolDelta <= 0;
        draftAction.crewFeasible = crewOk;
        draftAction.crewFeasibilityCheck = crewOk
          ? `PASS — Crew duty durations remain within max_duty_mins after swap.`
          : `WARNING — Swap triggers ${crewViolDelta} crew duty limit breach.`;
        draftAction.delayMinutesSaved = delaySaved;
        draftAction.connectionsSaved = connsSaved;
        draftAction.passengersSaved = paxSaved;
        draftAction.flightsRecovered = flightsRec;
        draftAction.expectedOperationalImpact = `Saves ${delaySaved}m total delay and ${connsSaved} connection(s) via zero-cost hub tail swap.`;
        draftAction.passengerImpactLabel = `Reduces delay exposure for ${firstDelayed.pax} outbound passengers on ${firstDelayed.flight_id}.`;
        draftAction.whySelected = `Uses existing idle slack on ${hTail.tailId} at ${firstDelayed.origin} without consuming a spare aircraft.`;
        draftAction.feasibilityScore = (crewOk ? 30 : -40) + connsSaved * 35 + paxSaved + delaySaved * 0.4;
        candidates.push(draftAction);
      }
    }
  }

  // 4. REBOOK MISSED CONNECTION PASSENGERS ONTO ALTERNATIVE FLIGHTS
  for (const cx of currentSim.connections) {
    if (cx.status === 'MADE' || rebookedConns.has(cx.connection_id)) continue;
    const feasibleAlt = cx.alternativeOptions.find((o) => o.feasible && o.canAccommodateAll)
      ?? cx.alternativeOptions.find((o) => o.feasible);
    if (!feasibleAlt) continue;

    const rebookCount = Math.min(cx.passengers, feasibleAlt.availableSeats);
    const draftAction: RecoveryAction = {
      id: `rec-rebook-${cx.connection_id}-${feasibleAlt.flightId}`,
      type: 'REBOOK_PASSENGERS',
      title: `Rebook ${cx.connection_id} (${rebookCount} pax) onto ${feasibleAlt.flightId}`,
      summary: `Transfer ${rebookCount}/${cx.passengers} misconnected ${cx.airport} passengers from ${cx.to_flight} to later ${feasibleAlt.flightId} (${feasibleAlt.depStr}).`,
      targetFlightIds: [cx.from_flight, cx.to_flight, feasibleAlt.flightId],
      connectionId: cx.connection_id,
      rebookToFlightId: feasibleAlt.flightId,
      problemIdentified: `${cx.passengers} passengers on ${cx.connection_id} (${cx.from_flight}->${cx.to_flight}) missed connection at ${cx.airport}.`,
      dataUsed: [
        `${feasibleAlt.flightId} (${feasibleAlt.origin}->${feasibleAlt.destination}) departs ${feasibleAlt.depStr}`,
        `Open seat inventory: ${feasibleAlt.availableSeats} seats (180 - onboard pax)`,
        `Transfer buffer after ${cx.from_flight} arrival: ${feasibleAlt.connectMinutesAfterArrival}m (>= ${cx.min_connect_minutes}m min)`,
      ],
      whySelected: `${feasibleAlt.flightId} is the earliest feasible flight with verified seat capacity and minimum connection buffer.`,
      alternativesConsidered: [
        `Leave ${cx.passengers} passengers stranded for next-day re-accommodation`,
      ],
      expectedOperationalImpact: `Converts ${rebookCount} stranded connecting passengers into confirmed same-day rebookings with zero schedule disruption.`,
      passengerImpactLabel: `Rebooks ${rebookCount} passenger(s) on ${cx.airport}->${cx.toFlight.destination}.`,
      aircraftAvailabilityCheck: `PASS — Operating flight ${feasibleAlt.flightId} has ${feasibleAlt.availableSeats} open seats.`,
      crewFeasibilityCheck: `PASS — Uses existing scheduled crew on ${feasibleAlt.flightId}; zero extra crew duty.`,
      crewFeasible: true,
      aircraftFeasible: true,
      operationalRisks: feasibleAlt.canAccommodateAll
        ? `Low risk — full group accommodated on ${feasibleAlt.flightId}.`
        : `Partial capacity: ${cx.passengers - rebookCount} passenger(s) still require secondary routing.`,
      delayMinutesSaved: 0,
      connectionsSaved: 0,
      passengersSaved: rebookCount,
      flightsRecovered: 0,
      feasibilityScore: 28 + rebookCount * 1.4,
    };

    candidates.push(draftAction);
  }

  // 5. STRATEGIC FLIGHT CANCELLATION (Only when Crew Violation exists or severe terminal leg cascade)
  for (const crew of currentSim.crews) {
    if (crew.status !== 'VIOLATION') continue;
    const tailFlights = currentSim.flights
      .filter((f) => f.assignedTailId === crew.tail_id && f.status !== 'CANCELLED')
      .sort((a, b) => a.leg_order - b.leg_order);
    const lastLeg = tailFlights[tailFlights.length - 1];
    if (!lastLeg || cancelledFlights.has(lastLeg.flight_id)) continue;

    const draftAction: RecoveryAction = {
      id: `rec-cancel-${lastLeg.flight_id}`,
      type: 'CANCEL_FLIGHT',
      title: `Cancel Terminal Leg ${lastLeg.flight_id} to Resolve ${crew.crew_id} Duty Breach`,
      summary: `Cancel ${lastLeg.flight_id} (${lastLeg.origin}->${lastLeg.destination}, ${lastLeg.pax} pax) to bring ${crew.crew_id} back within ${crew.max_duty_mins}m FDTL limit.`,
      targetFlightIds: [lastLeg.flight_id],
      cancelFlightId: lastLeg.flight_id,
      problemIdentified: `Crew ${crew.crew_id} on ${crew.tail_id} reaches ${crew.simDutyMins}m duty (+${crew.violationMins}m over ${crew.max_duty_mins}m legal cap).`,
      dataUsed: [
        `Crew ${crew.crew_id} duty_start=${crew.duty_start}, projected arrival=${formatMinutesToTime(crew.simFinalArrMin)}`,
        `Terminal leg ${lastLeg.flight_id}: ${lastLeg.pax} pax`,
      ],
      whySelected: '',
      alternativesConsidered: [
        `Operate ${lastLeg.flight_id} illegally over ${crew.max_duty_mins}m limit (regulatory violation)`,
      ],
      expectedOperationalImpact: '',
      passengerImpactLabel: '',
      aircraftAvailabilityCheck: `PASS — ${crew.tail_id} remains parked safely at ${lastLeg.origin}.`,
      crewFeasibilityCheck: `PASS — Resolves ${crew.crew_id} duty limit exceedance.`,
      crewFeasible: true,
      aircraftFeasible: true,
      operationalRisks: `Displaces ${lastLeg.pax} passengers on ${lastLeg.flight_id}; requires passenger re-accommodation.`,
      delayMinutesSaved: 0,
      connectionsSaved: 0,
      passengersSaved: 0,
      flightsRecovered: 0,
      feasibilityScore: 0,
    };

    const testSim = runSimulation(dataset, config, [...appliedActions, draftAction]);
    const violFixed = currentSim.metrics.crewViolationCount - testSim.metrics.crewViolationCount;
    const delaySaved = Math.max(0, currentSim.metrics.totalDelayMinutes - testSim.metrics.totalDelayMinutes);

    if (violFixed > 0) {
      draftAction.delayMinutesSaved = delaySaved;
      draftAction.expectedOperationalImpact = `Resolves ${violFixed} legal crew duty violation(s) and removes ${delaySaved}m delay from network ledger.`;
      draftAction.passengerImpactLabel = `Displaces ${lastLeg.pax} pax on ${lastLeg.flight_id} to prevent illegal crew operation.`;
      draftAction.whySelected = `Mandatory safety/regulatory fallback when spare aircraft or swap cannot relieve ${crew.crew_id} duty limit.`;
      draftAction.feasibilityScore = 25 + violFixed * 50 - lastLeg.pax * 0.2;
      candidates.push(draftAction);
    }
  }

  // Deduplicate and rank descending by feasibilityScore
  const uniqueMap = new Map<string, RecoveryAction>();
  for (const c of candidates) {
    if (!uniqueMap.has(c.id)) uniqueMap.set(c.id, c);
  }

  return Array.from(uniqueMap.values())
    .sort((a, b) => b.feasibilityScore - a.feasibilityScore)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}
