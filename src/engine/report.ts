import { jsPDF } from 'jspdf';
import {
  CostAssumptions,
  RecoveryAction,
  SimulationResult,
} from '../types/aviation';
import { calculateCostEstimate } from './analytics';
import { formatCurrencyINR, formatMinutesToTime, parseTimeToMinutes } from './time';

export function generateIncidentPdfReport(
  beforeRecoverySim: SimulationResult,
  currentSim: SimulationResult,
  recommendations: RecoveryAction[],
  costAssumptions: CostAssumptions
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = 44;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 44) {
      doc.addPage();
      y = 44;
    }
  };

  const drawSectionHeader = (title: string) => {
    ensureSpace(32);
    doc.setFillColor(240, 247, 255);
    doc.rect(margin, y, pageWidth - margin * 2, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin + 8, y + 15);
    y += 30;
  };

  // Header Banner
  doc.setFillColor(7, 16, 34);
  doc.rect(0, 0, pageWidth, 84, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('DOMINO SKY — AIRLINE DISRUPTION INCIDENT REPORT', margin, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(103, 232, 249);
  doc.text('One Disruption. A Network of Consequences. Smarter Recovery.', margin, 54);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Generated: ${new Date().toLocaleString()} | Dataset: Domino Sky flight_network.json (IST)`,
    margin,
    70
  );

  y = 104;

  // 1. Airport Closure & Scenario Details
  drawSectionHeader('1. AIRPORT CLOSURE & SCENARIO PARAMETERS');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  const closureEnd = formatMinutesToTime(
    parseTimeToMinutes(currentSim.config.startTime) + currentSim.config.durationMinutes
  );
  const closureText = currentSim.config.enabled
    ? `Selected Airport: ${currentSim.config.airportId} | Closure Window: ${currentSim.config.startTime} - ${closureEnd} IST (${currentSim.config.durationMinutes} min) | Cause: ${currentSim.config.description || 'Operational Shutdown'}`
    : 'Baseline Network State (No Active Airport Closure)';
  doc.text(closureText, margin, y, { maxWidth: pageWidth - margin * 2 });
  y += 22;

  // 2. Before vs After Recovery Comparison
  drawSectionHeader('2. SIMULATION SUMMARY & BEFORE / AFTER RECOVERY COMPARISON');
  const beforeCost = calculateCostEstimate(beforeRecoverySim, costAssumptions);
  const afterCost = calculateCostEstimate(currentSim, costAssumptions);
  const savings = Math.max(0, beforeCost.totalEstimatedCost - afterCost.totalEstimatedCost);

  const summaryRows: Array<[string, string, string]> = [
    [
      'Metric',
      'Before Recovery (Initial Disruption)',
      'After Applied Recovery',
    ],
    [
      'On-Time / Delayed / Cancelled Flights',
      `${beforeRecoverySim.metrics.onTimeFlights} / ${beforeRecoverySim.metrics.delayedFlights} / ${beforeRecoverySim.metrics.cancelledFlights}`,
      `${currentSim.metrics.onTimeFlights} / ${currentSim.metrics.delayedFlights} / ${currentSim.metrics.cancelledFlights}`,
    ],
    [
      'Total Accumulated Delay Minutes',
      `${beforeRecoverySim.metrics.totalDelayMinutes} min`,
      `${currentSim.metrics.totalDelayMinutes} min`,
    ],
    [
      'Missed Passenger Connections',
      `${beforeRecoverySim.metrics.missedConnectionsCount} (${beforeRecoverySim.passengerImpact.missedConnectionPassengers} pax)`,
      `${currentSim.metrics.missedConnectionsCount} (${currentSim.passengerImpact.missedConnectionPassengers} pax)`,
    ],
    [
      'Unique Affected / Stranded Passengers',
      `${beforeRecoverySim.passengerImpact.uniqueAffectedPassengers} affected / ${beforeRecoverySim.passengerImpact.strandedPassengers} stranded`,
      `${currentSim.passengerImpact.uniqueAffectedPassengers} affected / ${currentSim.passengerImpact.strandedPassengers} stranded`,
    ],
    [
      'Crew Duty Violations / Spares Deployed',
      `${beforeRecoverySim.metrics.crewViolationCount} violations / ${beforeRecoverySim.metrics.deployedSpareAircraft} spares`,
      `${currentSim.metrics.crewViolationCount} violations / ${currentSim.metrics.deployedSpareAircraft} spares`,
    ],
    [
      'Estimated Operational Cost (Configurable Model)',
      formatCurrencyINR(beforeCost.totalEstimatedCost),
      `${formatCurrencyINR(afterCost.totalEstimatedCost)} (Est. Savings: ${formatCurrencyINR(savings)})`,
    ],
  ];

  for (let i = 0; i < summaryRows.length; i++) {
    ensureSpace(18);
    const [col1, col2, col3] = summaryRows[i];
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.text(col1, margin, y);
    doc.text(col2, margin + 205, y);
    doc.text(col3, margin + 365, y);
    y += 15;
  }
  y += 10;

  // 3. Affected Flights List
  drawSectionHeader('3. AFFECTED FLIGHTS & CASCADE PROPAGATION (CURRENT STATE)');
  const affectedFlights = currentSim.flights.filter((f) => f.status !== 'ON_TIME');
  if (affectedFlights.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('All 70 flights operating on time.', margin, y);
    y += 18;
  } else {
    for (const fl of affectedFlights.slice(0, 28)) {
      ensureSpace(24);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(
        `${fl.flight_id} (${fl.assignedTailId}) ${fl.origin}->${fl.destination} | Sched ${fl.dep}-${fl.arr} | Pred ${fl.predDepStr}-${fl.predArrStr} | ${fl.status} (+${Math.max(
          fl.depDelayMin,
          fl.arrDelayMin
        )}m)`,
        margin,
        y
      );
      y += 11;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const wrapped = doc.splitTextToSize(fl.reason, pageWidth - margin * 2 - 12);
      doc.text(wrapped, margin + 10, y);
      y += wrapped.length * 10 + 4;
    }
    if (affectedFlights.length > 28) {
      doc.setFontSize(8);
      doc.text(`...and ${affectedFlights.length - 28} additional affected flights.`, margin, y);
      y += 14;
    }
  }

  // 4. Aircraft & Crew Constraint Analysis
  drawSectionHeader('4. AIRCRAFT DISRUPTION & CREW CONSTRAINT ALERTS');
  const disruptedAircraft = currentSim.aircraft.filter((a) => a.delayedFlights > 0 || a.cancelledFlights > 0 || a.isSpare);
  for (const ac of disruptedAircraft.slice(0, 12)) {
    ensureSpace(16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `${ac.tailId} (${ac.availability}) | Loc: ${ac.currentLocation} | Delayed: ${ac.delayedFlights} | Total Delay: ${ac.totalDelayMins}m | Util: ${ac.utilizationPct}%`,
      margin,
      y
    );
    y += 13;
  }
  const crewAlerts = currentSim.crews.filter((c) => c.status !== 'LEGAL');
  ensureSpace(18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(
    crewAlerts.length > 0
      ? `Crew Duty Alerts (${crewAlerts.length}):`
      : 'Crew Duty Status: All 16 crews remain within max_duty_mins (600m).',
    margin,
    y
  );
  y += 14;
  for (const cr of crewAlerts) {
    ensureSpace(14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`${cr.crew_id} (${cr.tail_id}): ${cr.simDutyMins}m / ${cr.max_duty_mins}m — ${cr.notes}`, margin + 8, y);
    y += 13;
  }

  // 5. Passenger Impact & Connections
  drawSectionHeader('5. PASSENGER CONNECTION IMPACT');
  const missedConns = currentSim.connections.filter((c) => c.status !== 'MADE');
  if (missedConns.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('All 21 scheduled passenger connections remain intact.', margin, y);
    y += 16;
  } else {
    for (const cx of missedConns) {
      ensureSpace(15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(
        `${cx.connection_id} at ${cx.airport}: ${cx.from_flight}->${cx.to_flight} (${cx.passengers} pax) | Avail: ${
          cx.availableConnectMin ?? 'N/A'
        }m vs Min ${cx.min_connect_minutes}m | ${cx.rebookedToFlightId ? `Rebooked: ${cx.rebookedToFlightId}` : 'Action Required'}`,
        margin,
        y
      );
      y += 13;
    }
  }

  // 6. AI Recovery Recommendations & Final Outcome
  drawSectionHeader('6. AI DISPATCHER RECOMMENDATIONS & FINAL OUTCOME');
  if (currentSim.appliedActions.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Applied Recovery Actions (${currentSim.appliedActions.length}):`, margin, y);
    y += 14;
    for (const act of currentSim.appliedActions) {
      ensureSpace(22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const lines = doc.splitTextToSize(`• ${act.title}: ${act.expectedOperationalImpact || act.summary}`, pageWidth - margin * 2 - 8);
      doc.text(lines, margin + 6, y);
      y += lines.length * 11 + 3;
    }
  }
  if (recommendations.length > 0) {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Top Remaining AI Dispatcher Recommendations:`, margin, y);
    y += 14;
    for (const rec of recommendations.slice(0, 5)) {
      ensureSpace(24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const lines = doc.splitTextToSize(
        `#${rec.rank} ${rec.title} — ${rec.expectedOperationalImpact} (Crew: ${rec.crewFeasible ? 'Feasible' : 'Restricted'})`,
        pageWidth - margin * 2 - 8
      );
      doc.text(lines, margin + 6, y);
      y += lines.length * 11 + 3;
    }
  }

  ensureSpace(28);
  y += 6;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Note: Operational metrics are deterministically calculated from flight_network.json. Financial figures are estimated from user-configurable assumptions.',
    margin,
    y
  );

  const fileTag = currentSim.config.enabled
    ? `${currentSim.config.airportId}_${currentSim.config.durationMinutes}m`
    : 'baseline';
  doc.save(`DOMINO_SKY_Incident_Report_${fileTag}.pdf`);
}
