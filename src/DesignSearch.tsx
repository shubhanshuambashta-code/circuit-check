import {useEffect,useId,useMemo,useState} from 'react';
import {Search,X} from 'lucide-react';
import type {DesignTarget} from './design-search';

export default function DesignSearch({targets,selected,onSelect,onClear}:{targets:DesignTarget[];selected?:DesignTarget;onSelect:(target:DesignTarget)=>void;onClear:()=>void}){
 const [query,setQuery]=useState(selected?.name||''),[open,setOpen]=useState(false),[active,setActive]=useState(0);
 const id=useId(),term=query.trim().toLowerCase();
 const matches=useMemo(()=>targets.filter(t=>!term||t.name.toLowerCase().includes(term)).sort((a,b)=>Number(b.name===query.trim())-Number(a.name===query.trim())||Number(b.name.toLowerCase()===term)-Number(a.name.toLowerCase()===term)).slice(0,30),[targets,term,query]);
 useEffect(()=>{setQuery(selected?.name||'')},[selected]);
 useEffect(()=>{if(open)document.getElementById(id+'-'+active)?.scrollIntoView({block:'nearest'})},[active,open,id]);
 function choose(target:DesignTarget){onSelect(target);setQuery(target.name);setOpen(false)}
 return <div className="r2-design-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}}>
  <label htmlFor={id}>Find component or net</label>
  <div className="r2-design-search-input"><Search size={16} aria-hidden="true"/><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open?id+'-results':undefined} aria-activedescendant={open&&matches[active]?id+'-'+active:undefined} value={query} placeholder="R1, U1, GND…" autoComplete="off" onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setActive(0);setOpen(true)}} onKeyDown={e=>{
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,Math.min(matches.length-1,i+(e.key==='ArrowDown'?1:-1))))}
   if(e.key==='Enter'&&open&&matches[active]){e.preventDefault();choose(matches[active])}
   if(e.key==='Escape')setOpen(false);
  }}/>{(query||selected)&&<button className="r2-icon" aria-label="Clear component or net search" onClick={()=>{setQuery('');setOpen(false);onClear()}}><X size={15}/></button>}</div>
  {open&&<div className="r2-design-results"><ul role="listbox" id={id+'-results'} aria-label="Components and nets">{matches.map((target,i)=><li role="option" id={id+'-'+i} key={target.kind+target.name} aria-selected={active===i} onMouseEnter={()=>setActive(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(target)}><strong>{target.name}</strong><span>{target.kind==='net'?'Net':'Component'}</span></li>)}</ul>{!matches.length&&<p>No matching component or net. Try a reference like R1 or a net like GND.</p>}{matches.length===30&&<p>Showing 30 matches. Keep typing to narrow the results.</p>}</div>}
 </div>;
}
