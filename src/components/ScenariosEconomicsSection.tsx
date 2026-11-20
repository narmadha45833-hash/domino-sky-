import React, { useMemo, useState } from 'react';
import { ChartConfiguration } from 'chart.js';
import { BookmarkPlus, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  ClosureConfig,
  CostAssumptions,
  FlightNetworkDataset,
  SavedScenario,
  SimulationResult,
} from '../types/aviation';
import { runSimulation } from '../engine/simulation';
import { calculateCostEstimate } from '../engine/analytics';
import { formatCurrencyINR } from '../engine/time';
import { ChartCanvas } from './Charts';

interface ScenariosEconomicsSectionProps {
  dataset: FlightNetworkDataset;
  beforeRecoverySim: SimulationResult;
  currentSim: SimulationResult;
  costAssumptions: CostAssumptions;
  savedScenarios: SavedScenario[];
  onUpdateCostAssumptions: (next: CostAssumptions) => void;
  onResetCostAssumptions: () => void;
  onLoadClosureConfig: (config: ClosureConfig) => void;
  onSaveCurrentScenario: (name: string) => void;
  onReloadSavedScenario: (scenario: SavedScenario) => void;
  onDeleteSavedScenario: (id: string) => void;
}

interface WhatIfCase {
  id: string;
  label: string;
  config: ClosureConfig;
}

const INITIAL_WHAT_IF_CASES: WhatIfCase[] = [
  {
    id: 'wi-bom-60',
    label: 'Mumbai (BOM) 60m · 07:30',
    config: {
      enabled: true,
      airportId: 'BOM',
      startTime: '07:30',
      durationMinutes: 60,
      severityPct: 100,
      enforceRunwayCapacity: true,
      description: 'Monsoon Visibility Drop',
      autoCancelThresholdMinutes: null,
    },
  },
  {
    id: 'wi-bom-90',
    label: 'Mumbai (BOM) 90m · 07:30',
    config: {
      enabled: true,
      airportId: 'BOM',
      startTime: '07:30',
      durationMinutes: 90,
      severityPct: 100,
      enforceRunwayCapacity: true,
      description: 'Severe Monsoon Thunderstorm',
      autoCancelThresholdMinutes: null,
    },
  },
  {
    id: 'wi-del-120',
    label: 'Delhi (DEL) 120m · 12:00',
    config: {
      enabled: true,
      airportId: 'DEL',
      startTime: '12:00',
      durationMinutes: 120,
      severityPct: 100,
      enforceRunwayCapacity: true,
      description: 'Runway Closure / ATC Ground Stop',
      autoCancelThresholdMinutes: null,
    },
  },
  {
    id: 'wi-blr-45',
    label: 'Bengaluru (BLR) 45m · 11:00',
    config: {
      enabled: true,
      airportId: 'BLR',
      startTime: '11:00',
      durationMinutes: 45,
      severityPct: 100,
      enforceRunwayCapacity: true,
      description: 'Crosswind Shear Hold',
      autoCancelThresholdMinutes: null,
    },
  },
  {
    id: 'wi-hyd-90',
    label: 'Hyderabad (HYD) 90m · 12:15',
    config: {
      enabled: true,
      airportId: 'HYD',
      startTime: '12:15',
      durationMinutes: 90,
      severityPct: 100,
      enforceRunwayCapacity: true,
      description: 'Electrical Storm Shutdown',
      autoCancelThresholdMinutes: null,
    },
  },
];

