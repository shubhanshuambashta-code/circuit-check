import {useEffect,useMemo,useRef,useState} from 'react';
import {Download,FileUp,Network,ZoomIn,ZoomOut} from 'lucide-react';
import type {DesignTarget} from './design-search';
import type {Project} from './api';
import {api} from './api';
import {importSchematicSource,schematicFromGeometry,renderSchematic,SCHEMATIC_NOTE,type SchematicSource} from './generated-schematic';
import './generated-schematic.css';
export default function GeneratedSchematic({project,onOriginal,selection}:{project?:Project;onOriginal?:()=>void;selection?:DesignTarget}){
 const [imported,setImported]=useState<SchematicSource>(),[mode,setMode]=useState<'current'|'imported'>('current'),[error,setError]=useState(''),[zoom,setZoom]=useState(70),[reading,setReading]=useState(false);
 const input=useRef<HTMLInputElement>(null),errorBox=useRef<HTMLParagraphElement>(null),token=useRef(0);
 const originalAvailable=project?.revision.result?.previews.some(preview=>preview.kind==='schematic');
 const hasPads=project?.revision.result?.geometry?.objects.some(o=>o.kind==='pad');
 const [fallback,setFallback]=useState<{key:string;source?:SchematicSource;error?:string}>();
 const sourceKey=project?project.id+':'+project.current_revision:'';
 useEffect(()=>{
  if(!project||originalAvailable||hasPads||mode!=='current')return;
  let cancelled=false;const key=project.id+':'+project.current_revision;
  setFallback({key});
  api<Record<string,unknown>>(`/projects/${project.id}/revisions/${project.current_revision}/schematic-source`).then(raw=>{
   if(cancelled)return;
   if(raw.projectId!==project.id||raw.revisionId!==project.current_revision||raw.sourceHash!==project.revision.hash)throw Error('The saved circuit revision changed. Select the circuit again.');
   const source=importSchematicSource(raw);setFallback({key,source});
  }).catch(e=>{if(!cancelled)setFallback({key,error:(e as Error).message})});
  return()=>{cancelled=true};
 },[project?.id,project?.current_revision,project?.revision.hash,originalAvailable,hasPads,mode]);
 const automatic=useMemo(()=>{
  if(!project||originalAvailable)return {source:undefined,error:''};
  if(!hasPads)return fallback?.key===sourceKey?{source:fallback.source,error:fallback.error||''}:{source:undefined,error:''};
  try{return {source:schematicFromGeometry(project.revision.result?.geometry,project.name),error:''}}catch(e){return {source:undefined,error:(e as Error).message}}
 },[project?.current_revision,project?.name,project?.revision.result?.geometry,originalAvailable,hasPads,fallback,sourceKey]);
 const source=mode==='current'?automatic.source:imported,displayError=mode==='current'?automatic.error:error;
 const diagram=useMemo(()=>source?renderSchematic(source,selection):undefined,[source,selection]);
 const canvas=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!selection)return;requestAnimationFrame(()=>canvas.current?.querySelector('[data-search-selected="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'}))},[selection,diagram]);
 const reportedOpens=mode==='current'?(project?.revision.result?.findings.filter(f=>!f.excluded&&['unconnected_items','track_dangling','via_dangling','isolated_copper','pin_not_connected'].includes(f.rule)).length||0):0;
 useEffect(()=>()=>{token.current++},[]);
 useEffect(()=>{if(displayError)errorBox.current?.focus()},[displayError]);
 function useCurrent(){token.current++;setReading(false);setError('');setImported(undefined);setMode('current');setZoom(70)}
 async function openFile(file?:File){if(!file)return;const version=++token.current;setMode('imported');setReading(true);setError('');setImported(undefined);try{
  if(file.size>5*1024*1024)throw Error('Choose a JSON file smaller than 5 MB.');
  const raw=await file.text();if(version!==token.current)return;
  let value:unknown;try{value=JSON.parse(raw)}catch{throw Error('This file is not valid JSON. Export diagram.json from Wokwi or a JSON review report from Circuit Check.');}
  const next=importSchematicSource(value);if(version===token.current){setImported(next);setZoom(70)}
 }catch(e){if(version===token.current)setError((e as Error).message)}finally{if(version===token.current)setReading(false);if(input.current)input.current.value=''}}
 function save(kind:'svg'|'json'){if(!diagram)return;const blob=new Blob([kind==='svg'?diagram.svg:diagram.netlist],{type:kind==='svg'?'image/svg+xml;charset=utf-8':'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='circuitcheck-generated-schematic.'+kind;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <section className="generated-schematic" aria-labelledby="generated-schematic-heading">
  <div className="gs-header"><div><p className="r2-eyebrow">CURRENT CIRCUIT → AUTOMATIC SCHEMATIC</p><h2 id="generated-schematic-heading">Automatic schematic</h2><p>When the original schematic is unavailable, Circuit Check draws one automatically from the open circuit. No separate import or Generate step is required. Disconnected and unfinished circuits are supported too.</p></div><Network size={30} aria-hidden="true"/></div>
  <p className="gs-note"><strong>Note:</strong> {SCHEMATIC_NOTE}</p>
  <div className="gs-current" role="status"><h3>{mode==='imported'?'Viewing another circuit':originalAvailable?'Original schematic available':automatic.source?(diagram?.openPinCount?'Open-circuit schematic created automatically':'Schematic created automatically'):displayError?'Cannot read saved circuit':'Reading saved circuit connections…'}</h3><p>{originalAvailable?'The original drawing is available for this circuit.':project?'Using the recorded connections of “'+project.name+'”. It updates when you select another circuit or its analysis supplies new connectivity.':'Open one of your saved circuits. Its existing connections are used directly.'}</p>{originalAvailable&&onOriginal&&<button className="r2-primary" onClick={onOriginal}>View original schematic</button>}{project&&!hasPads&&!originalAvailable&&!automatic.source&&!automatic.error&&<p className="gs-hint">Reading the PCB file already saved in this project. Pads without UUIDs and unassigned nets are supported; no new file import or analysis rerun is required.</p>}{mode==='imported'&&<button className="r2-secondary" onClick={useCurrent}>Return to automatic current-circuit schematic</button>}</div>
  <details className="gs-optional"><summary>Other circuit files (optional)</summary><p>The automatic current-circuit schematic above needs no file import. You can still open a separate Wokwi diagram or Circuit Check report here.</p><button className="r2-secondary" disabled={reading} onClick={()=>input.current?.click()}><FileUp size={16} aria-hidden="true"/>{reading?'Reading circuit…':'Import circuit JSON'}</button><input ref={input} type="file" accept=".json,application/json" aria-label="Import circuit JSON file" aria-describedby={displayError?'schematic-import-error':undefined} onChange={e=>void openFile(e.target.files?.[0])} className="sr-only" tabIndex={-1}/><p className="gs-hint">Maximum 5 MB, 500 components and 5,000 pins. Photos and PDFs do not contain usable net connections.</p></details>
  {displayError&&<p id="schematic-import-error" ref={errorBox} tabIndex={-1} role="alert" className="gs-error">{displayError}</p>}
  {source&&diagram&&(diagram.openPinCount>0||diagram.singlePinNetCount>0||reportedOpens>0)&&<div className="gs-open-circuit" role="status"><strong>Open / incomplete connections do not block schematic generation</strong><p>{diagram.openPinCount} unconnected pins remain marked ×. Missing connections are kept open, not automatically repaired.</p>{diagram.singlePinNetCount>0&&<p>{diagram.singlePinNetCount} nets have only one captured pin. Review these endpoints; external or intentionally unused connections can be valid.</p>}{reportedOpens>0&&<p>KiCad reports {reportedOpens} unconnected or dangling connection findings. PCB net labels show intended membership and do not prove that copper connects the endpoints.</p>}</div>}
  {source&&diagram&&<>{selection&&<p className="gs-selection" role="status">{selection.name} · {diagram.svg.includes('data-search-selected="true"')?(selection.kind==='net'?'Recorded net pins highlighted':'Component highlighted'):'No matching pins or component in this drawing'}</p>}<div className="gs-toolbar"><div aria-live="polite"><strong>{source.title}</strong><span>{diagram.partCount} components · {diagram.pinCount} pins · {diagram.netCount} nets · {diagram.openPinCount} unconnected pins · {source.source}</span></div><div className="gs-actions"><button className="r2-secondary" aria-label="Zoom out generated schematic" disabled={zoom<=30} onClick={()=>setZoom(Math.max(30,zoom-10))}><ZoomOut size={16}/></button><output aria-label="Schematic zoom">{zoom}%</output><button className="r2-secondary" aria-label="Zoom in generated schematic" disabled={zoom>=150} onClick={()=>setZoom(Math.min(150,zoom+10))}><ZoomIn size={16}/></button><button className="r2-primary" onClick={()=>save('svg')}><Download size={16} aria-hidden="true"/>Download schematic SVG</button><button className="r2-secondary" onClick={()=>save('json')}>Download connection JSON</button></div></div>
   <div ref={canvas} className="gs-canvas" tabIndex={0} aria-label="Generated schematic; scroll to inspect all components"><div style={{width:1680*zoom/100}} dangerouslySetInnerHTML={{__html:diagram.svg}}/></div>
   <div className="gs-source-notes">{diagram.openPinCount>0&&<details className="gs-open-pins"><summary>Unconnected pins ({diagram.openPinCount})</summary><ul>{diagram.openPins.slice(0,100).map(pin=><li key={pin.component+':'+pin.pinIndex}>{pin.label} · pin {pin.pin}</li>)}</ul>{diagram.openPinCount>100&&<p>Showing 100 pins. Download connection JSON for the complete list.</p>}</details>}<h3>Source notes</h3><ul>{source.notes.map(note=><li key={note}>{note}</li>)}</ul><p>Generated drawings and downloads are separate from your original circuit. PCB intended net assignments can still contain unrouted connections.</p></div>
  </>}
  {!source&&!displayError&&<div className="gs-empty"><Network size={32} aria-hidden="true"/><p>{reading?'Reading circuit connections…':originalAvailable?'Use the available original schematic.':'Reading the existing saved circuit to reconstruct its component pins…'}</p></div>}
 </section>;
}
