import { platformOf, platformLabel } from './platforms.js';
import { validateDiagram } from './wokwi.js';
import { analyze } from './analyzer.js';
import { DEFAULT_PROFILE, validateProfile } from './profiles.js';
export const ENGINE_VERSION = 'circuit-check-rules/0.6.2';
export const ADAPTER_VERSION = 'circuit-check-readers/0.6.1';
export const EXPLANATION_VERSION = 'evidence-guide/1';
const text = (value, limit = 1200) => typeof value === 'string' ? value.slice(0, limit) : '';
export function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value ?? null);
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(stable(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function projectKey(snapshot) { return platformOf(snapshot) + ':' + snapshot.designId; }
export function canonicalComponents(snapshot, includePosition = true) {
  const members = new Map();
  const identities = new Map();
  for (const c of snapshot.components) {
    const occurrences = new Map();
    for (const p of c.terminals) {
      const count = occurrences.get(p.name) || 0; occurrences.set(p.name, count + 1);
      identities.set(p, p.key || p.name + '#' + count);
    if (!p.net) continue;
    if (!members.has(p.net)) members.set(p.net, []);
      members.get(p.net).push(stable([c.id, p.name, identities.get(p)]));
    }
  }
  // The smallest unique terminal identifies a net exactly without repeating the
  // entire membership list on every pin (which would grow quadratically).
  const nets = new Map([...members].map(([key, pins]) => [key, pins.reduce((a,b)=>a.localeCompare(b)<0?a:b)]));
  return snapshot.components.map(c => ({ id: c.id, label: c.label, model: c.model, typeName: c.typeName,
    resistance: c.resistance, nested: !!c.nested,
    properties: [...(c.properties || [])].sort((a, b) => stable(a).localeCompare(stable(b))),
    terminals: c.terminals.map(p => ({ name: p.name, key: identities.get(p), net: p.net ? nets.get(p.net) : null })).sort((a, b) => stable(a).localeCompare(stable(b))),
    ...(includePosition ? { position: c.position ?? null } : {})
  })).sort((a, b) => a.id.localeCompare(b.id));
}
export function validateSnapshot(raw, imported = false) {
  if (!raw || raw.schema !== 1 || raw.error || !Array.isArray(raw.components) || raw.components.length > 500) throw Error('A valid Circuit Check snapshot with up to 500 components is required.');
  if (typeof raw.designId !== 'string' || !raw.designId || raw.designId.length > 200) throw Error('Snapshot has no valid design ID.');
  const platform=platformOf(raw);
  if(platform==='tinkercad'&&raw.diagram)throw Error('Tinkercad snapshots cannot contain a Wokwi source diagram.');
  const ids = new Set(), nets = new Set(); let pinCount = 0;
  const components = raw.components.map(c => {
    if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 200 || ids.has(c.id)) throw Error('Component IDs must be unique nonempty strings.');
    ids.add(c.id);
    if (!Array.isArray(c.terminals) || (pinCount += c.terminals.length) > 30000) throw Error('Snapshot exceeds 30,000 terminals or has invalid pin data.');
    const terminals = c.terminals.map(p => {
      if (!p || typeof p.name !== 'string' || p.name.length > 200 || (p.net !== null && (typeof p.net !== 'string' || p.net.length > 200))) throw Error('Invalid terminal or net identifier.');
      if (p.net) nets.add(p.net);
      return { name: p.name, key: text(p.key, 200), net: p.net || null, hasBreadboardPin: !!p.hasBreadboardPin };
    });
    if (c.resistance !== null && c.resistance !== undefined && (typeof c.resistance !== 'number' || !Number.isFinite(c.resistance))) throw Error('Invalid resistor value.');
    const properties = (Array.isArray(c.properties) ? c.properties : []).filter(p => p && /^(resistance|voltage|color|count|capacitance)$/i.test(p.name)).slice(0, 30).map(p => Object.fromEntries(['name', 'value', 'prefix', 'unit'].map(k => [k, text(p[k], 200)])));
    const native = (Array.isArray(c.native) ? c.native : []).filter(n => n && ['breakdown', 'warning'].includes(n.kind)).slice(0, 2).map(n => ({kind: n.kind, reason: text(n.reason, 2000)}));
    const position = c.position && ['x', 'y', 'angle'].every(k => typeof c.position[k] === 'number' && Number.isFinite(c.position[k])) ? { x: c.position.x, y: c.position.y, angle: c.position.angle } : null;
    return { id: c.id, label: text(c.label, 200), model: text(c.model, 200), typeName: text(c.typeName, 200), terminals, properties, native,
      resistance: c.resistance ?? null, nativeSupported: !!c.nativeSupported, nested: !!c.nested, position };
  });
  return { schema: 1, platform, designId: raw.designId, title: text(raw.title, 200), components, netCount: nets.size,
    diagram: raw.diagram ? validateDiagram(raw.diagram) : null,
    sourceDocument: raw.sourceDocument && typeof raw.sourceDocument.text==='string' && raw.sourceDocument.text.length<=2097152 ? {format:text(raw.sourceDocument.format,40),text:raw.sourceDocument.text} : null,
    adapterNotices: Array.isArray(raw.adapterNotices)?raw.adapterNotices.slice(0,100).map(n=>text(n,700)):[], topologyComplete:raw.topologyComplete!==false,
    captureMode: text(raw.captureMode, 80),
    wireCount: Number.isInteger(raw.wireCount) && raw.wireCount >= 0 ? raw.wireCount : null,
    simulation: ['running', 'paused', 'stopped', 'unknown'].includes(raw.simulation) ? raw.simulation : 'stopped',
    source: imported ? 'Imported review data · not a live editor reading' : text(raw.source, 200),
    imported: imported || raw.imported === true, editable: raw.editable === true && !imported && raw.imported !== true,
    capturedAt: typeof raw.capturedAt === 'string' && Number.isFinite(Date.parse(raw.capturedAt)) ? raw.capturedAt : new Date().toISOString() };
}
export async function createRun(rawSnapshot, inputProfile = DEFAULT_PROFILE, options = {}) {
  const snapshot = validateSnapshot(rawSnapshot, options.imported === true);
  const profile = validateProfile(inputProfile);
  const analysis = analyze(snapshot, profile);
  const canonical = canonicalComponents(snapshot);
  const evidenceComponents = canonicalComponents(snapshot, false);
  const membership = new Map();
  for(const c of canonical)for(const pin of c.terminals)if(pin.net){if(!membership.has(pin.net))membership.set(pin.net,[]);membership.get(pin.net).push([c.id,pin.name,pin.key]);}
  const netHashes = new Map(await Promise.all([...membership].map(async([net,pins])=>[net,await digest(pins.sort((a,b)=>stable(a).localeCompare(stable(b))))])));
  const [designHash, profileHash, coverageHash] = await Promise.all([
    digest({ platform: snapshot.platform, designId: snapshot.designId, components: canonical, wireCount: snapshot.wireCount, diagram: snapshot.diagram, sourceDocument:snapshot.sourceDocument }), digest(profile),
    digest({ engine: ENGINE_VERSION, profile, nativeActive: snapshot.simulation !== 'stopped', statuses: analysis.coverage.map(c=>({id:c.id,status:c.status})) })
  ]);
  const findings = await Promise.all(analysis.findings.map(async f => ({ ...f, evidenceHash: await digest({ engine: ENGINE_VERSION, profileHash, rule: f.rule,
    components: evidenceComponents.filter(c => f.componentIds.includes(c.id)),
    nets: [...new Set(evidenceComponents.filter(c=>f.componentIds.includes(c.id)).flatMap(c=>c.terminals.map(p=>p.net).filter(Boolean)))].sort().map(net=>[net,netHashes.get(net)]),
    native: f.rule === 'native' ? snapshot.components.filter(c => f.componentIds.includes(c.id)).map(c => c.native) : null }) })));
  return { id: crypto.randomUUID(), name: text(options.name, 160) || 'Review ' + new Date().toLocaleString(), projectId: projectKey(snapshot),
    snapshot, profile, analysis: { ...analysis, findings },
    provenance: { engine: ENGINE_VERSION, adapter: snapshot.platform+'-reader/0.6.1', platform: snapshot.platform, explanationEngine: EXPLANATION_VERSION, hashAlgorithm: 'SHA-256',
      designHash, profileHash, coverageHash, capturedAt: snapshot.capturedAt, source: snapshot.source, imported: snapshot.imported }, createdAt: new Date().toISOString() };
}
export function reviewStatus(notes, finding) {
  const decision = [...notes].reverse().find(n => n.findingId === finding.id && n.kind !== 'comment');
  if (!decision || decision.kind === 'reopen') return 'open';
  if (decision.evidenceHash !== finding.evidenceHash) return 'needs_review';
  return decision.kind === 'exception' ? 'accepted_exception' : 'reviewed';
}
export function compareRuns(before, after) {
  if (!before || !after || before.projectId !== after.projectId) throw Error('Compare reviews of the same platform and design.');
  const comparable = ['engine', 'profileHash', 'coverageHash', 'imported'].every(k => before.provenance[k] === after.provenance[k]);
  const old = new Map(before.analysis.findings.map(f => [f.id, f])), next = new Map(after.analysis.findings.map(f => [f.id, f]));
  const added = [...next.values()].filter(f => !old.has(f.id));
  const remaining = [...next.values()].filter(f => old.has(f.id)).map(f => ({ ...f, evidenceChanged: old.get(f.id).evidenceHash !== f.evidenceHash }));
  const notReported = [...old.values()].filter(f => !next.has(f.id));
  const a = new Map(canonicalComponents(before.snapshot).map(c => [c.id, c])), b = new Map(canonicalComponents(after.snapshot).map(c => [c.id, c]));
  const components = { added: [], removed: [], moved: [], rewired: [], changed: [] };
  for (const [id, c] of b) {
    const prior = a.get(id);
    if (!prior) { components.added.push(id); continue; }
    if (stable(prior.position) !== stable(c.position)) components.moved.push(id);
    if (stable(prior.terminals) !== stable(c.terminals)) components.rewired.push(id);
    if (stable({ ...prior, terminals: [], position: null }) !== stable({ ...c, terminals: [], position: null })) components.changed.push(id);
  }
  for (const id of a.keys()) if (!b.has(id)) components.removed.push(id);
  return { comparable, added, remaining, notReported, components,
    note: comparable ? 'No longer reported means absent from these supported checks; it does not verify complete circuit function. Object IDs must remain stable.' :
      'Rule, engine, simulation coverage or source trust changed. Disappeared findings require re-review and are not verified fixes.' };
}
export function explainFinding(finding, question = '') {
  if (!finding) throw Error('Select a finding first.');
  let answer;
  if (/safe|all correct|guarantee|approve/i.test(question)) answer = 'This finding and the enabled checks cannot establish whole-circuit correctness or safety. Review coverage and test the actual circuit in its simulator.';
  else if (/verif|test|check again|confirm/i.test(question)) answer = 'After changing the design, run Check circuit again and restart the project simulation. Compare with a saved review using the same profile and simulation coverage. Confirm the named finding is no longer reported and inspect any new findings.';
  else if (/fix|repair|change|solve/i.test(question)) answer = finding.fix;
  else if (/why|mean|cause|evidence/i.test(question)) answer = finding.evidence;
  else answer = 'The evidence available for this finding is: ' + finding.evidence + '\n\nSuggested action: ' + finding.fix;
  return { engine: EXPLANATION_VERSION, mode: 'Deterministic evidence guide · no AI model', question: text(question, 2000), answer, findingId: finding.id,
    evidenceHash: finding.evidenceHash, createdAt: new Date().toISOString() };
}
export async function previewResistance(run, componentId, value, { restore = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (restore ? value < 0 : value <= 0) || value > 1e9) throw Error('Enter a resistance greater than zero and at most 1,000,000,000 Ω. A restore may return to zero ohms.');
  const component = run.snapshot.components.find(c => c.id === componentId);
  if (!component || !/^resistor$/i.test(component.model) || component.resistance === null) throw Error('Only a known standard resistor value can be previewed.');
  if (component.resistance === value) throw Error('Choose a value different from the current resistance.');
  const candidate = structuredClone(run.snapshot);
  candidate.simulation = 'stopped'; candidate.components.forEach(c => { c.native = []; });
  const edited = candidate.components.find(c => c.id === componentId); edited.resistance = value;
  const property = edited.properties.find(p => p.name === 'resistance');
  if (property) { property.value = String(value); property.prefix = 'none'; }
  const next = await createRun(candidate, run.profile, { name: 'Resistor value preview' });
  return { componentId, before: component.resistance, after: value, candidate: next,
    note: 'Prediction from static rules only. No simulation was run. Preview does not change the live circuit.' };
}
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function reportHTML(run, notes = [], explanations = [], repairs = []) {
  const e = escapeHTML;
  const findings = run.analysis.findings.map(f => `<section><h3>${e(f.severity.toUpperCase())}: ${e(f.title)}</h3><p>${e(f.category)} · ${e(f.source)} · ${e(reviewStatus(notes, f))}</p><p>${e(f.evidence)}</p><p><b>Suggested action:</b> ${e(f.fix)}</p><p>Pins: ${e(f.pins.join(', ') || 'See evidence')}</p><ul>${notes.filter(n => n.findingId === f.id).map(n => `<li>${e(n.createdAt)} · ${e(n.kind)} · ${e(n.body)}${n.evidenceHash !== f.evidenceHash ? ' · earlier evidence; re-review required' : ''}</li>`).join('')}</ul></section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Circuit Check review</title><style>body{font:15px/1.65 system-ui;color:#162c42;max-width:1000px;margin:36px auto;padding:0 24px}h1,h2{line-height:1.25}table{border-collapse:collapse;width:100%}th,td{padding:9px;text-align:left;border-bottom:1px solid #ccc}section{padding:15px 0;border-bottom:1px solid #ccc}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}@media print{body{margin:0}}</style></head><body><h1>Circuit Check</h1><h2>${e(run.snapshot.title)}</h2><p>${e(run.name)} · ${e(run.snapshot.capturedAt)} · ${e(run.snapshot.source)}</p><p>Supported checks only. This report does not verify complete circuit function or fabrication readiness.</p><h2>Provenance</h2><pre>${e(JSON.stringify(run.provenance, null, 2))}</pre><h2>Profile</h2><pre>${e(JSON.stringify(run.profile, null, 2))}</pre><h2>Coverage</h2><table><tr><th>Check</th><th>Status</th><th>Evaluated</th><th>Findings</th></tr>${(run.analysis.coverage || []).map(c => `<tr><td>${e(c.label)}</td><td>${e(c.status)}</td><td>${e(c.evaluated)}</td><td>${e(c.findings)}</td></tr>`).join('')}</table><h2>Findings and review decisions</h2>${findings || '<p>No findings in the enabled supported checks.</p>'}<h2>Evidence-guide history</h2>${explanations.map(x => `<section><p><b>${e(x.question)}</b></p><p>${e(x.answer)}</p><p>${e(x.mode)} · ${e(x.createdAt)} · evidence ${e(x.evidenceHash)}</p></section>`).join('')}<h2>Approved change history</h2>${repairs.map(r => `<section><p>${e(r.createdAt)} · ${e(r.componentId)}: ${e(r.before)} Ω → ${e(r.after)} Ω</p><p>${e(r.kind || "Approved resistor change")}</p></section>`).join("")}<h2>Limits</h2><ul>${run.analysis.limitations.map(l => `<li>${e(l)}</li>`).join('')}</ul></body></html>`;
}
