import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, Users } from 'lucide-react';
import { RecoveryAction, SimulationResult } from '../types/aviation';
import { formatMinutesToTime } from '../engine/time';

interface CrewPassengersSectionProps {
  sim: SimulationResult;
  onApplyRecovery: (action: RecoveryAction) => void;
  onSelectFlight: (flightId: string) => void;
}

export const CrewPassengersSection: React.FC<CrewPassengersSectionProps> = ({
  sim,
  onApplyRecovery,
  onSelectFlight,
}) => {
  const [view, setView] = useState<'PASSENGERS' | 'CREW'>('PASSENGERS');
  const [connFilter, setConnFilter] = useState<'ALL' | 'MISSED' | 'MADE'>('ALL');

  const filteredConns = sim.connections.filter((c) => {
    if (connFilter === 'MISSED') return c.status !== 'MADE';
    if (connFilter === 'MADE') return c.status === 'MADE';
    return true;
  });

  const handleQuickRebook = (
    cx: SimulationResult['connections'][number],
    altFlightId: string,
    availableSeats: number,
    connectMins: number | null
  ) => {
    const rebookCount = Math.min(cx.passengers, availableSeats);
    const action: RecoveryAction = {
      id: `rec-rebook-${cx.connection_id}-${altFlightId}`,
      type: 'REBOOK_PASSENGERS',
      title: `Rebook ${cx.connection_id} (${rebookCount} pax) onto ${altFlightId}`,
      summary: `Rebook ${rebookCount}/${cx.passengers} passengers from ${cx.to_flight} onto ${altFlightId} at ${cx.airport}.`,
      targetFlightIds: [cx.from_flight, cx.to_flight, altFlightId],
      connectionId: cx.connection_id,
      rebookToFlightId: altFlightId,
      problemIdentified: `Connection ${cx.connection_id} missed at ${cx.airport}.`,
      dataUsed: [`${altFlightId} has ${availableSeats} open seats; ${connectMins}m connect window`],
      whySelected: 'Operator selected feasible alternative flight in Passenger Assistance Centre.',
      alternativesConsidered: ['Leave passengers stranded'],
      expectedOperationalImpact: `Rebooks ${rebookCount} connecting passengers onto same-day service.`,
      passengerImpactLabel: `${rebookCount} pax rebooked`,
      aircraftAvailabilityCheck: `PASS — ${availableSeats} open seats on ${altFlightId}`,
      crewFeasibilityCheck: 'PASS — Existing crew on operating flight',
      crewFeasible: true,
      aircraftFeasible: true,
      operationalRisks: 'None',
      delayMinutesSaved: 0,
      connectionsSaved: 0,
      passengersSaved: rebookCount,
      flightsRecovered: 0,
      feasibilityScore: 50,
    };
    onApplyRecovery(action);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setView('PASSENGERS')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              view === 'PASSENGERS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Passenger Assistance Centre ({sim.connections.length} connections)
          </button>
          <button
            type="button"
            onClick={() => setView('CREW')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              view === 'CREW' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Crew Management System ({sim.crews.length} crews)
          </button>
        </div>

        <span className="font-mono text-xs text-slate-500">
          {view === 'PASSENGERS'
            ? `Deduplicated unique affected pax: ${sim.passengerImpact.uniqueAffectedPassengers}`
            : `FDTL Max Duty Limit: 600 min (10h)`}
        </span>
      </div>

      {/* PASSENGER ASSISTANCE CENTRE */}
      {view === 'PASSENGERS' && (
        <div className="space-y-5">
          {/* Deduplicated Passenger Summary */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Unique Affected Pax</div>
              <div className="mt-1 font-mono text-2xl font-bold text-slate-900">
                {sim.passengerImpact.uniqueAffectedPassengers}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                -{sim.passengerImpact.doubleCountedConnectingPax} overlap removed
              </div>
            </div>
            <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4">
              <div className="text-xs text-orange-800">On Delayed Flights</div>
              <div className="mt-1 font-mono text-2xl font-bold text-orange-700">
                {sim.passengerImpact.delayedPassengers}
              </div>
              <div className="mt-0.5 text-[11px] text-orange-700">Not stranded unless missed</div>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
              <div className="text-xs text-red-800">Missed Connections</div>
              <div className="mt-1 font-mono text-2xl font-bold text-red-700">
                {sim.passengerImpact.missedConnectionPassengers}
              </div>
              <div className="mt-0.5 text-[11px] text-red-700">
                Across {sim.metrics.missedConnectionsCount} connection(s)
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Cancelled Flights Pax</div>
              <div className="mt-1 font-mono text-2xl font-bold text-slate-900">
                {sim.passengerImpact.cancelledFlightPassengers}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">Requires full rebooking</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="text-xs text-emerald-800">Rebooked Pax</div>
              <div className="mt-1 font-mono text-2xl font-bold text-emerald-700">
                {sim.passengerImpact.rebookedPassengers}
              </div>
              <div className="mt-0.5 text-[11px] text-emerald-700">Confirmed alternate flights</div>
            </div>
            <div className="rounded-xl border border-sky-200 bg-[#F0F7FF] p-4">
              <div className="text-xs text-blue-800">Stranded / Unresolved</div>
              <div className="mt-1 font-mono text-2xl font-bold text-blue-900">
                {sim.passengerImpact.strandedPassengers}
              </div>
              <div className="mt-0.5 text-[11px] text-blue-700">Immediate assistance needed</div>
            </div>
          </div>

          {/* Connection Filter & Table */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-700" />
                  Passenger Connection & Rebooking Matrix
                </h3>
                <p className="text-xs text-slate-600">
                  Prioritized by urgency and actual dataset connection passenger counts. Feasible alternatives verify both minimum connect buffer and open seats (180 - onboard pax).
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(['ALL', 'MISSED', 'MADE'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setConnFilter(f)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${
                      connFilter === f ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {filteredConns.map((cx) => {
                const statusBadge =
                  cx.status === 'MADE'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : cx.rebookedToFlightId
                    ? 'bg-sky-100 text-blue-800 border-sky-200'
                    : 'bg-red-100 text-red-800 border-red-200';

                return (
                  <div
                    key={cx.connection_id}
                    className="rounded-xl border border-slate-200 p-4 text-xs space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {cx.connection_id} @ {cx.airport}
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectFlight(cx.from_flight)}
                          className="font-mono font-semibold text-blue-700 hover:underline"
                        >
                          {cx.from_flight} (Arr {cx.fromFlight.predArrStr})
                        </button>
                        <span className="text-slate-400">→</span>
                        <button
                          type="button"
                          onClick={() => onSelectFlight(cx.to_flight)}
                          className="font-mono font-semibold text-blue-700 hover:underline"
                        >
                          {cx.to_flight} (Dep {cx.toFlight.predDepStr})
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">
                          {cx.passengers} pax
                        </span>
                        <span className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${statusBadge}`}>
                          {cx.rebookedToFlightId
                            ? `REBOOKED → ${cx.rebookedToFlightId}`
                            : cx.status === 'MADE'
                            ? 'MADE'
                            : `${cx.urgency} · MISSED`}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-slate-600">
                      <span>
                        Required Min Connect: <strong className="font-mono">{cx.min_connect_minutes}m</strong>
                      </span>
                      <span>
                        Available Window:{' '}
                        <strong className={`font-mono ${cx.status === 'MADE' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {cx.availableConnectMin !== null ? `${cx.availableConnectMin}m` : 'Flight Cancelled'}
                        </strong>
                      </span>
                      {cx.status !== 'MADE' && (
                        <span className="text-red-700 font-medium">
                          Shortfall: {cx.shortfallMin}m
                        </span>
                      )}
                    </div>

                    {cx.status !== 'MADE' && !cx.rebookedToFlightId && (
                      <div className="rounded-lg border border-sky-200 bg-[#F0F7FF] p-3">
                        <div className="font-semibold text-slate-900 mb-1.5">
                          Alternative Feasible Connections ({cx.airport} → {cx.toFlight.destination}):
                        </div>
                        {cx.alternativeOptions.length === 0 ? (
                          <div className="text-slate-600">
                            No remaining same-day direct flights on {cx.airport} → {cx.toFlight.destination}; consider holding {cx.to_flight} or deploying a spare aircraft in AI Dispatcher.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {cx.alternativeOptions.map((alt) => (
                              <div
                                key={alt.flightId}
                                className="flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-white px-3 py-2"
                              >
                                <div>
                                  <span className="font-mono font-bold text-slate-900">
                                    {alt.flightId} ({alt.depStr}→{alt.arrStr})
                                  </span>
                                  <div className="text-[11px] text-slate-600">{alt.note}</div>
                                </div>
                                {alt.feasible && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuickRebook(
                                        cx,
                                        alt.flightId,
                                        alt.availableSeats,
                                        alt.connectMinutesAfterArrival
                                      )
                                    }
                                    className="rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
                                  >
                                    Rebook {Math.min(cx.passengers, alt.availableSeats)} Pax
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CREW MANAGEMENT SYSTEM */}
      {view === 'CREW' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-sky-200 bg-[#F0F7FF] p-4 text-xs text-slate-700">
            <strong className="text-slate-900">Crew Feasibility & Operational Limitations:</strong>{' '}
            Every crew in <span className="font-mono">flight_network.json</span> is tied to a specific aircraft tail (<span className="font-mono">tail_id</span>) and home base with a strict <span className="font-mono">max_duty_mins = 600m</span> limit from <span className="font-mono">duty_start</span> through final arrival. Recovery actions automatically verify crew duty headroom and station presence before approval.
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-4 py-3 font-semibold">Crew ID</th>
                  <th className="px-4 py-3 font-semibold">Aircraft</th>
                  <th className="px-4 py-3 font-semibold">Base</th>
                  <th className="px-4 py-3 font-semibold">Assigned Flights</th>
                  <th className="px-4 py-3 font-semibold">Duty Start</th>
                  <th className="px-4 py-3 font-semibold">Final Arrival (Sim)</th>
                  <th className="px-4 py-3 font-semibold text-right">Duty Duration</th>
                  <th className="px-4 py-3 font-semibold text-right">Max Limit</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sim.crews.map((cr) => {
                  const statusBadge =
                    cr.status === 'VIOLATION'
                      ? 'bg-red-100 text-red-800'
                      : cr.status === 'WARNING'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800';
                  return (
                    <tr key={cr.crew_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{cr.crew_id}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-blue-800">{cr.tail_id}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{cr.base}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {cr.flight_ids.join(', ')}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">{cr.duty_start}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {formatMinutesToTime(cr.simFinalArrMin)}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-right">
                        <span className={cr.status === 'VIOLATION' ? 'text-red-600' : 'text-slate-900'}>
                          {cr.simDutyMins}m
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-right text-slate-600">{cr.max_duty_mins}m</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-bold ${statusBadge}`}>
                          {cr.status === 'VIOLATION' ? (
                            <ShieldAlert className="h-3 w-3" />
                          ) : cr.status === 'WARNING' ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          {cr.status}
                        </span>
                        <div className="mt-0.5 text-[11px] text-slate-500">{cr.notes}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
