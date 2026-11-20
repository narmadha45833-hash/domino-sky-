import React, { useState } from 'react';
import { SimulatedCrew, SimulatedFlight, SimulationResult } from '../types/aviation';
import { formatMinutesToTime, parseTimeToMinutes } from '../engine/time';

interface GanttChartProps {
  sim: SimulationResult;
  onSelectFlight: (flightId: string) => void;
}

const DAY_START = 300; // 05:00
const DAY_END = 1380; // 23:00
const TOTAL_SPAN = DAY_END - DAY_START; // 1080 mins

const HOUR_TICKS = [5, 7, 9, 11, 13, 15, 17, 19, 21, 23];

export const GanttChart: React.FC<GanttChartProps> = ({ sim, onSelectFlight }) => {
  const [selectedCrew, setSelectedCrew] = useState<SimulatedCrew | null>(null);
  const [showCrewOverlay, setShowCrewOverlay] = useState(true);

  const pct = (min: number) => Math.max(0, Math.min(100, ((min - DAY_START) / TOTAL_SPAN) * 100));

  const closureStartMin = parseTimeToMinutes(sim.config.startTime);
  const closureEndMin = closureStartMin + sim.config.durationMinutes;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#16a34a]" /> On-Time Flight
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#ea580c]" /> Delayed Flight
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#dc2626]" /> Cancelled Flight
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#7c3aed]" /> Spare Coverage
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-sky-400 bg-sky-100" /> Turnaround / Crew Duty Span
          </span>
          {sim.config.enabled && sim.config.durationMinutes > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-blue-600/20 border border-blue-500" /> {sim.config.airportId} Closure Window
            </span>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showCrewOverlay}
            onChange={(e) => setShowCrewOverlay(e.target.checked)}
            className="rounded accent-blue-600"
          />
          Show Crew Duty & Violations
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="min-w-[960px]">
          {/* Time Header */}
          <div className="grid grid-cols-[180px_1fr] border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <div className="px-4 py-2.5 border-r border-slate-200">Aircraft / Crew</div>
            <div className="relative h-9">
              {HOUR_TICKS.map((hr) => {
                const left = pct(hr * 60);
                return (
                  <div
                    key={hr}
                    style={{ left: `${left}%` }}
                    className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center justify-center font-mono text-[11px] text-slate-500"
                  >
                    <span>{String(hr).padStart(2, '0')}:00</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aircraft Rows */}
          <div className="divide-y divide-slate-100">
            {sim.aircraft.map((ac) => {
              const crew = sim.crews.find((c) => c.tail_id === ac.tailId);
              const hasConflict = ac.scheduleConflicts.length > 0 || crew?.status === 'VIOLATION';

              return (
                <div
                  key={ac.tailId}
                  className={`grid grid-cols-[180px_1fr] items-center hover:bg-slate-50/70 transition-colors ${
                    hasConflict ? 'bg-red-50/30' : ''
                  }`}
                >
                  <div className="px-4 py-2.5 border-r border-slate-200">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-bold text-slate-900">{ac.tailId}</span>
                      <span
                        className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          ac.isSpare
                            ? 'bg-purple-100 text-purple-800'
                            : ac.delayedFlights > 0
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {ac.isSpare ? 'SPARE' : `${ac.utilizationPct}%`}
                      </span>
                    </div>
                    {crew && (
                      <button
                        type="button"
                        onClick={() => setSelectedCrew(crew)}
                        className="mt-0.5 text-left font-mono text-[11px] text-slate-500 hover:text-blue-700 underline-offset-2 hover:underline"
                      >
                        {crew.crew_id} · {crew.simDutyMins}m/{crew.max_duty_mins}m
                        {crew.status === 'VIOLATION' && (
                          <span className="ml-1 font-bold text-red-600">!</span>
                        )}
                      </button>
                    )}
                    {ac.isSpare && (
                      <div className="mt-0.5 font-mono text-[11px] text-purple-700">
                        Base {ac.baseAirport} · {ac.availability.replace('_', ' ')}
                      </div>
                    )}
                  </div>

                  {/* Timeline Track */}
                  <div className="relative h-14">
                    {/* Vertical Hour Gridlines */}
                    {HOUR_TICKS.map((hr) => (
                      <div
                        key={hr}
                        style={{ left: `${pct(hr * 60)}%` }}
                        className="absolute top-0 bottom-0 w-px bg-slate-100"
                      />
                    ))}

                    {/* Closure Shading */}
                    {sim.config.enabled && sim.config.durationMinutes > 0 && (
                      <div
                        style={{
                          left: `${pct(closureStartMin)}%`,
                          width: `${Math.max(0.5, pct(closureEndMin) - pct(closureStartMin))}%`,
                        }}
                        className="absolute top-0 bottom-0 bg-blue-500/10 border-x border-blue-400/40 pointer-events-none"
                      />
                    )}

                    {/* Crew Duty Bar */}
                    {showCrewOverlay && crew && (
                      <button
                        type="button"
                        onClick={() => setSelectedCrew(crew)}
                        title={`Crew ${crew.crew_id}: ${crew.duty_start} to ${formatMinutesToTime(crew.simFinalArrMin)} (${crew.simDutyMins}m)`}
                        style={{
                          left: `${pct(crew.dutyStartMin)}%`,
                          width: `${Math.max(1, pct(crew.simFinalArrMin) - pct(crew.dutyStartMin))}%`,
                        }}
                        className={`absolute bottom-1 h-1.5 rounded-full transition-opacity ${
                          crew.status === 'VIOLATION'
                            ? 'bg-red-500'
                            : crew.status === 'WARNING'
                            ? 'bg-amber-500'
                            : 'bg-sky-300'
                        }`}
                      />
                    )}

                    {/* Turnaround Connectors */}
                    {ac.flights.map((fl, idx) => {
                      if (idx === 0) return null;
                      const prev = ac.flights[idx - 1];
                      if (
                        prev.status === 'CANCELLED' ||
                        fl.status === 'CANCELLED' ||
                        prev.predArrMin === null ||
                        fl.predDepMin === null
                      ) {
                        return null;
                      }
                      const start = pct(prev.predArrMin);
                      const end = pct(fl.predDepMin);
                      if (end <= start) return null;
                      return (
                        <div
                          key={`turn-${fl.flight_id}`}
                          style={{ left: `${start}%`, width: `${end - start}%` }}
                          title={`Turnaround at ${fl.origin}: ${fl.predDepMin - prev.predArrMin}m`}
                          className="absolute top-[22px] h-1 bg-slate-300"
                        />
                      );
                    })}

                    {/* Flight Blocks */}
                    {ac.flights.map((fl: SimulatedFlight) => {
                      const depMin = fl.predDepMin ?? fl.schedDepMin;
                      const arrMin = fl.predArrMin ?? fl.schedArrMin;
                      const left = pct(depMin);
                      const width = Math.max(1.8, pct(arrMin) - left);

                      const bgClass =
                        fl.status === 'CANCELLED'
                          ? 'bg-red-600 hover:bg-red-700 border-red-800 opacity-85'
                          : fl.isSpareAssigned
                          ? 'bg-purple-600 hover:bg-purple-700 border-purple-800'
                          : fl.status === 'DELAYED'
                          ? 'bg-orange-500 hover:bg-orange-600 border-orange-700'
                          : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-800';

                      return (
                        <button
                          key={fl.flight_id}
                          type="button"
                          onClick={() => onSelectFlight(fl.flight_id)}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${fl.flight_id} (${fl.origin}->${fl.destination}) ${fl.predDepStr}-${fl.predArrStr} | ${fl.status}`}
                          className={`absolute top-2.5 h-7 rounded border px-1.5 text-left text-[10px] font-mono font-semibold text-white shadow-xs overflow-hidden whitespace-nowrap transition-transform hover:scale-[1.03] hover:z-10 ${bgClass}`}
                        >
                          {fl.flight_id.replace('DS', '')} {fl.origin}-{fl.destination}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Crew Inspection Bar */}
      {selectedCrew && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-sky-200 bg-[#F0F7FF] p-4 text-xs">
          <div>
            <div className="font-bold text-slate-900">
              Crew {selectedCrew.crew_id} · Aircraft {selectedCrew.tail_id} · Base {selectedCrew.base}
            </div>
            <div className="mt-1 text-slate-700">
              Duty Start: <span className="font-mono font-semibold">{selectedCrew.duty_start}</span> · Final Arrival:{' '}
              <span className="font-mono font-semibold">{formatMinutesToTime(selectedCrew.simFinalArrMin)}</span> ·
              Duration: <span className="font-mono font-semibold">{selectedCrew.simDutyMins}m</span> /{' '}
              <span className="font-mono">{selectedCrew.max_duty_mins}m</span> · {selectedCrew.notes}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedCrew(null)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};
