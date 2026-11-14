import {useEffect,useId,useMemo,useRef,useState,type RefObject} from 'react';
import type {Geometry,Preview} from './api';
import {componentFindings,selectedObjects,type Review3DOptions} from './review3d';

interface Picker extends HTMLElement {positionAndNormalFromPoint?:(x:number,y:number)=>{position:{x:number;y:number;z:number}}|null}
const noModels:{reference:string;model:string}[]=[];
const noOptions:Review3DOptions={};
const explanations:Record<string,string>={Resistor:'Limits electric current or helps set a voltage.',Capacitor:'Stores a small amount of electrical charge; often used to smooth power or filter signals.','Connector / pin header':'A row of metal pins for connecting wires, cables or another board.','Integrated circuit':'A chip containing many tiny electronic circuits. Its exact job depends on the part.',Component:'An electronic part mounted on this board.'};
const netMeaning=(net:string)=>({GND:'ground / electrical reference','+3V3':'3.3 V power',SDA:'data signal',SCL:'clock signal'}[net]||'named electrical connection');
function packageMeaning(model:string){
 const soic=model.match(/SOIC-(\d+)(W?)_([\d.]+)x([\d.]+)mm_P([\d.]+)mm/);if(soic)return `${soic[1]}-lead ${soic[2]?'wide ':''}SOIC package; ${soic[3]} × ${soic[4]} mm body, ${soic[5]} mm between leads.`;
 const header=model.match(/PinHeader_(\d+)x(\d+)_P([\d.]+)mm/);if(header)return `${header[1]} row${header[1]==='1'?'':'s'} of ${header[2]} pins, spaced ${header[3]} mm apart.`;
 const chip=model.match(/^[RC]_(\d+)_(\d{2})(\d{2})Metric/);if(chip)return `${chip[1]} surface-mount package; about ${Number(chip[2])/10} × ${Number(chip[3])/10} mm. This describes its size, not its electrical value.`;
 return 'The package describes the physical shape and size of the part.';
}
export function useComponentLabels(viewer:RefObject<HTMLElement|null>,geometry:Geometry|undefined,preview:Preview|undefined,enabled:boolean,source:string,models:{reference:string;model:string}[]=noModels,options:Review3DOptions=noOptions){
 const [labels,setLabels]=useState(true),[active,setActive]=useState<string>(),[pinned,setPinned]=useState<string>();
 const detailId=useId();
 const detailRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(pinned)detailRef.current?.scrollIntoView({block:'nearest',behavior:'auto'})},[pinned]);
 const parts=useMemo(()=>{
  const objects=geometry?.objects||[];
  return objects.filter(o=>o.kind==='component'&&o.reference).map(o=>{
   const pads=objects.filter(p=>p.kind==='pad'&&p.reference===o.reference),pts=(pads.length?pads: [o]).flatMap(p=>p.points),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
   const type=/^R\d/i.test(o.reference!)?'Resistor':/^C\d/i.test(o.reference!)?'Capacitor':/^J\d/i.test(o.reference!)?'Connector / pin header':/^U\d/i.test(o.reference!)?'Integrated circuit':'Component';
   return {...o,reference:o.reference!,type,x0,x1,y0,y1,x:(x0+x1)/2,y:(y0+y1)/2,pads:pads.length,nets:[...new Set(pads.map(p=>p.net).filter((n):n is string=>!!n))],model:models.find(m=>m.reference===o.reference)?.model,back:o.layer?.toUpperCase().startsWith('B.')};
  });
 },[geometry,models]);
 const all=geometry?.objects.flatMap(o=>o.points)||[],bounds=preview?.bounds_mm||(all.length?[Math.min(...all.map(p=>p[0])),Math.min(...all.map(p=>p[1])),Math.max(...all.map(p=>p[0])),Math.max(...all.map(p=>p[1]))]:undefined),cx=bounds?(bounds[0]+bounds[2])/2:0,cy=bounds?(bounds[1]+bounds[3])/2:0;
 useEffect(()=>setPinned(undefined),[geometry,enabled]);
 useEffect(()=>{setActive(undefined);const el=viewer.current as Picker|null;if(!el||!enabled)return;let frame=0,down:{x:number;y:number}|undefined;
  const pick=(x:number,y:number)=>{const hit=el.positionAndNormalFromPoint?.(x,y);if(!hit)return;return parts.find(p=>hit.position.x+cx>=p.x0-.8&&hit.position.x+cx<=p.x1+.8&&cy-hit.position.z>=p.y0-.8&&cy-hit.position.z<=p.y1+.8&&(p.back?hit.position.y< -1.65:hit.position.y>.2))?.reference};
  const move=(event:PointerEvent)=>{cancelAnimationFrame(frame);if(event.buttons){setActive(undefined);return}if((event.target as HTMLElement).closest?.('[data-component-label]'))return;frame=requestAnimationFrame(()=>setActive(pick(event.clientX,event.clientY)))};
  const start=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY}};
  const end=(e:PointerEvent)=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<5&&!(e.target as HTMLElement).closest?.('button')){const ref=pick(e.clientX,e.clientY);if(ref)setPinned(ref)}down=undefined};
  const clear=()=>{cancelAnimationFrame(frame);setActive(undefined)};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setPinned(undefined);setActive(undefined);el.focus()}};
  el.addEventListener('pointermove',move);el.addEventListener('pointerdown',start);el.addEventListener('pointerup',end);el.addEventListener('pointerleave',clear);el.addEventListener('keydown',escape);
  return()=>{cancelAnimationFrame(frame);el.removeEventListener('pointermove',move);el.removeEventListener('pointerdown',start);el.removeEventListener('pointerup',end);el.removeEventListener('pointerleave',clear);el.removeEventListener('keydown',escape)};
 },[viewer,enabled,source,parts,cx,cy]);
 useEffect(()=>{if(enabled&&options.focusReference)setPinned(options.focusReference.reference)},[enabled,options.focusReference]);
 const part=enabled?parts.find(p=>p.reference===(pinned||active)):undefined,related=part?componentFindings(part.reference,part.id,geometry,options.findings):[];
 const findingVisible=!options.finding||!options.severityFindings||options.severityFindings.some(f=>f.id===options.finding?.id);
 const selected=findingVisible?selectedObjects(geometry,options):[],ids=new Set(selected.map(o=>o.id));
 const statuses=new Map(options.changes?.map(c=>[c.object.id,c.status]));
 const selectedPart=(p:typeof parts[number])=>ids.has(p.id)||(findingVisible&&options.finding?.references?.includes(p.reference))||geometry?.objects.some(o=>o.reference===p.reference&&ids.has(o.id));
 const markers=[...selected.filter(o=>o.kind!=='component'&&!options.severityFindings?.some(f=>f.board_object_ids?.includes(o.id))),...(options.changes||[]).filter(c=>c.object.kind!=='component'&&!ids.has(c.object.id)).map(c=>c.object)].slice(0,60);
 const severityFor=(p:typeof parts[number])=>{const findings=componentFindings(p.reference,p.id,geometry,options.severityFindings||options.findings).filter(f=>!f.excluded&&f.source!=='KiCad ERC');return findings.some(f=>f.severity==='error')?'error':findings.some(f=>f.severity==='warning')?'warning':undefined};
 const close=()=>{setPinned(undefined);setActive(undefined);viewer.current?.focus()};
 return {
  control:enabled?<label className="component-label-toggle"><input type="checkbox" checked={labels} onChange={e=>{setLabels(e.target.checked);if(!e.target.checked){setPinned(undefined);setActive(undefined)}}}/>Identifiers</label>:null,
  select:(reference:string)=>{setPinned(reference);setActive(reference)},
  hotspots:enabled?<>{labels&&parts.map(p=><button key={p.reference} slot={`hotspot-${p.reference}`} data-component-label={p.reference} data-selected={selectedPart(p)?'true':undefined} data-change={statuses.get(p.id)} data-severity={severityFor(p)} data-position={`${p.x-cx}m ${p.back?-5.5:p.type==='Connector / pin header'?9:p.type==='Integrated circuit'?3.1:1.1}m ${cy-p.y}m`} data-normal={p.back?'0 -1 0':'0 1 0'} data-visibility-attribute="visible" className={`component-hotspot ${active===p.reference||pinned===p.reference?'active':''}`} aria-label={`${p.reference}: ${p.type}`} aria-pressed={pinned===p.reference} aria-expanded={pinned===p.reference} aria-controls={pinned===p.reference?detailId:undefined} aria-describedby={active===p.reference&&!pinned?detailId:undefined} onPointerEnter={()=>setActive(p.reference)} onPointerLeave={()=>setActive(undefined)} onFocus={()=>setActive(p.reference)} onBlur={()=>setActive(undefined)} onClick={()=>setPinned(p.reference)} title={`${p.reference} · ${p.type}`}>{p.reference}{severityFor(p)&&<sup aria-hidden="true">{severityFor(p)==='error'?' E':' W'}</sup>}{statuses.has(p.id)&&<span> · {statuses.get(p.id)==='added'?'Added':statuses.get(p.id)==='removed'?'Removed':'Changed'}</span>}</button>)}{markers.map(o=>{const points=o.points,x=points.reduce((s,p)=>s+p[0],0)/points.length,y=points.reduce((s,p)=>s+p[1],0)/points.length;return <button key={o.id} slot={`hotspot-object-${o.id}`} className="component-hotspot object-3d-marker" data-selected-object={ids.has(o.id)?o.id:undefined} data-change={statuses.get(o.id)} data-position={`${x-cx}m ${o.layer?.toUpperCase().startsWith('B.')?-1.8:.3}m ${cy-y}m`} data-normal={o.layer?.toUpperCase().startsWith('B.')?'0 -1 0':'0 1 0'} aria-label={`Highlighted ${o.kind}${o.net?' on '+o.net:''}`} title={`UUID-resolved ${o.kind}; marker indicates object centre`}>{o.kind}{o.net?' · '+o.net:''}</button>})}</>:null,
  details:part?<div ref={detailRef} id={detailId} className={`component-tooltip ${pinned?'pinned':''}`} role={pinned?'region':'tooltip'} aria-label={pinned?`Component ${part.reference} details`:undefined} onKeyDown={e=>{if(e.key==='Escape')close()}}><strong>{part.reference} <span>{part.type}</span></strong>{pinned&&<button className="component-close" aria-label="Close component details" onClick={close}>×</button>}<p>{explanations[part.type]}</p><p className="component-id-note">{part.reference} is this part’s identifier in the design.{!pinned?' Tap or click to keep these details open.':''}</p>{part.model&&<p><b>Physical size:</b> {packageMeaning(part.model)}</p>}{part.value&&part.value!=='Review fixture'?<p><b>Design value:</b> {part.value}</p>:<p><b>Design value:</b> Not specified.</p>}{part.footprint&&<p><b>Footprint:</b> {part.footprint}</p>}{part.part_number&&<p><b>Manufacturer part:</b> {[part.manufacturer,part.part_number].filter(Boolean).join(' · ')}</p>}<p><b>Board attachment:</b> {part.pads} pads (electrical contact points), on the {part.back?'bottom':'top'} of the board.</p>{!!part.nets.length&&<p><b>Connections (nets):</b> {part.nets.map(net=>`${net} — ${netMeaning(net)}`).join('; ')}.</p>}<small>{part.model?<>KiCad library shape · Package model: {part.model.replace(/\.wrl$/,'')}</>:'Component type inferred from its identifier; 3D shape is illustrative.'}</small>{pinned&&<div className="component-related"><b>{related.length} related finding{related.length===1?'':'s'}</b>{related.map(f=><button key={f.id} aria-pressed={f.id===options.finding?.id} onClick={()=>options.onSelectFinding?.(f.id)}>{f.severity} · {f.title}{f.excluded?' (excluded)':''}</button>)}{!related.length&&<p>No finding is linked to this component in the current report. This is not a safety assessment.</p>}</div>}</div>:null,
 };
}
