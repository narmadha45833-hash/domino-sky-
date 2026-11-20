import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  Airport,
  AirportRiskProfile,
  FlightNetworkDataset,
  SimulatedFlight,
  SimulationResult,
} from '../types/aviation';
import { formatMinutesToTime } from '../engine/time';

interface IndiaMapProps {
  dataset: FlightNetworkDataset;
  sim: SimulationResult;
  selectedAirportId: string | null;
  selectedFlightId: string | null;
  onSelectAirport: (airportId: string) => void;
  onSelectFlight: (flightId: string) => void;
  timelineCurrentMin?: number | null;
  heightClass?: string;
}

// Simplified India coastal/border reference polyline so the map reads sharply even if external tiles are slow
const INDIA_OUTLINE_COORDS: [number, number][] = [
  [35.5, 76.5],
  [34.2, 78.8],
  [32.1, 78.6],
  [30.5, 79.8],
  [28.8, 80.6],
  [27.8, 84.5],
  [27.2, 88.2],
  [28.1, 92.2],
  [28.5, 96.5],
  [26.2, 95.2],
  [23.8, 93.1],
  [22.0, 91.5],
  [21.6, 88.2],
  [20.2, 86.7],
  [17.8, 83.4],
  [15.6, 80.3],
  [13.0, 80.3],
  [10.3, 79.9],
  [8.1, 77.5],
  [9.9, 76.2],
  [12.9, 74.8],
  [15.4, 73.8],
  [19.0, 72.8],
  [21.2, 72.6],
  [22.3, 69.0],
  [23.7, 68.5],
  [24.5, 70.8],
  [27.5, 70.1],
  [30.1, 73.9],
  [32.6, 74.7],
  [34.3, 73.9],
  [35.5, 76.5],
];

