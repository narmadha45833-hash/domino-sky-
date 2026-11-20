import React, { useMemo } from 'react';
import { ChartConfiguration } from 'chart.js';
import { CheckCircle2, RotateCcw, ShieldCheck, Zap } from 'lucide-react';
import { RecoveryAction, SimulationResult } from '../types/aviation';
import { ChartCanvas } from './Charts';

interface RecoveryXaiSectionProps {
  beforeRecoverySim: SimulationResult;
  currentSim: SimulationResult;
  recommendations: RecoveryAction[];
  onApplyRecovery: (action: RecoveryAction) => void;
  onUndoLastRecovery: () => void;
  onClearAllRecoveries: () => void;
  onApplyAllOptimal: () => void;
}

export const RecoveryXaiSection: React.FC<RecoveryXaiSectionProps> = ({
  beforeRecoverySim,
  currentSim,
  recommendations,
  onApplyRecovery,
  onUndoLastRecovery,
  onClearAllRecoveries,
  onApplyAllOptimal,
}) => {
  const before = beforeRecoverySim.metrics;
  const after = currentSim.metrics;

  const delayPct =
    before.totalDelayMinutes > 0
      ? Math.round(((before.totalDelayMinutes - after.totalDelayMinutes) / before.totalDelayMinutes) * 100)
      : 0;

  const missedPct =
    before.missedConnectionsCount > 0
      ? Math.round(((before.missedConnectionsCount - after.missedConnectionsCount) / before.missedConnectionsCount) * 100)
      : 0;

  const strandedBefore = beforeRecoverySim.passengerImpact.strandedPassengers;
  const strandedAfter = currentSim.passengerImpact.strandedPassengers;
  const strandedPct =
    strandedBefore > 0 ? Math.round(((strandedBefore - strandedAfter) / strandedBefore) * 100) : 0;

  const comparisonChartConfig = useMemo<ChartConfiguration>(
    () => ({
      type: 'bar',
      data: {
        labels: [
          'Delayed Flights',
          'Cancelled Flights',
          'Missed Connections',
          'Stranded Pax (÷10)',
          'Delay Min (÷10)',
        ],
        datasets: [
          {
            label: 'Before Recovery',
            data: [
              before.delayedFlights,
              before.cancelledFlights,
              before.missedConnectionsCount,
              Math.round(strandedBefore / 10),
              Math.round(before.totalDelayMinutes / 10),
            ],
            backgroundColor: '#ea580c',
            borderRadius: 4,
          },
          {
            label: 'After Recovery',
            data: [
              after.delayedFlights,
              after.cancelledFlights,
              after.missedConnectionsCount,
              Math.round(strandedAfter / 10),
              Math.round(after.totalDelayMinutes / 10),
            ],
            backgroundColor: '#16a34a',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
        },
        scales: {
          y: { beginAtZero: true },
        },
      },
    }),
    [before, after, strandedBefore, strandedAfter]
  );

  return (
    <div className="space-y-6">
      {/* Header & Bulk Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <div className="text-xs font-semibold text-blue-700">
            AI DISPATCHER · EXPLAINABLE DECISION CENTRE
          </div>
          <h2 className="mt-0.5 text-lg font-bold text-slate-900">
            Deterministic Recovery Engine & Before-vs-After Impact
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Every recommendation is evaluated through the deterministic cascade simulator and verified against aircraft turnaround (30m), station location, and crew FDTL (600m) constraints.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentSim.appliedActions.length > 0 && (
            <>
              <button
                type="button"
                onClick={onUndoLastRecovery}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Undo Last Action
              </button>
              <button
                type="button"
                onClick={onClearAllRecoveries}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Restore Disrupted State
              </button>
            </>
          )}
          {recommendations.length > 0 && (
            <button
              type="button"
              onClick={onApplyAllOptimal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Auto-Apply Optimal Recovery Plan
            </button>
          )}
        </div>
      </div>

      {/* BEFORE-AND-AFTER RECOVERY COMPARISON */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Before-and-After Recovery Comparison
            </h3>
            <span className="font-mono text-xs text-emerald-700 font-semibold">
              {currentSim.appliedActions.length} action(s) applied
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-slate-500">Delayed Flights</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono">
                <span className="text-sm text-orange-600 line-through">{before.delayedFlights}</span>
                <span className="text-xl font-bold text-slate-900">{after.delayedFlights}</span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-slate-500">Cancelled Flights</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono">
                <span className="text-sm text-red-600 line-through">{before.cancelledFlights}</span>
                <span className="text-xl font-bold text-slate-900">{after.cancelledFlights}</span>
              </div>
            </div>

            <div className="rounded-lg border border-sky-200 bg-[#F0F7FF] p-3">
              <div className="text-slate-600">Total Delay Minutes</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono">
                <span className="text-sm text-orange-600 line-through">{before.totalDelayMinutes}m</span>
                <span className="text-xl font-bold text-emerald-700">{after.totalDelayMinutes}m</span>
              </div>
              <div className="font-mono text-[11px] font-semibold text-blue-700">
                {delayPct >= 0 ? `-${delayPct}%` : `+${Math.abs(delayPct)}%`} net change
              </div>
            </div>

            <div className="rounded-lg border border-sky-200 bg-[#F0F7FF] p-3">
              <div className="text-slate-600">Missed Connections</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono">
                <span className="text-sm text-red-600 line-through">{before.missedConnectionsCount}</span>
                <span className="text-xl font-bold text-emerald-700">{after.missedConnectionsCount}</span>
              </div>
              <div className="font-mono text-[11px] font-semibold text-blue-700">
                {missedPct}% resolved
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-slate-500">Affected Passengers</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono">
                <span className="text-sm text-slate-500 line-through">
                  {beforeRecoverySim.passengerImpact.uniqueAffectedPassengers}
                </span>
                <span className="text-xl font-bold text-slate-900">
                  {currentSim.passengerImpact.uniqueAffectedPassengers}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
              <div className="text-emerald-900">Stranded Passengers</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono">
                <span className="text-sm text-red-600 line-through">{strandedBefore}</span>
                <span className="text-xl font-bold text-emerald-700">{strandedAfter}</span>
              </div>
              <div className="font-mono text-[11px] font-semibold text-emerald-800">
                {strandedPct}% reduction
              </div>
            </div>
          </div>

          {currentSim.appliedActions.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
              <div className="font-bold text-emerald-900 mb-1">Active Applied Recovery Ledger:</div>
              <ul className="space-y-1 text-emerald-800">
                {currentSim.appliedActions.map((act, idx) => (
                  <li key={act.id} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <strong>#{idx + 1}</strong> {act.title} — {act.expectedOperationalImpact}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-900">
            Visual Before / After Delta
          </h3>
          <ChartCanvas
            config={comparisonChartConfig}
            height={260}
            ariaLabel="Before and after recovery comparison chart"
          />
        </div>
      </div>

      {/* EXPLAINABLE AI DECISION CENTRE CARDS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-700" />
            Ranked Recovery Recommendations ({recommendations.length})
          </h3>
          <span className="font-mono text-xs text-slate-500">
            Ranked by verified delay savings, connection protection & crew feasibility
          </span>
        </div>

        {recommendations.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
            {currentSim.config.enabled
              ? 'All feasible deterministic recovery actions have been applied or no remaining disruptions require intervention.'
              : 'Run an airport closure simulation first to generate AI Dispatcher recovery recommendations.'}
          </div>
        ) : (
          <div className="space-y-4">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                      <span className="rounded bg-blue-600 px-2 py-0.5 font-bold text-white">
                        RANK #{rec.rank}
                      </span>
                      <span className="font-bold text-blue-800">{rec.type.replace(/_/g, ' ')}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600">
                        Priority Score: {Math.round(rec.feasibilityScore)}
                      </span>
                    </div>
                    <h4 className="mt-1.5 text-base font-bold text-slate-900">{rec.title}</h4>
                  </div>

                  <button
                    type="button"
                    onClick={() => onApplyRecovery(rec)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Apply Action & Recalculate
                  </button>
                </div>

                {/* Explainable AI 8-Field Structured Matrix */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <div className="font-bold text-slate-900">1. Problem Identified</div>
                    <p className="mt-1 text-slate-700">{rec.problemIdentified}</p>
                  </div>
                  <div className="rounded-lg border border-sky-200 bg-[#F0F7FF] p-3">
                    <div className="font-bold text-slate-900">2. Why Selected</div>
                    <p className="mt-1 text-slate-700">{rec.whySelected}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                    <div className="font-bold text-emerald-900">3. Expected Impact</div>
                    <p className="mt-1 text-emerald-800">{rec.expectedOperationalImpact}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <div className="font-bold text-slate-900">4. Passenger Impact</div>
                    <p className="mt-1 text-slate-700">{rec.passengerImpactLabel}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
                  <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
                    <div>
                      <span className="font-bold text-slate-900">Data Used: </span>
                      <span className="font-mono text-[11px] text-slate-600">
                        {rec.dataUsed.join(' | ')}
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">Alternatives Considered: </span>
                      <span className="text-slate-600">{rec.alternativesConsidered.join(' · ')}</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
                    <div>
                      <span className="font-bold text-slate-900">Aircraft Availability: </span>
                      <span className="text-emerald-800 font-medium">{rec.aircraftAvailabilityCheck}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">Crew Feasibility: </span>
                      <span className={rec.crewFeasible ? 'text-emerald-800 font-medium' : 'text-red-700 font-semibold'}>
                        {rec.crewFeasibilityCheck}
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">Operational Risks: </span>
                      <span className="text-slate-600">{rec.operationalRisks}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