export const ScenariosEconomicsSection: React.FC<ScenariosEconomicsSectionProps> = ({
  dataset,
  beforeRecoverySim,
  currentSim,
  costAssumptions,
  savedScenarios,
  onUpdateCostAssumptions,
  onResetCostAssumptions,
  onLoadClosureConfig,
  onSaveCurrentScenario,
  onReloadSavedScenario,
  onDeleteSavedScenario,
}) => {
  const [whatIfCases, setWhatIfCases] = useState<WhatIfCase[]>(INITIAL_WHAT_IF_CASES);
  const [customAp, setCustomAp] = useState('MAA');
  const [customStart, setCustomStart] = useState('09:30');
  const [customDur, setCustomDur] = useState(75);
  const [scenarioName, setScenarioName] = useState('');

  // Run all What-If cases deterministically
  const whatIfResults = useMemo(() => {
    return whatIfCases.map((item) => {
      const sim = runSimulation(dataset, item.config, []);
      return {
        ...item,
        sim,
      };
    });
  }, [dataset, whatIfCases]);

  const greatestDisruptionId = useMemo(() => {
    let bestId = '';
    let maxScore = -1;
    for (const r of whatIfResults) {
      const score =
        r.sim.metrics.totalDelayMinutes +
        r.sim.metrics.missedConnectionsCount * 60 +
        r.sim.metrics.cancelledFlights * 120;
      if (score > maxScore) {
        maxScore = score;
        bestId = r.id;
      }
    }
    return bestId;
  }, [whatIfResults]);

  const whatIfChartConfig = useMemo<ChartConfiguration>(
    () => ({
      type: 'bar',
      data: {
        labels: whatIfResults.map((r) => r.label),
        datasets: [
          {
            label: 'Total Delay Minutes',
            data: whatIfResults.map((r) => r.sim.metrics.totalDelayMinutes),
            backgroundColor: '#2563eb',
            borderRadius: 4,
          },
          {
            label: 'Unique Affected Pax',
            data: whatIfResults.map((r) => r.sim.passengerImpact.uniqueAffectedPassengers),
            backgroundColor: '#06b6d4',
            borderRadius: 4,
          },
          {
            label: 'Stranded Pax',
            data: whatIfResults.map((r) => r.sim.passengerImpact.strandedPassengers),
            backgroundColor: '#dc2626',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } },
      },
    }),
    [whatIfResults]
  );

  const beforeCost = useMemo(
    () => calculateCostEstimate(beforeRecoverySim, costAssumptions),
    [beforeRecoverySim, costAssumptions]
  );
  const afterCost = useMemo(
    () => calculateCostEstimate(currentSim, costAssumptions),
    [currentSim, costAssumptions]
  );
  const estimatedSavings = Math.max(
    0,
    beforeCost.totalEstimatedCost - afterCost.totalEstimatedCost
  );

  const handleAddCustomWhatIf = (e: React.FormEvent) => {
    e.preventDefault();
    const id = `wi-custom-${Date.now()}`;
    setWhatIfCases((prev) => [
      ...prev,
      {
        id,
        label: `${customAp} ${customDur}m · ${customStart}`,
        config: {
          enabled: true,
          airportId: customAp,
          startTime: customStart,
          durationMinutes: customDur,
          severityPct: 100,
          enforceRunwayCapacity: true,
          description: 'Custom What-If Scenario',
          autoCancelThresholdMinutes: null,
        },
      },
    ]);
  };

  const handleSaveScenario = (e: React.FormEvent) => {
    e.preventDefault();
    const defaultLabel = currentSim.config.enabled
      ? `${currentSim.config.airportId} ${currentSim.config.durationMinutes}m (${currentSim.appliedActions.length} recoveries)`
      : 'Baseline Network';
    onSaveCurrentScenario(scenarioName.trim() || defaultLabel);
    setScenarioName('');
  };

  return (
    <div className="space-y-6">
      {/* 1. WHAT-IF SCENARIO BUILDER */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              What-If Scenario Builder & Multi-Scenario Comparator
            </h2>
            <p className="text-xs text-slate-600">
              Compare disruption cascades across airports and closure durations. All metrics are computed deterministically from <span className="font-mono">flight_network.json</span>.
            </p>
          </div>
        </div>

        {/* Add Custom What-If Scenario */}
        <form onSubmit={handleAddCustomWhatIf} className="grid grid-cols-1 gap-3 rounded-lg border border-sky-200 bg-[#F0F7FF] p-3.5 sm:grid-cols-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Airport</label>
            <select
              value={customAp}
              onChange={(e) => setCustomAp(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            >
              {dataset.airports.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} — {a.city}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Start (IST)</label>
            <input
              type="time"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Duration (min)</label>
            <input
              type="number"
              min={15}
              max={360}
              value={customDur}
              onChange={(e) => setCustomDur(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Scenario to Matrix
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-3 py-2.5 font-semibold">Scenario</th>
                <th className="px-3 py-2.5 font-semibold text-right">Delayed Flights</th>
                <th className="px-3 py-2.5 font-semibold text-right">Cancelled</th>
                <th className="px-3 py-2.5 font-semibold text-right">Total Delay</th>
                <th className="px-3 py-2.5 font-semibold text-right">Max Delay</th>
                <th className="px-3 py-2.5 font-semibold text-right">Missed Conn</th>
                <th className="px-3 py-2.5 font-semibold text-right">Stranded Pax</th>
                <th className="px-3 py-2.5 font-semibold">Worst Hub / Tail</th>
                <th className="px-3 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {whatIfResults.map(({ id, label, config, sim }) => {
                const isWorst = id === greatestDisruptionId;
                return (
                  <tr key={id} className={isWorst ? 'bg-red-50/60' : 'hover:bg-slate-50'}>
                    <td className="px-3 py-2.5 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{label}</span>
                        {isWorst && (
                          <span className="rounded bg-red-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                            GREATEST DISRUPTION
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-right text-orange-700">
                      {sim.metrics.delayedFlights}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-red-700">
                      {sim.metrics.cancelledFlights}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-right text-slate-900">
                      {sim.metrics.totalDelayMinutes}m
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-slate-700">
                      +{sim.metrics.maxDelayMinutes}m
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-red-700">
                      {sim.metrics.missedConnectionsCount}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-slate-900">
                      {sim.passengerImpact.strandedPassengers}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600">
                      {sim.metrics.mostAffectedAirportId ?? '--'} / {sim.metrics.mostAffectedTailId ?? '--'}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onLoadClosureConfig(config)}
                        className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                      >
                        <Play className="h-3 w-3" />
                        Load
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ChartCanvas
          config={whatIfChartConfig}
          height={240}
          ariaLabel="What-If scenario comparison chart"
        />
      </div>

      {/* 2. COST & OPERATIONAL IMPACT ESTIMATOR */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="text-xs font-semibold text-amber-700">
              ESTIMATED FINANCIAL MODEL · CONFIGURABLE ASSUMPTIONS (NOT ACTUAL DATASET COSTS)
            </div>
            <h3 className="mt-0.5 text-lg font-bold text-slate-900">
              Operational Cost & Recovery Savings Estimator
            </h3>
          </div>
          <button
            type="button"
            onClick={onResetCostAssumptions}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Default Assumptions
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 text-xs">
          {[
            ['aircraftDelayCostPerMin', 'Delay Cost / Min (INR)'],
            ['cancellationCostPerFlight', 'Cancellation / Flight (INR)'],
            ['passengerAccommodationCost', 'Accommodation / Stranded Pax'],
            ['rebookingCostPerPax', 'Rebooking / Pax (INR)'],
            ['spareDeploymentCost', 'Spare Aircraft Activation (INR)'],
          ].map(([key, label]) => (
            <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="block font-semibold text-slate-700 mb-1">{label}</label>
              <input
                type="number"
                min={0}
                step={100}
                value={costAssumptions[key as keyof CostAssumptions]}
                onChange={(e) =>
                  onUpdateCostAssumptions({
                    ...costAssumptions,
                    [key]: Math.max(0, Number(e.target.value)),
                  })
                }
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4">
            <div className="text-xs font-semibold text-orange-900">
              Estimated Pre-Recovery Loss
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-orange-800">
              {formatCurrencyINR(beforeCost.totalEstimatedCost)}
            </div>
            <div className="mt-2 space-y-0.5 font-mono text-[11px] text-orange-900/80">
              <div>Delay: {formatCurrencyINR(beforeCost.delayCost)}</div>
              <div>Cancellations: {formatCurrencyINR(beforeCost.cancellationCost)}</div>
              <div>Accommodation: {formatCurrencyINR(beforeCost.accommodationCost)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-sky-200 bg-[#F0F7FF] p-4">
            <div className="text-xs font-semibold text-blue-900">
              Estimated Post-Recovery Cost
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-blue-900">
              {formatCurrencyINR(afterCost.totalEstimatedCost)}
            </div>
            <div className="mt-2 space-y-0.5 font-mono text-[11px] text-blue-900/80">
              <div>Delay: {formatCurrencyINR(afterCost.delayCost)}</div>
              <div>Rebooking + Spares: {formatCurrencyINR(afterCost.rebookingCost + afterCost.spareDeploymentCost)}</div>
              <div>Accommodation: {formatCurrencyINR(afterCost.accommodationCost)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="text-xs font-semibold text-emerald-900">
              Estimated Net Savings After Recovery
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-emerald-700">
              {formatCurrencyINR(estimatedSavings)}
            </div>
            <div className="mt-2 text-[11px] text-emerald-800">
              Calculated strictly from configurable unit assumptions applied to deterministic simulation deltas.
            </div>
          </div>
        </div>
      </div>

      {/* 3. SCENARIO HISTORY & LOCAL STORAGE */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Scenario History & Browser Persistence (localStorage)
            </h3>
            <p className="text-xs text-slate-600">
              Save current disruption + applied recovery state without altering the underlying <span className="font-mono">flight_network.json</span> dataset.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveScenario} className="flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="Scenario label (e.g., BOM 90m + Spare VT-DS18 + Rebook)..."
            className="flex-1 min-w-[240px] rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            Save Current Scenario
          </button>
        </form>

        {savedScenarios.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            No saved scenarios yet. Save the active simulation above to compare or reload it later.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {savedScenarios.map((sc) => (
              <div
                key={sc.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900">{sc.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-600">
                    {sc.summary.delayedFlights} delayed · {sc.summary.totalDelayMinutes}m ·{' '}
                    {sc.summary.missedConnections} missed conn · {sc.summary.strandedPassengers} stranded
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    Saved {new Date(sc.createdAt).toLocaleString()} · {sc.appliedActions.length} recovery action(s)
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onReloadSavedScenario(sc)}
                    className="rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-700"
                  >
                    Reload
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSavedScenario(sc.id)}
                    aria-label={`Delete scenario ${sc.name}`}
                    className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-500 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
