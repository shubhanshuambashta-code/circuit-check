import { platformOf } from './platforms.js';
import { analyze } from './analyzer.js';
import { RULES, validateProfile } from './profiles.js';
import { createRun, previewResistance } from './review.js';

// Correction always checks every supported rule, including rules hidden by the
// ordinary review profile. A review exception never removes a correction task.
export function correctionProfile(profile) {
  return validateProfile({ ...profile, checks: Object.fromEntries(RULES.map(([id]) => [id, true])) });
}
export function correctionStatus(snapshot, profile, { live = false } = {}) {
  const analysis = analyze(snapshot, correctionProfile(profile));
  const errors = analysis.findings.filter(f => f.severity === 'error').length;
  const warnings = analysis.findings.filter(f => f.severity === 'warning').length;
  const simulationIncluded = snapshot.simulation !== 'stopped' && analysis.coverage.some(c => c.id === 'native' && c.evaluated > 0);
  return { errors, warnings, clear: errors === 0 && warnings === 0,
    current: live && !snapshot.imported, simulationIncluded, analysis,
    summary: `${errors} errors · ${warnings} warnings in supported checks`,
    note: 'All supported rules enabled; accepted exceptions remain counted. ' +
      (simulationIncluded ? 'Current Tinkercad component flags included. ' : platformOf(snapshot)==='wokwi' ? 'Wokwi simulator diagnostics are not read. Verify behavior separately in Wokwi. ' : 'Start or restart Tinkercad Simulation and recheck to read current simulator warnings. ') +
      'Coverage still excludes whole-circuit function, firmware, general ratings and complex paths.' };
}

export async function buildCorrectionPlan(run, { replacementResistance = null } = {}) {
  if (replacementResistance !== null && (typeof replacementResistance !== 'number' || !Number.isFinite(replacementResistance) || replacementResistance <= 0 || replacementResistance > 1e9)) throw Error('Choose a replacement resistance greater than zero and at most 1,000,000,000 Ω, or leave it empty.');
  const base = await createRun(run.snapshot, correctionProfile(run.profile));
  let candidate = base;
  const changes = [], rejected = new Set();
  // Work on separate static snapshots. No page API is called by this module.
  // Recompute after every proposed change, including shared resistor paths.
  for (let pass = 0; pass < 20; pass++) {
    let proposal = null;
    for (const f of candidate.analysis.findings) {
      if (f.rule === 'native') continue;
      if (f.rule === 'resistance' && replacementResistance !== null) {
        const c = candidate.snapshot.components.find(c => c.id === f.componentIds[0]);
        if (c && !rejected.has(c.id)) {
          proposal = { componentId: c.id, value: replacementResistance, reason: 'Use your selected replacement for a zero or negative resistor.' }; break;
        }
      }
      if (f.rule === 'ledMinimum' && base.profile.minLedResistance !== null) {
        const resistors = f.componentIds.map(id => candidate.snapshot.components.find(c => c.id === id))
          .filter(c => c?.model.toLowerCase() === 'resistor' && c.resistance !== null && c.resistance >= 0);
        const total = resistors.reduce((sum, c) => sum + c.resistance, 0);
        const c = resistors.find(c => !rejected.has(c.id));
        const value = c ? c.resistance + base.profile.minLedResistance - total : null;
        if (c && value > c.resistance && value <= 1e9) {
          proposal = { componentId: c.id, value, reason: `Raise the proven LED series path to your project minimum of ${base.profile.minLedResistance} Ω. This is your requirement, not a derived rating.` }; break;
        }
      }
    }
    if (!proposal) break;
    const preview = await previewResistance(candidate, proposal.componentId, proposal.value);
    const previous = candidate.analysis.findings.filter(f => f.rule !== 'native');
    const predicted = preview.candidate.analysis.findings.filter(f => f.rule !== 'native');
    // Do not offer changes that merely trade one supported finding for another.
    if (predicted.some(f => !previous.some(old => old.id === f.id)) || predicted.length >= previous.length) {
      rejected.add(proposal.componentId); continue;
    }
    const existing = changes.find(c => c.componentId === proposal.componentId);
    if (existing) existing.after = preview.after;
    else changes.push({ componentId: proposal.componentId, label: candidate.snapshot.components.find(c => c.id === proposal.componentId).label,
      before: preview.before, after: preview.after, reason: proposal.reason });
    candidate = preview.candidate;
  }
  const remaining = [...candidate.analysis.findings.filter(f => f.rule !== 'native'), ...base.analysis.findings.filter(f => f.rule === 'native')];
  const blockers = base.analysis.findings.filter(f => f.rule === 'supplyShort');
  return { schema: 1, type: 'circuit-check-correction-plan', createdAt: new Date().toISOString(),
    baseDesignHash: run.provenance.designHash, baseProfileHash: run.provenance.profileHash,
    before: base, candidate, changes, remaining, blockers,
    note: 'Static prediction only. Native simulation messages remain unresolved until simulation is restarted. Edits affect the open design; duplicate it in Wokwi first if you want a separate circuit.' };
}
