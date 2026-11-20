import React from 'react';
import { Pause, Play, RotateCcw, SkipBack } from 'lucide-react';
import { SimulationResult } from '../types/aviation';
import { formatMinutesToTime } from '../engine/time';

interface TimelinePlayerProps {
  sim: SimulationResult;
  currentMin: number;
  isPlaying: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onReplay: () => void;
  onResetTimeline: () => void;
  onSeek: (min: number) => void;
  onChangeSpeed: (speed: number) => void;
  onSelectFlight: (flightId: string) => void;
}

const TIMELINE_START = 300; // 05:00 IST
const TIMELINE_END = 1380; // 23:00 IST

export const TimelinePlayer: React.FC<TimelinePlayerProps> = ({
  sim,
  currentMin,
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
  const occurredEvents = sim.timelineEvents.filter((e) => e.timeMin <= currentMin);
  const upcomingEvents = sim.timelineEvents.filter((e) => e.timeMin > currentMin);

  // Flights delayed or cancelled as of currentMin
  const delayedSoFar = sim.flights.filter(
    (f) => f.status === 'DELAYED' && (f.firstDelayedAtMin ?? f.schedDepMin) <= currentMin
  );
  const cancelledSoFar = sim.flights.filter(
    (f) => f.status === 'CANCELLED' && f.schedDepMin <= currentMin
  );
  const airborneNow = sim.flights.filter(
    (f) =>
      f.status !== 'CANCELLED' &&
      f.predDepMin !== null &&
      f.predArrMin !== null &&
      currentMin >= f.predDepMin &&
      currentMin <= f.predArrMin
  );
  const affectedTailsSoFar = new Set([
    ...delayedSoFar.map((f) => f.assignedTailId),
    ...cancelledSoFar.map((f) => f.assignedTailId),
  ]);

  const progressPct = Math.round(
    ((currentMin - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100
  );

  return (
    <div className="space-y-5">
      {/* Control Deck */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-blue-700">
              LIVE MINUTE-BY-MINUTE SIMULATION TIMELINE
            </p>
            <h3 className="mt-0.5 text-lg font-bold text-slate-900">
              Current Clock: <span className="font-mono text-blue-700">{formatMinutesToTime(currentMin)} IST</span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isPlaying ? (
              <button
                type="button"
                onClick={onPlay}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5" />
                {currentMin > TIMELINE_START && currentMin < TIMELINE_END ? 'Resume' : 'Play'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onPause}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </button>
            )}

            <button
              type="button"
              onClick={onReplay}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <SkipBack className="h-3.5 w-3.5" />
              Replay
            </button>

            <button
              type="button"
              onClick={onResetTimeline}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Clock
            </button>

            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {[1, 2, 5, 10].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => onChangeSpeed(spd)}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    speed === spd
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrubber */}
        <div className="mt-5">
          <div className="flex items-center justify-between font-mono text-xs text-slate-500">
            <span>05:00 IST</span>
            <span>{progressPct}% of operating day</span>
            <span>23:00 IST</span>
          </div>
          <input
            type="range"
            min={TIMELINE_START}
            max={TIMELINE_END}
            step={1}
            value={currentMin}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Simulation timeline scrubber"
            className="mt-2 w-full accent-blue-600 cursor-pointer"
          />

          {/* Quick Jump Event Markers */}
          {sim.timelineEvents.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 mr-1">Jump to stage:</span>
              {sim.timelineEvents.slice(0, 8).map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onSeek(ev.timeMin)}
                  className={`rounded border px-2 py-0.5 font-mono text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                    currentMin >= ev.timeMin
                      ? 'border-blue-300 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {ev.timeStr} {ev.flightId ?? ev.airportId ?? ''}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Live Stage Snapshot KPIs */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-sky-100 bg-[#F0F7FF] p-3">
            <div className="text-xs text-slate-600">Airborne Now</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900">{airborneNow.length}</div>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50/70 p-3">
            <div className="text-xs text-orange-800">Delayed by {formatMinutesToTime(currentMin)}</div>
            <div className="mt-1 font-mono text-xl font-bold text-orange-700">{delayedSoFar.length}</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50/70 p-3">
            <div className="text-xs text-red-800">Cancelled by {formatMinutesToTime(currentMin)}</div>
            <div className="mt-1 font-mono text-xl font-bold text-red-700">{cancelledSoFar.length}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-600">Aircraft Impacted</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900">{affectedTailsSoFar.size}</div>
          </div>
        </div>
      </div>

      {/* Minute-by-Minute Cascade Feed */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="text-sm font-bold text-slate-900">
              Triggered Disruption Events ({occurredEvents.length})
            </h4>
            <span className="font-mono text-xs text-slate-500">Up to {formatMinutesToTime(currentMin)}</span>
          </div>
          {occurredEvents.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No disruption events have occurred at {formatMinutesToTime(currentMin)} IST. Press Play or scrub forward.
            </div>
          ) : (
            <div className="mt-3 max-h-[360px] space-y-2.5 overflow-y-auto pr-1">
              {[...occurredEvents].reverse().map((ev) => {
                const badgeStyle =
                  ev.severity === 'CRITICAL'
                    ? 'bg-red-100 text-red-800 border-red-200'
                    : ev.severity === 'HIGH'
                    ? 'bg-orange-100 text-orange-800 border-orange-200'
                    : 'bg-sky-100 text-sky-800 border-sky-200';
                return (
                  <div
                    key={ev.id}
                    onClick={() => ev.flightId && onSelectFlight(ev.flightId)}
                    className={`rounded-lg border border-slate-200 p-3 text-xs transition-colors ${
                      ev.flightId ? 'cursor-pointer hover:border-blue-300 hover:bg-[#F0F7FF]' : 'bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-slate-900">{ev.timeStr} IST</span>
                      <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${badgeStyle}`}>
                        {ev.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">{ev.title}</div>
                    <p className="mt-0.5 text-slate-600 leading-relaxed">{ev.description}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="text-sm font-bold text-slate-900">
              Upcoming Cascade Queue ({upcomingEvents.length})
            </h4>
            <span className="font-mono text-xs text-slate-500">After {formatMinutesToTime(currentMin)}</span>
          </div>
          {upcomingEvents.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              All scheduled disruption events for this scenario have been reached.
            </div>
          ) : (
            <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {upcomingEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onSeek(ev.timeMin)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-left text-xs hover:border-blue-300 hover:bg-[#F0F7FF] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-blue-700">Jump to {ev.timeStr}</span>
                    <span className="font-mono text-[10px] text-slate-500">{ev.severity}</span>
                  </div>
                  <div className="mt-1 font-semibold text-slate-800">{ev.title}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
