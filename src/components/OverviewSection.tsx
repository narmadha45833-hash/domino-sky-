import React, { useMemo } from 'react';
import { ChartConfiguration } from 'chart.js';
import { AlertTriangle, ArrowRight, Play, ShieldAlert } from 'lucide-react';
import { SimulationResult } from '../types/aviation';
import { ChartCanvas } from './Charts';
import { generateEmergencyAlerts } from '../engine/analytics';

interface OverviewSectionProps {
  sim: SimulationResult;
  onNavigateTab: (tab: string) => void;
  onLoadMumbai90Demo: () => void;
  onSelectFlight: (flightId: string) => void;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  sim,
  onNavigateTab,
  onLoadMumbai90Demo,
  onSelectFlight,
}) => {
  const alerts = useMemo(() => generateEmergencyAlerts(sim).slice(0, 6), [sim]);

  // 1. Flight Status Distribution Doughnut
  const statusChartConfig = useMemo<ChartConfiguration>(
    () => ({
      type: 'doughnut',
      data: {
        labels: ['On Time', 'Delayed', 'Cancelled'],
        datasets: [
          {
            data: [
              sim.metrics.onTimeFlights,
              sim.metrics.delayedFlights,
              sim.metrics.cancelledFlights,
            ],
            backgroundColor: ['#16a34a', '#ea580c', '#dc2626'],
            borderColor: '#ffffff',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        },
      },
    }),
    [sim.metrics]
  );

  // 2. Airport Disruption Bar Chart (Top 8 airports by delay minutes)
  const airportChartConfig = useMemo<ChartConfiguration>(() => {
    const topAirports = [...sim.airportRisks]
      .sort((a, b) => b.totalDelayMinutes - a.totalDelayMinutes || b.riskScore - a.riskScore)
      .slice(0, 8);
    return {
      type: 'bar',
      data: {
        labels: topAirports.map((a) => a.airport.id),
        datasets: [
          {
            label: 'Total Delay Minutes',
            data: topAirports.map((a) => a.totalDelayMinutes),
            backgroundColor: topAirports.map((a) =>
              a.riskLevel === 'CRITICAL RISK'
                ? '#dc2626'
                : a.riskLevel === 'HIGH RISK'
                ? '#ea580c'
                : a.riskLevel === 'MODERATE RISK'
                ? '#f59e0b'
                : '#2563eb'
            ),
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Minutes' } },
        },
      },
    };
  }, [sim.airportRisks]);

  // 3. Aircraft Delay Bar Chart (Top 8 affected aircraft)
  const aircraftChartConfig = useMemo<ChartConfiguration>(() => {
    const topTails = [...sim.aircraft]
      .filter((a) => !a.isSpare)
      .sort((a, b) => b.totalDelayMins - a.totalDelayMins)
      .slice(0, 8);
    return {
      type: 'bar',
      data: {
        labels: topTails.map((a) => a.tailId.replace('VT-', '')),
        datasets: [
          {
            label: 'Accumulated Delay (min)',
            data: topTails.map((a) => a.totalDelayMins),
            backgroundColor: '#0284c7',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Minutes' } },
        },
      },
    };
  }, [sim.aircraft]);

  // 4. Passenger Impact Bar Chart
  const passengerChartConfig = useMemo<ChartConfiguration>(
    () => ({
      type: 'bar',
      data: {
        labels: [
          'Unique Affected',
          'Delayed Flights',
          'Missed Connections',
          'Rebooked',
          'Stranded',
        ],
        datasets: [
          {
            label: 'Passengers',
            data: [
              sim.passengerImpact.uniqueAffectedPassengers,
              sim.passengerImpact.delayedPassengers,
              sim.passengerImpact.missedConnectionPassengers,
              sim.passengerImpact.rebookedPassengers,
              sim.passengerImpact.strandedPassengers,
            ],
            backgroundColor: ['#2563eb', '#ea580c', '#f59e0b', '#16a34a', '#dc2626'],
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Passengers' } },
        },
      },
    }),
    [sim.passengerImpact]
  );

  const kpis: Array<{ label: string; value: string | number; sub: string; tone?: string }> = [
    { label: 'Total Airports', value: sim.metrics.totalAirports, sub: 'Actual dataset (4 mega hubs)' },
    { label: 'Total Flights', value: sim.metrics.totalFlights, sub: 'Single-day IST schedule' },
    { label: 'Operating Aircraft', value: sim.metrics.totalAircraft, sub: 'VT-DS01 to VT-DS16' },
    { label: 'Connections', value: sim.metrics.totalConnections, sub: `${sim.passengerImpact.totalUniqueConnectingPax} connecting pax` },
    { label: 'Flight Crews', value: sim.metrics.totalCrews, sub: `${sim.metrics.crewViolationCount} FDTL violations` },
    {
      label: 'Spare Aircraft',
      value: `${sim.metrics.availableSpareAircraft} / 2`,
      sub: `${sim.metrics.deployedSpareAircraft} deployed (BLR, DEL)`,
      tone: 'text-purple-700',
    },
    { label: 'On-Time Flights', value: sim.metrics.onTimeFlights, sub: 'Operating per schedule', tone: 'text-emerald-700' },
    { label: 'Delayed Flights', value: sim.metrics.delayedFlights, sub: 'Closure + cascade impact', tone: 'text-orange-600' },
    { label: 'Cancelled Flights', value: sim.metrics.cancelledFlights, sub: 'Threshold or recovery', tone: 'text-red-600' },
    {
      label: 'Affected Passengers',
      value: sim.passengerImpact.uniqueAffectedPassengers,
      sub: `Deduplicated (-${sim.passengerImpact.doubleCountedConnectingPax} overlap)`,
    },
    {
      label: 'Missed Connections',
      value: sim.metrics.missedConnectionsCount,
      sub: `${sim.passengerImpact.missedConnectionPassengers} connecting pax`,
      tone: sim.metrics.missedConnectionsCount > 0 ? 'text-red-600' : 'text-emerald-700',
    },
    {
      label: 'Accumulated Delay',
      value: `${sim.metrics.totalDelayMinutes}m`,
      sub: `Max single leg +${sim.metrics.maxDelayMinutes}m`,
      tone: sim.metrics.totalDelayMinutes > 0 ? 'text-orange-600' : 'text-slate-900',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Operational Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-sky-200 bg-[#F0F7FF] p-5">
        <div>
          <div className="text-xs font-semibold text-blue-700">
            OPERATIONS CONTROL CENTRE · DETERMINISTIC NETWORK SNAPSHOT
          </div>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            {sim.config.enabled
              ? `${sim.config.airportId} Closure Active: ${sim.config.startTime} IST (${sim.config.durationMinutes} min · ${sim.config.description})`
              : 'Baseline Normal Operations (70/70 Scheduled Flights On Time)'}
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            All metrics below are computed deterministically from <span className="font-mono">flight_network.json</span>. Applied recovery actions: <span className="font-mono font-semibold">{sim.appliedActions.length}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!sim.config.enabled && (
            <button
              type="button"
              onClick={onLoadMumbai90Demo}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              Run Mumbai 90m Closure
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigateTab('recovery')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-4 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
          >
            Open AI Dispatcher
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 12 Dynamic KPIs */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-sky-300"
          >
            <div className="text-xs font-medium text-slate-500">{k.label}</div>
            <div className={`mt-1.5 font-mono text-2xl font-bold ${k.tone ?? 'text-slate-900'}`}>
              {k.value}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 truncate" title={k.sub}>
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Realistic Airline Operations Performance Strip */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <div className="rounded-xl border border-sky-200 bg-[#F0F7FF] p-3.5">
          <div className="text-xs text-slate-600">OTP-15 (Industry Standard)</div>
          <div className="mt-1 font-mono text-xl font-bold text-blue-800">
            {sim.metrics.otp15Pct}%
          </div>
          <div className="text-[11px] text-slate-500">OTP-0 exact: {sim.metrics.otp0Pct}%</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-xs text-slate-600">Avg Delay / Delayed Flight</div>
          <div className="mt-1 font-mono text-xl font-bold text-orange-700">
            {sim.metrics.avgDelayPerDelayedMin}m
          </div>
          <div className="text-[11px] text-slate-500">Across {sim.metrics.delayedFlights} delayed leg(s)</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-xs text-slate-600">Network Seat Load Factor</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900">
            {sim.metrics.networkLoadFactorPct}%
          </div>
          <div className="text-[11px] text-slate-500">180 seats/aircraft capacity</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-xs text-slate-600">ATC Runway Slot Metering</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900">
            +{sim.metrics.runwaySlotDelayMinutes}m
          </div>
          <div className="text-[11px] text-slate-500">
            {sim.config.enforceRunwayCapacity ? 'Enforced via capacity_per_hour' : 'Disabled'}
          </div>
        </div>
      </div>

      {/* 4 Dynamic Chart.js Visualizations */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Flight Status Distribution</h3>
            <span className="font-mono text-xs text-slate-500">70 total flights</span>
          </div>
          <ChartCanvas config={statusChartConfig} height={220} ariaLabel="Flight status distribution chart" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Airport Disruption (Delay Minutes)</h3>
            <span className="font-mono text-xs text-slate-500">Top 8 impacted airports</span>
          </div>
          <ChartCanvas config={airportChartConfig} height={220} ariaLabel="Airport disruption bar chart" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Aircraft Delay Propagation</h3>
            <span className="font-mono text-xs text-slate-500">Top 8 impacted tails</span>
          </div>
          <ChartCanvas config={aircraftChartConfig} height={220} ariaLabel="Aircraft delay bar chart" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Passenger Impact Breakdown</h3>
            <span className="font-mono text-xs text-slate-500">Deduplicated counts</span>
          </div>
          <ChartCanvas config={passengerChartConfig} height={220} ariaLabel="Passenger impact chart" />
        </div>
      </div>

      {/* Critical Alerts & Recent Cascade Activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-600" />
              Critical Operations Alerts
            </h3>
            <span className="font-mono text-xs text-slate-500">{alerts.length} shown</span>
          </div>
          <div className="mt-3 space-y-2.5">
            {alerts.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No operational alerts in baseline schedule.
              </p>
            ) : (
              alerts.map((al) => (
                <div key={al.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{al.title}</span>
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        al.priority === 'CRITICAL'
                          ? 'bg-red-100 text-red-800'
                          : al.priority === 'HIGH'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {al.priority}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">{al.detail}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              Recent Cascade Activity Log
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('simulator')}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              Open Live Timeline
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {sim.timelineEvents.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                Trigger an airport closure simulation to trace minute-by-minute cascade events.
              </p>
            ) : (
              sim.timelineEvents.slice(0, 7).map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => ev.flightId && onSelectFlight(ev.flightId)}
                  className="w-full rounded-lg border border-slate-200 bg-[#F0F7FF]/60 p-2.5 text-left text-xs hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-blue-800">{ev.timeStr} IST</span>
                    <span className="font-mono text-[10px] text-slate-500">{ev.type.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-900">{ev.title}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
