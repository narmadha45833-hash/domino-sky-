import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Plane, Search } from 'lucide-react';
import { FlightNetworkDataset, SimulationResult } from '../types/aviation';
import { GanttChart } from './GanttChart';

interface FlightsFleetGanttSectionProps {
  dataset: FlightNetworkDataset;
  sim: SimulationResult;
  onSelectFlight: (flightId: string) => void;
}

type SubTab = 'FLIGHTS' | 'AIRCRAFT' | 'GANTT';
type SortField = 'flight_id' | 'dep' | 'delay' | 'pax' | 'status';

export const FlightsFleetGanttSection: React.FC<FlightsFleetGanttSectionProps> = ({
  dataset,
  sim,
  onSelectFlight,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('FLIGHTS');
  const [search, setSearch] = useState('');
  const [airportFilter, setAirportFilter] = useState('ALL');
  const [tailFilter, setTailFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortField, setSortField] = useState<SortField>('dep');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 14;

  const filteredFlights = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sim.flights.filter((f) => {
      if (airportFilter !== 'ALL' && f.origin !== airportFilter && f.destination !== airportFilter) {
        return false;
      }
      if (tailFilter !== 'ALL' && f.assignedTailId !== tailFilter) {
        return false;
      }
      if (statusFilter !== 'ALL' && f.status !== statusFilter) {
        return false;
      }
      if (q) {
        const hay = `${f.flight_id} ${f.assignedTailId} ${f.origin} ${f.destination} ${f.reason}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'flight_id') cmp = a.flight_id.localeCompare(b.flight_id);
      else if (sortField === 'dep') cmp = a.schedDepMin - b.schedDepMin;
      else if (sortField === 'delay') {
        cmp = Math.max(a.depDelayMin, a.arrDelayMin) - Math.max(b.depDelayMin, b.arrDelayMin);
      } else if (sortField === 'pax') cmp = a.pax - b.pax;
      else if (sortField === 'status') cmp = a.status.localeCompare(b.status);
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [sim.flights, search, airportFilter, tailFilter, statusFilter, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredFlights.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageFlights = filteredFlights.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc((v) => !v);
    else {
      setSortField(field);
      setSortAsc(field === 'delay' ? false : true);
    }
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Segmented Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {[
            { id: 'FLIGHTS', label: `Flight Monitoring (${sim.flights.length})` },
            { id: 'AIRCRAFT', label: `Aircraft Utilization (${sim.aircraft.length})` },
            { id: 'GANTT', label: 'Aircraft & Crew Gantt Chart' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id as SubTab)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                subTab === t.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-slate-500">
          Click any flight row or Gantt block to inspect full cascade dossier
        </span>
      </div>

      {/* 1. FLIGHT MONITORING CENTRE */}
      {subTab === 'FLIGHTS' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search flight ID, aircraft, route, or disruption reason..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <select
              value={airportFilter}
              onChange={(e) => {
                setAirportFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by airport"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            >
              <option value="ALL">All Airports (16)</option>
              {dataset.airports.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} — {a.city}
                </option>
              ))}
            </select>

            <select
              value={tailFilter}
              onChange={(e) => {
                setTailFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by aircraft"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            >
              <option value="ALL">All Aircraft (18)</option>
              {sim.aircraft.map((a) => (
                <option key={a.tailId} value={a.tailId}>
                  {a.tailId} {a.isSpare ? '(Spare)' : ''}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by flight status"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            >
              <option value="ALL">All Statuses</option>
              <option value="ON_TIME">On Time ({sim.metrics.onTimeFlights})</option>
              <option value="DELAYED">Delayed ({sim.metrics.delayedFlights})</option>
              <option value="CANCELLED">Cancelled ({sim.metrics.cancelledFlights})</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-2.5 font-semibold">
                    <button type="button" onClick={() => toggleSort('flight_id')} className="inline-flex items-center gap-1 hover:text-slate-900">
                      Flight <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">Aircraft</th>
                  <th className="px-3 py-2.5 font-semibold">Route</th>
                  <th className="px-3 py-2.5 font-semibold">
                    <button type="button" onClick={() => toggleSort('dep')} className="inline-flex items-center gap-1 hover:text-slate-900">
                      Sched (Dep–Arr) <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">Pred (Dep–Arr)</th>
                  <th className="px-3 py-2.5 font-semibold text-right">
                    <button type="button" onClick={() => toggleSort('delay')} className="inline-flex items-center gap-1 hover:text-slate-900">
                      Delay <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-semibold text-right">
                    <button type="button" onClick={() => toggleSort('pax')} className="inline-flex items-center gap-1 hover:text-slate-900">
                      Pax <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">
                    <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-slate-900">
                      Status <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">Disruption Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageFlights.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-500">
                      No flights match your current filters.
                    </td>
                  </tr>
                ) : (
                  pageFlights.map((fl) => {
                    const maxD = Math.max(fl.depDelayMin, fl.arrDelayMin);
                    const statusClass =
                      fl.status === 'CANCELLED'
                        ? 'bg-red-100 text-red-800'
                        : fl.status === 'DELAYED'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-emerald-100 text-emerald-800';
                    return (
                      <tr
                        key={fl.flight_id}
                        onClick={() => onSelectFlight(fl.flight_id)}
                        className="cursor-pointer hover:bg-[#F0F7FF] transition-colors"
                      >
                        <td className="px-3 py-2.5 font-mono font-bold text-blue-800 whitespace-nowrap">
                          {fl.flight_id}
                        </td>
                        <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                          <span className={fl.isSpareAssigned ? 'font-bold text-purple-700' : 'text-slate-800'}>
                            {fl.assignedTailId}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {fl.origin} → {fl.destination}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                          {fl.dep}–{fl.arr}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {fl.predDepStr}–{fl.predArrStr}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-right whitespace-nowrap">
                          {fl.status === 'CANCELLED' ? (
                            <span className="text-red-600">--</span>
                          ) : maxD > 0 ? (
                            <span className="text-orange-600">+{maxD}m</span>
                          ) : (
                            <span className="text-slate-400">0m</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-right text-slate-700 whitespace-nowrap">
                          {fl.pax}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${statusClass}`}>
                            {fl.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 max-w-xs truncate" title={fl.reason}>
                          {fl.reason}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <span>
              Showing {(safePage - 1) * pageSize + (pageFlights.length > 0 ? 1 : 0)}–
              {(safePage - 1) * pageSize + pageFlights.length} of {filteredFlights.length} flights
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-300 px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="font-mono px-2">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-slate-300 px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. AIRCRAFT MANAGEMENT & UTILIZATION TRACKER */}
      {subTab === 'AIRCRAFT' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sim.aircraft.map((ac) => {
            const availBadge =
              ac.availability === 'SPARE_STANDBY'
                ? 'bg-purple-100 text-purple-800 border-purple-200'
                : ac.availability === 'SPARE_DEPLOYED'
                ? 'bg-purple-600 text-white border-purple-700'
                : ac.availability === 'DISRUPTED'
                ? 'bg-orange-100 text-orange-800 border-orange-200'
                : 'bg-emerald-100 text-emerald-800 border-emerald-200';

            return (
              <div
                key={ac.tailId}
                className={`rounded-xl border p-4 space-y-3 ${
                  ac.isSpare ? 'border-purple-200 bg-purple-50/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Plane className={`h-4 w-4 ${ac.isSpare ? 'text-purple-700' : 'text-blue-700'}`} />
                    <div>
                      <div className="font-mono text-sm font-bold text-slate-900">{ac.tailId}</div>
                      <div className="text-[11px] text-slate-500">
                        Base {ac.baseAirport} · Current Loc <span className="font-mono font-semibold text-slate-800">{ac.currentLocation}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${availBadge}`}>
                    {ac.availability.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-[#F0F7FF] p-2">
                    <div className="text-[10px] text-slate-500">Utilization</div>
                    <div className="font-mono text-sm font-bold text-slate-900">{ac.utilizationPct}%</div>
                  </div>
                  <div className="rounded-lg bg-[#F0F7FF] p-2">
                    <div className="text-[10px] text-slate-500">Min Turnaround</div>
                    <div className="font-mono text-sm font-bold text-slate-900">
                      {ac.minRemainingTurnaroundMin !== null ? `${ac.minRemainingTurnaroundMin}m` : 'N/A'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#F0F7FF] p-2">
                    <div className="text-[10px] text-slate-500">Total Delay</div>
                    <div className={`font-mono text-sm font-bold ${ac.totalDelayMins > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
                      {ac.totalDelayMins}m
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div>
                    <span className="font-semibold text-slate-800">First / Next Scheduled:</span>{' '}
                    {ac.nextFlight ? `${ac.nextFlight.flight_id} (${ac.nextFlight.origin}→${ac.nextFlight.destination} @ ${ac.nextFlight.dep})` : 'Standby — ready from 05:00'}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800">Previous Leg:</span>{' '}
                    {ac.previousFlight ? `${ac.previousFlight.flight_id} (${ac.previousFlight.origin}→${ac.previousFlight.destination})` : 'None / Initial Origin'}
                  </div>
                </div>

                {/* Sequence Chips */}
                {ac.flights.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {ac.flights.map((fl) => (
                      <button
                        key={fl.flight_id}
                        type="button"
                        onClick={() => onSelectFlight(fl.flight_id)}
                        className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                          fl.status === 'CANCELLED'
                            ? 'border-red-300 bg-red-50 text-red-700'
                            : fl.status === 'DELAYED'
                            ? 'border-orange-300 bg-orange-50 text-orange-800'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {fl.flight_id} {fl.origin}-{fl.destination}
                      </button>
                    ))}
                  </div>
                )}

                {ac.scheduleConflicts.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] font-medium text-red-800">
                    {ac.scheduleConflicts.join(' ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3. INTERACTIVE GANTT CHART */}
      {subTab === 'GANTT' && <GanttChart sim={sim} onSelectFlight={onSelectFlight} />}
    </div>
  );
};
