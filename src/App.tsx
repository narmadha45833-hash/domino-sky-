import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  Clock,
  Cpu,
  FileCheck2,
  GitCompare,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  Plane,
  Presentation,
  RotateCcw,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import {
  AppNotification,
  ClosureConfig,
  CostAssumptions,
  FlightNetworkDataset,
  RecoveryAction,
  SavedScenario,
} from './types/aviation';
import { validateDataset } from './engine/validation';
import { runSimulation } from './engine/simulation';
import { generateRecoveryRecommendations } from './engine/recovery';
import {
  DEFAULT_COST_ASSUMPTIONS,
  generateNotificationsFromSimulation,
} from './engine/analytics';
import { OverviewSection } from './components/OverviewSection';
import { SimulatorTimelineSection } from './components/SimulatorTimelineSection';
import { NetworkHeatmapSection } from './components/NetworkHeatmapSection';
import { FlightsFleetGanttSection } from './components/FlightsFleetGanttSection';
import { CrewPassengersSection } from './components/CrewPassengersSection';
import { RecoveryXaiSection } from './components/RecoveryXaiSection';
import { ScenariosEconomicsSection } from './components/ScenariosEconomicsSection';
import { ValidationReportsSection } from './components/ValidationReportsSection';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { EmergencyCommandModal } from './components/EmergencyCommandModal';
import { PresentationModeModal } from './components/PresentationModeModal';
import { FlightDetailModal } from './components/FlightDetailModal';

const STORAGE_KEY_SCENARIOS = 'domino_sky_saved_scenarios_v1';

const DEFAULT_MUMBAI_90M_CONFIG: ClosureConfig = {
  enabled: true,
  airportId: 'BOM',
  startTime: '07:30',
  durationMinutes: 90,
  severityPct: 100,
  enforceRunwayCapacity: true,
  description: 'Severe Monsoon Thunderstorm',
  autoCancelThresholdMinutes: null,
};

const BASELINE_CONFIG: ClosureConfig = {
  enabled: false,
  airportId: 'BOM',
  startTime: '07:30',
  durationMinutes: 90,
  severityPct: 100,
  enforceRunwayCapacity: true,
  description: 'Normal Operations',
  autoCancelThresholdMinutes: null,
};

type NavTabId =
  | 'overview'
  | 'simulator'
  | 'network'
  | 'fleet'
  | 'crew_pax'
  | 'recovery'
  | 'scenarios'
  | 'validation';

const NAV_ITEMS: Array<{ id: NavTabId; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'overview', label: 'Operations Dashboard', icon: LayoutDashboard },
  { id: 'simulator', label: 'Closure & Timeline', icon: Clock },
  { id: 'network', label: 'India Map & Heatmap', icon: MapIcon },
  { id: 'fleet', label: 'Flights, Fleet & Gantt', icon: Plane },
  { id: 'crew_pax', label: 'Crew & Passengers', icon: Users },
  { id: 'recovery', label: 'AI Recovery & XAI', icon: Cpu },
  { id: 'scenarios', label: 'What-If & Economics', icon: GitCompare },
  { id: 'validation', label: 'Validation & PDF', icon: FileCheck2 },
];

