import React from 'react';
import { AlertTriangle, CheckCircle2, FileDown, ShieldAlert } from 'lucide-react';
import {
  CostAssumptions,
  RecoveryAction,
  SimulationResult,
  ValidationIssue,
} from '../types/aviation';
import { generateIncidentPdfReport } from '../engine/report';
import { calculateCostEstimate } from '../engine/analytics';
import { formatCurrencyINR } from '../engine/time';

interface ValidationReportsSectionProps {
  validationIssues: ValidationIssue[];
  beforeRecoverySim: SimulationResult;
  currentSim: SimulationResult;
  recommendations: RecoveryAction[];
  costAssumptions: CostAssumptions;
}

export const ValidationReportsSection: React.FC<ValidationReportsSectionProps> = ({
  validationIssues,
  beforeRecoverySim,
  currentSim,
  recommendations,
  costAssumptions,
}) => {
  const passCount = validationIssues.filter((i) => i.severity === 'PASS').length;
  const warnCount = validationIssues.filter((i) => i.severity === 'WARNING').length;
  const errCount = validationIssues.filter((i) => i.severity === 'ERROR').length;

  const beforeCost = calculateCostEstimate(beforeRecoverySim, costAssumptions);
  const afterCost = calculateCostEstimate(currentSim, costAssumptions);

  return (
    <div className="space-y-6">
      {/* 1. AUTOMATIC INCIDENT REPORT GENERATOR */}
      <div className="rounded-xl border border-sky-200 bg-[#F0F7FF] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-blue-800">
              AUTOMATIC INCIDENT REPORT GENERATOR (PDF)
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              Export Executive Operations Incident Report
            </h2>
            <p className="mt-1 text-xs text-slate-600 max-w-2xl">
              Generates a formatted multi-page PDF with DOMINO SKY branding covering closure details, affected flights, aircraft & crew constraint alerts, passenger impact, AI recommendations, Before-and-After comparisons, and estimated financial savings.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              generateIncidentPdfReport(
                beforeRecoverySim,
                currentSim,
                recommendations,
                costAssumptions
              )
            }
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="h-4 w-4" />
            Download PDF Incident Report
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
          <div className="rounded-lg border border-sky-200 bg-white p-3">
            <div className="text-slate-500">Scenario</div>
            <div className="mt-0.5 font-mono font-bold text-slate-900">
              {currentSim.config.enabled
                ? `${currentSim.config.airportId} (${currentSim.config.durationMinutes}m)`
                : 'Baseline'}
            </div>
          </div>
          <div className="rounded-lg border border-sky-200 bg-white p-3">
            <div className="text-slate-500">Affected Flights</div>
            <div className="mt-0.5 font-mono font-bold text-orange-700">
              {currentSim.metrics.delayedFlights + currentSim.metrics.cancelledFlights}
            </div>
          </div>
          <div className="rounded-lg border border-sky-200 bg-white p-3">
            <div className="text-slate-500">Applied Recoveries</div>
            <div className="mt-0.5 font-mono font-bold text-emerald-700">
              {currentSim.appliedActions.length}
            </div>
          </div>
          <div className="rounded-lg border border-sky-200 bg-white p-3">
            <div className="text-slate-500">Est. Cost Savings</div>
            <div className="mt-0.5 font-mono font-bold text-blue-800">
              {formatCurrencyINR(
                Math.max(0, beforeCost.totalEstimatedCost - afterCost.totalEstimatedCost)
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. DATA QUALITY & VALIDATION PANEL */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Dataset Quality & Integrity Validation (<span className="font-mono">flight_network.json</span>)
            </h3>
            <p className="text-xs text-slate-600">
              Automated structural and operational validation executed before simulation.
            </p>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-emerald-700 font-bold">{passCount} PASS</span>
            <span className="text-amber-700 font-bold">{warnCount} WARN</span>
            <span className="text-red-700 font-bold">{errCount} ERR</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {validationIssues.map((issue) => {
            const style =
              issue.severity === 'ERROR'
                ? 'border-red-200 bg-red-50/70'
                : issue.severity === 'WARNING'
                ? 'border-amber-200 bg-amber-50/70'
                : 'border-emerald-200 bg-emerald-50/50';
            return (
              <div key={issue.id} className={`rounded-lg border p-3.5 text-xs ${style}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    {issue.severity === 'ERROR' ? (
                      <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
                    ) : issue.severity === 'WARNING' ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    )}
                    <span>{issue.title}</span>
                  </div>
                  <span className="font-mono text-[10px] font-bold text-slate-600">
                    {issue.severity}
                  </span>
                </div>
                <p className="mt-1.5 text-slate-700 leading-relaxed">{issue.detail}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. DATA PROVENANCE & TRANSPARENCY LEDGER */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3">
          Data Provenance & Calculation Transparency Standard
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="font-bold text-slate-900">1. Actual Dataset Values</div>
            <p className="mt-1 text-slate-600">
              16 airports (lat/lng, tier, hourly capacity), 70 flights, 16 aircraft rotations, 21 connections, 16 crew rosters, and 2 spare aircraft (VT-DS17, VT-DS18) from <span className="font-mono">flight_network.json</span>.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="font-bold text-slate-900">2. Deterministic Simulation</div>
            <p className="mt-1 text-slate-600">
              All departure/arrival delays, turnaround propagation (30m min), connection shortfalls, crew FDTL durations (600m max), and deduplicated passenger metrics are calculated reproducibly in TypeScript.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="font-bold text-slate-900">3. Estimated Financial Values</div>
            <p className="mt-1 text-slate-600">
              Operational loss and recovery savings are explicitly estimated from user-configurable unit cost assumptions in INR — not dataset financial figures.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="font-bold text-slate-900">4. Explainable AI Dispatcher</div>
            <p className="mt-1 text-slate-600">
              Recovery options are ranked deterministically using verified pre/post simulation runs and explicit crew/aircraft feasibility checks without inventing statistics.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
