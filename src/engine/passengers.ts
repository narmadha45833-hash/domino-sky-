import {
  AlternativeFlightOption,
  FlightNetworkDataset,
  PassengerImpactSummary,
  RecoveryAction,
  SimulatedConnection,
  SimulatedFlight,
} from '../types/aviation';

export function evaluateConnectionsAndPassengers(
  dataset: FlightNetworkDataset,
  simFlights: SimulatedFlight[],
  appliedActions: RecoveryAction[]
): {
  connections: SimulatedConnection[];
  passengerImpact: PassengerImpactSummary;
} {
  const flightMap = new Map(simFlights.map((f) => [f.flight_id, f]));

  // Check if any REBOOK_PASSENGERS recovery action rebooked specific connections
  const rebookedMap = new Map<string, string>();
  for (const action of appliedActions) {
    if (action.type === 'REBOOK_PASSENGERS' && action.connectionId && action.rebookToFlightId) {
      rebookedMap.set(action.connectionId, action.rebookToFlightId);
    }
  }

  const connections: SimulatedConnection[] = dataset.connections.map((cx) => {
    const fromFlight = flightMap.get(cx.from_flight)!;
    const toFlight = flightMap.get(cx.to_flight)!;

    let status: SimulatedConnection['status'] = 'MADE';
    let availableConnectMin: number | null = null;
    let shortfallMin = 0;

    if (fromFlight.status === 'CANCELLED' || toFlight.status === 'CANCELLED') {
      status = 'MISSED_CANCELLATION';
      shortfallMin = cx.min_connect_minutes;
    } else if (fromFlight.predArrMin !== null && toFlight.predDepMin !== null) {
      availableConnectMin = toFlight.predDepMin - fromFlight.predArrMin;
      if (availableConnectMin < cx.min_connect_minutes) {
        status = 'MISSED_DELAY';
        shortfallMin = cx.min_connect_minutes - availableConnectMin;
      }
    }

    // Find feasible alternative flights from cx.airport -> toFlight.destination
    const alternativeOptions: AlternativeFlightOption[] = [];
    if (status !== 'MADE') {
      const candidates = simFlights
        .filter(
          (f) =>
            f.flight_id !== toFlight.flight_id &&
            f.origin === cx.airport &&
            f.destination === toFlight.destination &&
            f.status !== 'CANCELLED'
        )
        .sort((a, b) => (a.predDepMin ?? a.schedDepMin) - (b.predDepMin ?? b.schedDepMin));

      for (const cand of candidates) {
        const availableSeats = Math.max(0, dataset.meta.seats_per_aircraft - cand.pax);
        const canAccommodateAll = availableSeats >= cx.passengers;
        const connectMinutesAfterArrival =
          fromFlight.status !== 'CANCELLED' && fromFlight.predArrMin !== null && cand.predDepMin !== null
            ? cand.predDepMin - fromFlight.predArrMin
            : null;
        const feasible =
          connectMinutesAfterArrival !== null &&
          connectMinutesAfterArrival >= cx.min_connect_minutes &&
          availableSeats > 0;

        let note = '';
        if (fromFlight.status === 'CANCELLED') {
          note = `Inbound ${fromFlight.flight_id} cancelled; requires origin rebooking first.`;
        } else if (connectMinutesAfterArrival === null || connectMinutesAfterArrival < cx.min_connect_minutes) {
          note = `Departs too early (${connectMinutesAfterArrival ?? '--'}m < ${cx.min_connect_minutes}m min connect).`;
        } else if (!canAccommodateAll) {
          note = `Partial capacity: ${availableSeats} open seats for ${cx.passengers} connecting pax.`;
        } else {
          note = `Feasible: ${connectMinutesAfterArrival}m connect window, ${availableSeats} seats open.`;
        }

        alternativeOptions.push({
          flightId: cand.flight_id,
          origin: cand.origin,
          destination: cand.destination,
          depStr: cand.predDepStr,
          arrStr: cand.predArrStr,
          availableSeats,
          canAccommodateAll,
          connectMinutesAfterArrival,
          feasible,
          note,
        });
      }
    }

    const urgency: SimulatedConnection['urgency'] =
      status === 'MADE'
        ? 'LOW'
        : cx.passengers >= 35 || status === 'MISSED_CANCELLATION'
        ? 'CRITICAL'
        : cx.passengers >= 20
        ? 'HIGH'
        : 'MEDIUM';

    return {
      ...cx,
      fromFlight,
      toFlight,
      availableConnectMin,
      shortfallMin,
      status,
      urgency,
      rebookedToFlightId: status !== 'MADE' ? rebookedMap.get(cx.connection_id) : undefined,
      alternativeOptions,
    };
  });

  // Deduplicated passenger calculations
  const totalScheduledPaxBoardings = simFlights.reduce((sum, f) => sum + f.pax, 0);
  const totalUniqueConnectingPax = connections.reduce((sum, c) => sum + c.passengers, 0);

  const affectedFlights = simFlights.filter((f) => f.status !== 'ON_TIME');
  const affectedFlightIds = new Set(affectedFlights.map((f) => f.flight_id));

  const affectedFlightBoardingsRaw = affectedFlights.reduce((sum, f) => sum + f.pax, 0);

  // Connecting passengers whose BOTH legs are in affectedFlights are counted twice in raw boardings sum
  const doubleCountedConnectingPax = connections.reduce((sum, cx) => {
    if (affectedFlightIds.has(cx.from_flight) && affectedFlightIds.has(cx.to_flight)) {
      return sum + cx.passengers;
    }
    return sum;
  }, 0);

  const uniqueAffectedPassengers = Math.max(0, affectedFlightBoardingsRaw - doubleCountedConnectingPax);

  const delayedFlights = simFlights.filter((f) => f.status === 'DELAYED');
  const delayedFlightIds = new Set(delayedFlights.map((f) => f.flight_id));
  const delayedDoubleCount = connections.reduce((sum, cx) => {
    if (delayedFlightIds.has(cx.from_flight) && delayedFlightIds.has(cx.to_flight)) {
      return sum + cx.passengers;
    }
    return sum;
  }, 0);
  const delayedPassengers = Math.max(
    0,
    delayedFlights.reduce((sum, f) => sum + f.pax, 0) - delayedDoubleCount
  );

  const cancelledFlights = simFlights.filter((f) => f.status === 'CANCELLED');
  const cancelledFlightIds = new Set(cancelledFlights.map((f) => f.flight_id));
  const cancelledDoubleCount = connections.reduce((sum, cx) => {
    if (cancelledFlightIds.has(cx.from_flight) && cancelledFlightIds.has(cx.to_flight)) {
      return sum + cx.passengers;
    }
    return sum;
  }, 0);
  const cancelledFlightPassengers = Math.max(
    0,
    cancelledFlights.reduce((sum, f) => sum + f.pax, 0) - cancelledDoubleCount
  );

  const missedConnections = connections.filter((c) => c.status !== 'MADE');
  const missedConnectionPassengers = missedConnections.reduce((sum, c) => sum + c.passengers, 0);

  // Avoid double-counting: if a missed connection's from_flight or to_flight is ALREADY counted in cancelledFlightPassengers,
  // only add missed-connection passengers from non-cancelled flights to compute total needing rebooking!
  const missedNonCancelledConnectingPax = missedConnections.reduce((sum, cx) => {
    if (cancelledFlightIds.has(cx.from_flight) || cancelledFlightIds.has(cx.to_flight)) {
      return sum;
    }
    return sum + cx.passengers;
  }, 0);

  const passengersNeedingRebooking = cancelledFlightPassengers + missedNonCancelledConnectingPax;

  // Rebooked passengers from applied REBOOK_PASSENGERS actions
  const rebookedPassengers = missedConnections.reduce((sum, cx) => {
    if (!cx.rebookedToFlightId) return sum;
    const alt = cx.alternativeOptions.find((o) => o.flightId === cx.rebookedToFlightId);
    if (!alt) return sum;
    return sum + Math.min(cx.passengers, alt.availableSeats);
  }, 0);

  const strandedPassengers = Math.max(0, passengersNeedingRebooking - rebookedPassengers);

  return {
    connections,
    passengerImpact: {
      totalScheduledPaxBoardings,
      totalUniqueConnectingPax,
      affectedFlightBoardingsRaw,
      doubleCountedConnectingPax,
      uniqueAffectedPassengers,
      delayedPassengers,
      missedConnectionPassengers,
      cancelledFlightPassengers,
      passengersNeedingRebooking,
      rebookedPassengers,
      strandedPassengers,
    },
  };
}
