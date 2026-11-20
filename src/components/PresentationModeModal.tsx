import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Play, Presentation, RotateCcw, Sparkles, X, Zap } from 'lucide-react';
import {
  CostAssumptions,
  FlightNetworkDataset,
  RecoveryAction,
  SimulationResult,
} from '../types/aviation';
import { calculateCostEstimate } from '../engine/analytics';
import { formatCurrencyINR, formatMinutesToTime } from '../engine/time';
import { IndiaMap } from './IndiaMap';

interface PresentationModeModalProps {
  open: boolean;
  dataset: FlightNetworkDataset;
  baselineSim: SimulationResult;
  beforeRecoverySim: SimulationResult;
  currentSim: SimulationResult;
  recommendations: RecoveryAction[];
  costAssumptions: CostAssumptions;
  onClose: () => void;
  onLoadMumbai90Demo: () => void;
  onApplyAllOptimal: () => void;
  onResetSimulation: () => void;
}

const SLIDE_TITLES = [
  '01. Network Baseline & Dataset Scope',
  '02. Disruption Trigger: Airport Closure',
  '03. Domino Cascade Across India Network',
  '04. Passenger Connections & Crew Constraints',
  '05. Explainable AI Dispatcher Recovery',
  '06. Before-vs-After Impact & Cost Savings',
];