export default function App() {
  const [dataset, setDataset] = useState<FlightNetworkDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTabId>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [closureConfig, setClosureConfig] = useState<ClosureConfig>(DEFAULT_MUMBAI_90M_CONFIG);
  const [appliedActions, setAppliedActions] = useState<RecoveryAction[]>([]);
  const [costAssumptions, setCostAssumptions] = useState<CostAssumptions>(DEFAULT_COST_ASSUMPTIONS);

  // Live Timeline playback state (05:00 = 300 to 23:00 = 1380)
  const [timelineMin, setTimelineMin] = useState<number>(450); // Start at 07:30 IST
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(2);

  // Overlays & Modals
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);

  // Notifications & Saved Scenarios
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SCENARIOS);
      return raw ? (JSON.parse(raw) as SavedScenario[]) : [];
    } catch {
      return [];
    }
  });

  const loadDataset = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/assets/aistudio/flight_network_78529dd1.json');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} while loading flight_network.json`);
      }
      const data = (await res.json()) as FlightNetworkDataset;
      setDataset(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load flight network dataset.');
    }
  }, []);

  useEffect(() => {
    loadDataset();
  }, [loadDataset]);

  // Persist saved scenarios to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SCENARIOS, JSON.stringify(savedScenarios));
    } catch {
      // Ignore storage quota errors gracefully
    }
  }, [savedScenarios]);

  // Deterministic Validation & Simulations
  const validationIssues = useMemo(
    () => (dataset ? validateDataset(dataset) : []),
    [dataset]
  );

  const baselineSim = useMemo(
    () => (dataset ? runSimulation(dataset, BASELINE_CONFIG, []) : null),
    [dataset]
  );

  const beforeRecoverySim = useMemo(
    () => (dataset ? runSimulation(dataset, closureConfig, []) : null),
    [dataset, closureConfig]
  );

  const currentSim = useMemo(
    () => (dataset ? runSimulation(dataset, closureConfig, appliedActions) : null),
    [dataset, closureConfig, appliedActions]
  );

  const recommendations = useMemo(() => {
    if (!dataset || !currentSim) return [];
    return generateRecoveryRecommendations(dataset, closureConfig, currentSim, appliedActions);
  }, [dataset, closureConfig, currentSim, appliedActions]);

  // Generate Smart Notifications whenever currentSim updates
  useEffect(() => {
    if (!currentSim) return;
    const fresh = generateNotificationsFromSimulation(currentSim, seenNotifIdsRef.current);
    if (fresh.length > 0) {
      for (const n of fresh) seenNotifIdsRef.current.add(n.id);
      setNotifications((prev) => [...fresh, ...prev].slice(0, 120));
    }
  }, [currentSim]);

  // Live Timeline Animation Loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      setTimelineMin((prev) => {
        if (prev >= 1380) {
          setIsPlaying(false);
          return 1380;
        }
        return Math.min(1380, prev + speed);
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [isPlaying, speed]);

  // Handlers
  const handleRunSimulation = (nextConfig: ClosureConfig) => {
    setClosureConfig(nextConfig);
    setAppliedActions([]);
    setIsPlaying(false);
    setTimelineMin(420); // 07:00 IST ready to step through closure
  };

  const handleResetBaseline = () => {
    setClosureConfig(BASELINE_CONFIG);
    setAppliedActions([]);
    setIsPlaying(false);
    setTimelineMin(300);
  };

  const handleLoadMumbai90Demo = () => {
    setClosureConfig(DEFAULT_MUMBAI_90M_CONFIG);
    setAppliedActions([]);
    setIsPlaying(false);
    setTimelineMin(450); // 07:30 IST
  };

  const handleApplyRecovery = (action: RecoveryAction) => {
    setAppliedActions((prev) => {
      if (prev.some((a) => a.id === action.id)) return prev;
      return [...prev, action];
    });
  };

  const handleUndoLastRecovery = () => {
    setAppliedActions((prev) => prev.slice(0, -1));
  };

  const handleClearAllRecoveries = () => {
    setAppliedActions([]);
  };

  const handleApplyAllOptimal = () => {
    if (!dataset) return;
    let workingActions = [...appliedActions];
    for (let step = 0; step < 8; step++) {
      const simStep = runSimulation(dataset, closureConfig, workingActions);
      const recs = generateRecoveryRecommendations(dataset, closureConfig, simStep, workingActions);
      const best = recs.find((r) => r.crewFeasible && r.aircraftFeasible && r.type !== 'CANCEL_FLIGHT') ?? recs[0];
      if (!best) break;
      workingActions = [...workingActions, best];
    }
    setAppliedActions(workingActions);
  };

  const handleSaveScenario = (name: string) => {
    if (!currentSim) return;
    const entry: SavedScenario = {
      id: `sc-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      config: closureConfig,
      appliedActions,
      summary: {
        delayedFlights: currentSim.metrics.delayedFlights,
        cancelledFlights: currentSim.metrics.cancelledFlights,
        totalDelayMinutes: currentSim.metrics.totalDelayMinutes,
        missedConnections: currentSim.metrics.missedConnectionsCount,
        uniqueAffectedPassengers: currentSim.passengerImpact.uniqueAffectedPassengers,
        strandedPassengers: currentSim.passengerImpact.strandedPassengers,
        mostAffectedAirportId: currentSim.metrics.mostAffectedAirportId,
        mostAffectedTailId: currentSim.metrics.mostAffectedTailId,
      },
    };
    setSavedScenarios((prev) => [entry, ...prev]);
  };

  const handleReloadScenario = (sc: SavedScenario) => {
    setClosureConfig(sc.config);
    setAppliedActions(sc.appliedActions);
    setActiveTab('overview');
  };

  const handleDeleteScenario = (id: string) => {
    setSavedScenarios((prev) => prev.filter((s) => s.id !== id));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#071022] p-6 text-white">
        <div className="max-w-md rounded-xl border border-red-500/40 bg-[#0d1b36] p-6 text-center space-y-3">
          <h1 className="text-lg font-bold">Unable to Load Flight Network Dataset</h1>
          <p className="text-xs text-slate-300">{loadError}</p>
          <button
            type="button"
            onClick={loadDataset}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Retry Loading Dataset
          </button>
        </div>
      </div>
    );
  }

  if (!dataset || !baselineSim || !beforeRecoverySim || !currentSim) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#071022] text-slate-200">
        <div className="text-center space-y-2">
          <Activity className="mx-auto h-7 w-7 text-cyan-400 animate-spin" />
          <div className="font-display text-sm font-semibold">
            Loading DOMINO SKY flight_network.json & running deterministic validation...
          </div>
        </div>
      </div>
    );
  }

  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Operations Dashboard';

  return (
    <div className="flex min-h-screen bg-[#071022] text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-800/80 bg-[#081224] text-slate-200">
        <div className="border-b border-slate-800/80 px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Plane className="h-4 w-4" />
            </div>
            <div>
              <div className="font-display text-base font-extrabold tracking-tight text-white">
                DOMINO SKY
              </div>
              <div className="text-[11px] text-cyan-300">Flight Operations Control</div>
            </div>
          </div>
          <p className="mt-2.5 text-[11px] leading-snug text-slate-400">
            One Disruption. A Network of Consequences. Smarter Recovery.
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Quick Scenario Control */}
        <div className="border-t border-slate-800/80 p-4 space-y-2.5 text-xs">
          <div className="text-[11px] font-semibold text-slate-400">ACTIVE SIMULATION</div>
          <div className="font-mono text-xs text-cyan-300">
            {currentSim.config.enabled
              ? `${currentSim.config.airportId} · ${currentSim.config.startTime} (${currentSim.config.durationMinutes}m)`
              : 'Baseline (No Closure)'}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleLoadMumbai90Demo}
              className="flex-1 rounded-md bg-cyan-500/15 border border-cyan-500/40 py-1.5 font-semibold text-cyan-300 hover:bg-cyan-500/25 transition-colors"
            >
              BOM 90m
            </button>
            <button
              type="button"
              onClick={handleResetBaseline}
              title="Reset to baseline normal schedule"
              className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden bg-slate-950/70 backdrop-blur-xs">
          <aside className="flex w-64 flex-col bg-[#081224] text-slate-200 h-full">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <span className="font-display text-base font-extrabold text-white">DOMINO SKY</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${
                      activeTab === item.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
          <div className="flex-1" onClick={() => setMobileNavOpen(false)} />
        </div>
      )}

      {/* Main Operations Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Control Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-800/80 bg-[#09152b]/95 px-4 py-3 text-white backdrop-blur-sm lg:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
                <span className="font-semibold text-white whitespace-nowrap">{activeNavLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-cyan-300 truncate">
                  {currentSim.config.enabled
                    ? `${currentSim.config.airportId} Closure (${currentSim.config.durationMinutes}m)`
                    : 'Baseline Schedule'}
                </span>
                <span className="hidden md:inline" aria-hidden="true">·</span>
                <span className="hidden md:inline font-mono text-slate-300 whitespace-nowrap">
                  {currentSim.metrics.delayedFlights} delayed / {currentSim.metrics.missedConnectionsCount} missed conn
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Bell className="h-3.5 w-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Alerts</span>
              {unreadCount > 0 && (
                <span className="font-mono text-[11px] font-bold text-cyan-300">
                  ({unreadCount})
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setEmergencyOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/50 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/60 transition-colors whitespace-nowrap shrink-0"
            >
              <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
              <span className="hidden sm:inline">Command Mode</span>
            </button>

            <button
              type="button"
              onClick={() => setPresentationOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
            >
              <Presentation className="h-3.5 w-3.5" />
              <span>Presentation Mode</span>
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="flex-1 bg-[#f1f5f9] p-4 lg:p-6">
          <div className="mx-auto max-w-[1440px]">
            {activeTab === 'overview' && (
              <OverviewSection
                sim={currentSim}
                onNavigateTab={(tab) => setActiveTab(tab as NavTabId)}
                onLoadMumbai90Demo={handleLoadMumbai90Demo}
                onSelectFlight={setSelectedFlightId}
              />
            )}

            {activeTab === 'simulator' && (
              <SimulatorTimelineSection
                dataset={dataset}
                sim={currentSim}
                onRunSimulation={handleRunSimulation}
                onResetBaseline={handleResetBaseline}
                onLoadMumbai90Demo={handleLoadMumbai90Demo}
                timelineMin={timelineMin}
                isPlaying={isPlaying}
                speed={speed}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onReplay={() => {
                  setTimelineMin(420);
                  setIsPlaying(true);
                }}
                onResetTimeline={() => {
                  setIsPlaying(false);
                  setTimelineMin(300);
                }}
                onSeek={(m) => setTimelineMin(m)}
                onChangeSpeed={(s) => setSpeed(s)}
                onSelectFlight={setSelectedFlightId}
              />
            )}

            {activeTab === 'network' && (
              <NetworkHeatmapSection
                dataset={dataset}
                sim={currentSim}
                onSelectFlight={setSelectedFlightId}
              />
            )}

            {activeTab === 'fleet' && (
              <FlightsFleetGanttSection
                dataset={dataset}
                sim={currentSim}
                onSelectFlight={setSelectedFlightId}
              />
            )}

            {activeTab === 'crew_pax' && (
              <CrewPassengersSection
                sim={currentSim}
                onApplyRecovery={handleApplyRecovery}
                onSelectFlight={setSelectedFlightId}
              />
            )}

            {activeTab === 'recovery' && (
              <RecoveryXaiSection
                beforeRecoverySim={beforeRecoverySim}
                currentSim={currentSim}
                recommendations={recommendations}
                onApplyRecovery={handleApplyRecovery}
                onUndoLastRecovery={handleUndoLastRecovery}
                onClearAllRecoveries={handleClearAllRecoveries}
                onApplyAllOptimal={handleApplyAllOptimal}
              />
            )}

            {activeTab === 'scenarios' && (
              <ScenariosEconomicsSection
                dataset={dataset}
                beforeRecoverySim={beforeRecoverySim}
                currentSim={currentSim}
                costAssumptions={costAssumptions}
                savedScenarios={savedScenarios}
                onUpdateCostAssumptions={setCostAssumptions}
                onResetCostAssumptions={() => setCostAssumptions(DEFAULT_COST_ASSUMPTIONS)}
                onLoadClosureConfig={(cfg) => {
                  handleRunSimulation(cfg);
                  setActiveTab('simulator');
                }}
                onSaveCurrentScenario={handleSaveScenario}
                onReloadSavedScenario={handleReloadScenario}
                onDeleteSavedScenario={handleDeleteScenario}
              />
            )}

            {activeTab === 'validation' && (
              <ValidationReportsSection
                validationIssues={validationIssues}
                beforeRecoverySim={beforeRecoverySim}
                currentSim={currentSim}
                recommendations={recommendations}
                costAssumptions={costAssumptions}
              />
            )}
          </div>
        </main>
      </div>

      {/* Overlays & Modals */}
      <NotificationsDrawer
        open={notificationsOpen}
        notifications={notifications}
        onClose={() => setNotificationsOpen(false)}
        onMarkRead={(id) =>
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n))
          )
        }
        onMarkAllRead={() =>
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        }
        onClearAll={() => setNotifications([])}
      />

      <EmergencyCommandModal
        open={emergencyOpen}
        sim={currentSim}
        recommendations={recommendations}
        onClose={() => setEmergencyOpen(false)}
        onApplyRecovery={handleApplyRecovery}
        onApplyAllOptimal={handleApplyAllOptimal}
        onSelectFlight={(fid) => {
          setSelectedFlightId(fid);
        }}
      />

      <PresentationModeModal
        open={presentationOpen}
        dataset={dataset}
        baselineSim={baselineSim}
        beforeRecoverySim={beforeRecoverySim}
        currentSim={currentSim}
        recommendations={recommendations}
        costAssumptions={costAssumptions}
        onClose={() => setPresentationOpen(false)}
        onLoadMumbai90Demo={handleLoadMumbai90Demo}
        onApplyAllOptimal={handleApplyAllOptimal}
        onResetSimulation={handleLoadMumbai90Demo}
      />

      <FlightDetailModal
        flightId={selectedFlightId}
        dataset={dataset}
        sim={currentSim}
        onClose={() => setSelectedFlightId(null)}
        onSelectFlight={setSelectedFlightId}
        onApplyRecovery={handleApplyRecovery}
      />
    </div>
  );
}
