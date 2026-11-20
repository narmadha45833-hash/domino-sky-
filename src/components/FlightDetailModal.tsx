import React from 'react';
import { Clock, Plane, ShieldAlert, Users, X, Zap } from 'lucide-react';
import {
  FlightNetworkDataset,
  RecoveryAction,
  SimulationResult,
} from '../types/aviation';
import { formatMinutesToTime, parseTimeToMinutes } from '../engine/time';

interface FlightDetailModalProps {
  flightId: string | null;
  dataset: FlightNetworkDataset;
  sim: SimulationResult;
  onClose: () => void;
  onSelectFlight: (flightId: string) => void;
  onApplyRecovery: (action: RecoveryAction) => void;
}

export const FlightDetailModal: React.FC<FlightDetailModalProps> = ({
  flightId,
  dataset,
  sim,
  onClose,
  onSelectFlight,
  onApplyRecovery,
}) => {
  if (!flightId) return null;

  const flight = sim.flights.find((f) => f.flight_id === flightId);
  if (!flight) return null;

  const tailFlights = sim.flights
    .filter((f) => f.assignedTailId === flight.assignedTailId)
    .sort((a, b) => a.schedDepMin - b.schedDepMin);

  const crew = sim.crews.find((c) => c.tail_id === flight.assignedTailId);
  const relatedConnections = sim.connections.filter(
    (c) => c.from_flight === flight.flight_id || c.to_flight === flight.flight_id
  );

  // Check if a standby spare is available at this flight's origin
  const availableSpareHere = dataset.spare_aircraft.find((sp) => {
    const alreadyDeployed = sim.appliedActions.some(
      (a) => a.type === 'DEPLOY_SPARE' && a.spareTailId === sp.tail_id
    );
    return (
      !alreadyDeployed &&
      sp.base === flight.origin &&
      flight.schedDepMin >= parseTimeToMinutes(sp.available_from)
    );
  });

  const handleManualHold = (extraMinutes: number) => {
    const totalHoldFromSched = flight.depDelayMin + extraMinutes;
    const targetTime = formatMinutesToTime(flight.schedDepMin + totalHoldFromSched);
    onApplyRecovery({
      id: `manual-hold-${flight.flight_id}-${totalHoldFromSched}-${Date.now()}`,
      type: 'HOLD_FLIGHT',
      title: `Manual Hold: ${flight.flight_id} until ${targetTime} (+${extraMinutes}m)`,
      summary: `Dispatcher manually held ${flight.flight_id} (${flight.origin}->${flight.destination}) by +${extraMinutes}m.`,
      targetFlightIds: [flight.flight_id],
      holdMinutes: totalHoldFromSched,
      problemIdentified: `Manual dispatcher intervention on ${flight.flight_id}.`,
      dataUsed: [`Current predicted departure ${flight.predDepStr}`],
      whySelected: 'Direct dispatcher override from Flight Dossier.',
      alternativesConsidered: ['Maintain current departure projection'],
      expectedOperationalImpact: `Shifts ${flight.flight_id} departure to ${targetTime}.`,
      passengerImpactLabel: `Affects ${flight.pax} onboard pax and downstream connections.`,
      aircraftAvailabilityCheck: `PASS — ${flight.assignedTailId} at ${flight.origin}`,
      crewFeasibilityCheck: crew
        ? `${crew.dutyRemainingMins >= extraMinutes ? 'PASS' : 'WARNING'} — Crew ${crew.crew_id} has ${crew.dutyRemainingMins}m remaining`
        : 'Standby crew',
      crewFeasible: crew ? crew.dutyRemainingMins >= extraMinutes : true,
      aircraftFeasible: true,
      operationalRisks: 'May propagate turnaround delay to subsequent legs.',
      delayMinutesSaved: 0,
      connectionsSaved: 0,
      passengersSaved: 0,
      flightsRecovered: 0,
      feasibilityScore: 50,
    });
  };

  const handleManualCancel = () => {
    onApplyRecovery({
      id: `manual-cancel-${flight.flight_id}-${Date.now()}`,
      type: 'CANCEL_FLIGHT',
      title: `Manual Cancel: ${flight.flight_id} (${flight.origin}->${flight.destination})`,
      summary: `Dispatcher manually cancelled ${flight.flight_id}.`,
      targetFlightIds: [flight.flight_id],
      cancelFlightId: flight.flight_id,
      problemIdentified: `Manual dispatcher cancellation of ${flight.flight_id}.`,
      dataUsed: [`Flight ${flight.flight_id} (${flight.pax} pax)`],
      whySelected: 'Direct dispatcher cancellation from Flight Dossier.',
      alternativesConsidered: ['Operate delayed'],
      expectedOperationalImpact: `Cancels ${flight.flight_id} and frees ${flight.assignedTailId} from this leg.`,
      passengerImpactLabel: `${flight.pax} passengers require rebooking.`,
      aircraftAvailabilityCheck: `PASS — ${flight.assignedTailId} remains at ${flight.origin}`,
      crewFeasibilityCheck: 'PASS — Reduces crew flight workload',
      crewFeasible: true,
      aircraftFeasible: true,
      operationalRisks: 'May leave tail out of station for subsequent legs if not swapped.',
      delayMinutesSaved: Math.max(flight.depDelayMin, flight.arrDelayMin),
      connectionsSaved: 0,
      passengersSaved: 0,
      flightsRecovered: 0,
      feasibilityScore: 30,
    });
  };

  const handleManualSpare = () => {
    if (!availableSpareHere) return;
    const chain = tailFlights
      .filter((f) => f.leg_order >= flight.leg_order && f.status !== 'CANCELLED')
      .map((f) => f.flight_id);
    onApplyRecovery({
      id: `manual-spare-${availableSpareHere.tail_id}-${flight.flight_id}-${Date.now()}`,
      type: 'DEPLOY_SPARE',
      title: `Manual Spare Deploy: ${availableSpareHere.tail_id} for ${chain.join(', ')}`,
      summary: `Dispatcher assigned standby spare ${availableSpareHere.tail_id} at ${availableSpareHere.base} to ${chain.join(', ')}.`,
      targetFlightIds: chain,
      spareTailId: availableSpareHere.tail_id,
      problemIdentified: `Dispatcher elected to swap ${flight.assignedTailId} out for standby spare ${availableSpareHere.tail_id}.`,
      dataUsed: [`Spare ${availableSpareHere.tail_id} available at ${availableSpareHere.base} from ${availableSpareHere.available_from}`],
      whySelected: 'Direct dispatcher spare assignment.',
      alternativesConsidered: ['Wait for inbound tail'],
      expectedOperationalImpact: `Assigns ${availableSpareHere.tail_id} to ${chain.length} leg(s) from ${flight.origin}.`,
      passengerImpactLabel: `Protects ${chain.length} downstream leg(s).`,
      aircraftAvailabilityCheck: `PASS — ${availableSpareHere.tail_id} standby at ${flight.origin}`,
      crewFeasibilityCheck: `PASS — Uses ${flight.origin} standby reserve crew`,
      crewFeasible: true,
      aircraftFeasible: true,
      operationalRisks: 'Consumes one of two network spare aircraft.',
      delayMinutesSaved: 0,
      connectionsSaved: 0,
      passengersSaved: 0,
      flightsRecovered: chain.length,
      feasibilityScore: 60,
    });
  };

  const statusColors =
    flight.status === 'CANCELLED'
      ? 'bg-red-100 text-red-800 border-red-200'
      : flight.status === 'DELAYED'
      ? 'bg-orange-100 text-orange-800 border-orange-200'
      : 'bg-emerald-100 text-emerald-800 border-emerald-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#081224] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <Plane className="h-5 w-5 text-cyan-400" />
            <div>
              <h3 className="font-mono text-base font-bold">
                {flight.flight_id} · {flight.origin} → {flight.destination}
              </h3>
              <p className="text-xs text-slate-300">
                Aircraft {flight.assignedTailId} (Leg #{flight.leg_order}) · {flight.pax} / 180 passengers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close flight details"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto p-5 space-y-5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`rounded border px-2.5 py-1 font-mono font-bold ${statusColors}`}>
              {flight.status}
              {flight.status === 'DELAYED'
                ? ` (+${Math.max(flight.depDelayMin, flight.arrDelayMin)}m)`
                : ''}
            </span>
            <span className="font-mono text-slate-500">
              Source: {flight.disruptionSource.replace(/_/g, ' ')}
              {flight.cascadeRootFlightId ? ` · Root: ${flight.cascadeRootFlightId}` : ''}
              {flight.slotMeteredDelayMin > 0 ? ` · Slot Metering +${flight.slotMeteredDelayMin}m` : ''}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-[#F0F7FF] p-3">
              <div className="text-slate-500">Sched Dep / Arr</div>
              <div className="mt-1 font-mono text-sm font-bold text-slate-900">
                {flight.dep} – {flight.arr}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-[#F0F7FF] p-3">
              <div className="text-slate-500">Pred Dep / Arr</div>
              <div className="mt-1 font-mono text-sm font-bold text-slate-900">
                {flight.predDepStr} – {flight.predArrStr}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-slate-500">Block / Turnaround</div>
              <div className="mt-1 font-mono text-sm font-bold text-slate-900">
                {flight.block_minutes}m / {flight.turnaroundAvailableMin ?? '--'}m
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-slate-500">Crew Duty</div>
              <div className="mt-1 font-mono text-sm font-bold text-slate-900">
                {crew ? `${crew.crew_id} (${crew.simDutyMins}m)` : 'Standby Reserve'}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-blue-600" />
              Deterministic Disruption Explanation
            </div>
            <p className="mt-1 text-slate-700 leading-relaxed">{flight.reason}</p>
          </div>

          {/* Manual Dispatcher Controls */}
          {flight.status !== 'CANCELLED' && (
            <div className="rounded-lg border border-sky-200 bg-[#F0F7FF] p-3.5 space-y-2.5">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-blue-700" />
                Manual Dispatcher Intervention
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleManualHold(15)}
                  className="rounded-md border border-blue-300 bg-white px-3 py-1.5 font-semibold text-blue-800 hover:bg-blue-50"
                >
                  Hold +15m
                </button>
                <button
                  type="button"
                  onClick={() => handleManualHold(30)}
                  className="rounded-md border border-blue-300 bg-white px-3 py-1.5 font-semibold text-blue-800 hover:bg-blue-50"
                >
                  Hold +30m
                </button>
                {availableSpareHere && !flight.isSpareAssigned && (
                  <button
                    type="button"
                    onClick={handleManualSpare}
                    className="rounded-md bg-purple-600 px-3 py-1.5 font-semibold text-white hover:bg-purple-700"
                  >
                    Assign Spare {availableSpareHere.tail_id} ({availableSpareHere.base})
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleManualCancel}
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Cancel Flight
                </button>
              </div>
            </div>
          )}

          {/* Aircraft Rotation Chain */}
          <div>
            <h4 className="font-bold text-slate-900 mb-2">
              Aircraft {flight.assignedTailId} Rotation Chain ({tailFlights.length} legs)
            </h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {tailFlights.map((leg) => (
                <button
                  key={leg.flight_id}
                  type="button"
                  onClick={() => onSelectFlight(leg.flight_id)}
                  className={`flex items-center justify-between rounded-lg border p-2.5 text-left transition-colors ${
                    leg.flight_id === flight.flight_id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="font-mono font-bold text-slate-900">
                      L{leg.leg_order}: {leg.flight_id} ({leg.origin}→{leg.destination})
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {leg.dep}→{leg.arr} · Pred {leg.predDepStr}→{leg.predArrStr}
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      leg.status === 'CANCELLED'
                        ? 'text-red-600'
                        : leg.status === 'DELAYED'
                        ? 'text-orange-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {leg.status === 'DELAYED'
                      ? `+${Math.max(leg.depDelayMin, leg.arrDelayMin)}m`
                      : leg.status}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Connections */}
          <div>
            <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-blue-600" />
              Linked Passenger Connections ({relatedConnections.length})
            </h4>
            {relatedConnections.length === 0 ? (
              <p className="text-slate-500">No dataset passenger connections linked to this flight.</p>
            ) : (
              <div className="space-y-1.5">
                {relatedConnections.map((cx) => (
                  <div
                    key={cx.connection_id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <span className="font-mono font-semibold text-slate-800">
                      {cx.connection_id} @ {cx.airport}: {cx.from_flight} → {cx.to_flight} ({cx.passengers} pax)
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        cx.status === 'MADE' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {cx.status === 'MADE'
                        ? `MADE (${cx.availableConnectMin}m)`
                        : cx.rebookedToFlightId
                        ? `REBOOKED (${cx.rebookedToFlightId})`
                        : `MISSED (${cx.availableConnectMin ?? '--'}m / ${cx.min_connect_minutes}m)`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
