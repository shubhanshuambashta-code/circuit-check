import { importCircuit } from './importers.js';
import { normalizeDiagram } from './wokwi.js';
export const PLATFORMS = { tinkercad: 'Tinkercad', wokwi: 'Wokwi', simduino:'SimDuino', falstad:'Falstad / CircuitJS', simulide:'SimulIDE', proteus:'Proteus', ltspice:'LTspice',circuitlab:'CircuitLab' };
export function platformForUrl(url) {
  try { const u=new URL(url);if(u.protocol!=='https:')return null;
    if(['tinkercad.com','www.tinkercad.com','editor.tinkercad.com'].includes(u.hostname))return 'tinkercad';
    if(['circuitlab.com','www.circuitlab.com'].includes(u.hostname)&&u.pathname.startsWith('/editor/'))return 'circuitlab';
    if(['simduino.com','www.simduino.com'].includes(u.hostname))return 'simduino';
    if(['falstad.com','www.falstad.com','lushprojects.com','www.lushprojects.com'].includes(u.hostname)&&/circuit/.test(u.pathname))return 'falstad';
    if(u.hostname==='wokwi.com'&&u.pathname.startsWith('/projects/'))return 'wokwi';
  }catch{}return null;
}
export function platformOf(snapshot) {
  if(snapshot?.platform!==undefined){if(!Object.hasOwn(PLATFORMS,snapshot.platform))throw Error('Unsupported circuit platform.');return snapshot.platform;}
  // Compatibility with review backups exported by the earlier editions.
  return snapshot?.diagram || /\bwokwi\b/i.test(snapshot?.source||'') ? 'wokwi' : 'tinkercad';
}
export const platformLabel = snapshot => PLATFORMS[platformOf(snapshot)];
export function captureSnapshot(platform,raw) {
  if(!Object.hasOwn(PLATFORMS,platform)||!raw||raw.schema!==1||raw.error)throw Error(raw?.error||'Circuit data is unavailable.');
  if(['simduino','falstad','simulide','proteus','ltspice','circuitlab'].includes(platform))return importCircuit(raw.text,platform,raw);
  if(platform==='wokwi')return {...normalizeDiagram(raw.diagram,raw),platform};
  return {...raw,platform,diagram:null};
}
export function selectCapture(platform,results) {
  const candidates=results.filter(r=>r.result?.schema===1),valid=candidates.filter(r=>!r.result.error);
  if(valid.length>1)throw Error('More than one circuit editor was found. Open the intended design in its own tab.');
  const found=valid[0]||candidates[0];if(!found)throw Error('No circuit editor was found. Wait for the canvas to load and check again.');
  return {snapshot:captureSnapshot(platform,found.result),frameId:found.frameId};
}
