import { loadWorkspace, transact, ensureProject } from './workspace.js';
import { newVisualDocument, validateVisualDocument } from './visual-model.js';
import { stable } from './review.js';
function sameSource(a,b) {
  return ['designHash','profileHash','coverageHash'].every(k=>a.provenance[k]===b.provenance[k])&&stable(a.snapshot.components.map(c=>[c.id,c.native]))===stable(b.snapshot.components.map(c=>[c.id,c.native]));
}
export async function openVisualProject(run) {
  const fresh=await newVisualDocument(run);
  return transact(data=>{
    const p=ensureProject(data,run.snapshot);
    if(!p.visual)p.visual=fresh;
    if(!sameSource(p.visual.original,run))p.visualSource=structuredClone(run);else delete p.visualSource;
    return p.id;
  });
}
export async function loadVisualProject(projectId) {
  const data=await loadWorkspace(),p=data.projects.find(p=>p.id===projectId);
  if(!p?.visual)throw Error('Open a checked project with the extension’s Open visual workspace button first.');
  return {document:await validateVisualDocument(p.visual),latestSource:p.visualSource||null};
}
export async function saveVisualProject(projectId,document,expectedRevision) {
  const clean=await validateVisualDocument(document);
  if(clean.original.projectId!==projectId)throw Error('The visual draft belongs to a different project.');
  return transact(data=>{
    const p=data.projects.find(p=>p.id===projectId);
    if(!p?.visual||p.visual.id!==clean.id||p.visual.revision!==expectedRevision)throw Error('This draft changed in another window. Export your unsaved draft, then reload this workspace to avoid overwriting it.');
    clean.revision=expectedRevision+1;p.visual=clean;
    if(p.visualSource&&sameSource(clean.original,p.visualSource))delete p.visualSource;
    return clean.revision;
  });
}
