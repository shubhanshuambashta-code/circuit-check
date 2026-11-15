import type {Geometry, Result} from './api';

export interface DesignTarget {kind:'component'|'net';name:string;sourceIds?:string[]}
export type NetMembers=Record<string,string[]>;
// Search text ignores case; selected identities preserve native net/reference names.
const equal=(a?:string,b?:string)=>!!a&&!!b&&a===b;

// Native netlist membership locates connected symbol anchors; it does not infer wire paths.
export function parseNetMembers(xml:string):NetMembers {
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.querySelector('parsererror'))throw Error('The native netlist could not be read.');
 const members:NetMembers=Object.create(null);
 doc.querySelectorAll('nets > net').forEach(net=>{
  const name=net.getAttribute('name');if(!name)return;
  members[name]=[...new Set(Array.from(net.querySelectorAll('node')).map(n=>n.getAttribute('ref')||'').filter(Boolean))];
 });
 return members;
}
export function targetIds(geometry:Geometry|undefined,target:DesignTarget|undefined,members:NetMembers={}):string[]{
 if(!target)return [];
 const refs=target.kind==='net'?Object.entries(members).find(([net])=>equal(net,target.name))?.[1]||[]:[];
 return geometry?.objects.filter(o=>target.kind==='component'?equal(o.reference,target.name):equal(o.net,target.name)||(o.kind==='symbol anchor'&&refs.some(ref=>equal(ref,o.reference)))).map(o=>o.id)||[];
}
export function designTargets(result:Result|undefined,members:NetMembers={}):DesignTarget[]{
 const targets=new Map<string,DesignTarget>();
 const add=(kind:DesignTarget['kind'],name?:string)=>{if(name)targets.set(kind+':'+name,{kind,name})};
 for(const geometry of [result?.geometry,...Object.values(result?.schematic_geometry||{})]){
  geometry?.objects.forEach(o=>{add('component',o.reference);add('net',o.net)});
  geometry?.nets?.forEach(net=>add('net',net));
 }
 for(const component of result?.captured_components||[]){const name=component.label||'Unnamed component';const key='component:'+name;const previous=targets.get(key);targets.set(key,{kind:'component',name,sourceIds:[...(previous?.sourceIds||[]),component.id]})}
 Object.keys(members).forEach(net=>add('net',net));
 return [...targets.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})||a.kind.localeCompare(b.kind));
}
