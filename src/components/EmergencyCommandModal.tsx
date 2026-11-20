import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plane, ShieldAlert, Users, X, Zap } from 'lucide-react';
import {
  RecoveryAction,
  SimulationResult,
} from '../types/aviation';
import { generateEmergencyAlerts } from '../engine/analytics';

interface EmergencyCommandModalProps {
  open: boolean;
  sim: SimulationResult;
  recommendations: RecoveryAction[];
  onClose: () => void;
  onApplyRecovery: (action: RecoveryAction) => void;
  onApplyAllOptimal: () => void;
  onSelectFlight: (flightId: string) => void;
}

export const EmergencyCommandModal: React.FC<EmergencyCommandModalProps> = ({
  open,
  sim,
  recommendations,
  onClose,
  onApplyRecovery,
  onApplyAllOptimal,
  onSelectFlight,
}) => {
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');

  const alerts = useMemo(() => generateEmergencyAlerts(sim), [sim]);

  if (!open) return null;

  const filteredAlerts = alerts.filter((a) =>
    priorityFilter === 'ALL' ? true : a.priority === priorityFilter
  );

  const topAirport = [...sim.airportRisks].sort((a, b) => b.riskScore - a.riskScore)[0];
  const topAircraft = [...sim.aircraft]
    .filter((a) => !a.isSpare)
    .sort((a, b) => b.totalDelayMins - a.totalDelayMins)[0];
  const urgentFlights = [...sim.flights]
    .filter((f) => f.status !== 'ON_TIME')
    .sort((a, b) => Math.max(b.depDelayMin, b.arrDelayMin) - Math.max(a.depDelayMin, a.arrDelayMin))
    .slice(0, 6);
  const missedConnections = sim.connections.filter((c) => c.status !== 'MADE');
  const crewWarnings = sim.crews.filter((c) => c.status !== 'LEGAL');
  const spares = sim.aircraft.filter((a) => a.isSpare);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#050c1b] text-slate-100 overflow-hidden">
      {/* Command Header */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 bg-[#081226] px-6 py-3.5">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-red-400" />
          <div>
            <h2 className="text-base font-bold tracking-tight text-white">
              DOMINO SKY — EMERGENCY OPERATIONS COMMAND MODE
            </h2>
            <p className="text-xs text-slate-400">
              {sim.config.enabled
                ? `Active Incident: ${sim.config.airportId} Closure (${sim.config.startTime}, ${sim.config.durationMinutes}m · ${sim.config.description})`
                : 'Monitoring Baseline Network Operations'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {recommendations.length > 0 && (
            <button
              type="button"
              onClick={onApplyAllOptimal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap"
            >
              <Zap className="h-3.5 w-3.5" />
              Execute Optimal Recovery Plan
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            <X className="h-4 w-4" />
            Exit Command Mode
          </button>
        </div>
      </div>

      {/* Main Command Grid */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Top Critical Snapshot Strip */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-[#0b1830] p-4">
            <div className="text-xs font-semibold text-cyan-400">Highest-Impact Airport</div>
            <div className="mt-1 font-mono text-2xl font-bold text-white">
              {topAirport && topAirport.riskScore > 0 ? `${topAirport.airport.id} · ${topAirport.airport.city}` : 'None'}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {topAirport && topAirport.riskScore > 0
                ? `${topAirport.riskLevel} · ${topAirport.totalDelayMinutes}m delay · ${topAirport.missedConnections} missed conn`
                : 'All 16 airports nominal'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0b1830] p-4">
            <div className="text-xs font-semibold text-orange-400">Most Affected Aircraft</div>
            <div className="mt-1 font-mono text-2xl font-bold text-white">
              {topAircraft && topAircraft.totalDelayMins > 0 ? topAircraft.tailId : 'None'}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {topAircraft && topAircraft.totalDelayMins > 0
                ? `${topAircraft.delayedFlights} delayed leg(s) · ${topAircraft.totalDelayMins}m accumulated`
                : 'All 16 tails operating on schedule'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0b1830] p-4">
            <div className="text-xs font-semibold text-red-400">Passenger & Crew Exposure</div>
            <div className="mt-1 font-mono text-2xl font-bold text-white">
              {sim.passengerImpact.strandedPassengers} Stranded
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {sim.metrics.missedConnectionsCount} missed conn · {sim.metrics.crewViolationCount} crew FDTL violation(s)
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0b1830] p-4">
            <div className="text-xs font-semibold text-purple-400">Spare Aircraft Readiness</div>
            <div className="mt-1 font-mono text-2xl font-bold text-white">
              {sim.metrics.availableSpareAircraft} / {spares.length} Standby
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {spares.map((s) => `${s.tailId} (${s.baseAirport}: ${s.availability === 'SPARE_DEPLOYED' ? 'DEPLOYED' : 'READY'})`).join(' · ')}
            </div>
          </div>
        </div>

        {/* 3-Column Command Center */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Column 1: Priority Alert Queue */}
          <div className="rounded-xl border border-slate-800 bg-[#0b1830] p-4 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Network Alert Feed ({filteredAlerts.length})
              </h3>
              <div className="flex items-center gap-1">
                {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setPriorityFilter(lvl)}
                    className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold transition-colors ${
                      priorityFilter === lvl
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
              {filteredAlerts.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  No alerts at selected priority level.
                </div>
              ) : (
                filteredAlerts.map((al) => {
                  const badge =
                    al.priority === 'CRITICAL'
                      ? 'bg-red-500/20 text-red-300 border-red-500/40'
                      : al.priority === 'HIGH'
                      ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                      : al.priority === 'MEDIUM'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                  return (
                    <div key={al.id} className="rounded-lg border border-slate-800 bg-[#071124] p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${badge}`}>
                          {al.priority}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">{al.category}</span>
                      </div>
                      <div className="mt-1.5 font-semibold text-white">{al.title}</div>
                      <p className="mt-0.5 text-slate-400 leading-relaxed">{al.detail}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 2: Immediate Flights, Connections & Crew Warnings */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-[#0b1830] p-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2.5">
                <Plane className="h-4 w-4 text-orange-400" />
                Flights Requiring Immediate Attention
              </h3>
              <div className="mt-3 space-y-2">
                {urgentFlights.length === 0 ? (
                  <p className="text-xs text-slate-400">All 70 flights operating normally.</p>
                ) : (
                  urgentFlights.map((fl) => (
                    <button
                      key={fl.flight_id}
                      type="button"
                      onClick={() => onSelectFlight(fl.flight_id)}
                      className="w-full rounded-lg border border-slate-800 bg-[#071124] px-3 py-2 text-left text-xs hover:border-cyan-500/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-white">
                          {fl.flight_id} · {fl.origin}→{fl.destination} ({fl.assignedTailId})
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            fl.status === 'CANCELLED' ? 'text-red-400' : 'text-orange-400'
                          }`}
                        >
                          {fl.status === 'CANCELLED'
                            ? 'CANCELLED'
                            : `+${Math.max(fl.depDelayMin, fl.arrDelayMin)}m`}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400 truncate">{fl.reason}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0b1830] p-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2.5">
                <Users className="h-4 w-4 text-cyan-400" />
                Connection & Crew Warnings
              </h3>
              <div className="mt-3 space-y-2 max-h-[210px] overflow-y-auto pr-1 text-xs">
                {crewWarnings.map((cr) => (
                  <div key={cr.crew_id} className="rounded-lg border border-red-500/30 bg-red-950/30 p-2.5">
                    <span className="font-mono font-bold text-red-300">{cr.crew_id} ({cr.tail_id}): </span>
                    <span className="text-slate-300">{cr.notes}</span>
                  </div>
                ))}
                {missedConnections.map((cx) => (
                  <div key={cx.connection_id} className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-2.5">
                    <span className="font-mono font-bold text-orange-300">
                      {cx.connection_id} @ {cx.airport} ({cx.passengers} pax):{' '}
                    </span>
                    <span className="text-slate-300">
                      {cx.from_flight} → {cx.to_flight} ({cx.rebookedToFlightId ? `Rebooked ${cx.rebookedToFlightId}` : `Shortfall ${cx.shortfallMin}m`})
                    </span>
                  </div>
                ))}
                {crewWarnings.length === 0 && missedConnections.length === 0 && (
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    No active connection or crew duty warnings.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column 3: AI Recovery Action Execution */}
          <div className="rounded-xl border border-slate-800 bg-[#0b1830] p-4 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="h-4 w-4 text-cyan-400" />
                Recommended Recovery Actions ({recommendations.length})
              </h3>
            </div>
            <div className="mt-3 max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
              {recommendations.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  No additional recovery actions needed or available.
                </div>
              ) : (
                recommendations.map((rec) => (
                  <div key={rec.id} className="rounded-lg border border-slate-800 bg-[#071124] p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold text-cyan-400">
                        RANK #{rec.rank} · {rec.type.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`font-mono text-[10px] font-semibold ${
                          rec.crewFeasible ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {rec.crewFeasible ? 'CREW FEASIBLE' : 'CREW RESTRICTED'}
                      </span>
                    </div>
                    <div className="mt-1 font-bold text-white">{rec.title}</div>
                    <p className="mt-1 text-slate-300">{rec.expectedOperationalImpact}</p>
                    <button
                      type="button"
                      onClick={() => onApplyRecovery(rec)}
                      className="mt-2.5 w-full rounded-md bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
                    >
                      Apply Action Now
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