export const PresentationModeModal: React.FC<PresentationModeModalProps> = ({
  open,
  dataset,
  baselineSim,
  beforeRecoverySim,
  currentSim,
  recommendations,
  costAssumptions,
  onClose,
  onLoadMumbai90Demo,
  onApplyAllOptimal,
  onResetSimulation,
}) => {
  const [slideIdx, setSlideIdx] = useState(0);
  const [demoClockMin, setDemoClockMin] = useState(450); // 07:30 IST
  const [animatingCascade, setAnimatingCascade] = useState(false);

  useEffect(() => {
    if (!open || !animatingCascade) return;
    const timer = window.setInterval(() => {
      setDemoClockMin((prev) => {
        if (prev >= 1260) {
          setAnimatingCascade(false);
          return 1260;
        }
        return prev + 8;
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [open, animatingCascade]);

  if (!open) return null;

  const beforeCost = calculateCostEstimate(beforeRecoverySim, costAssumptions);
  const afterCost = calculateCostEstimate(currentSim, costAssumptions);
  const costSavings = Math.max(0, beforeCost.totalEstimatedCost - afterCost.totalEstimatedCost);

  const delayReductionPct =
    beforeRecoverySim.metrics.totalDelayMinutes > 0
      ? Math.round(
          ((beforeRecoverySim.metrics.totalDelayMinutes - currentSim.metrics.totalDelayMinutes) /
            beforeRecoverySim.metrics.totalDelayMinutes) *
            100
        )
      : 0;

  const strandedReductionPct =
    beforeRecoverySim.passengerImpact.strandedPassengers > 0
      ? Math.round(
          ((beforeRecoverySim.passengerImpact.strandedPassengers -
            currentSim.passengerImpact.strandedPassengers) /
            beforeRecoverySim.passengerImpact.strandedPassengers) *
            100
        )
      : 0;

  const runGuidedMumbaiDemo = () => {
    onLoadMumbai90Demo();
    setSlideIdx(2);
    setDemoClockMin(450);
    setAnimatingCascade(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#060f22] text-white overflow-hidden">
      {/* Minimal Presentation Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-[#08152e] px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Presentation className="h-5 w-5 text-cyan-400" />
          <div>
            <span className="font-display text-base font-extrabold tracking-tight text-white">
              DOMINO SKY
            </span>
            <span className="ml-3 text-xs text-cyan-300">
              One Disruption. A Network of Consequences. Smarter Recovery.
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={runGuidedMumbaiDemo}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Guided Mumbai 90m Demo
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            <X className="h-4 w-4" />
            Exit Presentation
          </button>
        </div>
      </div>

      {/* Stage Stepper */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-800/80 bg-[#071226] px-6 py-2.5">
        {SLIDE_TITLES.map((title, idx) => (
          <button
            key={title}
            type="button"
            onClick={() => setSlideIdx(idx)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              slideIdx === idx
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {title}
          </button>
        ))}
      </div>

      {/* Main Slide Canvas */}
      <div className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {slideIdx === 0 && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold text-cyan-400">STAGE 1 · DETERMINISTIC DATASET FOUNDATION</p>
                <h2 className="mt-1 text-3xl font-extrabold text-white">
                  Live Single-Day Indian Domestic Airline Network
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-300">
                  Every flight, tail rotation, passenger connection, crew FDTL limit, and standby spare aircraft is loaded directly from the verified <span className="font-mono text-cyan-300">flight_network.json</span> schedule.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Airports', baselineSim.metrics.totalAirports],
                  ['Scheduled Flights', baselineSim.metrics.totalFlights],
                  ['Operating Aircraft', baselineSim.metrics.totalAircraft],
                  ['Connections', baselineSim.metrics.totalConnections],
                  ['Flight Crews', baselineSim.metrics.totalCrews],
                  ['Spare Aircraft', dataset.spare_aircraft.length],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-xl border border-slate-800 bg-[#0b1933] p-4">
                    <div className="text-xs text-slate-400">{label}</div>
                    <div className="mt-1 font-mono text-3xl font-bold text-cyan-300">{val}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-5 text-sm text-slate-300">
                <strong className="text-white">Operational Constraints Enforced:</strong> Minimum 30-minute aircraft turnaround between sequential <span className="font-mono">leg_order</span> flights, 180-seat aircraft capacity, 40–45 minute minimum hub connection times, 600-minute maximum crew duty duration, and base-locked spare tails (<span className="font-mono text-purple-300">VT-DS17 @ BLR</span>, <span className="font-mono text-purple-300">VT-DS18 @ DEL</span>).
              </div>
            </div>
          )}

          {slideIdx === 1 && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-orange-400">STAGE 2 · DISRUPTION SCENARIO</p>
                  <h2 className="mt-1 text-3xl font-extrabold text-white">
                    {currentSim.config.enabled
                      ? `${currentSim.config.airportId} Airport Closed for ${currentSim.config.durationMinutes} Minutes`
                      : 'No Closure Currently Active'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onLoadMumbai90Demo}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
                >
                  Trigger Mumbai (BOM) 07:30 · 90m Closure
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-5">
                  <div className="text-xs text-slate-400">Closed Hub</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-cyan-300">{beforeRecoverySim.config.airportId}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-5">
                  <div className="text-xs text-slate-400">Closure Window (IST)</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-white">{beforeRecoverySim.config.startTime} ({beforeRecoverySim.config.durationMinutes}m)</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-5">
                  <div className="text-xs text-slate-400">Delayed Flights (Pre-Recovery)</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-orange-400">{beforeRecoverySim.metrics.delayedFlights}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-5">
                  <div className="text-xs text-slate-400">Accumulated Delay</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-red-400">{beforeRecoverySim.metrics.totalDelayMinutes} min</div>
                </div>
              </div>
            </div>
          )}

          {slideIdx === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-cyan-400">STAGE 3 · ANIMATED DOMINO EFFECT</p>
                  <h2 className="text-2xl font-extrabold text-white">
                    Network Cascade Propagation · Clock: <span className="font-mono text-cyan-300">{formatMinutesToTime(demoClockMin)} IST</span>
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAnimatingCascade((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-500"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {animatingCascade ? 'Pause Cascade' : 'Animate Cascade'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDemoClockMin(450);
                      setAnimatingCascade(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Replay
                  </button>
                </div>
              </div>
              <IndiaMap
                dataset={dataset}
                sim={beforeRecoverySim}
                selectedAirportId={beforeRecoverySim.config.airportId}
                selectedFlightId={null}
                onSelectAirport={() => {}}
                onSelectFlight={() => {}}
                timelineCurrentMin={demoClockMin}
                heightClass="h-[420px]"
              />
            </div>
          )}

          {slideIdx === 3 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-orange-400">STAGE 4 · PASSENGER & CREW IMPACT</p>
                <h2 className="mt-1 text-2xl font-extrabold text-white">
                  Deduplicated Passenger Connections & Crew Duty Limits
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-4">
                  <div className="text-xs text-slate-400">Unique Affected Pax</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-white">{beforeRecoverySim.passengerImpact.uniqueAffectedPassengers}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-4">
                  <div className="text-xs text-slate-400">Missed Connections</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-orange-400">{beforeRecoverySim.metrics.missedConnectionsCount} ({beforeRecoverySim.passengerImpact.missedConnectionPassengers} pax)</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-4">
                  <div className="text-xs text-slate-400">Stranded Before Recovery</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-red-400">{beforeRecoverySim.passengerImpact.strandedPassengers}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-4">
                  <div className="text-xs text-slate-400">Crew FDTL Violations</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-amber-300">{beforeRecoverySim.metrics.crewViolationCount}</div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-4 max-h-[260px] overflow-y-auto space-y-2">
                {beforeRecoverySim.connections
                  .filter((c) => c.status !== 'MADE')
                  .map((cx) => (
                    <div key={cx.connection_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#071124] px-3 py-2 text-xs">
                      <span className="font-mono font-bold text-cyan-300">
                        {cx.connection_id} @ {cx.airport} ({cx.from_flight} → {cx.to_flight})
                      </span>
                      <span className="text-slate-300">
                        {cx.passengers} pax · Avail {cx.availableConnectMin ?? '--'}m vs Min {cx.min_connect_minutes}m
                      </span>
                      <span className="font-mono font-bold text-red-400">MISSED (-{cx.shortfallMin}m)</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {slideIdx === 4 && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-cyan-400">STAGE 5 · EXPLAINABLE AI DISPATCHER</p>
                  <h2 className="mt-1 text-2xl font-extrabold text-white">
                    Constraint-Checked Recovery Actions ({recommendations.length} available)
                  </h2>
                </div>
                {recommendations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyAllOptimal();
                      setSlideIdx(5);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Apply Optimal AI Recovery Plan & View Results
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {(recommendations.length > 0 ? recommendations.slice(0, 4) : currentSim.appliedActions).map((rec, i) => (
                  <div key={rec.id} className="rounded-xl border border-slate-800 bg-[#0b1933] p-4 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-cyan-300">#{rec.rank ?? i + 1} · {rec.type.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-emerald-400">
                        {rec.crewFeasible ? 'CREW OK' : 'RESTRICTED'}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white">{rec.title}</div>
                    <p className="text-slate-300">{rec.problemIdentified}</p>
                    <p className="text-emerald-300 font-medium">{rec.expectedOperationalImpact}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {slideIdx === 5 && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-emerald-400">STAGE 6 · FINAL VERIFIED OUTCOME</p>
                  <h2 className="mt-1 text-3xl font-extrabold text-white">
                    Before-and-After Recovery Comparison
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {currentSim.appliedActions.length === 0 && recommendations.length > 0 && (
                    <button
                      type="button"
                      onClick={onApplyAllOptimal}
                      className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                    >
                      Apply Optimal Recovery Now
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onResetSimulation}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Reset Demo
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-5">
                  <div className="text-xs text-slate-400">Total Delay Minutes</div>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="font-mono text-xl text-orange-400 line-through">
                      {beforeRecoverySim.metrics.totalDelayMinutes}m
                    </span>
                    <span className="font-mono text-3xl font-bold text-emerald-400">
                      {currentSim.metrics.totalDelayMinutes}m
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-cyan-300">
                    {delayReductionPct >= 0
                      ? `-${delayReductionPct}% delay reduction`
                      : `+${Math.abs(delayReductionPct)}% strategic hold trade-off`}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-5">
                  <div className="text-xs text-slate-400">Stranded Passengers</div>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="font-mono text-xl text-red-400 line-through">
                      {beforeRecoverySim.passengerImpact.strandedPassengers}
                    </span>
                    <span className="font-mono text-3xl font-bold text-emerald-400">
                      {currentSim.passengerImpact.strandedPassengers}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-cyan-300">
                    -{strandedReductionPct}% stranded reduction ({currentSim.passengerImpact.rebookedPassengers} rebooked)
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1933] p-5">
                  <div className="text-xs text-slate-400">Estimated Cost Savings (Model)</div>
                  <div className="mt-2 font-mono text-3xl font-bold text-emerald-400">
                    {formatCurrencyINR(costSavings)}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-400">
                    {formatCurrencyINR(beforeCost.totalEstimatedCost)} → {formatCurrencyINR(afterCost.totalEstimatedCost)}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5 text-sm text-emerald-100">
                <strong>Applied Recovery Actions ({currentSim.appliedActions.length}):</strong>{' '}
                {currentSim.appliedActions.length > 0
                  ? currentSim.appliedActions.map((a) => a.title).join(' · ')
                  : 'Click "Apply Optimal Recovery Now" above to execute AI Dispatcher recommendations live.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Slide Navigation */}
      <div className="flex items-center justify-between border-t border-slate-800 bg-[#08152e] px-6 py-3">
        <button
          type="button"
          disabled={slideIdx === 0}
          onClick={() => setSlideIdx((s) => Math.max(0, s - 1))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Previous Stage
        </button>

        <div className="font-mono text-xs text-slate-400">
          Stage {slideIdx + 1} / {SLIDE_TITLES.length}
        </div>

        <button
          type="button"
          disabled={slideIdx === SLIDE_TITLES.length - 1}
          onClick={() => setSlideIdx((s) => Math.min(SLIDE_TITLES.length - 1, s + 1))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
        >
          Next Stage
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
