import { createRun, projectKey, validateSnapshot } from './review.js';
import { DEFAULT_PROFILE, validateProfile } from './profiles.js';
import { validateVisualDocument } from './visual-model.js';
export const WORKSPACE_KEY = 'circuitCheckUnifiedWorkspaceV1';
export const MAX_BYTES = 8 * 1024 * 1024;
export const freshWorkspace = () => ({ schema: 2, profile: structuredClone(DEFAULT_PROFILE), projects: [] });
export async function loadWorkspace() {
  if (!chrome.storage?.local) throw Error('Reload Circuit Check on the browser’s extensions page to enable review storage.');
  const data = (await chrome.storage.local.get(WORKSPACE_KEY))[WORKSPACE_KEY];
  if (!data) return freshWorkspace();
  if (data.schema !== 2 || !Array.isArray(data.projects)) throw Error('Saved review data has an unsupported format. Export it before resetting the extension.');
  return data;
}
let queue = Promise.resolve();
export async function transact(mutator) {
  const perform = async () => {
    const data = await loadWorkspace();
    const result = await mutator(data);
    if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_BYTES) throw Error('Local review library is full (8 MB). Export the library and remove an older saved review before saving more.');
    await chrome.storage.local.set({[WORKSPACE_KEY]: data});
    return { data, result };
  };
  if (globalThis.navigator?.locks) return navigator.locks.request('circuit-check-review-library', perform);
  const next = queue.then(perform); queue = next.catch(() => {}); return next;
}
export function ensureProject(data, snapshot) {
  const id = projectKey(snapshot);
  let project = data.projects.find(p => p.id === id);
  if (!project) { project = { id, title: snapshot.title, runs: [], notes: [], explanations: [], repairs: [] }; data.projects.push(project); }
  project.title = snapshot.title;
  return project;
}
export async function saveRun(run, name) {
  return transact(data => {
    const project = ensureProject(data, run.snapshot);
    if (data.projects.reduce((n, p) => n + p.runs.length, 0) >= 60) throw Error('The library holds up to 60 saved reviews. Export and remove an older review first.');
    const saved = structuredClone(run); saved.id = crypto.randomUUID(); saved.name = String(name || run.name).trim().slice(0, 160) || run.name;
    project.runs.push(saved); return saved;
  });
}
export async function saveNote(run, finding, kind, body) {
  if (!['comment', 'exception', 'reviewed', 'reopen'].includes(kind) || typeof body !== 'string' || !body.trim() || body.length > 5000) throw Error('Choose a review action and enter a reason (up to 5,000 characters).');
  return transact(data => {
    const project = ensureProject(data, run.snapshot);
    if (project.notes.length >= 500) throw Error('Export this project before adding more than 500 review notes.');
    project.notes.push({ id: crypto.randomUUID(), findingId: finding.id, evidenceHash: finding.evidenceHash, runId: run.id, kind, body: body.trim(), createdAt: new Date().toISOString() });
  });
}
export async function importWorkspace(raw) {
  if (!raw || raw.schema !== 2 || !Array.isArray(raw.projects) || raw.projects.length > 60) throw Error('Choose a Circuit Check review-library JSON export.');
  let count = 0;
  const prepared = [];
  const visuals = [];
  for (const p of raw.projects) {
    if (!p || !Array.isArray(p.runs) || p.runs.length > 60) throw Error('Invalid saved review list.');
    if(p.visual)visuals.push(await validateVisualDocument(p.visual,{imported:true}));
    for (const r of p.runs) {
      if (++count > 60) throw Error('Import supports up to 60 saved reviews.');
      const snapshot = validateSnapshot(r.snapshot, true);
      const run = await createRun(snapshot, validateProfile(r.profile), { name: String(r.name || 'Imported review').slice(0,160), imported: true });
      // Stored finding counts/provenance are never trusted: the current engine recomputes them.
      const notes = (Array.isArray(p.notes) ? p.notes : []).slice(0,500).filter(n => n && ['comment','exception','reviewed','reopen'].includes(n.kind) && typeof n.body === 'string' && n.body.length <= 5000 && typeof n.findingId === 'string' && typeof n.evidenceHash === 'string').map(n => ({id:crypto.randomUUID(),findingId:n.findingId.slice(0,400),evidenceHash:n.evidenceHash.slice(0,64),body:n.body,kind:n.kind,runId:run.id,createdAt:typeof n.createdAt === 'string' ? n.createdAt.slice(0,80) : ''}));
      const explanations = (Array.isArray(p.explanations) ? p.explanations : []).slice(-100).filter(x => x && typeof x.question === 'string' && typeof x.answer === 'string').map(x => ({
        engine: String(x.engine || '').slice(0,200), mode: 'Imported historical explanation · unverified', question: x.question.slice(0,2000), answer: x.answer.slice(0,10000),
        findingId: String(x.findingId || '').slice(0,400), evidenceHash: String(x.evidenceHash || '').slice(0,64), createdAt: String(x.createdAt || '').slice(0,80) }));
      const repairs = (Array.isArray(p.repairs) ? p.repairs : []).slice(-50).filter(x => x && typeof x.componentId === 'string' && typeof x.before === 'number' && Number.isFinite(x.before) && typeof x.after === 'number' && Number.isFinite(x.after)).map(x => ({
        id: crypto.randomUUID(), componentId: x.componentId.slice(0,200), before: x.before, after: x.after, createdAt: String(x.createdAt || '').slice(0,80), kind: 'Imported historical change · unverified', restored: true, imported: true }));
      prepared.push({run, notes, explanations, repairs});
    }
  }
  return transact(data => {
    if (data.projects.reduce((n,p)=>n+p.runs.length,0)+prepared.length > 60) throw Error('Import would exceed the 60-review library limit.');
    const noted = new Set();
    for (const {run,notes,explanations,repairs} of prepared) {
      const project = ensureProject(data, run.snapshot); project.runs.push(run);
      if (!noted.has(project.id)) {
        const noteKey=n=>JSON.stringify([n.findingId,n.kind,n.body,n.evidenceHash,n.createdAt]);
        const existing=new Set(project.notes.map(noteKey));const additional=notes.filter(n=>!existing.has(noteKey(n)));
        if(project.notes.length+additional.length>500)throw Error('Imported notes would exceed the 500-note project limit.');
        project.notes.push(...additional);project.explanations.push(...explanations);project.explanations=project.explanations.slice(-100);
        project.repairs.push(...repairs);project.repairs=project.repairs.slice(-50);noted.add(project.id);
      }
    }
    for(const visual of visuals){const project=ensureProject(data,visual.original.snapshot);if(!project.visual)project.visual={...visual,revision:0};}
    return prepared.length;
  });
}
