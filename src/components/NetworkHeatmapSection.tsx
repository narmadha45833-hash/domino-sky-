import React, { useState } from 'react';
import { MapPin, PlaneTakeoff } from 'lucide-react';
import {
  FlightNetworkDataset,
  SimulationResult,
} from '../types/aviation';
import { IndiaMap } from './IndiaMap';
import { AirportFidsPanel } from './AirportFidsPanel';

interface NetworkHeatmapSectionProps {
  dataset: FlightNetworkDataset;
  sim: SimulationResult;
  onSelectFlight: (flightId: string) => void;
}

export const NetworkHeatmapSection: React.FC<NetworkHeatmapSectionProps> = ({
  dataset,
  sim,
  onSelectFlight,
}) => {
  const [selectedAirportId, setSelectedAirportId] = useState<string>(
    sim.config.enabled ? sim.config.airportId : 'BOM'
  );

  const selectedRisk =
    sim.airportRisks.find((r) => r.airport.id === selectedAirportId) ?? sim.airportRisks[0];

  const airportFlights = sim.flights.filter(
    (f) => f.origin === selectedAirportId || f.destination === selectedAirportId
  );

  const sortedHeatmap = [...sim.airportRisks].sort((a, b) => b.riskScore - a.riskScore);

  return (
    <div className="space-y-6">
      {/* Interactive India Flight Network Map */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Interactive India Flight Network Map (Leaflet.js)
            </h2>
            <p className="text-xs text-slate-600">
              Plotted using exact airport latitude/longitude coordinates. Click any airport marker or route polyline to inspect status and cascade paths.
            </p>
          </div>
          <div className="font-mono text-xs text-slate-600">
            Selected Hub: <strong className="text-blue-700">{selectedAirportId}</strong>
          </div>
        </div>

        <IndiaMap
          dataset={dataset}
          sim={sim}
          selectedAirportId={selectedAirportId}
          selectedFlightId={null}
          onSelectAirport={setSelectedAirportId}
          onSelectFlight={onSelectFlight}
          heightClass="h-[480px]"
        />
      </div>

      {/* Airport Risk Heatmap + Selected Airport Inspector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              Airport Risk Heatmap (All 16 Airports)
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Formula: <span className="font-mono">(Delayed Dep × 3) + (Delayed Arr × 2) + (Cancelled × 6) + (Missed Conn × 4) + round(DelayMin / 45) + (Active Closure ? 8 : 0)</span>
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sortedHeatmap.map((item) => {
              const isSelected = item.airport.id === selectedAirportId;
              const tileStyle =
                item.riskLevel === 'CRITICAL RISK'
                  ? 'border-red-300 bg-red-50 text-red-950'
                  : item.riskLevel === 'HIGH RISK'
                  ? 'border-orange-300 bg-orange-50 text-orange-950'
                  : item.riskLevel === 'MODERATE RISK'
                  ? 'border-amber-300 bg-amber-50 text-amber-950'
                  : 'border-emerald-200 bg-emerald-50/70 text-emerald-950';

              const badgeText =
                item.riskLevel === 'CRITICAL RISK'
                  ? 'text-red-700'
                  : item.riskLevel === 'HIGH RISK'
                  ? 'text-orange-700'
                  : item.riskLevel === 'MODERATE RISK'
                  ? 'text-amber-700'
                  : 'text-emerald-700';

              return (
                <button
                  key={item.airport.id}
                  type="button"
                  onClick={() => setSelectedAirportId(item.airport.id)}
                  className={`rounded-xl border p-3 text-left transition-all ${tileStyle} ${
                    isSelected ? 'ring-2 ring-blue-600 ring-offset-1' : 'hover:opacity-90'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-extrabold">{item.airport.id}</span>
                    <span className="font-mono text-xs font-bold">Score {item.riskScore}</span>
                  </div>
                  <div className="mt-0.5 text-xs font-medium truncate">{item.airport.city}</div>
                  <div className={`mt-2 font-mono text-[10px] font-bold ${badgeText}`}>
                    {item.riskLevel}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] opacity-80">
                    {item.totalDelayMinutes}m · {item.delayedDepartures + item.delayedArrivals} delayed
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Airport Detailed Statistics */}
        {selectedRisk && (
          <div className="rounded-xl border border-slate-200 bg-[#F0F7FF] p-5 space-y-4">
            <div className="flex items-start justify-between gap-2 border-b border-sky-200 pb-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                  <MapPin className="h-3.5 w-3.5" />
                  {selectedRisk.airport.tier.replace('_', ' ').toUpperCase()} · CAP {selectedRisk.airport.capacity_per_hour}/HR
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {selectedRisk.airport.id} — {selectedRisk.airport.city}
                </h3>
                <p className="text-xs text-slate-600">{selectedRisk.airport.name}</p>
              </div>
              <span className="rounded-md bg-white border border-sky-200 px-2.5 py-1 font-mono text-xs font-bold text-slate-900">
                {selectedRisk.riskLevel}
              </span>
            </div>

            <div className="rounded-lg border border-sky-200 bg-white p-3 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">Transparent Score Calculation</div>
              <p className="mt-1 font-mono text-[11px] text-slate-600">
                {selectedRisk.calculationBreakdown}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-lg border border-sky-200 bg-white p-2.5">
                <div className="text-slate-500">Delayed Dep / Arr</div>
                <div className="mt-0.5 font-mono text-base font-bold text-orange-700">
                  {selectedRisk.delayedDepartures} / {selectedRisk.delayedArrivals}
                </div>
              </div>
              <div className="rounded-lg border border-sky-200 bg-white p-2.5">
                <div className="text-slate-500">Total Delay Minutes</div>
                <div className="mt-0.5 font-mono text-base font-bold text-slate-900">
                  {selectedRisk.totalDelayMinutes}m
                </div>
              </div>
              <div className="rounded-lg border border-sky-200 bg-white p-2.5">
                <div className="text-slate-500">Missed Connections</div>
                <div className="mt-0.5 font-mono text-base font-bold text-red-700">
                  {selectedRisk.missedConnections} ({selectedRisk.affectedConnectingPax} pax)
                </div>
              </div>
              <div className="rounded-lg border border-sky-200 bg-white p-2.5">
                <div className="text-slate-500">Scheduled Ops</div>
                <div className="mt-0.5 font-mono text-base font-bold text-slate-900">
                  {selectedRisk.departuresTotal} dep · {selectedRisk.arrivalsTotal} arr
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                <PlaneTakeoff className="h-3.5 w-3.5 text-blue-700" />
                Flights Touching {selectedRisk.airport.id} ({airportFlights.length})
              </h4>
              <div className="max-h-[210px] space-y-1.5 overflow-y-auto pr-1">
                {airportFlights.map((fl) => (
                  <button
                    key={fl.flight_id}
                    type="button"
                    onClick={() => onSelectFlight(fl.flight_id)}
                    className="flex w-full items-center justify-between rounded-lg border border-sky-200 bg-white px-3 py-2 text-left text-xs hover:border-blue-400 transition-colors"
                  >
                    <span className="font-mono font-semibold text-slate-900">
                      {fl.flight_id} ({fl.origin}→{fl.destination}) · {fl.predDepStr}
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        fl.status === 'CANCELLED'
                          ? 'text-red-600'
                          : fl.status === 'DELAYED'
                          ? 'text-orange-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {fl.status === 'DELAYED'
                        ? `+${Math.max(fl.depDelayMin, fl.arrDelayMin)}m`
                        : fl.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
