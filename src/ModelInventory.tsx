import {useState} from 'react';
import type {Geometry} from './api';

export default function ModelInventory({geometry,models,onInspect,onSupply}:{geometry?:Geometry;models:{reference:string;model:string}[];onInspect:(reference:string)=>void;onSupply:()=>void}){
 const [search,setSearch]=useState('');
 const parts=geometry?.objects.filter(o=>o.kind==='component'&&o.reference)||[];
 const real=parts.filter(o=>models.some(m=>m.reference===o.reference)).length;
 return <details className="model-inventory"><summary>Components &amp; models <span>{parts.length} parts · {real} verified library assignments · {parts.length-real} unverified / illustrative</span></summary><div className="model-inventory-body"><p>Inspect component values, footprint names and model availability. Library assignments describe physical packages; they do not verify mechanical fit.</p><label>Find a component<input aria-label="Find a component" placeholder="Reference, value, footprint or part number" value={search} onChange={e=>setSearch(e.target.value)}/></label><ul>{parts.filter(p=>[p.reference,p.value,p.footprint,p.part_number].join(' ').toLowerCase().includes(search.toLowerCase())).map(p=>{
  const model=models.find(m=>m.reference===p.reference),assigned=p.models?.filter(m=>!m.hidden)||[];
  const status=model?'Library model':assigned.some(m=>m.available)?'Bundled model file':assigned.some(m=>m.available===false)?'Missing model file':assigned.length?'Assigned; resolution unverified':'Illustrative shape';
  return <li key={p.id}><div><strong>{p.reference}{p.value&&p.value!=='Review fixture'?` · ${p.value}`:''}</strong><span>{p.footprint||'Footprint name not retained in this report'}</span>{p.part_number&&<span>{p.manufacturer} {p.part_number}</span>}<small data-model-status={status}>{status}{model?' · '+model.model.replace('.wrl',''):''}</small></div><button onClick={()=>onInspect(p.reference!)} aria-label={`Inspect component ${p.reference}`}>Inspect</button></li>})}</ul><p>To supply missing models: assign STEP/WRL files to footprints in KiCad, then upload the project ZIP with those files included. You can also open a complete GLB above; its component mapping must be verified separately.</p><button onClick={onSupply}>Upload project with models</button></div></details>;
}
