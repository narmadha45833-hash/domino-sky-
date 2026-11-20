import React from 'react';
import { ArrowRight, GitBranch } from 'lucide-react';
import { SimulationResult } from '../types/aviation';

interface CascadeTreeProps {
  sim: SimulationResult;
  onSelectFlight: (flightId: string) => void;
}

export const CascadeTree: React.FC<CascadeTreeProps> = ({ sim, onSelectFlight }) => {
  // Group disrupted flights by their assignedTailId so users can trace each aircraft's domino chain
  const disruptedTails = sim.aircraft.filter(
    (ac) => !ac.isSpare && (ac.delayedFlights > 0 || ac.cancelledFlights > 0)
  );

  if (!sim.config.enabled || disruptedTails.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
        No active domino propagation chains. Trigger an airport closure or capacity restriction to inspect tail-by-tail cascade trees.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-blue-700" />
            Domino Effect Propagation Chains ({disruptedTails.length} Affected Aircraft)
          </h3>
          <p className="text-xs text-slate-600">
            Visualizes how a primary closure delay on an initial leg ripples down each aircraft&apos;s <span className="font-mono">leg_order</span> chain and breaks hub connections.
          </p>
        </div>
        <span className="font-mono text-xs text-slate-500">Click any leg to inspect</span>
      </div>

      <div className="space-y-3">
        {disruptedTails.map((ac) => {
          const chainFlights = ac.flights;
          const tailCx = sim.connections.filter(
            (cx) =>
              chainFlights.some((f) => f.flight_id === cx.from_flight) && cx.status !== 'MADE'
          );

          return (
            <div
              key={ac.tailId}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-900">{ac.tailId}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600">
                    {ac.delayedFlights} delayed / {ac.cancelledFlights} cancelled
                  </span>
                </div>
                <span className="font-mono font-semibold text-orange-700">
                  +{ac.totalDelayMins}m tail delay
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {chainFlights.map((fl, idx) => {
                  const maxD = Math.max(fl.depDelayMin, fl.arrDelayMin);
                  const nodeStyle =
                    fl.status === 'CANCELLED'
                      ? 'border-red-300 bg-red-50 text-red-900'
                      : fl.isSpareAssigned
                      ? 'border-purple-300 bg-purple-50 text-purple-900'
                      : fl.status === 'DELAYED'
                      ? fl.disruptionSource === 'TURNAROUND_PROPAGATION'
                        ? 'border-amber-300 bg-amber-50 text-amber-950'
                        : 'border-orange-400 bg-orange-100 text-orange-950'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-900';

                  return (
                    <React.Fragment key={fl.flight_id}>
                      {idx > 0 && <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                      <button
                        type="button"
                        onClick={() => onSelectFlight(fl.flight_id)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition-transform hover:scale-[1.02] ${nodeStyle}`}
                      >
                        <div className="font-mono font-bold">
                          {fl.flight_id} ({fl.origin}→{fl.destination})
                        </div>
                        <div className="font-mono text-[10px]">
                          {fl.predDepStr}–{fl.predArrStr}{' '}
                          {fl.status === 'DELAYED' ? (
                            <strong>(+{maxD}m)</strong>
                          ) : fl.status === 'CANCELLED' ? (
                            <strong>(CXL)</strong>
                          ) : (
                            '(OK)'
                          )}
                        </div>
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>

              {tailCx.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                  <span className="font-semibold text-red-700">Broken Connections:</span>
                  {tailCx.map((cx) => (
                    <span
                      key={cx.connection_id}
                      className="rounded border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-red-800"
                    >
                      {cx.connection_id} {cx.from_flight}→{cx.to_flight} @ {cx.airport} ({cx.passengers} pax)
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
