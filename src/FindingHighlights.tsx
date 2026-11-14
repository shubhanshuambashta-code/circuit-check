import {useEffect,useMemo,useState,type RefObject} from 'react';
import type {Finding,Geometry,Preview} from './api';
import type {Review3DOptions} from './review3d';

export function useFindingHighlights(geometry:Geometry|undefined,preview:Preview|undefined,options:Review3DOptions,enabled:boolean,viewer:RefObject<HTMLElement|null>,source:string){
 const [errors,setErrors]=useState(true),[warnings,setWarnings]=useState(true),[opened,setOpened]=useState<string>();
 const boardFindings=(options.findings||[]).filter(f=>!f.excluded&&f.source!=='KiCad ERC'&&(f.severity==='error'||f.severity==='warning'));
 const visible=boardFindings.filter(f=>f.severity==='error'?errors:warnings);
 const located=useMemo(()=>{
  const objects=geometry?.objects||[],byId=new Map(objects.map(o=>[o.id,o]));
  return boardFindings.map(f=>{
   const resolved=(f.board_object_ids||[]).flatMap(id=>byId.get(id)?[byId.get(id)!]:[]);
   const reported=f.file===preview?.file&&f.position&&Number.isFinite(f.position.x)&&Number.isFinite(f.position.y);
   const points=resolved.flatMap(o=>o.points);
   if(!reported&&!points.length)return {finding:f};
   const x=reported?f.position!.x:points.reduce((s,p)=>s+p[0],0)/points.length,y=reported?f.position!.y:points.reduce((s,p)=>s+p[1],0)/points.length;
   return {finding:f,x,y,back:(f.layer||resolved[0]?.layer)?.toUpperCase().startsWith('B.'),basis:reported?'Engine-reported position':'UUID-resolved object centre'};
  });
 },[geometry,preview,options.findings]);
 const all=geometry?.objects.flatMap(o=>o.points)||[],bounds=preview?.bounds_mm||(all.length?[Math.min(...all.map(p=>p[0])),Math.min(...all.map(p=>p[1])),Math.max(...all.map(p=>p[0])),Math.max(...all.map(p=>p[1]))]:[0,0,0,0]),cx=(bounds[0]+bounds[2])/2,cy=(bounds[1]+bounds[3])/2;
 const groups=new Map<string,{x:number;y:number;back?:boolean;items:{finding:Finding;basis?:string}[]}>();
 for(const item of located){if(item.x===undefined||item.y===undefined||!(item.finding.severity==='error'?errors:warnings))continue;
  // Nearby markers share a menu rather than obscuring each other on a small board.
  const nearby=[...groups].find(([,g])=>!!g.back===!!item.back&&Math.hypot(g.x-item.x!,g.y-item.y!)<3);
  const key=nearby?.[0]||`${item.finding.id}:${item.back?'B':'F'}`,group=nearby?.[1]||{x:item.x,y:item.y,back:item.back,items:[]};group.items.push(item);groups.set(key,group);
 }
 const group=opened?groups.get(opened):undefined;
 const errorCount=boardFindings.filter(f=>f.severity==='error').length,warningCount=boardFindings.length-errorCount,unmapped=located.filter(f=>f.x===undefined).length;
 useEffect(()=>{
  const el=viewer.current;if(!el||!enabled)return;let frame=0;
  const layout=()=>{frame=0;const area=el.getBoundingClientRect(),labels=[...el.querySelectorAll<HTMLElement>('[data-component-label][data-visible]')].map(label=>label.getBoundingClientRect()),placed:{left:number;top:number;right:number;bottom:number}[]=[];
   const overlaps=(a:{left:number;top:number;right:number;bottom:number},b:{left:number;top:number;right:number;bottom:number})=>a.left<b.right+3&&a.right>b.left-3&&a.top<b.bottom+3&&a.bottom>b.top-3;
   for(const marker of el.querySelectorAll<HTMLElement>('.finding-3d-marker[data-visible]')){
    marker.style.left='0px';marker.style.top='0px';const base=marker.getBoundingClientRect();let chosen:{x:number;y:number;rect:typeof placed[number]}|undefined;
    // Screen-space placement keeps markers clear of labels even when the camera rotates.
    for(const radius of [22,36,52,72,96,124]){for(let step=0;step<12;step++){const angle=step*Math.PI/6,x=Math.cos(angle)*radius,y=Math.sin(angle)*radius,rect={left:base.left+x,top:base.top+y,right:base.right+x,bottom:base.bottom+y};if(rect.left<area.left||rect.right>area.right||rect.top<area.top||rect.bottom>area.bottom)continue;if(labels.some(l=>overlaps(rect,l))||placed.some(l=>overlaps(rect,l)))continue;chosen={x,y,rect};break}if(chosen)break}
    if(chosen){marker.style.left=`${chosen.x}px`;marker.style.top=`${chosen.y}px`;placed.push(chosen.rect)}
   }
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(layout)};
  el.addEventListener('camera-change',schedule);el.addEventListener('load',schedule);
  const observer=new MutationObserver(schedule);observer.observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['data-visible']});const resize=new ResizeObserver(schedule);resize.observe(el);schedule();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();el.removeEventListener('camera-change',schedule);el.removeEventListener('load',schedule)};
 },[viewer,enabled,source,visible.map(f=>f.id).join(',')]);
 return {
  visibleFindings:visible,
  controls:enabled?<div className="finding-3d-legend" role="group" aria-label="3D finding highlights"><label><input type="checkbox" checked={errors} onChange={e=>setErrors(e.target.checked)}/><i aria-hidden="true" className="finding-key error">E</i>Errors ({errorCount})</label><label><input type="checkbox" checked={warnings} onChange={e=>setWarnings(e.target.checked)}/><i aria-hidden="true" className="finding-key warning">W</i>Warnings ({warningCount})</label><span>Click a marker to inspect.{unmapped>0?` ${unmapped} finding(s) have no mapped board location.`:''} Board findings only; excluded findings are hidden.</span></div>:null,
  markers:enabled?[...groups].map(([key,g],index)=>{const list=g.items,severity=list.some(i=>i.finding.severity==='error')?'error':'warning',selected=list.some(i=>i.finding.id===options.finding?.id),lead=list.find(i=>i.finding.id===options.finding?.id)||list[0];return <button key={key} slot={`hotspot-finding-${key}`} className={`finding-3d-marker ${severity} ${selected?'selected':''}`} data-finding-id={lead.finding.id} data-selected-object={selected?lead.finding.board_object_ids?.find(id=>geometry?.objects.some(o=>o.id===id)):undefined} data-finding-severity={severity} data-finding-count={list.length} data-position={`${g.x-cx}m ${g.back?-2:1.3}m ${cy-g.y}m`} data-normal={g.back?'0 -1 0':'0 1 0'} data-visibility-attribute="visible" aria-label={`${severity==='error'?'Error':'Warning'}: ${lead.finding.title}${list.length>1?`, ${list.length} findings near this location`:''}`} aria-pressed={selected} onClick={()=>{setOpened(key);options.onSelectFinding?.(lead.finding.id)}} title={`${list.map(i=>i.finding.title).join('\n')}\n${lead.basis}. Marker does not identify an exact collision point.`}>{severity==='error'?'E':'W'}{list.length>1?<sup>{list.length}</sup>:null}</button>}):null,
  panel:enabled&&group?<section className="finding-3d-list" aria-label="Findings at selected 3D location"><div><strong>{group.items.length} finding{group.items.length===1?'':'s'} near this location</strong><button aria-label="Close location findings" onClick={()=>setOpened(undefined)}>×</button></div>{group.items.map(item=><button key={item.finding.id} data-severity={item.finding.severity} aria-pressed={options.finding?.id===item.finding.id} onClick={()=>options.onSelectFinding?.(item.finding.id)}><b>{item.finding.severity}</b> · {item.finding.title}<small>{item.basis}</small></button>)}</section>:null,
 };
}