export const IndiaMap: React.FC<IndiaMapProps> = ({
  dataset,
  sim,
  selectedAirportId,
  selectedFlightId,
  onSelectAirport,
  onSelectFlight,
  timelineCurrentMin = null,
  heightClass = 'h-[500px]',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    routes: L.LayerGroup;
    airports: L.LayerGroup;
    aircraft: L.LayerGroup;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [21.2, 79.2],
      zoom: 5,
      minZoom: 4,
      maxZoom: 10,
      zoomControl: true,
    });

    // Dark cartographic base layer (gracefully degrades to vector outline on offline networks)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Subtle India reference outline in cyan-slate
    L.polygon(INDIA_OUTLINE_COORDS, {
      color: '#1e3a5f',
      weight: 1.5,
      fillColor: '#0c1c38',
      fillOpacity: 0.35,
      interactive: false,
    }).addTo(map);

    const routes = L.layerGroup().addTo(map);
    const airports = L.layerGroup().addTo(map);
    const aircraft = L.layerGroup().addTo(map);

    mapRef.current = map;
    layersRef.current = { routes, airports, aircraft };

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  // Re-render routes & airports when simulation or selection changes
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;

    layers.routes.clearLayers();
    layers.airports.clearLayers();
    layers.aircraft.clearLayers();

    const airportMap = new Map<string, Airport>(dataset.airports.map((a) => [a.id, a]));
    const riskMap = new Map<string, AirportRiskProfile>(
      sim.airportRisks.map((r) => [r.airport.id, r])
    );

    // Draw flight routes (prioritize delayed/cancelled/spare on top of on-time)
    const sortedFlights: SimulatedFlight[] = [...sim.flights].sort((a, b) => {
      const rank = (f: SimulatedFlight) =>
        f.flight_id === selectedFlightId
          ? 5
          : f.status === 'CANCELLED'
          ? 4
          : f.isSpareAssigned
          ? 3
          : f.status === 'DELAYED'
          ? 2
          : 1;
      return rank(a) - rank(b);
    });

    // Track drawn undirected/directed pairs to subtly curve overlapping opposite legs
    const pairCount = new Map<string, number>();

    for (const fl of sortedFlights) {
      const orig = airportMap.get(fl.origin);
      const dest = airportMap.get(fl.destination);
      if (!orig || !dest) continue;

      const pairKey = [fl.origin, fl.destination].sort().join('-');
      const idx = pairCount.get(pairKey) ?? 0;
      pairCount.set(pairKey, idx + 1);

      const isSelected = fl.flight_id === selectedFlightId;
      const isSelectedAirportRoute =
        selectedAirportId && (fl.origin === selectedAirportId || fl.destination === selectedAirportId);

      let color = '#16a34a'; // Green: Normal
      let weight = 1.6;
      let opacity = 0.42;
      let dashArray: string | undefined = undefined;

      if (fl.status === 'CANCELLED') {
        color = '#dc2626'; // Red: Cancelled
        weight = 2.4;
        opacity = 0.85;
        dashArray = '6 6';
      } else if (fl.isSpareAssigned) {
        color = '#7c3aed'; // Purple: Spare aircraft
        weight = 2.8;
        opacity = 0.92;
      } else if (fl.status === 'DELAYED') {
        color = '#ea580c'; // Orange: Delayed
        weight = 2.4;
        opacity = 0.82;
      }

      if (isSelected) {
        color = '#06b6d4';
        weight = 4;
        opacity = 1;
      } else if (isSelectedAirportRoute) {
        opacity = Math.max(opacity, 0.78);
        weight = Math.max(weight, 2.2);
      }

      // Slight midpoint offset so bidirectional routes are distinguishable
      const offsetFactor = ((idx % 4) - 1.5) * 0.25;
      const midLat = (orig.lat + dest.lat) / 2 + offsetFactor * (dest.lng - orig.lng) * 0.08;
      const midLng = (orig.lng + dest.lng) / 2 - offsetFactor * (dest.lat - orig.lat) * 0.08;

      const line = L.polyline(
        [
          [orig.lat, orig.lng],
          [midLat, midLng],
          [dest.lat, dest.lng],
        ],
        {
          color,
          weight,
          opacity,
          dashArray,
        }
      );

      line.bindTooltip(
        `<div style="font-family: 'JetBrains Mono', monospace; font-size:11px;">
          <strong>${fl.flight_id}</strong> (${fl.assignedTailId})<br/>
          ${fl.origin} → ${fl.destination} | ${fl.predDepStr}–${fl.predArrStr}<br/>
          Status: <strong>${fl.status}</strong>${
            fl.status === 'DELAYED' ? ` (+${Math.max(fl.depDelayMin, fl.arrDelayMin)}m)` : ''
          }
        </div>`,
        { sticky: true }
      );

      line.on('click', () => onSelectFlight(fl.flight_id));
      line.addTo(layers.routes);

      // If Timeline clock is active, show live airborne aircraft positions!
      if (
        timelineCurrentMin !== null &&
        fl.status !== 'CANCELLED' &&
        fl.predDepMin !== null &&
        fl.predArrMin !== null &&
        timelineCurrentMin >= fl.predDepMin &&
        timelineCurrentMin <= fl.predArrMin
      ) {
        const progress =
          (timelineCurrentMin - fl.predDepMin) /
          Math.max(1, fl.predArrMin - fl.predDepMin);
        // Quadratic Bezier interpolation through midpoint
        const oneMinusT = 1 - progress;
        const lat =
          oneMinusT * oneMinusT * orig.lat +
          2 * oneMinusT * progress * midLat +
          progress * progress * dest.lat;
        const lng =
          oneMinusT * oneMinusT * orig.lng +
          2 * oneMinusT * progress * midLng +
          progress * progress * dest.lng;

        const markerColor = fl.isSpareAssigned
          ? '#a855f7'
          : fl.status === 'DELAYED'
          ? '#fb923c'
          : '#22c55e';

        const planeMarker = L.circleMarker([lat, lng], {
          radius: 5,
          color: '#ffffff',
          weight: 1.5,
          fillColor: markerColor,
          fillOpacity: 1,
        });
        planeMarker.bindTooltip(
          `${fl.flight_id} (${fl.assignedTailId}) · ${fl.origin}→${fl.destination} · ${Math.round(
            progress * 100
          )}%`,
          { direction: 'top' }
        );
        planeMarker.on('click', () => onSelectFlight(fl.flight_id));
        planeMarker.addTo(layers.aircraft);
      }
    }

    // Draw all 16 airports
    for (const ap of dataset.airports) {
      const risk = riskMap.get(ap.id);
      const isClosed = Boolean(risk?.isClosedAirport);
      const isSelected = ap.id === selectedAirportId;
      const hasSpare = dataset.spare_aircraft.some((s) => s.base === ap.id);

      let fillColor = '#16a34a';
      if (isClosed || isSelected) {
        fillColor = '#2563eb'; // Blue for selected/closed
      } else if (risk?.riskLevel === 'CRITICAL RISK') {
        fillColor = '#dc2626';
      } else if (risk?.riskLevel === 'HIGH RISK') {
        fillColor = '#ea580c';
      } else if (risk?.riskLevel === 'MODERATE RISK') {
        fillColor = '#f59e0b';
      }

      if (isClosed) {
        L.circleMarker([ap.lat, ap.lng], {
          radius: 18,
          color: '#38bdf8',
          weight: 2,
          fillColor: '#2563eb',
          fillOpacity: 0.22,
          interactive: false,
        }).addTo(layers.airports);
      }

      const radius = ap.tier === 'mega_hub' ? 9 : ap.tier === 'regional_hub' ? 7 : 5.5;
      const marker = L.circleMarker([ap.lat, ap.lng], {
        radius: isSelected ? radius + 3 : radius,
        color: hasSpare ? '#c084fc' : '#ffffff',
        weight: hasSpare ? 2.5 : 1.5,
        fillColor,
        fillOpacity: 0.95,
      });

      marker.bindTooltip(
        `<div style="font-family: 'DM Sans', sans-serif; font-size:12px;">
          <strong>${ap.id} — ${ap.city}</strong><br/>
          ${ap.name}<br/>
          Risk: <strong>${risk?.riskLevel ?? 'LOW RISK'}</strong> (${risk?.totalDelayMinutes ?? 0}m delay)${
            hasSpare ? '<br/><span style="color:#7c3aed;font-weight:600;">Spare Aircraft Base</span>' : ''
          }${isClosed ? '<br/><span style="color:#2563eb;font-weight:700;">CLOSED IN SIMULATION</span>' : ''}
        </div>`,
        { direction: 'top', offset: [0, -6] }
      );

      marker.on('click', () => onSelectAirport(ap.id));
      marker.addTo(layers.airports);

      // Clean IATA code label
      const label = L.marker([ap.lat, ap.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#e2e8f0;text-shadow:0 1px 3px #020617;transform:translate(10px,-6px);pointer-events:none;white-space:nowrap;">${ap.id}</div>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      });
      label.addTo(layers.airports);
    }
  }, [dataset, sim, selectedAirportId, selectedFlightId, timelineCurrentMin, onSelectAirport, onSelectFlight]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-[#09152b]">
      <div ref={containerRef} className={`w-full ${heightClass}`} />
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-wrap items-center gap-3 rounded-lg border border-slate-700/80 bg-[#071022]/90 px-3 py-2 text-xs text-slate-200 backdrop-blur-sm">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" /> Normal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ea580c]" /> Delayed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#dc2626]" /> Cancelled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" /> Selected / Closed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#7c3aed]" /> Spare Aircraft
        </span>
        {timelineCurrentMin !== null && (
          <span className="ml-1 font-mono text-cyan-300">
            Live Clock: {formatMinutesToTime(timelineCurrentMin)} IST
          </span>
        )}
      </div>
    </div>
  );
};
