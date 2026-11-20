import React, { useMemo, useState } from 'react';
import { ChartConfiguration } from 'chart.js';
import { PlaneLanding, PlaneTakeoff } from 'lucide-react';
import { FlightNetworkDataset, SimulationResult } from '../types/aviation';
import { ChartCanvas } from './Charts';

interface AirportFidsPanelProps {
  dataset: FlightNetworkDataset;
  sim: SimulationResult;
  selectedAirportId: string;
  onSelectAirport: (airportId: string) => void;
  onSelectFlight: (flightId: string) => void;
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 to 22:00

export const AirportFidsPanel: React.FC<AirportFidsPanelProps> = ({
  dataset,
  sim,
  selectedAirportId,
  onSelectAirport,
  onSelectFlight,
}) => {
  const [boardMode, setBoardMode] = useState<'DEPARTURES' | 'ARRIVALS'>('DEPARTURES');

  const airport = dataset.airports.find((a) => a.id === selectedAirportId) ?? dataset.airports[0];

  const departures = useMemo(
    () =>
      sim.flights
        .filter((f) => f.origin === selectedAirportId)
        .sort((a, b) => a.schedDepMin - b.schedDepMin),
    [sim.flights, selectedAirportId]
  );

  const arrivals = useMemo(
    () =>
      sim.flights
        .filter((f) => f.destination === selectedAirportId)
        .sort((a, b) => a.schedArrMin - b.schedArrMin),
    [sim.flights, selectedAirportId]
  );

  // Hourly movement demand (scheduled vs simulated) against airport.capacity_per_hour
  const hourlyConfig = useMemo<ChartConfiguration>(() => {
    const schedCounts = HOURS.map((hr) => {
      const s = hr * 60;
      const e = s + 60;
      return sim.flights.filter(
        (f) =>
          (f.origin === selectedAirportId && f.schedDepMin >= s && f.schedDepMin < e) ||
          (f.destination === selectedAirportId && f.schedArrMin >= s && f.schedArrMin < e)
      ).length;
    });

    const simCounts = HOURS.map((hr) => {
      const s = hr * 60;
      const e = s + 60;
      return sim.flights.filter(
        (f) =>
          f.status !== 'CANCELLED' &&
          ((f.origin === selectedAirportId && f.predDepMin !== null && f.predDepMin >= s && f.predDepMin < e) ||
            (f.destination === selectedAirportId && f.predArrMin !== null && f.predArrMin >= s && f.predArrMin < e))
      ).length;
    });

    return {
      type: 'bar',
      data: {
        labels: HOURS.map((h) => `${String(h).padStart(2, '0')}:00`),
        datasets: [
          {
            label: 'Scheduled Movements/Hr',
            data: schedCounts,
            backgroundColor: '#94a3b8',
            borderRadius: 3,
          },
          {
            label: 'Simulated Movements/Hr',
            data: simCounts,
            backgroundColor: '#2563eb',
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        },
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: Math.max(6, Math.min(airport.capacity_per_hour, 12)),
            ticks: { stepSize: 1 },
          },
        },
      },
    };
  }, [sim.flights, selectedAirportId, airport.capacity_per_hour]);

  const rows = boardMode === 'DEPARTURES' ? departures : arrivals;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Station FIDS Board & Runway Slot Demand ({airport.id} · {airport.city})
          </h3>
          <p className="text-xs text-slate-600">
            Airport rated capacity: <span className="font-mono font-semibold">{airport.capacity_per_hour} movements/hr</span> · Tier: {airport.tier.replace('_', ' ')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedAirportId}
            onChange={(e) => onSelectAirport(e.target.value)}
            aria-label="Select FIDS airport"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900"
          >
            {dataset.airports.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} — {a.city} ({a.capacity_per_hour}/hr)
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setBoardMode('DEPARTURES')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold ${
                boardMode === 'DEPARTURES' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <PlaneTakeoff className="h-3.5 w-3.5" />
              Departures ({departures.length})
            </button>
            <button
              type="button"
              onClick={() => setBoardMode('ARRIVALS')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold ${
                boardMode === 'ARRIVALS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <PlaneLanding className="h-3.5 w-3.5" />
              Arrivals ({arrivals.length})
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Authentic Dark FIDS Board */}
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#081224] text-slate-100">
          <div className="flex items-center justify-between border-b border-slate-800 bg-[#0c1a33] px-4 py-2.5 text-xs">
            <span className="font-mono font-bold text-cyan-300">
              {airport.id} TERMINAL {boardMode}
            </span>
            <span className="font-mono text-slate-400">ALL TIMES IST</span>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-[#0a162b] text-[11px] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2">FLIGHT</th>
                  <th className="px-3 py-2">{boardMode === 'DEPARTURES' ? 'DEST' : 'ORIG'}</th>
                  <th className="px-3 py-2">TAIL</th>
                  <th className="px-3 py-2">SCHED</th>
                  <th className="px-3 py-2">ESTIMATED</th>
                  <th className="px-3 py-2">REMARKS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No {boardMode.toLowerCase()} scheduled at {airport.id}.
                    </td>
                  </tr>
                ) : (
                  rows.map((fl) => {
                    const sched = boardMode === 'DEPARTURES' ? fl.dep : fl.arr;
                    const est = boardMode === 'DEPARTURES' ? fl.predDepStr : fl.predArrStr;
                    const delay = boardMode === 'DEPARTURES' ? fl.depDelayMin : fl.arrDelayMin;
                    const remarkColor =
                      fl.status === 'CANCELLED'
                        ? 'text-red-400'
                        : delay > 0
                        ? 'text-amber-400'
                        : 'text-emerald-400';

                    return (
                      <tr
                        key={fl.flight_id}
                        onClick={() => onSelectFlight(fl.flight_id)}
                        className="cursor-pointer hover:bg-slate-800/60 transition-colors"
                      >
                        <td className="px-3 py-2 font-bold text-cyan-300">{fl.flight_id}</td>
                        <td className="px-3 py-2 font-semibold text-white">
                          {boardMode === 'DEPARTURES' ? fl.destination : fl.origin}
                        </td>
                        <td className="px-3 py-2 text-slate-300">{fl.assignedTailId}</td>
                        <td className="px-3 py-2 text-slate-400">{sched}</td>
                        <td className="px-3 py-2 font-bold text-white">{est}</td>
                        <td className={`px-3 py-2 font-bold ${remarkColor}`}>
                          {fl.status === 'CANCELLED'
                            ? 'CANCELLED'
                            : delay > 0
                            ? `DELAYED +${delay}m`
                            : 'ON TIME'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hourly Runway Demand Chart */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-900">
              Hourly Runway Movements vs Slot Capacity ({airport.capacity_per_hour}/hr)
            </h4>
            <p className="mt-0.5 text-[11px] text-slate-600">
              Shows how closures compress flights into recovery waves metered by ATC runway capacity.
            </p>
          </div>
          <div className="mt-3">
            <ChartCanvas
              config={hourlyConfig}
              height={240}
              ariaLabel={`Hourly runway movements at ${airport.id}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
