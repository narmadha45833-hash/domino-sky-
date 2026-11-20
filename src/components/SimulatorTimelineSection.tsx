import React, { useState } from 'react';
import { Play, RotateCcw, Sparkles } from 'lucide-react';
import {
  ClosureConfig,
  FlightNetworkDataset,
  SimulationResult,
} from '../types/aviation';
import { TimelinePlayer } from './TimelinePlayer';
import { IndiaMap } from './IndiaMap';
import { CascadeTree } from './CascadeTree';

interface SimulatorTimelineSectionProps {
  dataset: FlightNetworkDataset;
  sim: SimulationResult;
  onRunSimulation: (config: ClosureConfig) => void;
  onResetBaseline: () => void;
  onLoadMumbai90Demo: () => void;
  timelineMin: number;
  isPlaying: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onReplay: () => void;
  onResetTimeline: () => void;
  onSeek: (min: number) => void;
  onChangeSpeed: (spd: number) => void;
  onSelectFlight: (flightId: string) => void;
}

export const SimulatorTimelineSection: React.FC<SimulatorTimelineSectionProps> = ({
  dataset,
  sim,
  onRunSimulation,
  onResetBaseline,
  onLoadMumbai90Demo,
  timelineMin,
  isPlaying,
  speed,
  onPlay,
  onPause,
  onReplay,
  onResetTimeline,
  onSeek,
  onChangeSpeed,
  onSelectFlight,
}) => {
  const [airportId, setAirportId] = useState(sim.config.airportId || 'BOM');
  const [startTime, setStartTime] = useState(sim.config.startTime || '07:30');
  const [durationMinutes, setDurationMinutes] = useState(sim.config.durationMinutes || 90);
  const [severityPct, setSeverityPct] = useState<100 | 50 | 25>(sim.config.severityPct ?? 100);
  const [enforceRunwayCapacity, setEnforceRunwayCapacity] = useState(
    sim.config.enforceRunwayCapacity ?? true
  );
  const [description, setDescription] = useState(
    sim.config.description || 'Severe Monsoon Thunderstorm'
  );
  const [autoCancelStr, setAutoCancelStr] = useState<string>(
    sim.config.autoCancelThresholdMinutes ? String(sim.config.autoCancelThresholdMinutes) : 'NONE'
  );

  // Secondary concurrent airport disruption
  const [secondaryEnabled, setSecondaryEnabled] = useState(
    Boolean(sim.config.secondary?.enabled)
  );
  const [secAirportId, setSecAirportId] = useState(sim.config.secondary?.airportId || 'PNQ');
  const [secStartTime, setSecStartTime] = useState(sim.config.secondary?.startTime || '08:30');
  const [secDuration, setSecDuration] = useState(sim.config.secondary?.durationMinutes || 45);
  const [secSeverityPct, setSecSeverityPct] = useState<100 | 50 | 25>(
    sim.config.secondary?.severityPct ?? 50
  );
  const [secDescription, setSecDescription] = useState(
    sim.config.secondary?.description || 'Secondary Weather Squall / Single Runway'
  );

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{2}:\d{2}$/.test(startTime) || (secondaryEnabled && !/^\d{2}:\d{2}$/.test(secStartTime))) {
      setErrorMsg('Start time must be in 24-hour HH:MM format.');
      return;
    }
    const [hh, mm] = startTime.split(':').map(Number);
    if (hh > 23 || mm > 59) {
      setErrorMsg('Invalid clock time (hours 00-23, minutes 00-59).');
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
      setErrorMsg('Closure duration must be between 15 and 480 minutes.');
      return;
    }
    if (secondaryEnabled && secAirportId === airportId) {
      setErrorMsg('Secondary airport must differ from primary airport.');
      return;
    }
    setErrorMsg(null);
    onRunSimulation({
      enabled: true,
      airportId,
      startTime,
      durationMinutes,
      severityPct,
      enforceRunwayCapacity,
      description: description.trim() || 'Operational Airport Closure',
      autoCancelThresholdMinutes: autoCancelStr === 'NONE' ? null : Number(autoCancelStr),
      secondary: secondaryEnabled
        ? {
            enabled: true,
            airportId: secAirportId,
            startTime: secStartTime,
            durationMinutes: secDuration,
            severityPct: secSeverityPct,
            description: secDescription.trim() || 'Secondary Restriction',
          }
        : undefined,
    });
  };

  const initiallyAffected = sim.flights.filter(
    (f) => f.disruptionSource === 'ORIGIN_CLOSURE' || f.disruptionSource === 'DEST_CLOSURE'
  );

  return (
    <div className="space-y-6">
      {/* Airport Closure Simulator Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Airport Closure & ATC Capacity Simulator
            </h2>
            <p className="text-xs text-slate-600">
              Model full shutdowns or partial runway capacity degradation, ATC slot metering (<span className="font-mono">capacity_per_hour</span>), and concurrent multi-airport weather fronts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAirportId('BOM');
                setStartTime('07:30');
                setDurationMinutes(90);
                setSeverityPct(100);
                setEnforceRunwayCapacity(true);
                setSecondaryEnabled(false);
                setDescription('Severe Monsoon Thunderstorm');
                setAutoCancelStr('NONE');
                onLoadMumbai90Demo();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-[#F0F7FF] px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-colors whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Mumbai 90m Preset
            </button>
            <button
              type="button"
              onClick={onResetBaseline}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Baseline
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Airport (16 Network Airports)
              </label>
              <select
                value={airportId}
                onChange={(e) => setAirportId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {dataset.airports.map((ap) => (
                  <option key={ap.id} value={ap.id}>
                    {ap.id} — {ap.city} ({ap.capacity_per_hour}/hr)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Time (IST)
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Duration (min)
              </label>
              <input
                type="number"
                min={15}
                max={480}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Restriction Mode
              </label>
              <select
                value={severityPct}
                onChange={(e) => setSeverityPct(Number(e.target.value) as 100 | 50 | 25)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value={100}>100% Full Ground Stop</option>
                <option value={50}>50% Single Runway / CAT-III</option>
                <option value={25}>25% Severe ATC Flow</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Auto-Cancel Threshold
              </label>
              <select
                value={autoCancelStr}
                onChange={(e) => setAutoCancelStr(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="NONE">Never (Delay Only)</option>
                <option value="90">Cancel if &gt; 90m</option>
                <option value="120">Cancel if &gt; 120m</option>
                <option value="180">Cancel if &gt; 180m</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr_auto] items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Disruption Cause Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Severe Monsoon Thunderstorm, Runway Inspection, Fog"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 pb-1.5">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enforceRunwayCapacity}
                  onChange={(e) => setEnforceRunwayCapacity(e.target.checked)}
                  className="rounded accent-blue-600"
                />
                Enforce Runway Slot Metering
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-blue-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={secondaryEnabled}
                  onChange={(e) => setSecondaryEnabled(e.target.checked)}
                  className="rounded accent-blue-600"
                />
                + Compound 2nd Airport
              </label>
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5" />
              Start Simulation
            </button>
          </div>

          {/* Optional Secondary Compound Disruption */}
          {secondaryEnabled && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-sky-200 bg-[#F0F7FF] p-3.5 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Secondary Airport
                </label>
                <select
                  value={secAirportId}
                  onChange={(e) => setSecAirportId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  {dataset.airports.map((ap) => (
                    <option key={ap.id} value={ap.id}>
                      {ap.id} — {ap.city}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Start (IST)
                </label>
                <input
                  type="time"
                  value={secStartTime}
                  onChange={(e) => setSecStartTime(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Duration (min)
                </label>
                <input
                  type="number"
                  min={15}
                  max={360}
                  value={secDuration}
                  onChange={(e) => setSecDuration(Number(e.target.value))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Severity
                </label>
                <select
                  value={secSeverityPct}
                  onChange={(e) => setSecSeverityPct(Number(e.target.value) as 100 | 50 | 25)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value={100}>100% Full Closure</option>
                  <option value={50}>50% Reduced Cap</option>
                  <option value={25}>25% Severe Flow</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Secondary Cause
                </label>
                <input
                  type="text"
                  value={secDescription}
                  onChange={(e) => setSecDescription(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>
          )}
        </form>

        {errorMsg && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Immediate Closure Impact Summary */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-sky-100 bg-[#F0F7FF] p-3">
            <div className="text-[11px] text-slate-600">Initially Affected</div>
            <div className="mt-1 font-mono text-xl font-bold text-blue-700">{initiallyAffected.length}</div>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-3">
            <div className="text-[11px] text-orange-800">Total Delayed</div>
            <div className="mt-1 font-mono text-xl font-bold text-orange-700">{sim.metrics.delayedFlights}</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
            <div className="text-[11px] text-red-800">Cancelled</div>
            <div className="mt-1 font-mono text-xl font-bold text-red-700">{sim.metrics.cancelledFlights}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] text-slate-600">Affected Aircraft</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900">{sim.metrics.affectedAircraftCount}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] text-slate-600">Missed Connections</div>
            <div className="mt-1 font-mono text-xl font-bold text-red-700">{sim.metrics.missedConnectionsCount}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] text-slate-600">Slot Metering Added</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900">+{sim.metrics.runwaySlotDelayMinutes}m</div>
          </div>
        </div>
      </div>

      {/* Live Timeline + Live Animated Network Sync */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_1fr]">
        <TimelinePlayer
          sim={sim}
          currentMin={timelineMin}
          isPlaying={isPlaying}
          speed={speed}
          onPlay={onPlay}
          onPause={onPause}
          onReplay={onReplay}
          onResetTimeline={onResetTimeline}
          onSeek={onSeek}
          onChangeSpeed={onChangeSpeed}
          onSelectFlight={onSelectFlight}
        />

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-2">
              Synchronized Network Animation
            </h3>
            <p className="text-xs text-slate-600 mb-3">
              Airborne dots track active flights at the current simulation minute. Click any airport or route for details.
            </p>
            <IndiaMap
              dataset={dataset}
              sim={sim}
              selectedAirportId={sim.config.enabled ? sim.config.airportId : null}
              selectedFlightId={null}
              onSelectAirport={() => {}}
              onSelectFlight={onSelectFlight}
              timelineCurrentMin={timelineMin}
              heightClass="h-[460px]"
            />
          </div>
        </div>
      </div>

      {/* Interactive Domino Cascade Propagation Tree */}
      <CascadeTree sim={sim} onSelectFlight={onSelectFlight} />
    </div>
  );
};
